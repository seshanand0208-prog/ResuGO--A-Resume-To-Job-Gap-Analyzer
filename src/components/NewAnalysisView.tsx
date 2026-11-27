import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  FolderOpen,
  Link2,
  Loader2,
  Lock,
  Sparkles,
} from 'lucide-react';
import { apiFetch, AnalysisItem, ResumeItem } from '../lib/api';
import type { NameAnalysisResult } from '../db/schema';
import {
  clearGoogleAccessToken,
  ensureGoogleAccessToken,
  openGoogleDrivePicker,
  subscribeGoogleWorkspaceStatus,
} from '../lib/firebase';
import { LangCode, t } from '../lib/i18n';

const MAX_BYTES = 10 * 1024 * 1024;

export interface PrefillJob {
  title?: string;
  company?: string;
  location?: string;
  salaryRange?: string;
  applyUrl?: string;
  source?: string;
  descriptionText: string;
}

export function NewAnalysisView({
  resumes,
  isAuthenticated,
  prefillJob,
  lang,
  onAnalysisComplete,
  onRequireSignIn,
  onResumeUploaded,
  onOpenNameCheck,
}: {
  resumes: ResumeItem[];
  isAuthenticated: boolean;
  prefillJob: PrefillJob | null;
  lang: LangCode;
  onAnalysisComplete: (analysis: AnalysisItem) => void;
  onRequireSignIn: () => void;
  onResumeUploaded: () => void;
  onOpenNameCheck?: () => void;
}) {
  const [resumeMode, setResumeMode] = useState<'upload' | 'paste' | 'saved'>(
    resumes.length > 0 ? 'saved' : 'upload'
  );
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(
    resumes[0]?.id ?? null
  );
  const [uploadedResume, setUploadedResume] = useState<ResumeItem | null>(null);
  const [parsedPastedResume, setParsedPastedResume] = useState<ResumeItem | null>(null);
  const [parsingPaste, setParsingPaste] = useState(false);
  const [nameCheckNotice, setNameCheckNotice] = useState<NameAnalysisResult | null>(null);
  const [pasteResumeText, setPasteResumeText] = useState('');
  const [resumeTitle, setResumeTitle] = useState('');

  const [jobMode, setJobMode] = useState<'paste' | 'url'>('paste');
  const [jobText, setJobText] = useState(prefillJob?.descriptionText || '');
  const [jobUrl, setJobUrl] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestLimitHit, setGuestLimitHit] = useState(false);
  const [workspaceConnected, setWorkspaceConnected] = useState(false);

  useEffect(() => {
    return subscribeGoogleWorkspaceStatus(setWorkspaceConnected);
  }, []);

  useEffect(() => {
    if (prefillJob?.descriptionText) {
      setJobMode('paste');
      setJobText(prefillJob.descriptionText);
    }
  }, [prefillJob]);

  useEffect(() => {
    if (resumes.length > 0 && !selectedResumeId) {
      setSelectedResumeId(resumes[0].id);
    }
  }, [resumes, selectedResumeId]);

  const parsePastedTextNow = async (rawTextToParse: string) => {
    const trimmed = rawTextToParse.trim();
    if (trimmed.length < 30) {
      setError('Please paste at least 30 characters of resume text to load and parse.');
      return;
    }
    setError(null);
    setParsingPaste(true);
    try {
      const res = await apiFetch<{ resume: ResumeItem; nameCheck?: NameAnalysisResult | null }>(
        '/api/resumes/upload',
        {
          method: 'POST',
          body: JSON.stringify({
            rawText: trimmed,
            title: resumeTitle.trim() || undefined,
            source: 'paste',
          }),
        }
      );
      setParsedPastedResume(res.resume);
      if (res.nameCheck && (res.nameCheck.mismatchWarning || res.nameCheck.validityFlags.length > 0)) {
        setNameCheckNotice(res.nameCheck);
      }
      if (res.resume.id) {
        onResumeUploaded();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse pasted resume text.');
    } finally {
      setParsingPaste(false);
    }
  };

  // Auto-parse pasted resume cleanly after a short pause when user pastes >= 80 chars
  useEffect(() => {
    if (resumeMode !== 'paste') return;
    const trimmed = pasteResumeText.trim();
    if (trimmed.length < 80) {
      setParsedPastedResume(null);
      return;
    }
    if (parsedPastedResume && parsedPastedResume.rawText?.trim() === trimmed) {
      return;
    }
    const timer = window.setTimeout(() => {
      parsePastedTextNow(trimmed);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [pasteResumeText, resumeMode]);

  const processUploadedFile = async (file: File) => {
    setError(null);
    setNameCheckNotice(null);

    if (file.size > MAX_BYTES) {
      setError('File size exceeds the 10 MB limit.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (resumeTitle.trim()) {
        formData.append('title', resumeTitle.trim());
      }
      const res = await apiFetch<{ resume: ResumeItem; nameCheck?: NameAnalysisResult | null }>(
        '/api/resumes/upload',
        {
          method: 'POST',
          body: formData,
        }
      );
      setUploadedResume(res.resume);
      if (res.nameCheck && (res.nameCheck.mismatchWarning || res.nameCheck.validityFlags.length > 0)) {
        setNameCheckNotice(res.nameCheck);
      }
      if (res.resume.id) {
        setSelectedResumeId(res.resume.id);
        onResumeUploaded();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse resume file.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processUploadedFile(file);
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processUploadedFile(file);
    }
  };

  const handleDrivePicker = async () => {
    setError(null);
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }

    try {
      const token = await ensureGoogleAccessToken();
      await openGoogleDrivePicker(
        token,
        async (picked) => {
          setUploading(true);
          try {
            const res = await apiFetch<{ resume: ResumeItem }>(
              '/api/workspace/import-drive-file',
              {
                method: 'POST',
                body: JSON.stringify({
                  fileId: picked.id,
                  fileName: picked.name,
                  mimeType: picked.mimeType,
                }),
              }
            );
            setUploadedResume(res.resume);
            if (res.resume.id) {
              setSelectedResumeId(res.resume.id);
              onResumeUploaded();
            }
          } catch (err: any) {
            if (err.code === 'GOOGLE_TOKEN_REQUIRED') {
              clearGoogleAccessToken();
            }
            setError(err.message || 'Failed to import file from Google Drive.');
          } finally {
            setUploading(false);
          }
        },
        () => setUploading(false)
      );
    } catch (err: any) {
      setError(err.message || 'Could not authorize or open Google Drive Picker.');
    }
  };

  const handleRunAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuestLimitHit(false);

    if (!consentAccepted) {
      setError('Please acknowledge the data processing and encryption consent notice.');
      return;
    }

    const payload: Record<string, unknown> = {
      jobText: jobMode === 'paste' ? jobText.trim() : undefined,
      jobUrl: jobMode === 'url' ? jobUrl.trim() : undefined,
      jobMeta: prefillJob || undefined,
    };

    if (resumeMode === 'saved' && selectedResumeId) {
      payload.resumeId = selectedResumeId;
    } else if (resumeMode === 'upload' && uploadedResume) {
      if (uploadedResume.id) {
        payload.resumeId = uploadedResume.id;
      } else {
        payload.parsedResume = uploadedResume.parsedData;
        payload.rawResumeText = uploadedResume.rawText;
      }
    } else if (resumeMode === 'paste') {
      if (parsedPastedResume && parsedPastedResume.rawText?.trim() === pasteResumeText.trim()) {
        if (parsedPastedResume.id) {
          payload.resumeId = parsedPastedResume.id;
        } else {
          payload.parsedResume = parsedPastedResume.parsedData;
          payload.rawResumeText = parsedPastedResume.rawText;
        }
      } else {
        payload.rawResumeText = pasteResumeText.trim();
      }
    }

    setAnalyzing(true);
    try {
      const res = await apiFetch<{ analysis: AnalysisItem }>('/api/analyses/run', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onAnalysisComplete(res.analysis);
    } catch (err: any) {
      if (err.code === 'GUEST_LIMIT_REACHED') {
        setGuestLimitHit(true);
      }
      setError(err.message || 'Gap analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const loadSampleData = () => {
    const sampleResume = `Arjun Mehta — Software Engineer
arjun.mehta@example.com · Hyderabad, India · 3.5 years experience
Summary: Backend & React developer specializing in TypeScript, Node.js, and REST APIs.
Experience:
- Software Engineer at PayFlow (2023–Present): Built React dashboard and Node.js Express microservices handling 12k daily webhook events.
- Junior Developer at ShopGrid (2021–2023): Implemented order checkout flows and unit tests with Jest.
Skills: JavaScript, TypeScript, React, Node.js, Express, MongoDB, Git, Jest, HTML, CSS
Education: B.Tech Information Technology, IIIT Hyderabad (2021)`;
    setResumeMode('paste');
    setParsedPastedResume(null);
    setPasteResumeText(sampleResume);
    setJobMode('paste');
    setJobText(`Senior Full-Stack Engineer — FinScale
Location: Bengaluru / Hybrid · Salary: ₹32L – ₹46L
Requirements:
- 4+ years building production applications with React, TypeScript, and Node.js
- Strong experience with PostgreSQL schema design, indexing, and query optimization
- Experience with Docker, CI/CD pipelines, and AWS or GCP cloud deployments
- Familiarity with Redis caching, GraphQL, and automated Playwright testing`);
  };

  return (
    <form onSubmit={handleRunAnalysis} className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            New Resume-to-Job Gap Analysis
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Upload a resume (PDF, DOCX, Google Doc, or text) and supply a target role to receive an actionable gap report.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSampleData}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          Fill Sample Resume & Job
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          {guestLimitHit && (
            <button
              type="button"
              onClick={onRequireSignIn}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
            >
              Sign In to Continue
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1: Resume Source */}
        <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              01. {t(lang, 'uploadResume')}
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Max 10 MB</span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {resumes.length > 0 && (
              <button
                type="button"
                onClick={() => setResumeMode('saved')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  resumeMode === 'saved'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Saved ({resumes.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setResumeMode('upload')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                resumeMode === 'upload'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              File / Drive
            </button>
            <button
              type="button"
              onClick={() => setResumeMode('paste')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                resumeMode === 'paste'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Paste Text
            </button>
          </div>

          {resumeMode === 'saved' && resumes.length > 0 && (
            <div className="space-y-2.5">
              {resumes.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedResumeId === r.id
                      ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="savedResume"
                    checked={selectedResumeId === r.id}
                    onChange={() => setSelectedResumeId(r.id)}
                    className="mt-1 accent-teal-600"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {r.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      v{r.version} · {r.parsedData.skills.length} skills · {r.parsedData.totalYearsExp} yrs exp
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {resumeMode === 'upload' && (
            <div className="space-y-4">
              <input
                type="text"
                value={resumeTitle}
                onChange={(e) => setResumeTitle(e.target.value)}
                placeholder="Optional label (e.g. Full-Stack v2)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors text-center ${
                  dragOver
                    ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30'
                    : 'border-slate-300 dark:border-slate-700 hover:border-teal-500'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-7 h-7 text-teal-600 animate-spin mb-2" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Extracting & structuring resume...
                    </span>
                  </>
                ) : (
                  <>
                    <FileUp className="w-7 h-7 text-teal-600 mb-2" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      Drop or Upload PDF, DOCX, or TXT
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Encrypted with AES-256-GCM · Fast Local Extract · Max 10 MB
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleDrivePicker}
                disabled={uploading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-indigo-600" />
                <span>
                  {workspaceConnected
                    ? 'Import from Google Drive Picker (Connected)'
                    : 'Connect & Import from Google Drive'}
                </span>
              </button>

              {uploadedResume && (
                <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-emerald-900 dark:text-emerald-200">
                    <p className="font-semibold">
                      Parsed: {uploadedResume.parsedData.contactInfo?.name || uploadedResume.title}
                    </p>
                    <p className="mt-0.5">
                      {uploadedResume.parsedData.skills.length} skills extracted ·{' '}
                      {uploadedResume.parsedData.experience.length} roles
                    </p>
                  </div>
                </div>
              )}

              {nameCheckNotice && (
                <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Name Check Notice: {nameCheckNotice.canonicalName}
                      </p>
                      <p className="mt-0.5">
                        {nameCheckNotice.mismatchWarning ||
                          nameCheckNotice.validityFlags.join(' · ')}
                      </p>
                    </div>
                  </div>
                  {onOpenNameCheck && (
                    <button
                      type="button"
                      onClick={onOpenNameCheck}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 whitespace-nowrap shrink-0"
                    >
                      Review Name
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {resumeMode === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {parsingPaste ? (
                    <span className="inline-flex items-center gap-1.5 text-teal-600 dark:text-teal-400 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading & extracting skills...
                    </span>
                  ) : parsedPastedResume ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Resume loaded & ready
                    </span>
                  ) : (
                    'Paste plain text — auto-parses immediately'
                  )}
                </span>
                <button
                  type="button"
                  disabled={parsingPaste || pasteResumeText.trim().length < 30}
                  onClick={() => parsePastedTextNow(pasteResumeText)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {parsingPaste ? 'Loading...' : 'Load & Parse'}
                </button>
              </div>
              <textarea
                rows={9}
                value={pasteResumeText}
                onChange={(e) => {
                  setPasteResumeText(e.target.value);
                  if (parsedPastedResume && parsedPastedResume.rawText?.trim() !== e.target.value.trim()) {
                    setParsedPastedResume(null);
                  }
                }}
                placeholder="Paste your resume text here (experience, skills, education, projects)..."
                className="w-full p-3.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {parsedPastedResume && (
                <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-emerald-900 dark:text-emerald-200">
                    <p className="font-semibold">
                      Parsed: {parsedPastedResume.parsedData.contactInfo?.name || 'Candidate Resume'}
                    </p>
                    <p className="mt-0.5">
                      {parsedPastedResume.parsedData.skills.length} skills extracted ·{' '}
                      {parsedPastedResume.parsedData.experience.length} roles ·{' '}
                      {parsedPastedResume.parsedData.totalYearsExp} yrs exp
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Step 2: Target Job */}
        <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              02. {t(lang, 'targetJob')}
            </h2>
            {prefillJob?.company && (
              <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                Pre-filled: {prefillJob.company}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setJobMode('paste')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                jobMode === 'paste'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Paste Description
            </button>
            <button
              type="button"
              onClick={() => setJobMode('url')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                jobMode === 'url'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Paste Job URL
            </button>
          </div>

          {jobMode === 'paste' ? (
            <textarea
              rows={10}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Paste the full job posting (title, responsibilities, required skills, years of experience)..."
              className="w-full p-3.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Public Job Posting URL
              </label>
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="url"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/company/jobs/12345"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ResuGO reads public job posting URLs cleanly. If a site blocks automated reading behind a login wall, switch to Paste Description.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Consent Notice & Submit */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer max-w-2xl">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-0.5 accent-teal-600"
          />
          <span>
            <Lock className="w-3.5 h-3.5 inline mr-1 text-teal-600" />
            {t(lang, 'privacyNotice')}
          </span>
        </label>

        <button
          type="submit"
          disabled={analyzing || uploading}
          className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t(lang, 'analyzing')}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{t(lang, 'runAnalysis')}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
