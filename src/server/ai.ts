import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  GapReportData,
  JobRequirementsData,
  NameAnalysisResult,
  ParsedResumeData,
  RoadmapWeekData,
} from '../db/schema.ts';
import { getCachedValue, setCachedValue } from '../db/repository.ts';

function getAIClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing in server environment.');
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function attemptModelWithBackoff(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  retries = 1
) {
  const delays = [500];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      const isTransient503 = /503|UNAVAILABLE|high demand|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
        msg
      );
      if (!isTransient503 || attempt === retries) {
        break;
      }
      await new Promise((r) => setTimeout(r, delays[attempt] ?? 500));
    }
  }
  throw lastErr;
}

function buildFallbackParams(
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  targetModel: string,
  stripTools = false
): Parameters<GoogleGenAI['models']['generateContent']>[0] {
  const nextConfig: Record<string, any> = { ...(params.config || {}) };
  if (stripTools) {
    delete nextConfig.tools;
  }
  if (targetModel === 'gemini-4-hydrogen') {
    delete nextConfig.temperature;
    delete nextConfig.topP;
    delete nextConfig.topK;
    delete nextConfig.candidateCount;
    nextConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  } else if (targetModel === 'gemini-3.1-flash-lite') {
    delete nextConfig.thinkingConfig;
  }
  return {
    ...params,
    model: targetModel,
    config: nextConfig,
  };
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  const requestedModel = String(params.model || 'gemini-3.1-flash-lite');

  const chain: string[] =
    requestedModel === 'gemini-3.1-flash-lite'
      ? ['gemini-3.1-flash-lite', 'gemini-4-hydrogen']
      : requestedModel === 'gemini-4-hydrogen'
      ? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
      : [requestedModel, 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];

  const uniqueChain = Array.from(new Set(chain));
  let lastErr: unknown;

  for (let i = 0; i < uniqueChain.length; i++) {
    const model = uniqueChain[i];
    const callParams = i === 0 ? params : buildFallbackParams(params, model);
    try {
      return await attemptModelWithBackoff(ai, callParams, i === 0 ? 1 : 0);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      // If fallback model rejects tools with 400 INVALID_ARGUMENT, retry fallback once without tools
      if (i > 0 && /400|INVALID_ARGUMENT|tool/i.test(msg) && (callParams.config as any)?.tools) {
        try {
          return await attemptModelWithBackoff(
            ai,
            buildFallbackParams(params, model, true),
            0
          );
        } catch (innerErr) {
          lastErr = innerErr;
        }
      }
      const shouldFallback =
        /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|high demand|404|NOT_FOUND|not found|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
          msg
        );
      if (!shouldFallback) {
        throw err;
      }
    }
  }

  throw lastErr;
}

function safeParseJson<T>(raw: string | undefined, fallbackMsg: string): T {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error('JSON parse failure:', cleaned.slice(0, 400));
    throw new Error(fallbackMsg, { cause: err });
  }
}

export function resumeDataToPlainText(data: ParsedResumeData): string {
  const lines: string[] = [];
  lines.push(data.contactInfo?.name || 'Candidate Name');
  lines.push(
    [
      data.contactInfo?.email,
      data.contactInfo?.phone,
      data.contactInfo?.location,
      data.contactInfo?.linkedin,
      data.contactInfo?.github,
      data.contactInfo?.portfolio,
    ]
      .filter(Boolean)
      .join(' · ')
  );
  if (data.summary) {
    lines.push('', 'SUMMARY', data.summary);
  }
  if (data.skills?.length) {
    lines.push('', 'SKILLS', data.skills.join(', '));
  }
  if (data.experience?.length) {
    lines.push('', 'EXPERIENCE');
    for (const exp of data.experience) {
      lines.push(`${exp.role} — ${exp.company} (${exp.duration})`);
      for (const b of exp.bullets || []) {
        lines.push(`• ${b}`);
      }
    }
  }
  if (data.projects?.length) {
    lines.push('', 'PROJECTS');
    for (const proj of data.projects) {
      lines.push(`${proj.name} (${(proj.technologies || []).join(', ')})`);
      if (proj.description) lines.push(`• ${proj.description}`);
    }
  }
  if (data.education?.length) {
    lines.push('', 'EDUCATION');
    for (const edu of data.education) {
      lines.push(`${edu.degree} — ${edu.institution} (${edu.year})`);
    }
  }
  if (data.certifications?.length) {
    lines.push('', 'CERTIFICATIONS', data.certifications.join(' · '));
  }
  if (data.languages?.length) {
    lines.push(
      '',
      'LANGUAGES',
      data.languages.map((l) => `${l.language} (${l.proficiency})`).join(', ')
    );
  }
  if (data.awards?.length) {
    lines.push('', 'AWARDS');
    for (const a of data.awards) {
      lines.push(`• ${a.title} — ${a.issuer} (${a.year})`);
    }
  }
  if (data.volunteering?.length) {
    lines.push('', 'VOLUNTEERING');
    for (const v of data.volunteering) {
      lines.push(`${v.role} — ${v.organization} (${v.duration}): ${v.description}`);
    }
  }
  if (data.publications?.length) {
    lines.push('', 'PUBLICATIONS');
    for (const p of data.publications) {
      lines.push(`• ${p.title} (${p.venue}, ${p.year})`);
    }
  }
  if (data.customSections?.length) {
    for (const sec of data.customSections) {
      lines.push('', sec.title.toUpperCase());
      for (const item of sec.items || []) {
        lines.push(`${item.heading} — ${item.subheading} (${item.date})`);
        for (const b of item.bullets || []) lines.push(`• ${b}`);
      }
    }
  }
  return lines.join('\n');
}

export async function parseResumeWithAI(input: {
  rawText?: string;
  pdfBase64?: string;
  fileName?: string;
}): Promise<{ extractedText: string; parsedData: ParsedResumeData }> {
  const ai = getAIClient();

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (input.pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: input.pdfBase64,
      },
    });
    parts.push({
      text: `Extract a clean concise summary of this resume PDF (${input.fileName || 'resume.pdf'}) into extractedText (under 1200 chars) and structure every section faithfully into parsedData without inventing details.`,
    });
  } else {
    parts.push({
      text: `Parse the following resume text faithfully without inventing details:\n\n${(input.rawText || '').slice(0, 16000)}`,
    });
  }

  const needExtractedText = Boolean(input.pdfBase64);

  const response = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: { parts },
    config: {
      systemInstruction:
        'You are an ultra-fast, accurate ATS resume parser. Extract only facts present in the resume. Keep summary and bullets concise, estimate totalYearsExp numerically, and leave languages/awards/volunteering/publications as [] unless clearly present.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ...(needExtractedText ? { extractedText: { type: Type.STRING } } : {}),
          parsedData: {
            type: Type.OBJECT,
            properties: {
              contactInfo: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  email: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  location: { type: Type.STRING },
                  linkedin: { type: Type.STRING },
                  github: { type: Type.STRING },
                  portfolio: { type: Type.STRING },
                },
                required: ['name', 'email', 'phone', 'location'],
              },
              summary: { type: Type.STRING },
              totalYearsExp: { type: Type.NUMBER },
              seniorityLevel: { type: Type.STRING },
              skills: { type: Type.ARRAY, items: { type: Type.STRING } },
              experience: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    role: { type: Type.STRING },
                    company: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['role', 'company', 'duration', 'bullets'],
                },
              },
              education: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    degree: { type: Type.STRING },
                    institution: { type: Type.STRING },
                    year: { type: Type.STRING },
                  },
                  required: ['degree', 'institution', 'year'],
                },
              },
              certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
              projects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    technologies: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['name', 'description', 'technologies'],
                },
              },
              languages: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    language: { type: Type.STRING },
                    proficiency: { type: Type.STRING },
                  },
                  required: ['language', 'proficiency'],
                },
              },
              awards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    issuer: { type: Type.STRING },
                    year: { type: Type.STRING },
                  },
                  required: ['title', 'issuer', 'year'],
                },
              },
              volunteering: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    role: { type: Type.STRING },
                    organization: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ['role', 'organization', 'duration', 'description'],
                },
              },
              publications: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    venue: { type: Type.STRING },
                    year: { type: Type.STRING },
                    url: { type: Type.STRING },
                  },
                  required: ['title', 'venue', 'year'],
                },
              },
            },
            required: [
              'contactInfo',
              'summary',
              'totalYearsExp',
              'seniorityLevel',
              'skills',
              'experience',
              'education',
              'certifications',
              'projects',
            ],
          },
        },
        required: needExtractedText ? ['extractedText', 'parsedData'] : ['parsedData'],
      },
    },
  });

  const parsed = safeParseJson<{
    extractedText?: string;
    parsedData: ParsedResumeData;
  }>(response.text, 'Failed to parse resume content.');

  const pd = parsed.parsedData || ({} as ParsedResumeData);
  const normalizedData: ParsedResumeData = {
    contactInfo: {
      name: pd.contactInfo?.name || 'Candidate',
      email: pd.contactInfo?.email || '',
      phone: pd.contactInfo?.phone || '',
      location: pd.contactInfo?.location || '',
      linkedin: pd.contactInfo?.linkedin || '',
      github: pd.contactInfo?.github || '',
      portfolio: pd.contactInfo?.portfolio || '',
    },
    summary: pd.summary || '',
    totalYearsExp: Number.isFinite(Number(pd.totalYearsExp)) ? Number(pd.totalYearsExp) : 0,
    seniorityLevel: pd.seniorityLevel || 'Mid-Level',
    skills: Array.isArray(pd.skills) ? pd.skills : [],
    experience: Array.isArray(pd.experience) ? pd.experience : [],
    education: Array.isArray(pd.education) ? pd.education : [],
    certifications: Array.isArray(pd.certifications) ? pd.certifications : [],
    projects: Array.isArray(pd.projects) ? pd.projects : [],
    languages: Array.isArray(pd.languages) ? pd.languages : [],
    awards: Array.isArray(pd.awards) ? pd.awards : [],
    volunteering: Array.isArray(pd.volunteering) ? pd.volunteering : [],
    publications: Array.isArray(pd.publications) ? pd.publications : [],
    customSections: Array.isArray(pd.customSections) ? pd.customSections : [],
  };

  return {
    extractedText: input.rawText || parsed.extractedText || '',
    parsedData: normalizedData,
  };
}

export async function analyzeNameWithAI(input: {
  rawName: string;
  accountName?: string | null;
  googleProfileName?: string | null;
  resumeExtractedName?: string | null;
  email?: string | null;
  duplicateMatches?: Array<{ email: string; canonicalName: string | null }>;
}): Promise<NameAnalysisResult> {
  const raw = input.rawName.trim();

  // Deterministic pre-checks for fast spam/keyboard-mash/symbol feedback
  const flags: string[] = [];
  if (/\d/.test(raw)) {
    flags.push('Contains numeric digits');
  }
  if (/[^\p{L}\s.'-]/u.test(raw)) {
    flags.push('Contains stray symbols or emojis');
  }
  if (/(.)\1{3,}/i.test(raw)) {
    flags.push('Repeated character sequence detected');
  }
  const lower = raw.toLowerCase();
  if (
    ['asdf', 'qwerty', 'test user', 'admin', 'user', 'unknown', 'na', 'none', 'xyz'].some(
      (spam) => lower === spam || lower.includes('asdf') || lower.includes('test user')
    )
  ) {
    flags.push('Possible placeholder or keyboard-mash text');
  }

  const ai = getAIClient();
  const response = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: `Analyze this name thoroughly for a professional resume and profile.
Input name: "${raw}"
Account name: "${input.accountName || ''}"
Google profile name: "${input.googleProfileName || ''}"
Resume extracted name: "${input.resumeExtractedName || ''}"
Email: "${input.email || ''}"
Pre-check flags: ${JSON.stringify(flags)}

STRICT RULES:
1. NEVER infer, guess, or mention gender, ethnicity, caste, or religion. Bias-safe by design.
2. Support global naming conventions:
   - South Indian initials before or after given name (e.g. "K. Ramesh", "Ramesh Kumar S", "S. Muthukumar", "Lakshmi Narayanan R")
   - Single-name users (mononyms like "Cher" or "Senthil")
   - Multi-part surnames ("van der Berg", "De La Cruz") and patronymics
3. Normalize stray casing, extra spaces, stray symbols/emojis without breaking cultural spellings (e.g., "mcDONALD" -> "McDonald", "o'connor" -> "O'Connor", "k. ramesh" -> "K. Ramesh").
4. If Account name, Google profile name, and Resume name differ meaningfully (beyond initials/middle names), explain clearly in mismatchWarning; otherwise null.
5. Provide phoneticSpelling (e.g. "rah-MESH KOO-mar") and clean pronunciationText.
6. Provide resume format suggestions: fullName, initialsStyle, atsSafeName (ASCII/ATS friendly), 2-3 professional emailIdeas, and 2-3 LinkedIn handleIdeas.`,
    config: {
      systemInstruction:
        'You are a bias-safe, culturally aware global name parsing and normalization engine. Return strict JSON.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          normalizedName: { type: Type.STRING },
          canonicalName: { type: Type.STRING },
          parsedParts: {
            type: Type.OBJECT,
            properties: {
              prefix: { type: Type.STRING },
              firstName: { type: Type.STRING },
              middleName: { type: Type.STRING },
              lastName: { type: Type.STRING },
              initials: { type: Type.STRING },
              suffix: { type: Type.STRING },
              formatType: { type: Type.STRING },
            },
            required: [
              'prefix',
              'firstName',
              'middleName',
              'lastName',
              'initials',
              'suffix',
              'formatType',
            ],
          },
          validityStatus: { type: Type.STRING },
          validityFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
          mismatchWarning: { type: Type.STRING, nullable: true },
          phoneticSpelling: { type: Type.STRING },
          pronunciationText: { type: Type.STRING },
          suggestions: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING },
              initialsStyle: { type: Type.STRING },
              atsSafeName: { type: Type.STRING },
              emailIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
              handleIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'fullName',
              'initialsStyle',
              'atsSafeName',
              'emailIdeas',
              'handleIdeas',
            ],
          },
        },
        required: [
          'normalizedName',
          'canonicalName',
          'parsedParts',
          'validityStatus',
          'validityFlags',
          'phoneticSpelling',
          'pronunciationText',
          'suggestions',
        ],
      },
    },
  });

  const aiParsed = safeParseJson<
    Omit<NameAnalysisResult, 'rawInputName' | 'duplicateWarning'>
  >(response.text, 'Failed to analyze name structure.');

  const mergedFlags = Array.from(new Set([...flags, ...(aiParsed.validityFlags || [])]));
  const status: NameAnalysisResult['validityStatus'] =
    mergedFlags.some((f) => /placeholder|keyboard-mash|digits/i.test(f))
      ? 'flagged'
      : mergedFlags.length > 0
      ? 'warning'
      : (aiParsed.validityStatus as NameAnalysisResult['validityStatus']) || 'valid';

  const dupWarning =
    input.duplicateMatches && input.duplicateMatches.length > 0
      ? `Similar name or email prefix already exists (${input.duplicateMatches
          .slice(0, 2)
          .map((d) => d.canonicalName || d.email)
          .join(', ')}). Confirm if creating a separate profile.`
      : null;

  return {
    rawInputName: raw,
    normalizedName: aiParsed.normalizedName || raw,
    canonicalName: aiParsed.canonicalName || aiParsed.normalizedName || raw,
    parsedParts: aiParsed.parsedParts,
    validityStatus: status,
    validityFlags: mergedFlags,
    mismatchWarning: aiParsed.mismatchWarning || null,
    duplicateWarning: dupWarning,
    phoneticSpelling: aiParsed.phoneticSpelling,
    pronunciationText: aiParsed.pronunciationText || aiParsed.normalizedName || raw,
    suggestions: aiParsed.suggestions,
  };
}

export async function extractJobFromTextOrUrl(input: {
  descriptionText?: string;
  url?: string;
}): Promise<{
  title: string;
  company: string;
  location: string;
  salaryRange: string;
  descriptionText: string;
  extractedRequirements: JobRequirementsData;
}> {
  const ai = getAIClient();

  let sourceContent = (input.descriptionText || '').trim();

  if (input.url && !sourceContent) {
    const urlResponse = await generateWithRetry(ai, {
      model: 'gemini-4-hydrogen',
      contents: `Read this job posting URL and extract the complete job title, company name, location, salary range (if mentioned), and full job description & requirements text: ${input.url}`,
      config: {
        tools: [{ urlContext: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    sourceContent = (urlResponse.text || '').trim();
    if (!sourceContent) {
      throw new Error(
        'Could not read the job posting URL. Please paste the job description text directly.'
      );
    }
  }

  const structuredResponse = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: `Extract structured job details and requirements from the following posting:\n\n${sourceContent.slice(0, 12000)}`,
    config: {
      systemInstruction:
        'Extract factual job requirements, required skills, preferred skills, seniority, years of experience, and ATS keywords.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          company: { type: Type.STRING },
          location: { type: Type.STRING },
          salaryRange: { type: Type.STRING },
          extractedRequirements: {
            type: Type.OBJECT,
            properties: {
              requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              preferredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              minYearsExp: { type: Type.NUMBER },
              seniority: { type: Type.STRING },
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              educationRequirement: { type: Type.STRING },
            },
            required: [
              'requiredSkills',
              'preferredSkills',
              'minYearsExp',
              'seniority',
              'keywords',
              'educationRequirement',
            ],
          },
        },
        required: [
          'title',
          'company',
          'location',
          'salaryRange',
          'extractedRequirements',
        ],
      },
    },
  });

  const extracted = safeParseJson<{
    title: string;
    company: string;
    location: string;
    salaryRange: string;
    extractedRequirements: JobRequirementsData;
  }>(
    structuredResponse.text,
    'Failed to extract structured requirements from the job description.'
  );

  return {
    title: extracted.title || 'Target Role',
    company: extracted.company || 'Target Company',
    location: extracted.location || 'Remote',
    salaryRange: extracted.salaryRange || 'Market standard',
    descriptionText: sourceContent,
    extractedRequirements: extracted.extractedRequirements,
  };
}

export async function runGapAnalysisAI(input: {
  parsedResume: ParsedResumeData;
  rawResumeText: string;
  job: {
    title?: string;
    company?: string;
    location?: string;
    salaryRange?: string;
    descriptionText: string;
    extractedRequirements?: JobRequirementsData;
  };
}): Promise<{
  overallScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  keywordsScore: number;
  extractedJobMeta: {
    title: string;
    company: string;
    location: string;
    salaryRange: string;
    extractedRequirements: JobRequirementsData;
  };
  gapReport: GapReportData;
  roadmapTitle: string;
  roadmapWeeks: RoadmapWeekData[];
}> {
  const ai = getAIClient();

  const prompt = `Analyze the gap between this candidate's resume and the target job.

RESUME PARSED DATA:
${JSON.stringify(input.parsedResume)}

RAW RESUME EXCERPT:
${input.rawResumeText.slice(0, 3500)}

TARGET JOB:
Title hint: ${input.job.title || 'Infer from description'}
Company hint: ${input.job.company || 'Infer from description'}
Location hint: ${input.job.location || 'Remote / Infer from description'}
Salary hint: ${input.job.salaryRange || 'Infer or Market standard'}
Description: ${input.job.descriptionText.slice(0, 4500)}
${input.job.extractedRequirements ? `Pre-extracted Requirements: ${JSON.stringify(input.job.extractedRequirements)}` : ''}

Rules:
1. Extract factual job metadata in extractedJobMeta (title, company, location, salaryRange, requiredSkills, preferredSkills, minYearsExp, seniority, keywords, educationRequirement). Prefer explicit hints if provided.
2. Scores must be honest integers from 0 to 100. Keep explanations, reasons, and notes crisp (1 concise sentence each) for fast delivery.
3. HONESTY GUARD: In bulletRewrites, rewrite 2-3 actual bullets from the resume to incorporate relevant missing keywords HONESTLY without inventing metrics, employers, or skills. Set verifyBeforeApplying = true if added keywords stretch beyond direct resume evidence.
4. In actionPlan, suggest top 3-4 concrete gap items with valid doc/course URLs (official docs, Coursera, YouTube, Google Developer docs), practical project ideas, and realistic hour estimates.
5. Populate healthScore (0-100 + notes), transferabilityMap (2-3 existing skills -> target missing skills with coveragePercent), recruiterSixSecondView, careerPathSimulator, and negotiationTip in marketInsights.
6. In interviewQuestions, include 3 targeted questions with a concise sampleAnswer for each.
7. Create a concise 4-week roadmapWeeks plan with 2 actionable tasks per week.`;

  const response = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
    config: {
      systemInstruction:
        'You are an expert technical career advisor and ATS evaluator. Keep answers crisp, fast, accurate, and grounded in the actual resume and job posting. Return strictly valid JSON matching the schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallScore: { type: Type.INTEGER },
          skillsScore: { type: Type.INTEGER },
          experienceScore: { type: Type.INTEGER },
          educationScore: { type: Type.INTEGER },
          keywordsScore: { type: Type.INTEGER },
          roadmapTitle: { type: Type.STRING },
          extractedJobMeta: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              company: { type: Type.STRING },
              location: { type: Type.STRING },
              salaryRange: { type: Type.STRING },
              extractedRequirements: {
                type: Type.OBJECT,
                properties: {
                  requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  preferredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  minYearsExp: { type: Type.NUMBER },
                  seniority: { type: Type.STRING },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  educationRequirement: { type: Type.STRING },
                },
                required: [
                  'requiredSkills',
                  'preferredSkills',
                  'minYearsExp',
                  'seniority',
                  'keywords',
                  'educationRequirement',
                ],
              },
            },
            required: ['title', 'company', 'location', 'salaryRange', 'extractedRequirements'],
          },
          gapReport: {
            type: Type.OBJECT,
            properties: {
              summaryVerdict: { type: Type.STRING },
              matchedSkills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skill: { type: Type.STRING },
                    category: { type: Type.STRING },
                    evidence: { type: Type.STRING },
                  },
                  required: ['skill', 'category', 'evidence'],
                },
              },
              partialSkills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skill: { type: Type.STRING },
                    category: { type: Type.STRING },
                    gapNote: { type: Type.STRING },
                  },
                  required: ['skill', 'category', 'gapNote'],
                },
              },
              missingSkills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    skill: { type: Type.STRING },
                    category: { type: Type.STRING },
                    importance: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['skill', 'category', 'importance', 'reason'],
                },
              },
              atsCheck: {
                type: Type.OBJECT,
                properties: {
                  missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  matchedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  formattingIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
                  atsPassLikelihood: { type: Type.STRING },
                },
                required: [
                  'missingKeywords',
                  'matchedKeywords',
                  'formattingIssues',
                  'atsPassLikelihood',
                ],
              },
              seniorityGap: {
                type: Type.OBJECT,
                properties: {
                  candidateYears: { type: Type.NUMBER },
                  requiredYears: { type: Type.NUMBER },
                  candidateLevel: { type: Type.STRING },
                  targetLevel: { type: Type.STRING },
                  assessment: { type: Type.STRING },
                },
                required: [
                  'candidateYears',
                  'requiredYears',
                  'candidateLevel',
                  'targetLevel',
                  'assessment',
                ],
              },
              actionPlan: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    gap: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    estimatedHours: { type: Type.INTEGER },
                    resources: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          provider: { type: Type.STRING },
                          url: { type: Type.STRING },
                          type: { type: Type.STRING },
                        },
                        required: ['title', 'provider', 'url', 'type'],
                      },
                    },
                    projectIdea: { type: Type.STRING },
                    certification: { type: Type.STRING },
                  },
                  required: [
                    'gap',
                    'priority',
                    'estimatedHours',
                    'resources',
                    'projectIdea',
                    'certification',
                  ],
                },
              },
              bulletRewrites: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    section: { type: Type.STRING },
                    original: { type: Type.STRING },
                    improved: { type: Type.STRING },
                    addedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    rationale: { type: Type.STRING },
                    verifyBeforeApplying: { type: Type.BOOLEAN },
                  },
                  required: [
                    'section',
                    'original',
                    'improved',
                    'addedKeywords',
                    'rationale',
                    'verifyBeforeApplying',
                  ],
                },
              },
              interviewQuestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    targetGap: { type: Type.STRING },
                    difficulty: { type: Type.STRING },
                    talkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                    sampleAnswer: { type: Type.STRING },
                  },
                  required: [
                    'question',
                    'targetGap',
                    'difficulty',
                    'talkingPoints',
                    'sampleAnswer',
                  ],
                },
              },
              marketInsights: {
                type: Type.OBJECT,
                properties: {
                  salaryEstimate: { type: Type.STRING },
                  demandOutlook: { type: Type.STRING },
                  topIndustrySkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  negotiationTip: { type: Type.STRING },
                },
                required: [
                  'salaryEstimate',
                  'demandOutlook',
                  'topIndustrySkills',
                  'negotiationTip',
                ],
              },
              healthScore: {
                type: Type.OBJECT,
                properties: {
                  overall: { type: Type.INTEGER },
                  clarity: { type: Type.INTEGER },
                  impact: { type: Type.INTEGER },
                  readability: { type: Type.INTEGER },
                  length: { type: Type.INTEGER },
                  atsParseability: { type: Type.INTEGER },
                  notes: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'overall',
                  'clarity',
                  'impact',
                  'readability',
                  'length',
                  'atsParseability',
                  'notes',
                ],
              },
              transferabilityMap: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    existingSkill: { type: Type.STRING },
                    targetSkill: { type: Type.STRING },
                    coveragePercent: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                  },
                  required: [
                    'existingSkill',
                    'targetSkill',
                    'coveragePercent',
                    'explanation',
                  ],
                },
              },
              recruiterSixSecondView: {
                type: Type.OBJECT,
                properties: {
                  firstImpressions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  skippedOrBuried: { type: Type.ARRAY, items: { type: Type.STRING } },
                  verdict: { type: Type.STRING },
                },
                required: ['firstImpressions', 'skippedOrBuried', 'verdict'],
              },
              careerPathSimulator: {
                type: Type.OBJECT,
                properties: {
                  baselineAvgMatch: { type: Type.INTEGER },
                  projectedAvgMatch: { type: Type.INTEGER },
                  topSkillsToLearn: { type: Type.ARRAY, items: { type: Type.STRING } },
                  simulatedSummary: { type: Type.STRING },
                },
                required: [
                  'baselineAvgMatch',
                  'projectedAvgMatch',
                  'topSkillsToLearn',
                  'simulatedSummary',
                ],
              },
            },
            required: [
              'summaryVerdict',
              'matchedSkills',
              'partialSkills',
              'missingSkills',
              'atsCheck',
              'seniorityGap',
              'actionPlan',
              'bulletRewrites',
              'interviewQuestions',
              'marketInsights',
              'healthScore',
              'transferabilityMap',
              'recruiterSixSecondView',
              'careerPathSimulator',
            ],
          },
          roadmapWeeks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                weekNumber: { type: Type.INTEGER },
                theme: { type: Type.STRING },
                estimatedHours: { type: Type.INTEGER },
                tasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      skill: { type: Type.STRING },
                      resourceTitle: { type: Type.STRING },
                      resourceUrl: { type: Type.STRING },
                      resourceType: { type: Type.STRING },
                      completed: { type: Type.BOOLEAN },
                    },
                    required: [
                      'id',
                      'title',
                      'skill',
                      'resourceTitle',
                      'resourceUrl',
                      'resourceType',
                      'completed',
                    ],
                  },
                },
              },
              required: ['weekNumber', 'theme', 'estimatedHours', 'tasks'],
            },
          },
        },
        required: [
          'overallScore',
          'skillsScore',
          'experienceScore',
          'educationScore',
          'keywordsScore',
          'roadmapTitle',
          'extractedJobMeta',
          'gapReport',
          'roadmapWeeks',
        ],
      },
    },
  });

  return safeParseJson(
    response.text,
    'Failed to compute structured gap analysis.'
  );
}

export type BuilderAssistAction =
  | 'generate_summary'
  | 'rewrite_star'
  | 'quantify'
  | 'fix_grammar'
  | 'adjust_tone'
  | 'shorten_one_page'
  | 'fresher_mode'
  | 'tailor_to_job';

export async function resumeBuilderAssistAI(input: {
  action: BuilderAssistAction;
  resume: ParsedResumeData;
  sectionText?: string;
  targetJobText?: string;
  missingSkill?: string;
  tone?: string;
  language?: 'en' | 'ta' | 'hi';
}): Promise<{
  improvedText: string;
  suggestedSkills: string[];
  honestyFlag: boolean;
  verifyNotice: string;
  rationale: string;
  updatedSummary?: string;
}> {
  const ai = getAIClient();
  const langLabel =
    input.language === 'ta' ? 'Tamil' : input.language === 'hi' ? 'Hindi' : 'English';

  const response = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: `Perform resume builder AI action: "${input.action}"
Language: ${langLabel}
Tone: ${input.tone || 'Executive / Clear Technical'}
Missing skill focus: ${input.missingSkill || 'None'}
Target job context: ${(input.targetJobText || '').slice(0, 3000)}
Section text to improve:
${(input.sectionText || '').slice(0, 3000)}

Full candidate resume JSON:
${JSON.stringify(input.resume).slice(0, 8000)}

HONESTY GUARD RULES:
- Never invent companies, degrees, or fake metrics. If prompting for numbers, suggest placeholders like "[X%]" and set honestyFlag = true with a clear verifyNotice.
- For "fresher_mode", highlight coursework, academic projects, internships, hackathons, and transferable fundamentals without pretending senior work history.
- For "tailor_to_job", weave honest transferable keywords from the job into the summary/bullets and flag anything the user must verify before applying.`,
    config: {
      systemInstruction:
        'You are an honest, concise resume writing assistant. Return strict JSON.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          improvedText: { type: Type.STRING },
          suggestedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
          honestyFlag: { type: Type.BOOLEAN },
          verifyNotice: { type: Type.STRING },
          rationale: { type: Type.STRING },
          updatedSummary: { type: Type.STRING },
        },
        required: [
          'improvedText',
          'suggestedSkills',
          'honestyFlag',
          'verifyNotice',
          'rationale',
        ],
      },
    },
  });

  return safeParseJson(
    response.text,
    'Failed to run AI resume builder assistant.'
  );
}

export async function generateCoverLetterAI(input: {
  resume: ParsedResumeData;
  jobTitle: string;
  company: string;
  jobDescription: string;
  tone: 'professional' | 'enthusiastic' | 'concise';
  language: 'en' | 'ta' | 'hi';
}): Promise<{
  subjectLine: string;
  coverLetter: string;
  honestyChecklist: string[];
}> {
  const ai = getAIClient();
  const langLabel =
    input.language === 'ta' ? 'Tamil' : input.language === 'hi' ? 'Hindi' : 'English';

  const response = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: `Write a tailored, honest cover letter in ${langLabel} (${input.tone} tone).
Candidate Resume: ${JSON.stringify(input.resume).slice(0, 7000)}
Target Role: ${input.jobTitle} at ${input.company}
Job Description: ${input.jobDescription.slice(0, 4000)}

Only claim skills, projects, and roles grounded in the resume. Keep it crisp (240-340 words).`,
    config: {
      systemInstruction: 'Generate an honest, tailored cover letter in strict JSON.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subjectLine: { type: Type.STRING },
          coverLetter: { type: Type.STRING },
          honestyChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['subjectLine', 'coverLetter', 'honestyChecklist'],
      },
    },
  });

  return safeParseJson(response.text, 'Failed to generate cover letter.');
}

export async function chatAssistantAI(input: {
  message: string;
  mode: 'career_chat' | 'mock_interview';
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  resumeContext?: ParsedResumeData | null;
  jobContext?: string | null;
}): Promise<{ reply: string; followUpSuggestions: string[] }> {
  const ai = getAIClient();
  const recentHistory = input.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Candidate' : 'Coach'}: ${m.content}`)
    .join('\n');

  const systemInstruction =
    input.mode === 'mock_interview'
      ? 'You are a supportive yet realistic technical interviewer conducting a mock interview. Evaluate the candidate answer constructively using STAR/technical depth, give a brief score hint, and ask the next targeted question based on their resume and job gaps.'
      : 'You are ResuGO Career Copilot, a fast, honest resume, ATS, name-formatting, and career gap advisor. Give clear, concise, actionable guidance grounded in the user resume and target role without inventing credentials.';

  const prompt = `${input.resumeContext ? `CANDIDATE RESUME SUMMARY:\n${JSON.stringify(input.resumeContext).slice(0, 4500)}\n` : ''}${input.jobContext ? `TARGET JOB CONTEXT:\n${input.jobContext.slice(0, 2000)}\n` : ''}${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n` : ''}USER MESSAGE:\n${input.message}`;

  const response = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING },
          followUpSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['reply', 'followUpSuggestions'],
      },
    },
  });

  return safeParseJson(response.text, 'Career assistant failed to respond.');
}

export interface LiveJobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salaryRange: string;
  postedAt: string;
  source: string;
  applyUrl: string;
  descriptionText: string;
  highlights: string[];
}

export interface JobSearchPayload {
  listings: LiveJobListing[];
  marketBenchmark: {
    salaryRange: string;
    inDemandSkills: string[];
    summary: string;
    sources: Array<{ title: string; url: string }>;
  };
  provider: 'serpapi' | 'google_search_grounding';
}

export async function searchJobsAndMarketAI(input: {
  query: string;
  location: string;
}): Promise<JobSearchPayload> {
  const q = input.query.trim();
  const loc = input.location.trim() || 'Remote';
  const cacheKey = `jobs:${q.toLowerCase()}:${loc.toLowerCase()}`;

  const cached = await getCachedValue<JobSearchPayload>(cacheKey);
  if (cached) {
    return cached;
  }

  let listings: LiveJobListing[] = [];
  let provider: 'serpapi' | 'google_search_grounding' =
    'google_search_grounding';
  const groundingSources: Array<{ title: string; url: string }> = [];

  if (process.env.SERPAPI_KEY) {
    try {
      const params = new URLSearchParams({
        engine: 'google_jobs',
        q,
        location: loc,
        api_key: process.env.SERPAPI_KEY,
      });
      const serpRes = await fetch(
        `https://serpapi.com/search.json?${params.toString()}`
      );
      if (serpRes.ok) {
        const serpJson = (await serpRes.json()) as {
          jobs_results?: Array<{
            job_id?: string;
            title?: string;
            company_name?: string;
            location?: string;
            description?: string;
            detected_extensions?: { posted_at?: string; salary?: string };
            apply_options?: Array<{ link?: string }>;
          }>;
        };
        if (serpJson.jobs_results && serpJson.jobs_results.length > 0) {
          provider = 'serpapi';
          listings = serpJson.jobs_results.slice(0, 8).map((item, idx) => ({
            id: item.job_id || `serp-${idx}`,
            title: item.title || q,
            company: item.company_name || 'Hiring Company',
            location: item.location || loc,
            salaryRange: item.detected_extensions?.salary || 'Not disclosed',
            postedAt: item.detected_extensions?.posted_at || 'Recent',
            source: 'Google Jobs (SerpAPI)',
            applyUrl:
              item.apply_options?.[0]?.link ||
              'https://www.google.com/search?q=' +
                encodeURIComponent(`${item.title} ${item.company_name}`),
            descriptionText:
              item.description || `${item.title} at ${item.company_name}`,
            highlights: [],
          }));
        }
      }
    } catch (err) {
      console.error(
        'SerpAPI Google Jobs lookup failed, falling back to search grounding:',
        err
      );
    }
  }

  let cseContext = '';
  if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX) {
    try {
      const cseParams = new URLSearchParams({
        key: process.env.GOOGLE_CSE_API_KEY,
        cx: process.env.GOOGLE_CSE_CX,
        q: `${q} salary skills requirements ${loc}`,
        num: '4',
      });
      const cseRes = await fetch(
        `https://www.googleapis.com/customsearch/v1?${cseParams.toString()}`
      );
      if (cseRes.ok) {
        const cseJson = (await cseRes.json()) as {
          items?: Array<{ title?: string; link?: string; snippet?: string }>;
        };
        if (cseJson.items) {
          cseContext = cseJson.items
            .map((i) => `${i.title}: ${i.snippet} (${i.link})`)
            .join('\n');
          cseJson.items.forEach((i) => {
            if (i.link && i.title) {
              groundingSources.push({ title: i.title, url: i.link });
            }
          });
        }
      }
    } catch (err) {
      console.error('Google Custom Search lookup failed:', err);
    }
  }

  const ai = getAIClient();
  const searchPrompt =
    listings.length > 0
      ? `Provide current salary benchmarks, demand outlook, and top 8 in-demand skills for "${q}" in "${loc}". Additional search context:\n${cseContext}`
      : `Find 6 current real job openings for "${q}" in "${loc}", along with current salary benchmarks and top 8 in-demand skills for this role. Additional search context:\n${cseContext}`;

  const groundedRes = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: searchPrompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const chunks =
    groundedRes.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  for (const chunk of chunks) {
    if (chunk.web?.uri && chunk.web?.title) {
      groundingSources.push({
        title: chunk.web.title,
        url: chunk.web.uri,
      });
    }
  }

  const normalizeRes = await generateWithRetry(ai, {
    model: 'gemini-3.1-flash-lite',
    contents: `Convert this search result into structured JSON. ${
      listings.length > 0
        ? 'Keep listings empty because listings are already fetched.'
        : 'Include up to 6 distinct job listings with full realistic descriptions based on the search output.'
    }\n\nSEARCH OUTPUT:\n${groundedRes.text || ''}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          listings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                company: { type: Type.STRING },
                location: { type: Type.STRING },
                salaryRange: { type: Type.STRING },
                postedAt: { type: Type.STRING },
                source: { type: Type.STRING },
                applyUrl: { type: Type.STRING },
                descriptionText: { type: Type.STRING },
                highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'id',
                'title',
                'company',
                'location',
                'salaryRange',
                'postedAt',
                'source',
                'applyUrl',
                'descriptionText',
                'highlights',
              ],
            },
          },
          marketBenchmark: {
            type: Type.OBJECT,
            properties: {
              salaryRange: { type: Type.STRING },
              inDemandSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              summary: { type: Type.STRING },
            },
            required: ['salaryRange', 'inDemandSkills', 'summary'],
          },
        },
        required: ['listings', 'marketBenchmark'],
      },
    },
  });

  const structured = safeParseJson<{
    listings: LiveJobListing[];
    marketBenchmark: {
      salaryRange: string;
      inDemandSkills: string[];
      summary: string;
    };
  }>(normalizeRes.text, 'Failed to structure job search results.');

  const payload: JobSearchPayload = {
    listings: listings.length > 0 ? listings : structured.listings.slice(0, 6),
    marketBenchmark: {
      ...structured.marketBenchmark,
      sources: groundingSources.slice(0, 5),
    },
    provider,
  };

  await setCachedValue(cacheKey, payload, 15);
  return payload;
}
