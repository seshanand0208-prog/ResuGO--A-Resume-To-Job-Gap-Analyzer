import type {
  GapReportData,
  JobRequirementsData,
  NameAnalysisResult,
  ParsedResumeData,
  ResumeBuilderConfig,
  RoadmapWeekData,
} from '../db/schema';
import {
  clearLocalSessionToken,
  getFirebaseIdToken,
  getGoogleAccessToken,
  getLocalSessionToken,
  getOrCreateDeviceId,
  getOrCreateGuestSessionId,
} from './firebase';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  canonicalName?: string | null;
  photoUrl: string | null;
  preferredLang: 'en' | 'ta' | 'hi';
  darkMode: boolean;
  twoFactorEnabled?: boolean;
  jobAlertsEnabled: boolean;
  alertQuery: string | null;
  alertLocation: string | null;
}

export interface NameProfileItem {
  id: number;
  userId: number;
  rawInputName: string;
  googleProfileName: string | null;
  resumeExtractedName: string | null;
  canonicalName: string;
  normalizedName: string;
  parsedParts: NameAnalysisResult['parsedParts'];
  phoneticSpelling: string | null;
  pronunciationText: string | null;
  validityStatus: 'valid' | 'warning' | 'flagged';
  validityFlags: string[];
  mismatchWarning: string | null;
  duplicateWarning: string | null;
  suggestions: NameAnalysisResult['suggestions'];
  userConfirmed: boolean;
  updatedAt: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  isAtsSafe: boolean;
  defaultAccent: string;
  layout: string;
}

export interface ResumeItem {
  id: number | null;
  title: string;
  fileName: string | null;
  fileType: string;
  fileSizeBytes: number;
  parsedData: ParsedResumeData;
  rawText?: string;
  activeTemplateId?: string;
  builderConfig?: ResumeBuilderConfig | null;
  publicPortfolioSlug?: string | null;
  isPortfolioPublic?: boolean;
  version: number;
  source: string;
  createdAt: string;
}

export interface ResumeVersionItem {
  id: number;
  resumeId: number;
  versionNumber: number;
  label: string;
  changeNote: string | null;
  parsedData: ParsedResumeData;
  builderConfig: ResumeBuilderConfig | null;
  createdAt: string;
}

export interface JobItem {
  id: number;
  title: string;
  company: string;
  location: string | null;
  salaryRange: string | null;
  source: string;
  externalUrl: string | null;
  descriptionText: string;
  extractedRequirements: JobRequirementsData;
  createdAt: string;
}

export interface AnalysisItem {
  id: number;
  userId: number | null;
  guestSessionId: string | null;
  resumeId: number | null;
  jobId: number;
  shareToken: string;
  overallScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  keywordsScore: number;
  gapReport: GapReportData;
  isSeed: boolean;
  createdAt: string;
  job: JobItem;
  roadmap?: RoadmapItem | null;
}

export interface RoadmapItem {
  id: number;
  userId: number;
  analysisId: number;
  title: string;
  weeks: RoadmapWeekData[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedJobItem {
  id: number;
  userId: number;
  jobId: number;
  notes: string | null;
  status: string;
  createdAt: string;
  job: JobItem;
}

export interface AlertItem {
  id: number;
  userId: number;
  query: string;
  location: string;
  minFitScore: number;
  frequency: string;
  active: boolean;
  createdAt: string;
}

export interface DashboardPayload {
  user: UserProfile;
  resumes: ResumeItem[];
  analyses: AnalysisItem[];
  roadmaps: RoadmapItem[];
  savedJobs: SavedJobItem[];
  nameProfile?: NameProfileItem | null;
  alerts?: AlertItem[];
  templates?: TemplateInfo[];
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getFirebaseIdToken();
  const localToken = !token ? getLocalSessionToken() : null;
  const googleAccessToken = getGoogleAccessToken();
  const guestSessionId = getOrCreateGuestSessionId();
  const deviceId = getOrCreateDeviceId();

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else if (localToken) {
    headers.set('Authorization', `Bearer local:${localToken}`);
  }
  headers.set('x-guest-session', guestSessionId);
  headers.set('x-device-id', deviceId);
  if (googleAccessToken) {
    headers.set('x-google-access-token', googleAccessToken);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const isWorkspaceAuthError =
      path.startsWith('/api/workspace/') || data.code === 'GOOGLE_TOKEN_REQUIRED';
    if (res.status === 401 && localToken && !isWorkspaceAuthError) {
      clearLocalSessionToken();
    }
    const err: any = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code;
    err.status = res.status;
    err.requireV2Fallback = data.requireV2Fallback;
    throw err;
  }
  return data as T;
}
