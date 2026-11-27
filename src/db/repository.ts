import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from './index.ts';
import {
  alerts,
  analyses,
  apiCache,
  GapReportData,
  JobRequirementsData,
  jobs,
  loginAttempts,
  NameAnalysisResult,
  nameProfiles,
  ParsedResumeData,
  ResumeBuilderConfig,
  resumes,
  resumeVersions,
  roadmaps,
  RoadmapWeekData,
  savedJobs,
  users,
} from './schema.ts';
import { encryptText } from '../server/crypto.ts';

// Local JSON fallback store ONLY used if Cloud SQL socket is unavailable in ephemeral preview containers
const LOCAL_STORE_PATH = path.resolve(process.cwd(), '.resugo-local-store.json');

interface LocalStoreData {
  seq: number;
  users: any[];
  nameProfiles: any[];
  resumes: any[];
  resumeVersions: any[];
  jobs: any[];
  analyses: any[];
  roadmaps: any[];
  savedJobs: any[];
  alerts: any[];
  loginAttempts: any[];
  apiCache: any[];
}

function readLocalStore(): LocalStoreData {
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf8'));
    }
  } catch {
    // ignore corrupt local file
  }
  return {
    seq: 100,
    users: [],
    nameProfiles: [],
    resumes: [],
    resumeVersions: [],
    jobs: [],
    analyses: [],
    roadmaps: [],
    savedJobs: [],
    alerts: [],
    loginAttempts: [],
    apiCache: [],
  };
}

function writeLocalStore(data: LocalStoreData) {
  try {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error('Local store write error:', err);
  }
}

function isDbConnectionError(err: any): boolean {
  const msg = String(err?.message || err?.cause?.message || '');
  const code = String(err?.code || err?.cause?.code || '');
  return (
    code === 'ENOENT' ||
    code === 'ECONNREFUSED' ||
    code === '42P01' || // undefined_table
    code === '42703' || // undefined_column
    msg.includes('ENOENT') ||
    msg.includes('Connection terminated') ||
    msg.includes('does not exist')
  );
}

export const DEFAULT_BUILDER_CONFIG: ResumeBuilderConfig = {
  templateId: 'ats-classic',
  font: 'plus-jakarta',
  accentColor: 'teal',
  spacing: 'balanced',
  margin: 'standard',
  atsSafeMode: true,
  showPhoto: false,
  regionFormat: 'US',
  sectionOrder: [
    'summary',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
    'awards',
    'volunteering',
    'publications',
  ],
  targetLanguage: 'en',
};

export const RESUME_TEMPLATES = [
  { id: 'ats-classic', name: 'ATS Classic Single-Column', category: 'ats', description: 'Standard headings, single column, maximum ATS parser accuracy.', isAtsSafe: true, defaultAccent: 'teal', layout: 'single-column' },
  { id: 'ats-compact', name: 'ATS Dense Engineering', category: 'ats', description: 'High-density single-column layout built for 1-page engineering resumes.', isAtsSafe: true, defaultAccent: 'slate', layout: 'compact' },
  { id: 'modern-teal', name: 'Modern Teal Accent', category: 'modern', description: 'Crisp hairline dividers with subtle teal hierarchy.', isAtsSafe: true, defaultAccent: 'teal', layout: 'single-column' },
  { id: 'modern-indigo', name: 'Modern Indigo Split', category: 'modern', description: 'Balanced two-column header & sidebar skills layout.', isAtsSafe: false, defaultAccent: 'indigo', layout: 'two-column' },
  { id: 'executive-serif', name: 'Executive Boardroom', category: 'executive', description: 'Authoritative executive leadership layout prioritizing impact metrics.', isAtsSafe: true, defaultAccent: 'slate', layout: 'single-column' },
  { id: 'executive-slate', name: 'Executive Minimalist', category: 'executive', description: 'Generous margins and clean summary-first hierarchy.', isAtsSafe: true, defaultAccent: 'indigo', layout: 'single-column' },
  { id: 'fresher-campus', name: 'Fresher & Campus Grad', category: 'fresher', description: 'Leads with education, coursework, and capstone projects.', isAtsSafe: true, defaultAccent: 'teal', layout: 'single-column' },
  { id: 'fresher-internship', name: 'Internship & Projects', category: 'fresher', description: 'Project-led experience formatting for students and career switchers.', isAtsSafe: true, defaultAccent: 'indigo', layout: 'single-column' },
  { id: 'academic-cv', name: 'Academic & Research CV', category: 'academic', description: 'Dedicated prominence for publications, awards, and teaching.', isAtsSafe: true, defaultAccent: 'slate', layout: 'single-column' },
  { id: 'academic-fellow', name: 'Lab & Grant CV', category: 'academic', description: 'Clean multi-page academic timeline for fellowships and PhDs.', isAtsSafe: true, defaultAccent: 'teal', layout: 'single-column' },
  { id: 'creative-product', name: 'Product & Design Lead', category: 'creative', description: 'Two-column showcase highlighting portfolio links and case studies.', isAtsSafe: false, defaultAccent: 'teal', layout: 'two-column' },
  { id: 'creative-editorial', name: 'Editorial Studio', category: 'creative', description: 'Clean typographic studio resume for writers, marketers, and PMs.', isAtsSafe: false, defaultAccent: 'indigo', layout: 'two-column' },
];

export async function getOrCreateUser(input: {
  uid: string;
  email: string;
  displayName?: string | null;
  photoUrl?: string | null;
}) {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, input.uid))
      .limit(1);

    const result = await db
      .insert(users)
      .values({
        uid: input.uid,
        email: input.email,
        displayName: input.displayName ?? null,
        canonicalName: input.displayName ?? null,
        photoUrl: input.photoUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: input.email,
          displayName: input.displayName ?? existing[0]?.displayName ?? null,
          photoUrl: input.photoUrl ?? existing[0]?.photoUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    const user = result[0];
    if (existing.length === 0) {
      await seedDemoWorkspaceForUser(user.id);
    }
    return user;
  } catch (error) {
    if (!isDbConnectionError(error)) {
      console.error('Database error in getOrCreateUser:', error);
      throw new Error('Failed to load user profile.', { cause: error });
    }
    const store = readLocalStore();
    let user = store.users.find((u) => u.uid === input.uid);
    let isNew = false;
    if (!user) {
      isNew = true;
      user = {
        id: ++store.seq,
        uid: input.uid,
        email: input.email,
        displayName: input.displayName ?? null,
        canonicalName: input.displayName ?? null,
        photoUrl: input.photoUrl ?? null,
        preferredLang: 'en',
        darkMode: false,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        jobAlertsEnabled: false,
        alertQuery: null,
        alertLocation: null,
        sessionsRevokedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.users.push(user);
    } else {
      user.email = input.email;
      if (input.displayName) user.displayName = input.displayName;
      if (input.photoUrl) user.photoUrl = input.photoUrl;
      user.updatedAt = new Date().toISOString();
    }
    writeLocalStore(store);
    if (isNew) {
      await seedDemoWorkspaceForUser(user.id);
    }
    return user;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const candidate = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (candidate.length !== original.length) return false;
  return crypto.timingSafeEqual(candidate, original);
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] || null;
  } catch (error) {
    if (!isDbConnectionError(error)) return null;
    const store = readLocalStore();
    return store.users.find((u) => u.uid === uid) || null;
  }
}

export async function registerLocalEmailUser(input: {
  email: string;
  password: string;
  displayName?: string | null;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const uid = `local_${crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 24)}`;
  const passwordHash = hashPassword(input.password);

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existing.length > 0 && existing[0].passwordHash) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          passwordHash,
          displayName: input.displayName || existing[0].displayName,
          canonicalName: input.displayName || existing[0].canonicalName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      return updated[0];
    }
    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        passwordHash,
        displayName: input.displayName || normalizedEmail.split('@')[0],
        canonicalName: input.displayName || normalizedEmail.split('@')[0],
      })
      .returning();
    const user = inserted[0];
    await seedDemoWorkspaceForUser(user.id);
    return user;
  } catch (error: any) {
    if (!isDbConnectionError(error)) throw error;
    const store = readLocalStore();
    let user = store.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (user && user.passwordHash) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }
    let isNew = false;
    if (!user) {
      isNew = true;
      user = {
        id: ++store.seq,
        uid,
        email: normalizedEmail,
        passwordHash,
        displayName: input.displayName || normalizedEmail.split('@')[0],
        canonicalName: input.displayName || normalizedEmail.split('@')[0],
        photoUrl: null,
        preferredLang: 'en',
        darkMode: false,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        jobAlertsEnabled: false,
        alertQuery: null,
        alertLocation: null,
        sessionsRevokedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.users.push(user);
    } else {
      user.passwordHash = passwordHash;
      if (input.displayName) {
        user.displayName = input.displayName;
        user.canonicalName = user.canonicalName || input.displayName;
      }
      user.updatedAt = new Date().toISOString();
    }
    writeLocalStore(store);
    if (isNew) {
      await seedDemoWorkspaceForUser(user.id);
    }
    return user;
  }
}

export async function authenticateLocalEmailUser(input: {
  email: string;
  password: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    const user = rows[0];
    if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      return null;
    }
    return user;
  } catch (error) {
    if (!isDbConnectionError(error)) return null;
    const store = readLocalStore();
    const user = store.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      return null;
    }
    return user;
  }
}

export async function findPotentialDuplicateUsers(
  currentUserId: number | undefined,
  canonicalName: string,
  email: string
) {
  try {
    const all = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        canonicalName: users.canonicalName,
      })
      .from(users);
    return all.filter((u) => {
      if (currentUserId && u.id === currentUserId) return false;
      const nameMatch =
        (u.canonicalName || u.displayName || '').toLowerCase().trim() ===
        canonicalName.toLowerCase().trim();
      const emailPrefixA = (u.email || '').split('@')[0]?.toLowerCase();
      const emailPrefixB = email.split('@')[0]?.toLowerCase();
      return (nameMatch && canonicalName.length > 3) || (emailPrefixA && emailPrefixA === emailPrefixB && emailPrefixA.length > 4);
    });
  } catch (error) {
    if (!isDbConnectionError(error)) return [];
    const store = readLocalStore();
    return store.users.filter((u) => {
      if (currentUserId && u.id === currentUserId) return false;
      const nameMatch =
        (u.canonicalName || u.displayName || '').toLowerCase().trim() ===
        canonicalName.toLowerCase().trim();
      return nameMatch && canonicalName.length > 3;
    });
  }
}

export async function upsertNameProfile(input: {
  userId: number;
  googleProfileName?: string | null;
  resumeExtractedName?: string | null;
  analysis: NameAnalysisResult;
  userConfirmed?: boolean;
}) {
  try {
    const existing = await db
      .select()
      .from(nameProfiles)
      .where(eq(nameProfiles.userId, input.userId))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(nameProfiles)
        .set({
          rawInputName: input.analysis.rawInputName,
          googleProfileName: input.googleProfileName ?? existing[0].googleProfileName,
          resumeExtractedName: input.resumeExtractedName ?? existing[0].resumeExtractedName,
          canonicalName: input.analysis.canonicalName,
          normalizedName: input.analysis.normalizedName,
          parsedParts: input.analysis.parsedParts,
          phoneticSpelling: input.analysis.phoneticSpelling,
          pronunciationText: input.analysis.pronunciationText,
          validityStatus: input.analysis.validityStatus,
          validityFlags: input.analysis.validityFlags,
          mismatchWarning: input.analysis.mismatchWarning,
          duplicateWarning: input.analysis.duplicateWarning,
          suggestions: input.analysis.suggestions,
          userConfirmed: input.userConfirmed ?? true,
          updatedAt: new Date(),
        })
        .where(eq(nameProfiles.userId, input.userId))
        .returning();
      await db
        .update(users)
        .set({ canonicalName: input.analysis.canonicalName, updatedAt: new Date() })
        .where(eq(users.id, input.userId));
      return updated[0];
    }

    const inserted = await db
      .insert(nameProfiles)
      .values({
        userId: input.userId,
        rawInputName: input.analysis.rawInputName,
        googleProfileName: input.googleProfileName ?? null,
        resumeExtractedName: input.resumeExtractedName ?? null,
        canonicalName: input.analysis.canonicalName,
        normalizedName: input.analysis.normalizedName,
        parsedParts: input.analysis.parsedParts,
        phoneticSpelling: input.analysis.phoneticSpelling,
        pronunciationText: input.analysis.pronunciationText,
        validityStatus: input.analysis.validityStatus,
        validityFlags: input.analysis.validityFlags,
        mismatchWarning: input.analysis.mismatchWarning,
        duplicateWarning: input.analysis.duplicateWarning,
        suggestions: input.analysis.suggestions,
        userConfirmed: input.userConfirmed ?? true,
      })
      .returning();

    await db
      .update(users)
      .set({ canonicalName: input.analysis.canonicalName, updatedAt: new Date() })
      .where(eq(users.id, input.userId));

    return inserted[0];
  } catch (error) {
    if (!isDbConnectionError(error)) {
      console.error('Database error in upsertNameProfile:', error);
      throw new Error('Failed to save name profile.', { cause: error });
    }
    const store = readLocalStore();
    const idx = store.nameProfiles.findIndex((n) => n.userId === input.userId);
    const record = {
      id: idx >= 0 ? store.nameProfiles[idx].id : ++store.seq,
      userId: input.userId,
      rawInputName: input.analysis.rawInputName,
      googleProfileName: input.googleProfileName ?? null,
      resumeExtractedName: input.resumeExtractedName ?? null,
      canonicalName: input.analysis.canonicalName,
      normalizedName: input.analysis.normalizedName,
      parsedParts: input.analysis.parsedParts,
      phoneticSpelling: input.analysis.phoneticSpelling,
      pronunciationText: input.analysis.pronunciationText,
      validityStatus: input.analysis.validityStatus,
      validityFlags: input.analysis.validityFlags,
      mismatchWarning: input.analysis.mismatchWarning,
      duplicateWarning: input.analysis.duplicateWarning,
      suggestions: input.analysis.suggestions,
      userConfirmed: input.userConfirmed ?? true,
      createdAt: idx >= 0 ? store.nameProfiles[idx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) store.nameProfiles[idx] = record;
    else store.nameProfiles.push(record);

    const u = store.users.find((x) => x.id === input.userId);
    if (u) u.canonicalName = input.analysis.canonicalName;
    writeLocalStore(store);
    return record;
  }
}

export async function deleteNameProfile(userId: number) {
  try {
    await db.delete(nameProfiles).where(eq(nameProfiles.userId, userId));
    await db.update(users).set({ canonicalName: null, updatedAt: new Date() }).where(eq(users.id, userId));
  } catch (error) {
    if (!isDbConnectionError(error)) throw new Error('Failed to delete name profile.', { cause: error });
    const store = readLocalStore();
    store.nameProfiles = store.nameProfiles.filter((n) => n.userId !== userId);
    const u = store.users.find((x) => x.id === userId);
    if (u) u.canonicalName = null;
    writeLocalStore(store);
  }
}

export async function updateUserSettings(
  userId: number,
  updates: Partial<{
    preferredLang: string;
    darkMode: boolean;
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    canonicalName: string | null;
    jobAlertsEnabled: boolean;
    alertQuery: string | null;
    alertLocation: string | null;
    sessionsRevokedAt: Date;
  }>
) {
  try {
    const result = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to update user preferences.', { cause: error });
    }
    const store = readLocalStore();
    const u = store.users.find((x) => x.id === userId);
    if (u) {
      Object.assign(u, updates, { updatedAt: new Date().toISOString() });
      writeLocalStore(store);
    }
    return u;
  }
}

export async function deleteAllUserData(userId: number) {
  try {
    await db.delete(alerts).where(eq(alerts.userId, userId));
    await db.delete(roadmaps).where(eq(roadmaps.userId, userId));
    await db.delete(savedJobs).where(eq(savedJobs.userId, userId));
    await db.delete(analyses).where(eq(analyses.userId, userId));
    await db.delete(resumeVersions).where(eq(resumeVersions.userId, userId));
    await db.delete(resumes).where(eq(resumes.userId, userId));
    await db.delete(nameProfiles).where(eq(nameProfiles.userId, userId));
    await db
      .update(users)
      .set({
        canonicalName: null,
        jobAlertsEnabled: false,
        alertQuery: null,
        alertLocation: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to delete account data.', { cause: error });
    }
    const store = readLocalStore();
    store.alerts = store.alerts.filter((x) => x.userId !== userId);
    store.roadmaps = store.roadmaps.filter((x) => x.userId !== userId);
    store.savedJobs = store.savedJobs.filter((x) => x.userId !== userId);
    store.analyses = store.analyses.filter((x) => x.userId !== userId);
    store.resumeVersions = store.resumeVersions.filter((x) => x.userId !== userId);
    store.resumes = store.resumes.filter((x) => x.userId !== userId);
    store.nameProfiles = store.nameProfiles.filter((x) => x.userId !== userId);
    writeLocalStore(store);
  }
}

export async function recordLoginAttempt(input: {
  identifier: string;
  ipAddress?: string;
  email?: string;
  attemptType: string;
  success: boolean;
  captchaScore?: string;
  reason?: string;
  lockedUntil?: Date | null;
}) {
  try {
    await db.insert(loginAttempts).values({
      identifier: input.identifier,
      ipAddress: input.ipAddress ?? null,
      email: input.email ?? null,
      attemptType: input.attemptType,
      success: input.success,
      captchaScore: input.captchaScore ?? null,
      reason: input.reason ?? null,
      lockedUntil: input.lockedUntil ?? null,
    });
  } catch (error) {
    if (!isDbConnectionError(error)) return;
    const store = readLocalStore();
    store.loginAttempts.push({
      id: ++store.seq,
      ...input,
      lockedUntil: input.lockedUntil?.toISOString() ?? null,
      createdAt: new Date().toISOString(),
    });
    if (store.loginAttempts.length > 400) {
      store.loginAttempts = store.loginAttempts.slice(-200);
    }
    writeLocalStore(store);
  }
}

export async function checkAttemptLockout(identifier: string): Promise<{
  locked: boolean;
  recentFailures: number;
  lockedUntil: Date | null;
}> {
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  try {
    const rows = await db
      .select()
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.identifier, identifier),
          gt(loginAttempts.createdAt, fifteenMinsAgo)
        )
      )
      .orderBy(desc(loginAttempts.createdAt))
      .limit(20);

    const activeLock = rows.find(
      (r) => r.lockedUntil && new Date(r.lockedUntil).getTime() > Date.now()
    );
    const failures = rows.filter((r) => !r.success).length;
    return {
      locked: Boolean(activeLock) || failures >= 6,
      recentFailures: failures,
      lockedUntil: activeLock?.lockedUntil ? new Date(activeLock.lockedUntil) : null,
    };
  } catch (error) {
    if (!isDbConnectionError(error)) {
      return { locked: false, recentFailures: 0, lockedUntil: null };
    }
    const store = readLocalStore();
    const rows = store.loginAttempts.filter(
      (r) =>
        r.identifier === identifier &&
        new Date(r.createdAt).getTime() > fifteenMinsAgo.getTime()
    );
    const activeLock = rows.find(
      (r) => r.lockedUntil && new Date(r.lockedUntil).getTime() > Date.now()
    );
    const failures = rows.filter((r) => !r.success).length;
    return {
      locked: Boolean(activeLock) || failures >= 6,
      recentFailures: failures,
      lockedUntil: activeLock?.lockedUntil ? new Date(activeLock.lockedUntil) : null,
    };
  }
}

export async function createResumeRecord(input: {
  userId: number;
  title: string;
  fileName?: string | null;
  fileType: string;
  fileSizeBytes: number;
  rawText: string;
  parsedData: ParsedResumeData;
  source: string;
  builderConfig?: ResumeBuilderConfig;
  changeNote?: string;
}) {
  const slug = `${(input.parsedData.contactInfo?.name || 'candidate')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28)}-${crypto.randomBytes(3).toString('hex')}`;

  const config = input.builderConfig || DEFAULT_BUILDER_CONFIG;
  const encrypted = encryptText(input.rawText);

  try {
    const existingResumes = await db
      .select({ version: resumes.version })
      .from(resumes)
      .where(eq(resumes.userId, input.userId))
      .orderBy(desc(resumes.version))
      .limit(1);

    const nextVersion =
      existingResumes.length > 0 ? existingResumes[0].version + 1 : 1;

    const result = await db
      .insert(resumes)
      .values({
        userId: input.userId,
        title: input.title,
        fileName: input.fileName ?? null,
        fileType: input.fileType,
        fileSizeBytes: input.fileSizeBytes,
        encryptedRawText: encrypted,
        parsedData: input.parsedData,
        activeTemplateId: config.templateId,
        builderConfig: config,
        publicPortfolioSlug: slug,
        isPortfolioPublic: false,
        version: nextVersion,
        source: input.source,
      })
      .returning();

    const saved = result[0];
    await db.insert(resumeVersions).values({
      resumeId: saved.id,
      userId: input.userId,
      versionNumber: 1,
      label: 'Initial Version',
      changeNote: input.changeNote || `Imported via ${input.source}`,
      encryptedRawText: encrypted,
      parsedData: input.parsedData,
      builderConfig: config,
    });

    return saved;
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to save resume.', { cause: error });
    }
    const store = readLocalStore();
    const userRes = store.resumes.filter((r) => r.userId === input.userId);
    const nextVersion =
      userRes.length > 0 ? Math.max(...userRes.map((r) => r.version)) + 1 : 1;

    const saved = {
      id: ++store.seq,
      userId: input.userId,
      title: input.title,
      fileName: input.fileName ?? null,
      fileType: input.fileType,
      fileSizeBytes: input.fileSizeBytes,
      encryptedRawText: encrypted,
      parsedData: input.parsedData,
      activeTemplateId: config.templateId,
      builderConfig: config,
      publicPortfolioSlug: slug,
      isPortfolioPublic: false,
      version: nextVersion,
      source: input.source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.resumes.push(saved);
    store.resumeVersions.push({
      id: ++store.seq,
      resumeId: saved.id,
      userId: input.userId,
      versionNumber: 1,
      label: 'Initial Version',
      changeNote: input.changeNote || `Imported via ${input.source}`,
      encryptedRawText: encrypted,
      parsedData: input.parsedData,
      builderConfig: config,
      createdAt: new Date().toISOString(),
    });
    writeLocalStore(store);
    return saved;
  }
}

export async function updateResumeBuilderState(input: {
  userId: number;
  resumeId: number;
  title?: string;
  parsedData: ParsedResumeData;
  builderConfig: ResumeBuilderConfig;
  rawText: string;
  isPortfolioPublic?: boolean;
  saveSnapshot?: boolean;
  snapshotLabel?: string;
  changeNote?: string;
}) {
  const encrypted = encryptText(input.rawText);
  try {
    const existingRows = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, input.resumeId), eq(resumes.userId, input.userId)))
      .limit(1);

    if (existingRows.length === 0) return null;
    const current = existingRows[0];

    const updatedRows = await db
      .update(resumes)
      .set({
        title: input.title || current.title,
        parsedData: input.parsedData,
        activeTemplateId: input.builderConfig.templateId,
        builderConfig: input.builderConfig,
        encryptedRawText: encrypted,
        isPortfolioPublic:
          typeof input.isPortfolioPublic === 'boolean'
            ? input.isPortfolioPublic
            : current.isPortfolioPublic,
        version: input.saveSnapshot ? current.version + 1 : current.version,
        updatedAt: new Date(),
      })
      .where(eq(resumes.id, current.id))
      .returning();

    if (input.saveSnapshot) {
      const existingVers = await db
        .select({ versionNumber: resumeVersions.versionNumber })
        .from(resumeVersions)
        .where(eq(resumeVersions.resumeId, current.id))
        .orderBy(desc(resumeVersions.versionNumber))
        .limit(1);
      const nextVer = (existingVers[0]?.versionNumber || 0) + 1;

      await db.insert(resumeVersions).values({
        resumeId: current.id,
        userId: input.userId,
        versionNumber: nextVer,
        label: input.snapshotLabel || `Revision v${nextVer}`,
        changeNote: input.changeNote || 'Updated in Resume Builder',
        encryptedRawText: encrypted,
        parsedData: input.parsedData,
        builderConfig: input.builderConfig,
      });
    }

    return updatedRows[0];
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to save resume builder changes.', { cause: error });
    }
    const store = readLocalStore();
    const r = store.resumes.find(
      (x) => x.id === input.resumeId && x.userId === input.userId
    );
    if (!r) return null;
    if (input.title) r.title = input.title;
    r.parsedData = input.parsedData;
    r.activeTemplateId = input.builderConfig.templateId;
    r.builderConfig = input.builderConfig;
    r.encryptedRawText = encrypted;
    if (typeof input.isPortfolioPublic === 'boolean') {
      r.isPortfolioPublic = input.isPortfolioPublic;
    }
    r.updatedAt = new Date().toISOString();
    if (input.saveSnapshot) {
      r.version = (r.version || 1) + 1;
      const vers = store.resumeVersions.filter((v) => v.resumeId === r.id);
      const nextVer = vers.length > 0 ? Math.max(...vers.map((v) => v.versionNumber)) + 1 : 1;
      store.resumeVersions.push({
        id: ++store.seq,
        resumeId: r.id,
        userId: input.userId,
        versionNumber: nextVer,
        label: input.snapshotLabel || `Revision v${nextVer}`,
        changeNote: input.changeNote || 'Updated in Resume Builder',
        encryptedRawText: encrypted,
        parsedData: input.parsedData,
        builderConfig: input.builderConfig,
        createdAt: new Date().toISOString(),
      });
    }
    writeLocalStore(store);
    return r;
  }
}

export async function getResumeVersions(userId: number, resumeId: number) {
  try {
    return await db
      .select({
        id: resumeVersions.id,
        resumeId: resumeVersions.resumeId,
        versionNumber: resumeVersions.versionNumber,
        label: resumeVersions.label,
        changeNote: resumeVersions.changeNote,
        parsedData: resumeVersions.parsedData,
        builderConfig: resumeVersions.builderConfig,
        createdAt: resumeVersions.createdAt,
      })
      .from(resumeVersions)
      .where(
        and(
          eq(resumeVersions.resumeId, resumeId),
          eq(resumeVersions.userId, userId)
        )
      )
      .orderBy(desc(resumeVersions.versionNumber));
  } catch (error) {
    if (!isDbConnectionError(error)) return [];
    const store = readLocalStore();
    return store.resumeVersions
      .filter((v) => v.resumeId === resumeId && v.userId === userId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }
}

export async function getPublicResumePortfolio(slug: string) {
  try {
    const rows = await db
      .select({
        id: resumes.id,
        title: resumes.title,
        parsedData: resumes.parsedData,
        builderConfig: resumes.builderConfig,
        activeTemplateId: resumes.activeTemplateId,
        isPortfolioPublic: resumes.isPortfolioPublic,
        publicPortfolioSlug: resumes.publicPortfolioSlug,
        updatedAt: resumes.updatedAt,
      })
      .from(resumes)
      .where(eq(resumes.publicPortfolioSlug, slug))
      .limit(1);
    if (rows.length === 0 || !rows[0].isPortfolioPublic) return null;
    return rows[0];
  } catch (error) {
    if (!isDbConnectionError(error)) return null;
    const store = readLocalStore();
    const r = store.resumes.find(
      (x) => x.publicPortfolioSlug === slug && x.isPortfolioPublic
    );
    return r || null;
  }
}

export async function deleteResumeRecord(userId: number, resumeId: number) {
  try {
    await db
      .delete(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to delete resume.', { cause: error });
    }
    const store = readLocalStore();
    store.resumes = store.resumes.filter(
      (r) => !(r.id === resumeId && r.userId === userId)
    );
    store.resumeVersions = store.resumeVersions.filter(
      (v) => v.resumeId !== resumeId
    );
    writeLocalStore(store);
  }
}

export async function getResumeByIdForUser(userId: number, resumeId: number) {
  try {
    const rows = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    if (!isDbConnectionError(error)) return null;
    const store = readLocalStore();
    return (
      store.resumes.find((r) => r.id === resumeId && r.userId === userId) ?? null
    );
  }
}

export async function createJobRecord(input: {
  title: string;
  company: string;
  location?: string | null;
  salaryRange?: string | null;
  source: string;
  externalUrl?: string | null;
  descriptionText: string;
  extractedRequirements: JobRequirementsData;
}) {
  try {
    const result = await db
      .insert(jobs)
      .values({
        title: input.title,
        company: input.company,
        location: input.location ?? null,
        salaryRange: input.salaryRange ?? null,
        source: input.source,
        externalUrl: input.externalUrl ?? null,
        descriptionText: input.descriptionText,
        extractedRequirements: input.extractedRequirements,
      })
      .returning();
    return result[0];
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to save target job.', { cause: error });
    }
    const store = readLocalStore();
    const job = {
      id: ++store.seq,
      ...input,
      location: input.location ?? null,
      salaryRange: input.salaryRange ?? null,
      externalUrl: input.externalUrl ?? null,
      createdAt: new Date().toISOString(),
    };
    store.jobs.push(job);
    writeLocalStore(store);
    return job;
  }
}

export async function createAnalysisAndRoadmap(input: {
  userId?: number | null;
  guestSessionId?: string | null;
  resumeId?: number | null;
  jobId: number;
  overallScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  keywordsScore: number;
  gapReport: GapReportData;
  roadmapTitle: string;
  roadmapWeeks: RoadmapWeekData[];
  isSeed?: boolean;
}) {
  const shareToken = crypto.randomBytes(8).toString('hex');
  try {
    const analysisRows = await db
      .insert(analyses)
      .values({
        userId: input.userId ?? null,
        guestSessionId: input.guestSessionId ?? null,
        resumeId: input.resumeId ?? null,
        jobId: input.jobId,
        shareToken,
        overallScore: input.overallScore,
        skillsScore: input.skillsScore,
        experienceScore: input.experienceScore,
        educationScore: input.educationScore,
        keywordsScore: input.keywordsScore,
        gapReport: input.gapReport,
        isSeed: input.isSeed ?? false,
      })
      .returning();

    const analysis = analysisRows[0];
    let roadmap = null;
    if (input.userId) {
      const roadmapRows = await db
        .insert(roadmaps)
        .values({
          userId: input.userId,
          analysisId: analysis.id,
          title: input.roadmapTitle,
          weeks: input.roadmapWeeks,
        })
        .returning();
      roadmap = roadmapRows[0];
    }
    return { analysis, roadmap };
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to save gap analysis.', { cause: error });
    }
    const store = readLocalStore();
    const analysis = {
      id: ++store.seq,
      userId: input.userId ?? null,
      guestSessionId: input.guestSessionId ?? null,
      resumeId: input.resumeId ?? null,
      jobId: input.jobId,
      shareToken,
      overallScore: input.overallScore,
      skillsScore: input.skillsScore,
      experienceScore: input.experienceScore,
      educationScore: input.educationScore,
      keywordsScore: input.keywordsScore,
      gapReport: input.gapReport,
      isSeed: input.isSeed ?? false,
      createdAt: new Date().toISOString(),
    };
    store.analyses.push(analysis);
    let roadmap = null;
    if (input.userId) {
      roadmap = {
        id: ++store.seq,
        userId: input.userId,
        analysisId: analysis.id,
        title: input.roadmapTitle,
        weeks: input.roadmapWeeks,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.roadmaps.push(roadmap);
    }
    writeLocalStore(store);
    return { analysis, roadmap };
  }
}

export async function countGuestAnalyses(guestSessionId: string): Promise<number> {
  try {
    const rows = await db
      .select({ id: analyses.id })
      .from(analyses)
      .where(eq(analyses.guestSessionId, guestSessionId));
    return rows.length;
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to verify guest quota.', { cause: error });
    }
    const store = readLocalStore();
    return store.analyses.filter((a) => a.guestSessionId === guestSessionId).length;
  }
}

export async function getUserDashboardData(userId: number) {
  try {
    const [userResumes, userAnalyses, userRoadmaps, userSavedJobs, userNameProfile, userAlerts] =
      await Promise.all([
        db
          .select({
            id: resumes.id,
            title: resumes.title,
            fileName: resumes.fileName,
            fileType: resumes.fileType,
            fileSizeBytes: resumes.fileSizeBytes,
            parsedData: resumes.parsedData,
            activeTemplateId: resumes.activeTemplateId,
            builderConfig: resumes.builderConfig,
            publicPortfolioSlug: resumes.publicPortfolioSlug,
            isPortfolioPublic: resumes.isPortfolioPublic,
            version: resumes.version,
            source: resumes.source,
            createdAt: resumes.createdAt,
          })
          .from(resumes)
          .where(eq(resumes.userId, userId))
          .orderBy(desc(resumes.createdAt)),
        db
          .select({ analysis: analyses, job: jobs })
          .from(analyses)
          .innerJoin(jobs, eq(analyses.jobId, jobs.id))
          .where(eq(analyses.userId, userId))
          .orderBy(desc(analyses.createdAt)),
        db
          .select()
          .from(roadmaps)
          .where(eq(roadmaps.userId, userId))
          .orderBy(desc(roadmaps.createdAt)),
        db
          .select({ savedJob: savedJobs, job: jobs })
          .from(savedJobs)
          .innerJoin(jobs, eq(savedJobs.jobId, jobs.id))
          .where(eq(savedJobs.userId, userId))
          .orderBy(desc(savedJobs.createdAt)),
        db
          .select()
          .from(nameProfiles)
          .where(eq(nameProfiles.userId, userId))
          .limit(1),
        db
          .select()
          .from(alerts)
          .where(eq(alerts.userId, userId))
          .orderBy(desc(alerts.createdAt)),
      ]);

    return {
      resumes: userResumes,
      analyses: userAnalyses.map((row) => ({ ...row.analysis, job: row.job })),
      roadmaps: userRoadmaps,
      savedJobs: userSavedJobs.map((row) => ({ ...row.savedJob, job: row.job })),
      nameProfile: userNameProfile[0] ?? null,
      alerts: userAlerts,
      templates: RESUME_TEMPLATES,
    };
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to load workspace dashboard.', { cause: error });
    }
    const store = readLocalStore();
    const userResumes = store.resumes
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(({ encryptedRawText: _e, ...rest }) => rest);
    const userAnalyses = store.analyses
      .filter((a) => a.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((a) => ({
        ...a,
        job: store.jobs.find((j) => j.id === a.jobId),
      }))
      .filter((a) => a.job);
    const userRoadmaps = store.roadmaps
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const userSavedJobs = store.savedJobs
      .filter((s) => s.userId === userId)
      .map((s) => ({ ...s, job: store.jobs.find((j) => j.id === s.jobId) }))
      .filter((s) => s.job);
    const userNameProfile = store.nameProfiles.find((n) => n.userId === userId) ?? null;
    const userAlerts = store.alerts.filter((a) => a.userId === userId);

    return {
      resumes: userResumes,
      analyses: userAnalyses,
      roadmaps: userRoadmaps,
      savedJobs: userSavedJobs,
      nameProfile: userNameProfile,
      alerts: userAlerts,
      templates: RESUME_TEMPLATES,
    };
  }
}

export async function getAnalysisByIdOrToken(opts: {
  id?: number;
  shareToken?: string;
  userId?: number;
  guestSessionId?: string;
}) {
  try {
    const condition = opts.shareToken
      ? eq(analyses.shareToken, opts.shareToken)
      : eq(analyses.id, opts.id!);

    const rows = await db
      .select({ analysis: analyses, job: jobs })
      .from(analyses)
      .innerJoin(jobs, eq(analyses.jobId, jobs.id))
      .where(condition)
      .limit(1);

    if (rows.length === 0) return null;
    const row = rows[0];

    if (!opts.shareToken) {
      const ownerMatch = opts.userId && row.analysis.userId === opts.userId;
      const guestMatch =
        opts.guestSessionId && row.analysis.guestSessionId === opts.guestSessionId;
      if (!ownerMatch && !guestMatch) return null;
    }

    let relatedRoadmap = null;
    if (row.analysis.userId) {
      const rmRows = await db
        .select()
        .from(roadmaps)
        .where(eq(roadmaps.analysisId, row.analysis.id))
        .limit(1);
      relatedRoadmap = rmRows[0] ?? null;
    }

    return { ...row.analysis, job: row.job, roadmap: relatedRoadmap };
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to load analysis report.', { cause: error });
    }
    const store = readLocalStore();
    const a = store.analyses.find((x) =>
      opts.shareToken ? x.shareToken === opts.shareToken : x.id === opts.id
    );
    if (!a) return null;
    if (!opts.shareToken) {
      const ownerMatch = opts.userId && a.userId === opts.userId;
      const guestMatch = opts.guestSessionId && a.guestSessionId === opts.guestSessionId;
      if (!ownerMatch && !guestMatch) return null;
    }
    const job = store.jobs.find((j) => j.id === a.jobId);
    if (!job) return null;
    const roadmap = store.roadmaps.find((r) => r.analysisId === a.id) ?? null;
    return { ...a, job, roadmap };
  }
}

export async function updateRoadmapTask(input: {
  userId: number;
  roadmapId: number;
  taskId: string;
  completed?: boolean;
  calendarEventId?: string;
}) {
  try {
    const rows = await db
      .select()
      .from(roadmaps)
      .where(and(eq(roadmaps.id, input.roadmapId), eq(roadmaps.userId, input.userId)))
      .limit(1);

    if (rows.length === 0) return null;
    const current = rows[0];
    const updatedWeeks = current.weeks.map((week) => ({
      ...week,
      tasks: week.tasks.map((task) =>
        task.id !== input.taskId
          ? task
          : {
              ...task,
              completed:
                typeof input.completed === 'boolean' ? input.completed : task.completed,
              calendarEventId:
                input.calendarEventId !== undefined
                  ? input.calendarEventId
                  : task.calendarEventId,
            }
      ),
    }));

    const updated = await db
      .update(roadmaps)
      .set({ weeks: updatedWeeks, updatedAt: new Date() })
      .where(eq(roadmaps.id, current.id))
      .returning();

    return updated[0];
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to update roadmap progress.', { cause: error });
    }
    const store = readLocalStore();
    const rm = store.roadmaps.find(
      (r) => r.id === input.roadmapId && r.userId === input.userId
    );
    if (!rm) return null;
    rm.weeks = rm.weeks.map((week: RoadmapWeekData) => ({
      ...week,
      tasks: week.tasks.map((task) =>
        task.id !== input.taskId
          ? task
          : {
              ...task,
              completed:
                typeof input.completed === 'boolean' ? input.completed : task.completed,
              calendarEventId:
                input.calendarEventId !== undefined
                  ? input.calendarEventId
                  : task.calendarEventId,
            }
      ),
    }));
    rm.updatedAt = new Date().toISOString();
    writeLocalStore(store);
    return rm;
  }
}

export async function saveJobForUser(input: {
  userId: number;
  jobData: {
    title: string;
    company: string;
    location?: string | null;
    salaryRange?: string | null;
    source: string;
    externalUrl?: string | null;
    descriptionText: string;
    extractedRequirements: JobRequirementsData;
  };
  notes?: string;
}) {
  const job = await createJobRecord(input.jobData);
  try {
    const savedRows = await db
      .insert(savedJobs)
      .values({
        userId: input.userId,
        jobId: job.id,
        notes: input.notes ?? null,
        status: 'saved',
      })
      .returning();
    return { ...savedRows[0], job };
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to save job.', { cause: error });
    }
    const store = readLocalStore();
    const saved = {
      id: ++store.seq,
      userId: input.userId,
      jobId: job.id,
      notes: input.notes ?? null,
      status: 'saved',
      createdAt: new Date().toISOString(),
    };
    store.savedJobs.push(saved);
    writeLocalStore(store);
    return { ...saved, job };
  }
}

export async function updateSavedJobStatus(
  userId: number,
  savedJobId: number,
  status: string,
  notes?: string
) {
  try {
    const updated = await db
      .update(savedJobs)
      .set({ status, ...(notes !== undefined ? { notes } : {}) })
      .where(and(eq(savedJobs.id, savedJobId), eq(savedJobs.userId, userId)))
      .returning();
    return updated[0] ?? null;
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to update saved job.', { cause: error });
    }
    const store = readLocalStore();
    const s = store.savedJobs.find((x) => x.id === savedJobId && x.userId === userId);
    if (!s) return null;
    s.status = status;
    if (notes !== undefined) s.notes = notes;
    writeLocalStore(store);
    return s;
  }
}

export async function deleteSavedJob(userId: number, savedJobId: number) {
  try {
    await db
      .delete(savedJobs)
      .where(and(eq(savedJobs.id, savedJobId), eq(savedJobs.userId, userId)));
  } catch (error) {
    if (!isDbConnectionError(error)) {
      throw new Error('Failed to remove saved job.', { cause: error });
    }
    const store = readLocalStore();
    store.savedJobs = store.savedJobs.filter(
      (x) => !(x.id === savedJobId && x.userId === userId)
    );
    writeLocalStore(store);
  }
}

export async function upsertJobAlert(input: {
  userId: number;
  query: string;
  location: string;
  minFitScore: number;
  frequency: string;
  active: boolean;
}) {
  try {
    const existing = await db
      .select()
      .from(alerts)
      .where(eq(alerts.userId, input.userId))
      .limit(1);
    if (existing.length > 0) {
      const updated = await db
        .update(alerts)
        .set({
          query: input.query,
          location: input.location,
          minFitScore: input.minFitScore,
          frequency: input.frequency,
          active: input.active,
        })
        .where(eq(alerts.id, existing[0].id))
        .returning();
      return updated[0];
    }
    const inserted = await db
      .insert(alerts)
      .values(input)
      .returning();
    return inserted[0];
  } catch (error) {
    if (!isDbConnectionError(error)) return null;
    const store = readLocalStore();
    const existing = store.alerts.find((a) => a.userId === input.userId);
    if (existing) {
      Object.assign(existing, input);
      writeLocalStore(store);
      return existing;
    }
    const created = {
      id: ++store.seq,
      ...input,
      lastCheckedAt: null,
      lastMatchCount: 0,
      createdAt: new Date().toISOString(),
    };
    store.alerts.push(created);
    writeLocalStore(store);
    return created;
  }
}

export async function getCachedValue<T>(cacheKey: string): Promise<T | null> {
  try {
    const rows = await db
      .select()
      .from(apiCache)
      .where(
        and(eq(apiCache.cacheKey, cacheKey), gt(apiCache.expiresAt, new Date()))
      )
      .limit(1);
    return rows.length > 0 ? (rows[0].payload as T) : null;
  } catch (error) {
    if (!isDbConnectionError(error)) return null;
    const store = readLocalStore();
    const hit = store.apiCache.find(
      (c) => c.cacheKey === cacheKey && new Date(c.expiresAt).getTime() > Date.now()
    );
    return hit ? (hit.payload as T) : null;
  }
}

export async function setCachedValue(
  cacheKey: string,
  payload: unknown,
  ttlMinutes = 15
) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  try {
    await db
      .insert(apiCache)
      .values({ cacheKey, payload, expiresAt })
      .onConflictDoUpdate({
        target: apiCache.cacheKey,
        set: { payload, expiresAt },
      });
  } catch (error) {
    if (!isDbConnectionError(error)) return;
    const store = readLocalStore();
    const idx = store.apiCache.findIndex((c) => c.cacheKey === cacheKey);
    const entry = { cacheKey, payload, expiresAt: expiresAt.toISOString() };
    if (idx >= 0) store.apiCache[idx] = entry;
    else store.apiCache.push(entry);
    writeLocalStore(store);
  }
}

export async function exportFullGdprData(userId: number) {
  const dash = await getUserDashboardData(userId);
  return {
    exportedAt: new Date().toISOString(),
    service: 'ResuGO',
    ...dash,
  };
}

export async function seedDemoWorkspaceForUser(userId: number) {
  try {
    const demoResumeText = `Maya Subramanian
Senior Frontend Engineer · Bengaluru, India · maya.s@example.com
Summary: 4.5 years building React, TypeScript, and Next.js web products with strong accessibility and Web Vitals focus.
Experience:
- Frontend Engineer at CloudLedger (2023–Present): Built React 18 & TypeScript billing console serving 40k monthly accounts; reduced bundle size by 28%.
- UI Engineer at FinTrack (2021–2023): Delivered responsive Tailwind dashboards and REST API integrations.
Skills: React, TypeScript, Next.js, Tailwind CSS, JavaScript, REST APIs, Git, Jest, WCAG AA Accessibility
Education: B.E. Computer Science, Anna University (2021)`;

    const demoParsedResume: ParsedResumeData = {
      contactInfo: {
        name: 'Maya Subramanian',
        email: 'maya.s@example.com',
        phone: '+91 98400 11223',
        location: 'Bengaluru, India',
        github: 'github.com/mayasubramanian',
        linkedin: 'linkedin.com/in/maya-subramanian',
      },
      summary:
        '4.5 years building React, TypeScript, and Next.js web products with strong accessibility and Web Vitals focus.',
      totalYearsExp: 4.5,
      seniorityLevel: 'Mid-Senior',
      skills: [
        'React',
        'TypeScript',
        'Next.js',
        'Tailwind CSS',
        'JavaScript',
        'REST APIs',
        'Jest',
        'WCAG AA Accessibility',
        'Git',
      ],
      experience: [
        {
          role: 'Frontend Engineer',
          company: 'CloudLedger',
          duration: '2023 – Present',
          bullets: [
            'Built React 18 & TypeScript billing console serving 40k monthly accounts.',
            'Reduced initial JavaScript bundle size by 28% via code-splitting.',
          ],
        },
        {
          role: 'UI Engineer',
          company: 'FinTrack',
          duration: '2021 – 2023',
          bullets: [
            'Delivered responsive Tailwind dashboards and REST API integrations.',
          ],
        },
      ],
      education: [
        {
          degree: 'B.E. Computer Science',
          institution: 'Anna University',
          year: '2021',
        },
      ],
      certifications: ['Google UX Design Certificate'],
      projects: [
        {
          name: 'A11y Audit CLI',
          description:
            'Automated WCAG contrast and keyboard-trap checker for CI pipelines.',
          technologies: ['TypeScript', 'Node.js', 'Playwright'],
        },
      ],
      languages: [
        { language: 'English', proficiency: 'Fluent' },
        { language: 'Tamil', proficiency: 'Native' },
      ],
      awards: [
        { title: 'Best Engineering Demo', issuer: 'CloudLedger Hackathon', year: '2024' },
      ],
      volunteering: [
        {
          role: 'Frontend Mentor',
          organization: 'Open Web India',
          duration: '2023 – Present',
          description: 'Mentored 15 junior students on semantic HTML and WCAG accessibility.',
        },
      ],
      publications: [],
      customSections: [],
    };

    const resume1 = await createResumeRecord({
      userId,
      title: 'Frontend Engineer — Baseline Resume',
      fileName: 'maya_frontend_v1.pdf',
      fileType: 'application/pdf',
      fileSizeBytes: 184200,
      rawText: demoResumeText,
      parsedData: demoParsedResume,
      source: 'seed',
    });

    await upsertNameProfile({
      userId,
      googleProfileName: 'Maya Subramanian',
      resumeExtractedName: 'Maya Subramanian',
      analysis: {
        rawInputName: 'Maya Subramanian',
        normalizedName: 'Maya Subramanian',
        canonicalName: 'Maya Subramanian',
        parsedParts: {
          prefix: '',
          firstName: 'Maya',
          middleName: '',
          lastName: 'Subramanian',
          initials: 'M. S.',
          suffix: '',
          formatType: 'Given + Family (South Indian)',
        },
        validityStatus: 'valid',
        validityFlags: [],
        mismatchWarning: null,
        duplicateWarning: null,
        phoneticSpelling: 'MY-ah soo-brah-MAH-nee-uhn',
        pronunciationText: 'Maya Subramanian',
        suggestions: {
          fullName: 'Maya Subramanian',
          initialsStyle: 'Maya S.',
          atsSafeName: 'Maya Subramanian',
          emailIdeas: ['maya.subramanian@gmail.com', 'msubramanian.dev@gmail.com'],
          handleIdeas: ['maya-subramanian', 'mayasubramanian-dev'],
        },
      },
      userConfirmed: true,
    });

    const job1 = await createJobRecord({
      title: 'Senior Full-Stack Product Engineer',
      company: 'Stripe',
      location: 'Bengaluru / Hybrid',
      salaryRange: '₹38L – ₹52L / yr',
      source: 'seed',
      externalUrl: 'https://stripe.com/jobs',
      descriptionText:
        'Looking for a Senior Product Engineer with 5+ years of experience across React, TypeScript, Node.js, PostgreSQL, GraphQL, observability (OpenTelemetry), and CI/CD.',
      extractedRequirements: {
        requiredSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'GraphQL', 'System Design'],
        preferredSkills: ['OpenTelemetry', 'Docker', 'Playwright'],
        minYearsExp: 5,
        seniority: 'Senior',
        keywords: ['PostgreSQL', 'GraphQL', 'Node.js', 'OpenTelemetry', 'CI/CD', 'End-to-End Ownership'],
        educationRequirement: "Bachelor's in Computer Science or equivalent",
      },
    });

    const job2 = await createJobRecord({
      title: 'Staff Design Systems Engineer',
      company: 'Atlassian',
      location: 'Remote (India)',
      salaryRange: '₹42L – ₹58L / yr',
      source: 'seed',
      externalUrl: 'https://www.atlassian.com/company/careers',
      descriptionText:
        'Lead accessible React component libraries in TypeScript, Tailwind/CSS tokens, Playwright visual regression testing, and micro-frontend architecture.',
      extractedRequirements: {
        requiredSkills: ['React', 'TypeScript', 'WCAG AA Accessibility', 'Design Systems', 'Playwright'],
        preferredSkills: ['Storybook', 'CI/CD', 'Monorepos'],
        minYearsExp: 5,
        seniority: 'Senior / Staff',
        keywords: ['Design Tokens', 'Playwright', 'Storybook', 'Accessibility', 'TypeScript'],
        educationRequirement: "Bachelor's degree or equivalent practical experience",
      },
    });

    await saveJobForUser({
      userId,
      jobData: {
        title: job1.title,
        company: job1.company,
        location: job1.location,
        salaryRange: job1.salaryRange,
        source: 'seed',
        externalUrl: job1.externalUrl,
        descriptionText: job1.descriptionText,
        extractedRequirements: job1.extractedRequirements,
      },
      notes: 'Strong product fit; close PostgreSQL & GraphQL gap first.',
    });

    const gapReport1: GapReportData = {
      summaryVerdict:
        'Strong frontend engineering foundation (React, TypeScript, Next.js), with primary gaps in backend database architecture (PostgreSQL), GraphQL APIs, and production observability.',
      matchedSkills: [
        { skill: 'React', category: 'hard', evidence: '3+ years production React 18 billing console at CloudLedger' },
        { skill: 'TypeScript', category: 'hard', evidence: 'Core language across CloudLedger and A11y Audit CLI' },
        { skill: 'WCAG AA Accessibility', category: 'hard', evidence: 'Built automated WCAG checker project' },
        { skill: 'Cross-functional Delivery', category: 'soft', evidence: 'Shipped multi-quarter billing workflows' },
      ],
      partialSkills: [
        { skill: 'Node.js', category: 'hard', gapNote: 'Used in CLI tooling, lacks high-throughput API production examples' },
        { skill: 'Automated Testing', category: 'hard', gapNote: 'Lists Jest and Playwright, needs end-to-end CI pipeline metrics' },
      ],
      missingSkills: [
        { skill: 'PostgreSQL', category: 'hard', importance: 'critical', reason: 'Required for transactional schema design and query tuning' },
        { skill: 'GraphQL', category: 'hard', importance: 'recommended', reason: 'Primary API layer listed in target team architecture' },
        { skill: 'OpenTelemetry', category: 'hard', importance: 'bonus', reason: 'Used for distributed request tracing across services' },
      ],
      atsCheck: {
        missingKeywords: ['PostgreSQL', 'GraphQL', 'OpenTelemetry', 'CI/CD', 'End-to-End Ownership'],
        matchedKeywords: ['React', 'TypeScript', 'Next.js', 'REST APIs', 'Jest'],
        formattingIssues: ['Quantify user impact in FinTrack bullets with latency or revenue metrics.'],
        atsPassLikelihood: 'Medium',
      },
      seniorityGap: {
        candidateYears: 4.5,
        requiredYears: 5,
        candidateLevel: 'Mid-Senior',
        targetLevel: 'Senior',
        assessment: '0.5 years shy of the 5-year benchmark; bridgeable by highlighting architectural ownership and backend database scope.',
      },
      actionPlan: [
        {
          gap: 'PostgreSQL & Relational Schema Design',
          priority: 'High',
          estimatedHours: 14,
          resources: [
            { title: 'PostgreSQL Tutorial & Indexing Deep Dive', provider: 'PostgreSQL Docs', url: 'https://www.postgresql.org/docs/current/tutorial.html', type: 'docs' },
            { title: 'SQL & Relational Databases Full Course', provider: 'YouTube', url: 'https://www.youtube.com/results?search_query=postgresql+full+course+indexing', type: 'video' },
          ],
          projectIdea: 'Add a PostgreSQL + Drizzle persistence layer with indexed queries and transaction rollbacks to your billing demo.',
          certification: 'PostgreSQL Associate Certification',
        },
        {
          gap: 'GraphQL Schema & Federation',
          priority: 'Medium',
          estimatedHours: 10,
          resources: [
            { title: 'Official GraphQL Learn Guide', provider: 'GraphQL.org', url: 'https://graphql.org/learn/', type: 'docs' },
            { title: 'Full-Stack GraphQL with TypeScript', provider: 'Coursera', url: 'https://www.coursera.org/search?query=graphql%20typescript', type: 'course' },
          ],
          projectIdea: 'Expose a typed GraphQL endpoint over PostgreSQL with DataLoader batching to eliminate N+1 queries.',
          certification: 'Apollo GraphQL Associate Developer',
        },
      ],
      bulletRewrites: [
        {
          section: 'CloudLedger · Frontend Engineer',
          original: 'Built React 18 & TypeScript billing console serving 40k monthly accounts.',
          improved: 'Architected end-to-end React 18 & TypeScript billing console serving 40k monthly accounts, integrating REST APIs and automated Jest/CI checks to cut release regressions.',
          addedKeywords: ['End-to-End', 'CI'],
          rationale: 'Highlights ownership and testing rigor without fabricating unverified backend metrics.',
          verifyBeforeApplying: false,
        },
        {
          section: 'FinTrack · UI Engineer',
          original: 'Delivered responsive Tailwind dashboards and REST API integrations.',
          improved: 'Engineered accessible (WCAG AA) Tailwind CSS financial dashboards backed by REST APIs, improving mobile responsiveness across 12 core reporting views.',
          addedKeywords: ['WCAG AA', 'Engineered'],
          rationale: 'Elevates senior ownership vocabulary and connects existing accessibility work directly.',
          verifyBeforeApplying: true,
        },
      ],
      interviewQuestions: [
        {
          question: 'How would you design a PostgreSQL schema for idempotent invoice payments to prevent double charges?',
          targetGap: 'PostgreSQL',
          difficulty: 'Deep Dive',
          talkingPoints: ['Unique idempotency key constraint', 'Serializable/Read Committed transaction isolation', 'Audit log append-only table'],
          sampleAnswer: 'I would enforce a UNIQUE constraint on `(merchant_id, idempotency_key)` inside an atomic transaction wrapping the ledger insert and payment state update.',
        },
        {
          question: 'Walk through how you reduced bundle size by 28% at CloudLedger and how you prevented regressions.',
          targetGap: 'End-to-End Ownership',
          difficulty: 'Core',
          talkingPoints: ['Route-level lazy loading', 'Tree-shaking audit', 'CI bundle budget checks'],
          sampleAnswer: 'We profiled chunk graphs, split heavy chart packages via dynamic imports, and added CI size budgets on PRs.',
        },
      ],
      marketInsights: {
        salaryEstimate: '₹36L – ₹52L / yr (India Senior Product Engineer)',
        demandOutlook: 'High demand for TypeScript engineers who pair frontend craft with SQL database fluency.',
        topIndustrySkills: ['TypeScript', 'React', 'PostgreSQL', 'Node.js', 'Observability'],
        negotiationTip: 'Anchor on your 40k-account production billing console and bundle-size optimization impact when negotiating equity and base.',
      },
      healthScore: {
        overall: 84,
        clarity: 88,
        impact: 79,
        readability: 90,
        length: 85,
        atsParseability: 82,
        notes: [
          'Strong single-column readability and clear timeline.',
          'Quantify FinTrack dashboard bullet with concrete adoption or speed numbers.',
        ],
      },
      transferabilityMap: [
        {
          existingSkill: 'REST APIs & TypeScript Interfaces',
          targetSkill: 'GraphQL',
          coveragePercent: 65,
          explanation: 'Your typed REST contract experience directly transfers to GraphQL schema definitions and resolver typing.',
        },
        {
          existingSkill: 'Node.js CLI Tooling (A11y Audit)',
          targetSkill: 'Backend Node.js Services',
          coveragePercent: 55,
          explanation: 'Existing Node.js async I/O skills cover core runtime patterns; focus next on connection pooling and rate limiting.',
        },
      ],
      recruiterSixSecondView: {
        firstImpressions: [
          'Name & Senior Frontend Engineer positioning are immediately visible.',
          'CloudLedger 40k monthly accounts & 28% bundle reduction stand out quickly.',
        ],
        skippedOrBuried: [
          'Playwright & Node.js experience is tucked inside the bottom Projects section instead of top skills.',
        ],
        verdict: 'Strong frontend signal in 6 seconds, but full-stack recruiters may miss backend project proof unless surfaced higher.',
      },
      careerPathSimulator: {
        baselineAvgMatch: 74,
        projectedAvgMatch: 91,
        topSkillsToLearn: ['PostgreSQL', 'GraphQL'],
        simulatedSummary: 'Learning PostgreSQL and GraphQL increases your projected fit across similar Senior Full-Stack roles from 74% to 91%.',
      },
    };

    const roadmapWeeks1: RoadmapWeekData[] = [
      {
        weekNumber: 1,
        theme: 'Relational Database & SQL Foundations',
        estimatedHours: 8,
        tasks: [
          {
            id: 'w1-t1',
            title: 'Master B-Tree indexing, EXPLAIN ANALYZE, and transaction isolation in PostgreSQL',
            skill: 'PostgreSQL',
            resourceTitle: 'PostgreSQL Official Tutorial',
            resourceUrl: 'https://www.postgresql.org/docs/current/tutorial.html',
            resourceType: 'docs',
            completed: true,
          },
          {
            id: 'w1-t2',
            title: 'Build normalized tables with foreign keys using Drizzle ORM',
            skill: 'PostgreSQL',
            resourceTitle: 'Drizzle ORM PostgreSQL Docs',
            resourceUrl: 'https://orm.drizzle.team/docs/get-started-postgresql',
            resourceType: 'docs',
            completed: false,
          },
        ],
      },
      {
        weekNumber: 2,
        theme: 'GraphQL API Design & DataLoader',
        estimatedHours: 7,
        tasks: [
          {
            id: 'w2-t1',
            title: 'Design typed GraphQL schema with pagination and error unions',
            skill: 'GraphQL',
            resourceTitle: 'GraphQL.org Learn Guide',
            resourceUrl: 'https://graphql.org/learn/',
            resourceType: 'docs',
            completed: false,
          },
        ],
      },
      {
        weekNumber: 3,
        theme: 'Observability & CI/CD Hardening',
        estimatedHours: 6,
        tasks: [
          {
            id: 'w3-t1',
            title: 'Instrument Node.js API routes with OpenTelemetry traces',
            skill: 'OpenTelemetry',
            resourceTitle: 'OpenTelemetry JS Docs',
            resourceUrl: 'https://opentelemetry.io/docs/languages/js/',
            resourceType: 'docs',
            completed: false,
          },
        ],
      },
      {
        weekNumber: 4,
        theme: 'Mock Interviews & Resume Tailoring',
        estimatedHours: 5,
        tasks: [
          {
            id: 'w4-t1',
            title: 'Apply rewritten CloudLedger & FinTrack bullets in ResuGO Builder',
            skill: 'ATS Optimization',
            resourceTitle: 'ResuGO Resume Builder',
            resourceUrl: '#builder',
            resourceType: 'docs',
            completed: false,
          },
        ],
      },
    ];

    await createAnalysisAndRoadmap({
      userId,
      resumeId: resume1.id,
      jobId: job1.id,
      overallScore: 74,
      skillsScore: 76,
      experienceScore: 82,
      educationScore: 90,
      keywordsScore: 62,
      gapReport: gapReport1,
      roadmapTitle: '4-Week Bridge Plan: Senior Full-Stack Product Engineer',
      roadmapWeeks: roadmapWeeks1,
      isSeed: true,
    });

    await createAnalysisAndRoadmap({
      userId,
      resumeId: resume1.id,
      jobId: job2.id,
      overallScore: 86,
      skillsScore: 88,
      experienceScore: 85,
      educationScore: 92,
      keywordsScore: 80,
      gapReport: {
        ...gapReport1,
        summaryVerdict:
          'Very strong alignment with Design Systems Engineer requirements thanks to TypeScript, Tailwind CSS, and WCAG AA accessibility projects.',
        matchedSkills: [
          { skill: 'React', category: 'hard', evidence: 'React 18 component engineering at CloudLedger' },
          { skill: 'TypeScript', category: 'hard', evidence: 'Strict TypeScript across production apps & CLI' },
          { skill: 'WCAG AA Accessibility', category: 'hard', evidence: 'Built A11y Audit CLI with Playwright' },
          { skill: 'Playwright', category: 'hard', evidence: 'Used in A11y Audit CLI' },
        ],
        missingSkills: [
          { skill: 'Storybook', category: 'hard', importance: 'recommended', reason: 'Primary interactive documentation suite listed in JD' },
        ],
        atsCheck: {
          missingKeywords: ['Storybook', 'Design Tokens'],
          matchedKeywords: ['React', 'TypeScript', 'Accessibility', 'Playwright', 'Tailwind CSS'],
          formattingIssues: [],
          atsPassLikelihood: 'High',
        },
        careerPathSimulator: {
          baselineAvgMatch: 86,
          projectedAvgMatch: 95,
          topSkillsToLearn: ['Storybook', 'Design Tokens'],
          simulatedSummary: 'Publishing a Storybook token demo lifts Design Systems fit from 86% to 95%.',
        },
      },
      roadmapTitle: '2-Week Sprint: Design Systems Engineer',
      roadmapWeeks: roadmapWeeks1.slice(0, 2),
      isSeed: true,
    });
  } catch (error) {
    console.error('Failed to seed demo workspace:', error);
  }
}
