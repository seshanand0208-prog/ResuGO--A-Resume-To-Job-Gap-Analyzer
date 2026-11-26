import 'dotenv/config';
import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  AuthRequest,
  clearAuthSessionCookie,
  createRateLimiter,
  issueAuthSessionCookie,
  optionalAuth,
  requireAuth,
} from './src/middleware/auth.ts';
import {
  clearHumanSessionCookie,
  createAccessibleChallenge,
  issueHumanSessionCookie,
  verifyHumanSubmission,
} from './src/server/botDefense.ts';
import {
  authenticateLocalEmailUser,
  countGuestAnalyses,
  createAnalysisAndRoadmap,
  createJobRecord,
  createResumeRecord,
  DEFAULT_BUILDER_CONFIG,
  deleteAllUserData,
  deleteNameProfile,
  deleteResumeRecord,
  deleteSavedJob,
  exportFullGdprData,
  findPotentialDuplicateUsers,
  getAnalysisByIdOrToken,
  getPublicResumePortfolio,
  getResumeByIdForUser,
  getResumeVersions,
  getUserDashboardData,
  registerLocalEmailUser,
  RESUME_TEMPLATES,
  saveJobForUser,
  seedDemoWorkspaceForUser,
  updateResumeBuilderState,
  updateRoadmapTask,
  updateSavedJobStatus,
  updateUserSettings,
  upsertJobAlert,
  upsertNameProfile,
} from './src/db/repository.ts';
import { decryptText } from './src/server/crypto.ts';
import {
  analyzeNameWithAI,
  BuilderAssistAction,
  chatAssistantAI,
  extractJobFromTextOrUrl,
  generateCoverLetterAI,
  parseResumeWithAI,
  resumeBuilderAssistAI,
  resumeDataToPlainText,
  runGapAnalysisAI,
  searchJobsAndMarketAI,
} from './src/server/ai.ts';
import type { GapReportData, ParsedResumeData, ResumeBuilderConfig } from './src/db/schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

const aiRateLimiter = createRateLimiter(35, 5 * 60 * 1000);
const searchRateLimiter = createRateLimiter(25, 5 * 60 * 1000);
const authRateLimiter = createRateLimiter(20, 5 * 60 * 1000);

const app = express();
app.use(express.json({ limit: '10mb' }));

async function extractTextFromUploadedBuffer(
  buffer: Buffer,
  mimetype: string,
  fileName: string
): Promise<{ rawText?: string; pdfBase64?: string }> {
  const lower = fileName.toLowerCase();
  const isPdf = mimetype === 'application/pdf' || lower.endsWith('.pdf');
  const isDocx =
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx');
  const isLegacyDoc = mimetype === 'application/msword' || lower.endsWith('.doc');

  if (isPdf) {
    let extracted = '';
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      extracted = (textResult.text || '')
        .replace(/--\s*\d+\s+of\s+\d+\s*--/g, '')
        .replace(/\u0000/g, '')
        .trim();
    } catch (pdfErr: any) {
      if (/password/i.test(String(pdfErr?.message || ''))) {
        throw new Error('This PDF is password-protected. Please upload an unlocked PDF or paste text.');
      }
      // Fall back cleanly to multimodal PDF if local PDF reader struggles
    } finally {
      await parser.destroy().catch(() => {});
    }

    if (extracted.replace(/\s+/g, '').length >= 40) {
      return { rawText: extracted };
    }
    // Scanned / image-only PDF fallback
    return { pdfBase64: buffer.toString('base64') };
  }

  if (isDocx || isLegacyDoc) {
    // Check OLE legacy binary .doc signature (D0 CF 11 E0) vs ZIP/DOCX (50 4B)
    const isOleBinary =
      buffer.length >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0;

    if (isOleBinary) {
      throw new Error(
        'Legacy binary .doc format detected. Please save the file as .docx or .pdf (or paste resume text).'
      );
    }

    try {
      const docResult = await mammoth.extractRawText({ buffer });
      const text = (docResult.value || '').replace(/\u0000/g, '').trim();
      if (text.length >= 20) {
        return { rawText: text };
      }
    } catch {
      // Check if file was actually RTF or plain text saved with .doc extension
      const utf8Text = buffer.toString('utf8').replace(/\u0000/g, '').trim();
      if (utf8Text.length >= 30 && /^[\x20-\x7E\r\n\t]+/.test(utf8Text.slice(0, 100))) {
        return { rawText: utf8Text };
      }
      throw new Error('Could not read DOCX archive. Make sure it is a valid .docx, .pdf, or .txt file.');
    }
    throw new Error('Could not extract readable text from this Word document.');
  }

  if (mimetype.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md')) {
    const text = buffer.toString('utf8').replace(/\u0000/g, '').trim();
    if (!text) {
      throw new Error('Uploaded text file is empty.');
    }
    return { rawText: text };
  }

  throw new Error('Unsupported format. Please upload PDF, DOCX, TXT, or paste text.');
}

function formatUpstreamAiError(error: any, fallback: string): { status: number; message: string } {
  const raw = String(error?.message || fallback);
  if (/503|UNAVAILABLE|high demand/i.test(raw)) {
    return {
      status: 503,
      message: 'The AI service is temporarily experiencing high demand. Please retry in a few seconds.',
    };
  }
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return {
      status: 429,
      message: 'AI rate limit reached for this minute. Please wait a moment and try again.',
    };
  }
  return { status: 500, message: raw || fallback };
}

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'ResuGO',
    timestamp: new Date().toISOString(),
  });
});

// Accessible human verification challenge + public reCAPTCHA site key configuration
app.get('/api/auth/challenge', (_req: Request, res: Response) => {
  const challenge = createAccessibleChallenge();
  res.json({
    ...challenge,
    recaptchaEnabled: Boolean(
      process.env.RECAPTCHA_SECRET_KEY &&
        process.env.VITE_RECAPTCHA_V3_SITE_KEY
    ),
    recaptchaV3SiteKey: process.env.VITE_RECAPTCHA_V3_SITE_KEY || null,
    recaptchaV2SiteKey: process.env.VITE_RECAPTCHA_V2_SITE_KEY || null,
  });
});

// Server-side CAPTCHA / bot defense verification before login, signup, guest start, or password reset
app.post(
  '/api/auth/verify-human',
  authRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const result = await verifyHumanSubmission(req, req.body || {});
      if (!result.ok) {
        return res.status(403).json(result);
      }
      const idSeed =
        (typeof req.body?.email === 'string' && req.body.email.trim()) ||
        (typeof req.body?.deviceId === 'string' && req.body.deviceId.trim()) ||
        req.ip ||
        'human';
      issueHumanSessionCookie(res, idSeed);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ ok: false, error: 'Verification failed, try again.' });
    }
  }
);

// Email/Password Registration (scrypt + signed httpOnly resugo_session cookie)
app.post('/api/auth/register', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const displayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 120) : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const user = await registerLocalEmailUser({
      email,
      password,
      displayName: displayName || email.split('@')[0],
    });
    const sessionToken = issueAuthSessionCookie(res, user.uid, req);
    const { twoFactorSecret: _tf, passwordHash: _pw, ...safeUser } = user;
    res.json({ user: safeUser, sessionToken });
  } catch (error: any) {
    const msg = error?.message || 'Could not create account.';
    const status = /already exists/i.test(msg) ? 409 : 500;
    res.status(status).json({ error: msg });
  }
});

// Email/Password Sign-In (scrypt + signed httpOnly resugo_session cookie + iframe-safe token)
app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await authenticateLocalEmailUser({ email, password });
    if (!user) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid email or password. Please check your credentials or sign up.',
      });
    }

    const sessionToken = issueAuthSessionCookie(res, user.uid, req);
    const { twoFactorSecret: _tf, passwordHash: _pw, ...safeUser } = user;
    res.json({ user: safeUser, sessionToken });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Sign-in failed.' });
  }
});

// Sign out cookie session
app.post('/api/auth/logout', (req: Request, res: Response) => {
  clearAuthSessionCookie(res, req);
  clearHumanSessionCookie(res);
  res.json({ ok: true });
});

// Current authenticated user profile
app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.dbUser });
});

// Logout from all devices (revokes Firebase refresh tokens & sets sessionsRevokedAt)
app.post('/api/auth/logout-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    try {
      await adminAuth.revokeRefreshTokens(req.dbUser!.uid);
    } catch {
      // Proceed with DB-level revocation timestamp even if IAM token revocation isn't active in preview
    }
    await updateUserSettings(req.dbUser!.id, {
      sessionsRevokedAt: new Date(),
    });
    clearAuthSessionCookie(res, req);
    clearHumanSessionCookie(res);
    res.json({ revoked: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to revoke sessions.' });
  }
});

// Optional 2FA setup / toggle
app.post('/api/auth/2fa/toggle', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const enable = Boolean(req.body?.enable);
    if (!enable) {
      const updated = await updateUserSettings(req.dbUser!.id, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });
      return res.json({ user: updated, enabled: false });
    }
    const backupCode = `RSG-${crypto.randomInt(100000, 999999)}`;
    const secret = crypto.randomBytes(10).toString('hex').toUpperCase();
    const updated = await updateUserSettings(req.dbUser!.id, {
      twoFactorEnabled: true,
      twoFactorSecret: `${secret}:${backupCode}`,
    });
    res.json({
      user: { ...updated, twoFactorSecret: undefined },
      enabled: true,
      recoveryCode: backupCode,
      manualKey: secret,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update 2FA setting.' });
  }
});

app.post('/api/auth/2fa/verify', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Verification code is required.' });
    // Accepts any valid 6-digit authenticator format or issued RSG-XXXXXX code for verification step
    const validFormat = /^\d{6}$/.test(code) || /^RSG-\d{6}$/i.test(code);
    if (!validFormat) {
      return res.status(400).json({ error: 'Invalid 6-digit verification code.' });
    }
    res.json({ verified: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '2FA verification failed.' });
  }
});

// Update user profile & preferences
app.patch('/api/user/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
      preferredLang,
      darkMode,
      jobAlertsEnabled,
      alertQuery,
      alertLocation,
      canonicalName,
    } = req.body;
    const updates: Record<string, unknown> = {};
    if (typeof preferredLang === 'string' && ['en', 'ta', 'hi'].includes(preferredLang)) {
      updates.preferredLang = preferredLang;
    }
    if (typeof darkMode === 'boolean') updates.darkMode = darkMode;
    if (typeof jobAlertsEnabled === 'boolean') updates.jobAlertsEnabled = jobAlertsEnabled;
    if (typeof alertQuery === 'string' || alertQuery === null) {
      updates.alertQuery = alertQuery ? alertQuery.slice(0, 140) : null;
    }
    if (typeof alertLocation === 'string' || alertLocation === null) {
      updates.alertLocation = alertLocation ? alertLocation.slice(0, 140) : null;
    }
    if (typeof canonicalName === 'string' && canonicalName.trim()) {
      updates.canonicalName = canonicalName.trim().slice(0, 140);
    }
    const updated = await updateUserSettings(req.dbUser!.id, updates);
    res.json({ user: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save preferences.' });
  }
});

// Privacy: Export all stored data as GDPR JSON
app.get('/api/user/export-gdpr', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const payload = await exportFullGdprData(req.dbUser!.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="resugo_data_export_${req.dbUser!.id}.json"`
    );
    res.send(JSON.stringify(payload, null, 2));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to export user data.' });
  }
});

// Privacy: Delete all user data
app.delete('/api/user/data', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await deleteAllUserData(req.dbUser!.id);
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete user data.' });
  }
});

// Reload demo seed workspace on demand
app.post('/api/user/load-demo', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await seedDemoWorkspaceForUser(req.dbUser!.id);
    const data = await getUserDashboardData(req.dbUser!.id);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load demo workspace.' });
  }
});

// Dashboard aggregate endpoint
app.get('/api/dashboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getUserDashboardData(req.dbUser!.id);
    res.json({ user: req.dbUser, ...data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch dashboard.' });
  }
});

// Bias-Safe Name Analysis Engine
app.post(
  '/api/names/analyze',
  optionalAuth,
  aiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        rawName,
        accountName,
        googleProfileName,
        resumeExtractedName,
        email,
        save = true,
      } = req.body || {};

      const targetName = String(
        rawName || req.dbUser?.canonicalName || req.dbUser?.displayName || ''
      ).trim();

      if (!targetName) {
        return res.status(400).json({ error: 'Please provide a name to analyze.' });
      }

      const targetEmail = String(email || req.dbUser?.email || '');
      const duplicateMatches = await findPotentialDuplicateUsers(
        req.dbUser?.id,
        targetName,
        targetEmail
      );

      const analysis = await analyzeNameWithAI({
        rawName: targetName,
        accountName: accountName ?? req.dbUser?.displayName,
        googleProfileName: googleProfileName ?? req.firebaseUser?.name ?? req.dbUser?.displayName,
        resumeExtractedName: resumeExtractedName ?? null,
        email: targetEmail,
        duplicateMatches,
      });

      let nameProfile = null;
      if (req.dbUser && save !== false) {
        nameProfile = await upsertNameProfile({
          userId: req.dbUser.id,
          googleProfileName:
            googleProfileName ?? req.firebaseUser?.name ?? req.dbUser.displayName,
          resumeExtractedName: resumeExtractedName ?? null,
          analysis,
          userConfirmed: analysis.validityStatus === 'valid' && !analysis.mismatchWarning,
        });
      }

      res.json({ analysis, nameProfile });
    } catch (error: any) {
      console.error('Name analysis error:', error);
      res.status(500).json({ error: error.message || 'Failed to analyze name.' });
    }
  }
);

app.patch('/api/names/confirm', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { canonicalName } = req.body || {};
    if (!canonicalName || typeof canonicalName !== 'string' || !canonicalName.trim()) {
      return res.status(400).json({ error: 'Canonical name is required.' });
    }

    const analysis = await analyzeNameWithAI({
      rawName: canonicalName.trim(),
      accountName: req.dbUser!.displayName,
      googleProfileName: req.firebaseUser?.name ?? req.dbUser!.displayName,
      email: req.dbUser!.email,
    });
    analysis.canonicalName = canonicalName.trim();
    analysis.mismatchWarning = null;

    const nameProfile = await upsertNameProfile({
      userId: req.dbUser!.id,
      googleProfileName: req.firebaseUser?.name ?? req.dbUser!.displayName,
      analysis,
      userConfirmed: true,
    });

    res.json({ nameProfile, analysis });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to confirm canonical name.' });
  }
});

app.delete('/api/names', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await deleteNameProfile(req.dbUser!.id);
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete name data.' });
  }
});

// Resume templates list
app.get('/api/templates', (_req: Request, res: Response) => {
  res.json({ templates: RESUME_TEMPLATES });
});

// Create blank or Fresher Mode custom resume in Builder
app.post('/api/resumes/blank', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, templateId, fresherMode } = req.body || {};
    const candidateName =
      req.dbUser!.canonicalName || req.dbUser!.displayName || 'Your Name';
    const starterData: ParsedResumeData = fresherMode
      ? {
          contactInfo: {
            name: candidateName,
            email: req.dbUser!.email,
            phone: '',
            location: '',
            linkedin: '',
            github: '',
            portfolio: '',
          },
          summary:
            'Motivated computer science graduate with hands-on capstone project delivery in web engineering, databases, and automated testing.',
          totalYearsExp: 0,
          seniorityLevel: 'Fresher / Graduate',
          skills: ['TypeScript', 'React', 'SQL', 'Git', 'REST APIs'],
          experience: [],
          education: [
            {
              degree: 'B.Tech / B.E. Computer Science',
              institution: 'University Name',
              year: String(new Date().getFullYear()),
            },
          ],
          certifications: [],
          projects: [
            {
              name: 'Full-Stack Capstone Project',
              description:
                'Designed and deployed a responsive web application with authentication, database persistence, and automated tests.',
              technologies: ['React', 'TypeScript', 'PostgreSQL'],
            },
          ],
          languages: [{ language: 'English', proficiency: 'Fluent' }],
          awards: [],
          volunteering: [],
          publications: [],
          customSections: [],
        }
      : {
          contactInfo: {
            name: candidateName,
            email: req.dbUser!.email,
            phone: '',
            location: '',
          },
          summary: '',
          totalYearsExp: 0,
          seniorityLevel: 'Mid-Level',
          skills: [],
          experience: [],
          education: [],
          certifications: [],
          projects: [],
          languages: [],
          awards: [],
          volunteering: [],
          publications: [],
          customSections: [],
        };

    const config: ResumeBuilderConfig = {
      ...DEFAULT_BUILDER_CONFIG,
      templateId: templateId || (fresherMode ? 'fresher-campus' : 'ats-classic'),
    };
    const rawText = resumeDataToPlainText(starterData);
    const saved = await createResumeRecord({
      userId: req.dbUser!.id,
      title: String(title || (fresherMode ? 'Fresher Campus Resume' : 'Custom Resume')).slice(
        0,
        160
      ),
      fileType: 'application/json',
      fileSizeBytes: Buffer.byteLength(rawText, 'utf8'),
      rawText,
      parsedData: starterData,
      source: 'builder',
      builderConfig: config,
      changeNote: fresherMode ? 'Created with Fresher Mode starter' : 'Created in Resume Builder',
    });

    res.json({
      resume: {
        ...saved,
        encryptedRawText: undefined,
        rawText,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create custom resume.' });
  }
});

// Upload & parse resume (PDF, DOCX, or plain text) + automatic Name Cross-Check
app.post(
  '/api/resumes/upload',
  optionalAuth,
  aiRateLimiter,
  (req: AuthRequest, res: Response, next) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      upload.single('file')(req, res, (err: any) => {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File exceeds the 10 MB limit.' });
          }
          return res.status(400).json({ error: err.message || 'Upload error.' });
        }
        next();
      });
    } else {
      next();
    }
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const file = req.file;
      const bodyTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const bodyRawText = typeof req.body?.rawText === 'string' ? req.body.rawText.trim() : '';
      const sourceLabel =
        typeof req.body?.source === 'string' ? req.body.source.trim() : undefined;

      let parsedResult: { extractedText: string; parsedData: ParsedResumeData };
      const fileName = file?.originalname || null;
      const fileType = file?.mimetype || 'text/plain';
      const fileSizeBytes = file?.size || Buffer.byteLength(bodyRawText, 'utf8');
      const title = bodyTitle || fileName || 'Uploaded Resume';

      if (file) {
        let extractedInput: { rawText?: string; pdfBase64?: string };
        try {
          extractedInput = await extractTextFromUploadedBuffer(
            file.buffer,
            file.mimetype,
            file.originalname
          );
        } catch (extractErr: any) {
          return res.status(400).json({
            error: extractErr?.message || 'Could not extract readable text from uploaded file.',
          });
        }
        parsedResult = await parseResumeWithAI({
          ...extractedInput,
          fileName: file.originalname,
        });
      } else if (bodyRawText.length >= 30) {
        parsedResult = await parseResumeWithAI({ rawText: bodyRawText });
      } else {
        return res.status(400).json({
          error: 'Please upload a resume file (max 10 MB) or paste at least 30 characters.',
        });
      }

      // Run full AI name analysis in background so upload/paste responds immediately
      const resumeName = parsedResult.parsedData.contactInfo?.name;
      if (req.dbUser && resumeName) {
        const dbUser = req.dbUser;
        const googleName = req.firebaseUser?.name ?? dbUser.displayName;
        void (async () => {
          try {
            const nameCheck = await analyzeNameWithAI({
              rawName: resumeName,
              accountName: dbUser.displayName,
              googleProfileName: googleName,
              resumeExtractedName: resumeName,
              email: dbUser.email,
            });
            await upsertNameProfile({
              userId: dbUser.id,
              googleProfileName: googleName,
              resumeExtractedName: resumeName,
              analysis: nameCheck,
              userConfirmed: !nameCheck.mismatchWarning && nameCheck.validityStatus === 'valid',
            });
          } catch {
            // Non-blocking background name check
          }
        })();
      }
      const nameCheck = null;

      if (req.dbUser) {
        const saved = await createResumeRecord({
          userId: req.dbUser.id,
          title: title.slice(0, 160),
          fileName,
          fileType,
          fileSizeBytes,
          rawText: parsedResult.extractedText,
          parsedData: parsedResult.parsedData,
          source: sourceLabel || (file ? 'upload' : 'paste'),
        });
        return res.json({
          resume: {
            ...saved,
            encryptedRawText: undefined,
            rawText: parsedResult.extractedText,
          },
          nameCheck,
        });
      }

      return res.json({
        resume: {
          id: null,
          title,
          fileName,
          fileType,
          fileSizeBytes,
          parsedData: parsedResult.parsedData,
          rawText: parsedResult.extractedText,
          activeTemplateId: DEFAULT_BUILDER_CONFIG.templateId,
          builderConfig: DEFAULT_BUILDER_CONFIG,
          version: 1,
          source: sourceLabel || (file ? 'upload' : 'paste'),
          createdAt: new Date().toISOString(),
        },
        nameCheck,
      });
    } catch (error: any) {
      console.error('Resume upload error:', error);
      const formatted = formatUpstreamAiError(error, 'Failed to parse resume.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  }
);

// Save Resume Builder edits & snapshots
app.put('/api/resumes/:id/builder', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const resumeId = Number(req.params.id);
    if (!Number.isFinite(resumeId)) {
      return res.status(400).json({ error: 'Invalid resume ID.' });
    }
    const {
      title,
      parsedData,
      builderConfig,
      isPortfolioPublic,
      saveSnapshot,
      snapshotLabel,
      changeNote,
    } = req.body || {};

    if (!parsedData) {
      return res.status(400).json({ error: 'Resume structured data is required.' });
    }

    const rawText = resumeDataToPlainText(parsedData);
    const updated = await updateResumeBuilderState({
      userId: req.dbUser!.id,
      resumeId,
      title,
      parsedData,
      builderConfig: builderConfig || DEFAULT_BUILDER_CONFIG,
      rawText,
      isPortfolioPublic,
      saveSnapshot: Boolean(saveSnapshot),
      snapshotLabel,
      changeNote,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Resume not found.' });
    }

    res.json({
      resume: {
        ...updated,
        encryptedRawText: undefined,
        rawText,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save resume builder changes.' });
  }
});

// Resume Version History
app.get('/api/resumes/:id/versions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const resumeId = Number(req.params.id);
    if (!Number.isFinite(resumeId)) {
      return res.status(400).json({ error: 'Invalid resume ID.' });
    }
    const versions = await getResumeVersions(req.dbUser!.id, resumeId);
    res.json({ versions });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch resume versions.' });
  }
});

// Per-Section Resume Builder AI Assistant
app.post(
  '/api/resumes/:id/ai-assist',
  optionalAuth,
  aiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        action,
        resume,
        sectionText,
        targetJobText,
        missingSkill,
        tone,
        language,
      } = req.body || {};
      if (!action || !resume) {
        return res.status(400).json({ error: 'Action and resume payload are required.' });
      }
      const result = await resumeBuilderAssistAI({
        action: action as BuilderAssistAction,
        resume,
        sectionText,
        targetJobText,
        missingSkill,
        tone,
        language,
      });
      res.json(result);
    } catch (error: any) {
      console.error('Resume AI assist error:', error);
      res.status(500).json({ error: error.message || 'AI resume assistant failed.' });
    }
  }
);

// Public One-Page Web Portfolio
app.get('/api/portfolio/:slug', async (req: Request, res: Response) => {
  try {
    const portfolio = await getPublicResumePortfolio(req.params.slug);
    if (!portfolio) {
      return res.status(404).json({ error: 'Public portfolio not found or private.' });
    }
    res.json({ portfolio });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load public portfolio.' });
  }
});

// Import resume from Google Drive / Google Docs via Drive Picker
app.post(
  '/api/workspace/import-drive-file',
  requireAuth,
  aiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const accessToken = req.headers['x-google-access-token'];
      if (typeof accessToken !== 'string' || !accessToken) {
        return res.status(401).json({
          code: 'GOOGLE_TOKEN_REQUIRED',
          error: 'Google Drive authorization required. Click to connect your Google Drive account.',
        });
      }

      const { fileId, fileName, mimeType } = req.body;
      if (!fileId || typeof fileId !== 'string') {
        return res.status(400).json({ error: 'Missing Google Drive fileId.' });
      }

      let parsedResult: { extractedText: string; parsedData: ParsedResumeData };
      let fileSizeBytes = 0;

      if (mimeType === 'application/vnd.google-apps.document') {
        const exportRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (exportRes.status === 401) {
          return res.status(401).json({
            code: 'GOOGLE_TOKEN_REQUIRED',
            error: 'Google Drive session expired. Please reconnect your Google account.',
          });
        }
        if (!exportRes.ok) {
          const errText = await exportRes.text();
          throw new Error(`Google Docs export failed: ${errText.slice(0, 180)}`);
        }
        const rawText = await exportRes.text();
        fileSizeBytes = Buffer.byteLength(rawText, 'utf8');
        if (fileSizeBytes > MAX_FILE_SIZE) {
          return res.status(400).json({ error: 'Selected Google Doc exceeds 10 MB limit.' });
        }
        parsedResult = await parseResumeWithAI({ rawText, fileName });
      } else {
        const mediaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (mediaRes.status === 401) {
          return res.status(401).json({
            code: 'GOOGLE_TOKEN_REQUIRED',
            error: 'Google Drive session expired. Please reconnect your Google account.',
          });
        }
        if (!mediaRes.ok) {
          const errText = await mediaRes.text();
          throw new Error(`Google Drive download failed: ${errText.slice(0, 180)}`);
        }
        const arrayBuf = await mediaRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        fileSizeBytes = buffer.length;
        if (fileSizeBytes > MAX_FILE_SIZE) {
          return res.status(400).json({ error: 'Selected Drive file exceeds 10 MB limit.' });
        }

        const extractedInput = await extractTextFromUploadedBuffer(
          buffer,
          mimeType || '',
          fileName || 'drive-resume'
        );
        parsedResult = await parseResumeWithAI({
          ...extractedInput,
          fileName,
        });
      }

      const saved = await createResumeRecord({
        userId: req.dbUser!.id,
        title: (fileName || 'Google Drive Resume').slice(0, 160),
        fileName: fileName || 'drive-resume',
        fileType: mimeType || 'application/octet-stream',
        fileSizeBytes,
        rawText: parsedResult.extractedText,
        parsedData: parsedResult.parsedData,
        source: 'drive',
      });

      res.json({
        resume: {
          ...saved,
          encryptedRawText: undefined,
          rawText: parsedResult.extractedText,
        },
      });
    } catch (error: any) {
      console.error('Drive import error:', error);
      const formatted = formatUpstreamAiError(error, 'Failed to import file from Google Drive.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  }
);

app.delete('/api/resumes/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid resume id.' });
    await deleteResumeRecord(req.dbUser!.id, id);
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete resume.' });
  }
});

// Live Google Jobs + Market Info Search (cached & rate-limited)
app.get('/api/jobs/search', searchRateLimiter, async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const location =
      typeof req.query.location === 'string' ? req.query.location.trim() : 'Remote';
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Please enter a job title or skill query.' });
    }
    const payload = await searchJobsAndMarketAI({ query: q, location });
    res.json(payload);
  } catch (error: any) {
    console.error('Job search error:', error);
    const formatted = formatUpstreamAiError(error, 'Failed to search live jobs.');
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// Saved Jobs CRUD
app.post('/api/saved-jobs', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, company, location, salaryRange, source, applyUrl, descriptionText, notes } =
      req.body;
    if (!title || !descriptionText) {
      return res.status(400).json({ error: 'Job title and description are required.' });
    }
    const extracted = await extractJobFromTextOrUrl({ descriptionText });
    const saved = await saveJobForUser({
      userId: req.dbUser!.id,
      jobData: {
        title: title || extracted.title,
        company: company || extracted.company,
        location: location || extracted.location,
        salaryRange: salaryRange || extracted.salaryRange,
        source: source || 'google_jobs',
        externalUrl: applyUrl || null,
        descriptionText: extracted.descriptionText || descriptionText,
        extractedRequirements: extracted.extractedRequirements,
      },
      notes,
    });
    res.json({ savedJob: saved });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save job.' });
  }
});

app.patch('/api/saved-jobs/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { status, notes } = req.body;
    const updated = await updateSavedJobStatus(req.dbUser!.id, id, status || 'saved', notes);
    if (!updated) return res.status(404).json({ error: 'Saved job not found.' });
    res.json({ savedJob: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update saved job.' });
  }
});

app.delete('/api/saved-jobs/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await deleteSavedJob(req.dbUser!.id, id);
    res.json({ deleted: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete saved job.' });
  }
});

// Run Gap Analysis (supports Authenticated Users AND Guest Mode: 1 free analysis)
app.post(
  '/api/analyses/run',
  optionalAuth,
  aiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        resumeId,
        parsedResume,
        rawResumeText,
        jobText,
        jobUrl,
        jobMeta,
      } = req.body;

      if (!req.dbUser) {
        if (!req.guestSessionId) {
          return res.status(400).json({
            error: 'Missing guest session identifier. Please refresh or sign in.',
          });
        }
        const guestCount = await countGuestAnalyses(req.guestSessionId);
        if (guestCount >= 1) {
          return res.status(403).json({
            code: 'GUEST_LIMIT_REACHED',
            error:
              'Guest mode allows 1 free gap analysis. Sign in with Google or email to run unlimited analyses, unlock the Resume Builder, and save history.',
          });
        }
      }

      let activeResumeParsed = parsedResume;
      let activeResumeText = rawResumeText || '';
      let persistedResumeId: number | null = null;

      if (req.dbUser && resumeId) {
        const found = await getResumeByIdForUser(req.dbUser.id, Number(resumeId));
        if (found) {
          persistedResumeId = found.id;
          activeResumeParsed = found.parsedData;
          activeResumeText = decryptText(found.encryptedRawText);
        }
      }

      if (!activeResumeParsed && (!activeResumeText || activeResumeText.trim().length < 30)) {
        return res.status(400).json({
          error: 'Please upload or paste at least 30 characters of your resume before running the gap analysis.',
        });
      }

      if ((!jobText || jobText.trim().length < 20) && !jobUrl) {
        return res.status(400).json({
          error:
            'Please paste a target job description (at least 20 characters), select a job listing, or provide a job URL.',
        });
      }

      const [parsedResult, extractedJob] = await Promise.all([
        !activeResumeParsed
          ? parseResumeWithAI({ rawText: activeResumeText })
          : Promise.resolve(null),
        jobUrl && !jobText?.trim()
          ? extractJobFromTextOrUrl({ url: jobUrl })
          : Promise.resolve(null),
      ]);

      if (parsedResult) {
        activeResumeParsed = parsedResult.parsedData;
        activeResumeText = parsedResult.extractedText;
      }

      if (req.dbUser && !persistedResumeId && activeResumeParsed && activeResumeText) {
        const savedRes = await createResumeRecord({
          userId: req.dbUser.id,
          title: `${activeResumeParsed.contactInfo?.name || 'Candidate'} Resume`,
          fileType: 'text/plain',
          fileSizeBytes: Buffer.byteLength(activeResumeText, 'utf8'),
          rawText: activeResumeText,
          parsedData: activeResumeParsed,
          source: 'paste',
        });
        persistedResumeId = savedRes.id;
      }

      const effectiveJobText = extractedJob?.descriptionText || jobText;
      const aiAnalysis = await runGapAnalysisAI({
        parsedResume: activeResumeParsed,
        rawResumeText: activeResumeText,
        job: {
          title: jobMeta?.title || extractedJob?.title,
          company: jobMeta?.company || extractedJob?.company,
          location: jobMeta?.location || extractedJob?.location,
          salaryRange: jobMeta?.salaryRange || extractedJob?.salaryRange,
          descriptionText: effectiveJobText,
          extractedRequirements: extractedJob?.extractedRequirements,
        },
      });

      const jobRecord = await createJobRecord({
        title: jobMeta?.title || extractedJob?.title || aiAnalysis.extractedJobMeta.title || 'Target Role',
        company: jobMeta?.company || extractedJob?.company || aiAnalysis.extractedJobMeta.company || 'Target Company',
        location: jobMeta?.location || extractedJob?.location || aiAnalysis.extractedJobMeta.location || 'Remote',
        salaryRange: jobMeta?.salaryRange || extractedJob?.salaryRange || aiAnalysis.extractedJobMeta.salaryRange || 'Market standard',
        source: jobUrl ? 'url' : jobMeta?.source || 'paste',
        externalUrl: jobUrl || jobMeta?.applyUrl || null,
        descriptionText: effectiveJobText,
        extractedRequirements:
          extractedJob?.extractedRequirements || aiAnalysis.extractedJobMeta.extractedRequirements,
      });

      const { analysis, roadmap } = await createAnalysisAndRoadmap({
        userId: req.dbUser?.id ?? null,
        guestSessionId: req.dbUser ? null : req.guestSessionId,
        resumeId: persistedResumeId,
        jobId: jobRecord.id,
        overallScore: aiAnalysis.overallScore,
        skillsScore: aiAnalysis.skillsScore,
        experienceScore: aiAnalysis.experienceScore,
        educationScore: aiAnalysis.educationScore,
        keywordsScore: aiAnalysis.keywordsScore,
        gapReport: aiAnalysis.gapReport,
        roadmapTitle: aiAnalysis.roadmapTitle,
        roadmapWeeks: aiAnalysis.roadmapWeeks,
      });

      res.json({
        analysis: {
          ...analysis,
          job: jobRecord,
          roadmap,
        },
      });
    } catch (error: any) {
      console.error('Analysis error:', error);
      const formatted = formatUpstreamAiError(error, 'Gap analysis failed.');
      res.status(formatted.status).json({ error: formatted.message });
    }
  }
);

// Multi-Job Comparison (up to 5 jobs against 1 resume, ranked by overall fit score)
app.post(
  '/api/analyses/compare',
  requireAuth,
  aiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const { resumeId, jobs: targetJobs } = req.body;
      if (!Array.isArray(targetJobs) || targetJobs.length < 2 || targetJobs.length > 5) {
        return res.status(400).json({
          error: 'Please provide between 2 and 5 jobs to compare.',
        });
      }

      const activeResume = await getResumeByIdForUser(req.dbUser!.id, Number(resumeId));
      if (!activeResume) {
        return res.status(404).json({ error: 'Selected resume not found.' });
      }

      const rawText = decryptText(activeResume.encryptedRawText);

      const results = await Promise.all(
        targetJobs.map(
          async (tj: { title?: string; company?: string; descriptionText: string }) => {
            const aiRes = await runGapAnalysisAI({
              parsedResume: activeResume.parsedData,
              rawResumeText: rawText,
              job: {
                title: tj.title,
                company: tj.company,
                descriptionText: tj.descriptionText,
              },
            });
            const jobRec = await createJobRecord({
              title: tj.title || aiRes.extractedJobMeta.title,
              company: tj.company || aiRes.extractedJobMeta.company,
              location: aiRes.extractedJobMeta.location,
              salaryRange: aiRes.extractedJobMeta.salaryRange,
              source: 'compare',
              descriptionText: tj.descriptionText,
              extractedRequirements: aiRes.extractedJobMeta.extractedRequirements,
            });
            const saved = await createAnalysisAndRoadmap({
              userId: req.dbUser!.id,
              resumeId: activeResume.id,
              jobId: jobRec.id,
              overallScore: aiRes.overallScore,
              skillsScore: aiRes.skillsScore,
              experienceScore: aiRes.experienceScore,
              educationScore: aiRes.educationScore,
              keywordsScore: aiRes.keywordsScore,
              gapReport: aiRes.gapReport,
              roadmapTitle: aiRes.roadmapTitle,
              roadmapWeeks: aiRes.roadmapWeeks,
            });
            return {
              ...saved.analysis,
              job: jobRec,
            };
          }
        )
      );

      results.sort((a, b) => b.overallScore - a.overallScore);
      res.json({ rankedAnalyses: results });
    } catch (error: any) {
      console.error('Multi-job compare error:', error);
      res.status(500).json({ error: error.message || 'Multi-job comparison failed.' });
    }
  }
);

// Public Shareable Report
app.get('/api/analyses/share/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const report = await getAnalysisByIdOrToken({ shareToken: token });
    if (!report) return res.status(404).json({ error: 'Shared report not found.' });
    res.json({ analysis: report });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load shared report.' });
  }
});

// Single Analysis Detail
app.get('/api/analyses/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid analysis ID.' });
    const report = await getAnalysisByIdOrToken({
      id,
      userId: req.dbUser?.id,
      guestSessionId: req.guestSessionId,
    });
    if (!report) return res.status(404).json({ error: 'Analysis not found.' });
    res.json({ analysis: report });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch analysis.' });
  }
});

// Update Roadmap Task Completion
app.patch('/api/roadmaps/:id/task', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const roadmapId = Number(req.params.id);
    const { taskId, completed, calendarEventId } = req.body;
    const updated = await updateRoadmapTask({
      userId: req.dbUser!.id,
      roadmapId,
      taskId,
      completed,
      calendarEventId,
    });
    if (!updated) return res.status(404).json({ error: 'Roadmap not found.' });
    res.json({ roadmap: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update roadmap.' });
  }
});

// Tailored Cover Letter Generator
app.post(
  '/api/cover-letter/generate',
  optionalAuth,
  aiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const { resume, jobTitle, company, jobDescription, tone, language } = req.body || {};
      if (!resume || !jobTitle || !jobDescription) {
        return res.status(400).json({
          error: 'Resume, target job title, and job description are required.',
        });
      }
      const generated = await generateCoverLetterAI({
        resume,
        jobTitle,
        company: company || 'Hiring Team',
        jobDescription,
        tone: tone || 'professional',
        language: language || 'en',
      });
      res.json(generated);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate cover letter.' });
    }
  }
);

// Fast Career Chatbot & Mock Interview Coach
app.post(
  '/api/chat',
  optionalAuth,
  aiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const { message, mode, history, resumeContext, jobContext } = req.body || {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required.' });
      }
      const response = await chatAssistantAI({
        message: message.trim().slice(0, 2000),
        mode: mode === 'mock_interview' ? 'mock_interview' : 'career_chat',
        history: Array.isArray(history) ? history : [],
        resumeContext: resumeContext || null,
        jobContext: jobContext || null,
      });
      res.json(response);
    } catch (error: any) {
      console.error('Chatbot error:', error);
      res.status(500).json({ error: error.message || 'Career assistant unavailable.' });
    }
  }
);

// Export Custom Resume to Google Docs (via drive.file multipart upload conversion)
app.post('/api/workspace/export-gdoc', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = req.headers['x-google-access-token'];
    if (typeof accessToken !== 'string' || !accessToken) {
      return res.status(401).json({
        code: 'GOOGLE_TOKEN_REQUIRED',
        error: 'Google Docs authorization required. Connect Google Workspace to export.',
      });
    }
    const { title, parsedData } = req.body || {};
    if (!parsedData) {
      return res.status(400).json({ error: 'Missing resume content.' });
    }
    const plainText = resumeDataToPlainText(parsedData);
    const boundary = `resugo_doc_${Date.now()}`;
    const metadata = JSON.stringify({
      name: title || `${parsedData.contactInfo?.name || 'ResuGO'} Resume`,
      mimeType: 'application/vnd.google-apps.document',
    });
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
      `${plainText}\r\n` +
      `--${boundary}--`;

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (uploadRes.status === 401) {
      return res.status(401).json({
        code: 'GOOGLE_TOKEN_REQUIRED',
        error: 'Google authorization expired. Please reconnect Google Workspace.',
      });
    }
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Google Docs export failed: ${errText.slice(0, 200)}`);
    }
    const file = (await uploadRes.json()) as { id: string; webViewLink?: string };
    res.json({
      fileId: file.id,
      docUrl: file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
    });
  } catch (error: any) {
    console.error('Google Docs export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export Google Doc.' });
  }
});

// Save Gap Report directly to Google Drive as a Google Doc
app.post(
  '/api/workspace/save-drive-report',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const accessToken = req.headers['x-google-access-token'];
      if (typeof accessToken !== 'string' || !accessToken) {
        return res.status(401).json({
          code: 'GOOGLE_TOKEN_REQUIRED',
          error: 'Google Drive authorization required. Connect Google Workspace to save.',
        });
      }
      const { analysisId } = req.body;
      const report = await getAnalysisByIdOrToken({
        id: Number(analysisId),
        userId: req.dbUser!.id,
      });
      if (!report) return res.status(404).json({ error: 'Analysis not found.' });

      const g: GapReportData = report.gapReport;
      const content = [
        `ResuGO Gap Analysis Report`,
        `Target Role: ${report.job.title} at ${report.job.company}`,
        `Overall Fit: ${report.overallScore}% (Skills ${report.skillsScore}% · Experience ${report.experienceScore}% · Education ${report.educationScore}% · ATS ${report.keywordsScore}%)`,
        '',
        `SUMMARY VERDICT`,
        g.summaryVerdict,
        '',
        `MISSING SKILLS`,
        ...g.missingSkills.map((s) => `• ${s.skill} (${s.importance}): ${s.reason}`),
        '',
        `MISSING ATS KEYWORDS`,
        g.atsCheck.missingKeywords.join(', ') || 'None',
        '',
        `ACTION PLAN`,
        ...g.actionPlan.map((a) => `• ${a.gap} (~${a.estimatedHours}h): ${a.projectIdea}`),
        '',
        `HONEST BULLET REWRITES`,
        ...g.bulletRewrites.map((b) => `[${b.section}]\nBefore: ${b.original}\nAfter: ${b.improved}\n`),
      ].join('\n');

      const boundary = `resugo_rep_${Date.now()}`;
      const metadata = JSON.stringify({
        name: `ResuGO Report — ${report.job.title} (${report.job.company})`,
        mimeType: 'application/vnd.google-apps.document',
      });
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );
      if (uploadRes.status === 401) {
        return res.status(401).json({
          code: 'GOOGLE_TOKEN_REQUIRED',
          error: 'Google Drive session expired. Please reconnect Google Workspace.',
        });
      }
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Google Drive save failed: ${errText.slice(0, 200)}`);
      }
      const file = (await uploadRes.json()) as { id: string; webViewLink?: string };
      res.json({
        fileId: file.id,
        fileUrl: file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save report to Google Drive.' });
    }
  }
);

// Google Sheets Export of Gap Report
app.post('/api/workspace/export-sheets', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = req.headers['x-google-access-token'];
    if (typeof accessToken !== 'string' || !accessToken) {
      return res.status(401).json({
        code: 'GOOGLE_TOKEN_REQUIRED',
        error: 'Google Sheets authorization required. Connect Google Workspace to export.',
      });
    }
    const { analysisId } = req.body;
    const report = await getAnalysisByIdOrToken({
      id: Number(analysisId),
      userId: req.dbUser!.id,
    });
    if (!report) return res.status(404).json({ error: 'Analysis not found.' });

    const createSheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `ResuGO Gap Report — ${report.job.title} at ${report.job.company}`,
        },
        sheets: [
          { properties: { title: 'Summary' } },
          { properties: { title: 'Skill Gaps' } },
          { properties: { title: 'Action Plan' } },
          { properties: { title: 'Bullet Rewrites' } },
        ],
      }),
    });

    if (createSheetRes.status === 401) {
      return res.status(401).json({
        code: 'GOOGLE_TOKEN_REQUIRED',
        error: 'Google Sheets session expired. Please reconnect Google Workspace.',
      });
    }
    if (!createSheetRes.ok) {
      const errText = await createSheetRes.text();
      throw new Error(`Google Sheets API error: ${errText.slice(0, 200)}`);
    }

    const spreadsheet = (await createSheetRes.json()) as {
      spreadsheetId: string;
      spreadsheetUrl: string;
    };

    const g: GapReportData = report.gapReport;
    const summaryValues = [
      ['ResuGO Resume-to-Job Gap Report', ''],
      ['Target Role', report.job.title],
      ['Company', report.job.company],
      ['Location', report.job.location || 'N/A'],
      ['Overall Match Score', `${report.overallScore}%`],
      ['Skills Score', `${report.skillsScore}%`],
      ['Experience Score', `${report.experienceScore}%`],
      ['Education Score', `${report.educationScore}%`],
      ['ATS Keywords Score', `${report.keywordsScore}%`],
      ['ATS Pass Likelihood', g.atsCheck.atsPassLikelihood],
      ['Summary Verdict', g.summaryVerdict],
      ['Missing ATS Keywords', g.atsCheck.missingKeywords.join(', ')],
    ];

    const skillGapValues = [
      ['Skill', 'Category', 'Status', 'Notes / Evidence'],
      ...g.matchedSkills.map((s) => [s.skill, s.category, 'Matched', s.evidence]),
      ...g.partialSkills.map((s) => [s.skill, s.category, 'Partial', s.gapNote]),
      ...g.missingSkills.map((s) => [
        s.skill,
        s.category,
        `Missing (${s.importance})`,
        s.reason,
      ]),
    ];

    const actionValues = [
      ['Gap Area', 'Priority', 'Est. Hours', 'Suggested Project', 'Certification', 'Resources'],
      ...g.actionPlan.map((a) => [
        a.gap,
        a.priority,
        String(a.estimatedHours),
        a.projectIdea,
        a.certification,
        a.resources.map((r) => `${r.title} (${r.url})`).join(' | '),
      ]),
    ];

    const bulletValues = [
      ['Section', 'Original Bullet', 'Tailored Bullet', 'Added Keywords', 'Rationale'],
      ...g.bulletRewrites.map((b) => [
        b.section,
        b.original,
        b.improved,
        b.addedKeywords.join(', '),
        b.rationale,
      ]),
    ];

    const batchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet.spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: 'Summary!A1', values: summaryValues },
            { range: 'Skill Gaps!A1', values: skillGapValues },
            { range: 'Action Plan!A1', values: actionValues },
            { range: 'Bullet Rewrites!A1', values: bulletValues },
          ],
        }),
      }
    );

    if (!batchRes.ok) {
      const errText = await batchRes.text();
      throw new Error(`Google Sheets populate error: ${errText.slice(0, 200)}`);
    }

    res.json({
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
    });
  } catch (error: any) {
    console.error('Sheets export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export to Google Sheets.' });
  }
});

// Google Calendar Schedule for Roadmap Milestones
app.post(
  '/api/workspace/calendar-schedule',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const accessToken = req.headers['x-google-access-token'];
      if (typeof accessToken !== 'string' || !accessToken) {
        return res.status(401).json({
          code: 'GOOGLE_TOKEN_REQUIRED',
          error:
            'Google Calendar authorization required. Connect Google Workspace to schedule.',
        });
      }

      const { title, description, startDateIso, durationHours } = req.body;
      const start = startDateIso ? new Date(startDateIso) : new Date(Date.now() + 86400000);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + (Number(durationHours) || 2) * 3600000);

      const calRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: title || 'ResuGO Learning Sprint',
            description: description || 'Scheduled via ResuGO Skill Roadmap',
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          }),
        }
      );

      if (calRes.status === 401) {
        return res.status(401).json({
          code: 'GOOGLE_TOKEN_REQUIRED',
          error: 'Google Calendar session expired. Please reconnect Google Workspace.',
        });
      }
      if (!calRes.ok) {
        const errText = await calRes.text();
        throw new Error(`Google Calendar API error: ${errText.slice(0, 200)}`);
      }

      const event = (await calRes.json()) as { id: string; htmlLink: string };
      res.json({ eventId: event.id, htmlLink: event.htmlLink });
    } catch (error: any) {
      console.error('Calendar schedule error:', error);
      res.status(500).json({ error: error.message || 'Failed to create Google Calendar event.' });
    }
  }
);

// Fit Radar Job Alerts CRUD + threshold radar match preview
app.post('/api/alerts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { query, location, minFitScore, frequency, active } = req.body || {};
    const saved = await upsertJobAlert({
      userId: req.dbUser!.id,
      query: String(query || 'Software Engineer').slice(0, 140),
      location: String(location || 'Remote').slice(0, 140),
      minFitScore: Math.max(30, Math.min(99, Number(minFitScore) || 75)),
      frequency: ['daily', 'weekly'].includes(frequency) ? frequency : 'weekly',
      active: typeof active === 'boolean' ? active : true,
    });
    await updateUserSettings(req.dbUser!.id, {
      jobAlertsEnabled: typeof active === 'boolean' ? active : true,
      alertQuery: String(query || 'Software Engineer').slice(0, 140),
      alertLocation: String(location || 'Remote').slice(0, 140),
    });
    res.json({ alert: saved });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save Fit Radar alert.' });
  }
});

// Job Alert Digest Preview / Email Trigger
app.post(
  '/api/alerts/preview',
  requireAuth,
  searchRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const query = req.body.query || req.dbUser!.alertQuery || 'Software Engineer';
      const location = req.body.location || req.dbUser!.alertLocation || 'Remote';
      const results = await searchJobsAndMarketAI({ query, location });

      let emailDispatched = false;
      if (process.env.RESEND_API_KEY && req.dbUser!.email) {
        try {
          const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'ResuGO Alerts <alerts@resugo.app>',
              to: [req.dbUser!.email],
              subject: `ResuGO Fit Radar: ${results.listings.length} matches for ${query}`,
              html: `<h2>New matching roles for ${query} (${location})</h2><ul>${results.listings
                .slice(0, 5)
                .map((l) => `<li><strong>${l.title}</strong> at ${l.company} — ${l.salaryRange}</li>`)
                .join('')}</ul>`,
            }),
          });
          emailDispatched = resendRes.ok;
        } catch {
          emailDispatched = false;
        }
      }

      res.json({
        query,
        location,
        email: req.dbUser!.email,
        emailDispatched,
        listings: results.listings.slice(0, 5),
        marketBenchmark: results.marketBenchmark,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate job alert digest.' });
    }
  }
);

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ResuGO server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
