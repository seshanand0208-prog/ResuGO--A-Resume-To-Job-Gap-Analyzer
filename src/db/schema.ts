import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export interface CustomSectionItem {
  heading: string;
  subheading: string;
  date: string;
  bullets: string[];
}

export interface CustomSectionBlock {
  id: string;
  title: string;
  items: CustomSectionItem[];
}

export interface ParsedResumeData {
  contactInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  photoUrl?: string;
  summary: string;
  totalYearsExp: number;
  seniorityLevel: string;
  skills: string[];
  experience: Array<{
    role: string;
    company: string;
    duration: string;
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
  certifications: string[];
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
  }>;
  languages?: Array<{ language: string; proficiency: string }>;
  awards?: Array<{ title: string; issuer: string; year: string }>;
  volunteering?: Array<{
    role: string;
    organization: string;
    duration: string;
    description: string;
  }>;
  publications?: Array<{
    title: string;
    venue: string;
    year: string;
    url?: string;
  }>;
  customSections?: CustomSectionBlock[];
}

export interface ResumeBuilderConfig {
  templateId: string;
  font: 'plus-jakarta' | 'bricolage' | 'georgia' | 'jetbrains';
  accentColor: 'teal' | 'indigo' | 'slate' | 'emerald';
  spacing: 'compact' | 'balanced' | 'relaxed';
  margin: 'narrow' | 'standard' | 'wide';
  atsSafeMode: boolean;
  showPhoto: boolean;
  regionFormat: 'US' | 'UK' | 'India' | 'EU';
  sectionOrder: string[];
  targetLanguage: 'en' | 'ta' | 'hi';
}

export interface NameParsedParts {
  prefix: string;
  firstName: string;
  middleName: string;
  lastName: string;
  initials: string;
  suffix: string;
  formatType: string;
}

export interface NameAnalysisResult {
  rawInputName: string;
  normalizedName: string;
  canonicalName: string;
  parsedParts: NameParsedParts;
  validityStatus: 'valid' | 'warning' | 'flagged';
  validityFlags: string[];
  mismatchWarning: string | null;
  duplicateWarning: string | null;
  phoneticSpelling: string;
  pronunciationText: string;
  suggestions: {
    fullName: string;
    initialsStyle: string;
    atsSafeName: string;
    emailIdeas: string[];
    handleIdeas: string[];
  };
}

export interface JobRequirementsData {
  requiredSkills: string[];
  preferredSkills: string[];
  minYearsExp: number;
  seniority: string;
  keywords: string[];
  educationRequirement: string;
}

export interface GapReportData {
  summaryVerdict: string;
  matchedSkills: Array<{
    skill: string;
    category: 'hard' | 'soft';
    evidence: string;
  }>;
  partialSkills: Array<{
    skill: string;
    category: 'hard' | 'soft';
    gapNote: string;
  }>;
  missingSkills: Array<{
    skill: string;
    category: 'hard' | 'soft';
    importance: 'critical' | 'recommended' | 'bonus';
    reason: string;
  }>;
  atsCheck: {
    missingKeywords: string[];
    matchedKeywords: string[];
    formattingIssues: string[];
    atsPassLikelihood: 'High' | 'Medium' | 'Low';
  };
  seniorityGap: {
    candidateYears: number;
    requiredYears: number;
    candidateLevel: string;
    targetLevel: string;
    assessment: string;
  };
  actionPlan: Array<{
    gap: string;
    priority: 'High' | 'Medium' | 'Low';
    estimatedHours: number;
    resources: Array<{
      title: string;
      provider: string;
      url: string;
      type: 'course' | 'docs' | 'video';
    }>;
    projectIdea: string;
    certification: string;
  }>;
  bulletRewrites: Array<{
    section: string;
    original: string;
    improved: string;
    addedKeywords: string[];
    rationale: string;
    verifyBeforeApplying?: boolean;
  }>;
  interviewQuestions: Array<{
    question: string;
    targetGap: string;
    difficulty: 'Core' | 'Deep Dive' | 'Behavioral';
    talkingPoints: string[];
    sampleAnswer?: string;
  }>;
  marketInsights: {
    salaryEstimate: string;
    demandOutlook: string;
    topIndustrySkills: string[];
    negotiationTip?: string;
    sources?: Array<{ title: string; url: string }>;
  };
  healthScore?: {
    overall: number;
    clarity: number;
    impact: number;
    readability: number;
    length: number;
    atsParseability: number;
    notes: string[];
  };
  transferabilityMap?: Array<{
    existingSkill: string;
    targetSkill: string;
    coveragePercent: number;
    explanation: string;
  }>;
  recruiterSixSecondView?: {
    firstImpressions: string[];
    skippedOrBuried: string[];
    verdict: string;
  };
  careerPathSimulator?: {
    baselineAvgMatch: number;
    projectedAvgMatch: number;
    topSkillsToLearn: string[];
    simulatedSummary: string;
  };
}

export interface RoadmapWeekData {
  weekNumber: number;
  theme: string;
  estimatedHours: number;
  tasks: Array<{
    id: string;
    title: string;
    skill: string;
    resourceTitle: string;
    resourceUrl: string;
    resourceType: string;
    completed: boolean;
    calendarEventId?: string;
  }>;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  canonicalName: text('canonical_name'),
  photoUrl: text('photo_url'),
  preferredLang: text('preferred_lang').notNull().default('en'),
  darkMode: boolean('dark_mode').notNull().default(false),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  jobAlertsEnabled: boolean('job_alerts_enabled').notNull().default(false),
  alertQuery: text('alert_query'),
  alertLocation: text('alert_location'),
  sessionsRevokedAt: timestamp('sessions_revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const nameProfiles = pgTable('name_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  rawInputName: text('raw_input_name').notNull(),
  googleProfileName: text('google_profile_name'),
  resumeExtractedName: text('resume_extracted_name'),
  canonicalName: text('canonical_name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  parsedParts: jsonb('parsed_parts').$type<NameParsedParts>().notNull(),
  phoneticSpelling: text('phonetic_spelling'),
  pronunciationText: text('pronunciation_text'),
  validityStatus: text('validity_status').notNull().default('valid'),
  validityFlags: jsonb('validity_flags').$type<string[]>().notNull(),
  mismatchWarning: text('mismatch_warning'),
  duplicateWarning: text('duplicate_warning'),
  suggestions: jsonb('suggestions')
    .$type<NameAnalysisResult['suggestions']>()
    .notNull(),
  userConfirmed: boolean('user_confirmed').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  isAtsSafe: boolean('is_ats_safe').notNull().default(true),
  defaultAccent: text('default_accent').notNull().default('teal'),
  layout: text('layout').notNull().default('single-column'),
});

export const resumes = pgTable('resumes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  fileName: text('file_name'),
  fileType: text('file_type').notNull().default('text/plain'),
  fileSizeBytes: integer('file_size_bytes').notNull().default(0),
  encryptedRawText: text('encrypted_raw_text').notNull(),
  parsedData: jsonb('parsed_data').$type<ParsedResumeData>().notNull(),
  activeTemplateId: text('active_template_id').notNull().default('ats-classic'),
  builderConfig: jsonb('builder_config').$type<ResumeBuilderConfig>(),
  publicPortfolioSlug: text('public_portfolio_slug').unique(),
  isPortfolioPublic: boolean('is_portfolio_public').notNull().default(false),
  version: integer('version').notNull().default(1),
  source: text('source').notNull().default('upload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const resumeVersions = pgTable('resume_versions', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id')
    .references(() => resumes.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  versionNumber: integer('version_number').notNull(),
  label: text('label').notNull(),
  changeNote: text('change_note'),
  encryptedRawText: text('encrypted_raw_text').notNull(),
  parsedData: jsonb('parsed_data').$type<ParsedResumeData>().notNull(),
  builderConfig: jsonb('builder_config').$type<ResumeBuilderConfig>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location'),
  salaryRange: text('salary_range'),
  source: text('source').notNull().default('paste'),
  externalUrl: text('external_url'),
  descriptionText: text('description_text').notNull(),
  extractedRequirements: jsonb('extracted_requirements')
    .$type<JobRequirementsData>()
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const analyses = pgTable('analyses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  guestSessionId: text('guest_session_id'),
  resumeId: integer('resume_id').references(() => resumes.id, {
    onDelete: 'set null',
  }),
  jobId: integer('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  shareToken: text('share_token').notNull().unique(),
  overallScore: integer('overall_score').notNull(),
  skillsScore: integer('skills_score').notNull(),
  experienceScore: integer('experience_score').notNull(),
  educationScore: integer('education_score').notNull(),
  keywordsScore: integer('keywords_score').notNull(),
  gapReport: jsonb('gap_report').$type<GapReportData>().notNull(),
  isSeed: boolean('is_seed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const roadmaps = pgTable('roadmaps', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  analysisId: integer('analysis_id')
    .references(() => analyses.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  weeks: jsonb('weeks').$type<RoadmapWeekData[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const savedJobs = pgTable('saved_jobs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  jobId: integer('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('saved'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  query: text('query').notNull(),
  location: text('location').notNull().default('Remote'),
  minFitScore: integer('min_fit_score').notNull().default(75),
  frequency: text('frequency').notNull().default('weekly'),
  active: boolean('active').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at'),
  lastMatchCount: integer('last_match_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const loginAttempts = pgTable('login_attempts', {
  id: serial('id').primaryKey(),
  identifier: text('identifier').notNull(),
  ipAddress: text('ip_address'),
  email: text('email'),
  attemptType: text('attempt_type').notNull(),
  success: boolean('success').notNull(),
  captchaScore: text('captcha_score'),
  reason: text('reason'),
  lockedUntil: timestamp('locked_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const apiCache = pgTable('api_cache', {
  id: serial('id').primaryKey(),
  cacheKey: text('cache_key').notNull().unique(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  nameProfile: one(nameProfiles, {
    fields: [users.id],
    references: [nameProfiles.userId],
  }),
  resumes: many(resumes),
  resumeVersions: many(resumeVersions),
  analyses: many(analyses),
  roadmaps: many(roadmaps),
  savedJobs: many(savedJobs),
  alerts: many(alerts),
}));

export const resumesRelations = relations(resumes, ({ one, many }) => ({
  user: one(users, {
    fields: [resumes.userId],
    references: [users.id],
  }),
  versions: many(resumeVersions),
  analyses: many(analyses),
}));

export const resumeVersionsRelations = relations(resumeVersions, ({ one }) => ({
  resume: one(resumes, {
    fields: [resumeVersions.resumeId],
    references: [resumes.id],
  }),
  user: one(users, {
    fields: [resumeVersions.userId],
    references: [users.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ many }) => ({
  analyses: many(analyses),
  savedBy: many(savedJobs),
}));

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  user: one(users, {
    fields: [analyses.userId],
    references: [users.id],
  }),
  resume: one(resumes, {
    fields: [analyses.resumeId],
    references: [resumes.id],
  }),
  job: one(jobs, {
    fields: [analyses.jobId],
    references: [jobs.id],
  }),
  roadmaps: many(roadmaps),
}));

export const roadmapsRelations = relations(roadmaps, ({ one }) => ({
  user: one(users, {
    fields: [roadmaps.userId],
    references: [users.id],
  }),
  analysis: one(analyses, {
    fields: [roadmaps.analysisId],
    references: [analyses.id],
  }),
}));

export const savedJobsRelations = relations(savedJobs, ({ one }) => ({
  user: one(users, {
    fields: [savedJobs.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [savedJobs.jobId],
    references: [jobs.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  user: one(users, {
    fields: [alerts.userId],
    references: [users.id],
  }),
}));
