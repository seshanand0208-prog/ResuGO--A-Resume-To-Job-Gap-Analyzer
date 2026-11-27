import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderUp,
  Loader2,
  Map,
  MessageSquare,
  Share2,
  TrendingUp,
  Wrench,
  XCircle,
} from 'lucide-react';
import { apiFetch, AnalysisItem } from '../lib/api';
import { exportReportToPdf } from '../lib/pdfExport';
import {
  clearGoogleAccessToken,
  ensureGoogleAccessToken,
} from '../lib/firebase';
import { LangCode, t } from '../lib/i18n';

export function ReportView({
  analysis,
  isAuthenticated,
  isPublicShare,
  lang,
  onNavigate,
  onFixSkillInBuilder,
}: {
  analysis: AnalysisItem;
  isAuthenticated: boolean;
  isPublicShare?: boolean;
  lang: LangCode;
  onNavigate: (path: string) => void;
  onFixSkillInBuilder?: (skill: string, jobDesc: string, jobTitle: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<
    'skills' | 'intelligence' | 'action' | 'bullets' | 'interview' | 'market'
  >('skills');
  const [skillFilter, setSkillFilter] = useState<'all' | 'hard' | 'soft'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [confirmSheetsOpen, setConfirmSheetsOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [savingDrive, setSavingDrive] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [confirmDriveOpen, setConfirmDriveOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [practiceNotes, setPracticeNotes] = useState<Record<number, string>>({});

  const g = analysis.gapReport;

  const filterByCat = <T extends { category: string }>(arr: T[]) =>
    skillFilter === 'all' ? arr : arr.filter((i) => i.category === skillFilter);

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}/report/share/${analysis.shareToken}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const confirmExportSheets = async () => {
    setExportError(null);
    if (!isAuthenticated) {
      onNavigate('/login');
      return;
    }
    setExportingSheet(true);
    try {
      await ensureGoogleAccessToken();
      let res: { spreadsheetUrl: string };
      try {
        res = await apiFetch<{ spreadsheetUrl: string }>(
          '/api/workspace/export-sheets',
          {
            method: 'POST',
            body: JSON.stringify({ analysisId: analysis.id }),
          }
        );
      } catch (innerErr: any) {
        if (innerErr.code === 'GOOGLE_TOKEN_REQUIRED') {
          clearGoogleAccessToken();
          await ensureGoogleAccessToken(true);
          res = await apiFetch<{ spreadsheetUrl: string }>(
            '/api/workspace/export-sheets',
            {
              method: 'POST',
              body: JSON.stringify({ analysisId: analysis.id }),
            }
          );
        } else {
          throw innerErr;
        }
      }
      setSheetUrl(res.spreadsheetUrl);
      setConfirmSheetsOpen(false);
    } catch (err: any) {
      setExportError(err.message || 'Failed to export to Google Sheets.');
      setConfirmSheetsOpen(false);
    } finally {
      setExportingSheet(false);
    }
  };

  const confirmSaveToDrive = async () => {
    setExportError(null);
    if (!isAuthenticated) {
      onNavigate('/login');
      return;
    }
    setSavingDrive(true);
    try {
      await ensureGoogleAccessToken();
      let res: { fileUrl: string };
      try {
        res = await apiFetch<{ fileUrl: string }>('/api/workspace/save-drive-report', {
          method: 'POST',
          body: JSON.stringify({ analysisId: analysis.id }),
        });
      } catch (innerErr: any) {
        if (innerErr.code === 'GOOGLE_TOKEN_REQUIRED') {
          clearGoogleAccessToken();
          await ensureGoogleAccessToken(true);
          res = await apiFetch<{ fileUrl: string }>('/api/workspace/save-drive-report', {
            method: 'POST',
            body: JSON.stringify({ analysisId: analysis.id }),
          });
        } else {
          throw innerErr;
        }
      }
      setDriveUrl(res.fileUrl);
      setConfirmDriveOpen(false);
    } catch (err: any) {
      setExportError(err.message || 'Failed to save report to Google Drive.');
      setConfirmDriveOpen(false);
    } finally {
      setSavingDrive(false);
    }
  };

  const handleCopyBullet = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(`b-${idx}`);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const triggerFix = (skill: string) => {
    if (onFixSkillInBuilder) {
      onFixSkillInBuilder(skill, analysis.job.descriptionText, analysis.job.title);
    } else {
      onNavigate('/builder');
    }
  };

  return (
    <div className="space-y-6">
      {/* Confirmation Modal for Saving Report to Google Drive */}
      {confirmDriveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Save Gap Report to Google Drive?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ResuGO will authorize Google Drive if needed and create a Google Doc report for{' '}
              <strong>{analysis.job.title}</strong> at <strong>{analysis.job.company}</strong>.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDriveOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSaveToDrive}
                disabled={savingDrive}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60"
              >
                {savingDrive ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Exporting Gap Report to Google Sheets */}
      {confirmSheetsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Export Gap Report to Google Sheets?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ResuGO will create a 4-tab Google Sheet (Summary, Skill Gaps, Action Plan, Bullet Rewrites) for{' '}
              <strong>{analysis.job.title}</strong> in your Google Drive.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmSheetsOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExportSheets}
                disabled={exportingSheet}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60"
              >
                {exportingSheet ? 'Exporting...' : 'Confirm & Export Sheet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Report Header & Actions */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {analysis.job.company} · {analysis.job.location || 'Remote'} ·{' '}
              {new Date(analysis.createdAt).toLocaleDateString()}
            </p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {analysis.job.title}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              {g.summaryVerdict}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                exportReportToPdf({
                  jobTitle: analysis.job.title,
                  company: analysis.job.company,
                  location: analysis.job.location,
                  overallScore: analysis.overallScore,
                  skillsScore: analysis.skillsScore,
                  experienceScore: analysis.experienceScore,
                  educationScore: analysis.educationScore,
                  keywordsScore: analysis.keywordsScore,
                  gapReport: g,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {t(lang, 'downloadPdf')}
            </button>

            <button
              type="button"
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {shareCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              {shareCopied ? 'Link Copied' : t(lang, 'copyShareLink')}
            </button>

            {!isPublicShare && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    isAuthenticated ? setConfirmDriveOpen(true) : onNavigate('/login')
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <FolderUp className="w-3.5 h-3.5" /> Save to Drive
                </button>
                <button
                  type="button"
                  onClick={() =>
                    isAuthenticated ? setConfirmSheetsOpen(true) : onNavigate('/login')
                  }
                  disabled={exportingSheet}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  {exportingSheet ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  {t(lang, 'exportSheets')}
                </button>
              </>
            )}
          </div>
        </div>

        {sheetUrl && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200">
            <span>Gap report exported to Google Sheets successfully.</span>
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              Open Spreadsheet <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
        {driveUrl && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200">
            <span>Gap report saved to Google Drive successfully.</span>
            <a
              href={driveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              Open Google Doc <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
        {exportError && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
            {exportError}
          </div>
        )}

        {/* Score Breakdown Grid */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-6 gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'overallMatch')}</p>
            <p className="mt-1 font-mono text-3xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              {analysis.overallScore}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'skillsScore')}</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {analysis.skillsScore}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'experienceScore')}</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {analysis.experienceScore}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'educationScore')}</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {analysis.educationScore}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'keywordsScore')}</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {analysis.keywordsScore}%
            </p>
          </div>
          {g.healthScore && (
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Resume Health</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {g.healthScore.overall}/100
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Report Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {[
            { id: 'skills', label: 'Skills & ATS Check' },
            { id: 'intelligence', label: 'Health, 6s View & Simulator' },
            { id: 'action', label: 'Action Plan' },
            { id: 'bullets', label: 'AI Bullet Rewriter' },
            { id: 'interview', label: 'Interview Prep' },
            { id: 'market', label: 'Market & Salary' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!isPublicShare && isAuthenticated && (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onNavigate('/cover-letter')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" /> Cover Letter
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/roadmap')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
            >
              <Map className="w-4 h-4" /> Skill Roadmap →
            </button>
          </div>
        )}
      </div>

      {/* Tab 1: Skills & ATS Check */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Skill Gap Breakdown
            </h2>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'hard', 'soft'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSkillFilter(cat)}
                  className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                    skillFilter === cat
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Matched */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm mb-4">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {t(lang, 'matched')} ({filterByCat(g.matchedSkills).length})
                </span>
              </div>
              <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
                {filterByCat(g.matchedSkills).map((s, i) => (
                  <div key={i} className="pt-2.5 first:pt-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {s.skill}{' '}
                      <span className="text-xs font-normal text-slate-500">· {s.category}</span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {s.evidence}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Partial */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm mb-4">
                <AlertCircle className="w-4 h-4" />
                <span>
                  {t(lang, 'partial')} ({filterByCat(g.partialSkills).length})
                </span>
              </div>
              <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
                {filterByCat(g.partialSkills).map((s, i) => (
                  <div key={i} className="pt-2.5 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {s.skill}{' '}
                        <span className="text-xs font-normal text-slate-500">· {s.category}</span>
                      </p>
                      {!isPublicShare && (
                        <button
                          type="button"
                          onClick={() => triggerFix(s.skill)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline shrink-0"
                        >
                          <Wrench className="w-3 h-3" /> Fix this
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {s.gapNote}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Missing with Gap-to-Fix button */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-sm mb-4">
                <XCircle className="w-4 h-4" />
                <span>
                  {t(lang, 'missing')} ({filterByCat(g.missingSkills).length})
                </span>
              </div>
              <div className="space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
                {filterByCat(g.missingSkills).map((s, i) => (
                  <div key={i} className="pt-2.5 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {s.skill}{' '}
                        <span className="text-xs font-normal text-red-600 dark:text-red-400">
                          · {s.importance}
                        </span>
                      </p>
                      {!isPublicShare && (
                        <button
                          type="button"
                          onClick={() => triggerFix(s.skill)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                        >
                          <Wrench className="w-3 h-3" /> Fix this
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{s.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ATS Check & Seniority Gap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  ATS Keyword Check
                </h3>
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  Pass Likelihood: {g.atsCheck.atsPassLikelihood}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                  Missing Keywords
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {g.atsCheck.missingKeywords.join(' · ') || 'None'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                  Matched Keywords
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {g.atsCheck.matchedKeywords.join(' · ') || 'None'}
                </p>
              </div>
              {g.atsCheck.formattingIssues.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    Formatting & Impact Notes
                  </p>
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    {g.atsCheck.formattingIssues.map((issue, i) => (
                      <li key={i}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Seniority & Experience Alignment
              </h3>
              <div className="grid grid-cols-2 gap-4 py-2 border-y border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500">Your Experience</p>
                  <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                    {g.seniorityGap.candidateYears} yrs · {g.seniorityGap.candidateLevel}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Target Benchmark</p>
                  <p className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {g.seniorityGap.requiredYears}+ yrs · {g.seniorityGap.targetLevel}
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {g.seniorityGap.assessment}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Health Score, Transferability Map, Recruiter 6s View & Career Simulator */}
      {activeTab === 'intelligence' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Resume Health Score */}
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600" />
                  Resume Health Score
                </h2>
                <span className="font-mono text-xl font-bold text-teal-600 tabular-nums">
                  {g.healthScore?.overall ?? analysis.overallScore}/100
                </span>
              </div>
              {g.healthScore ? (
                <>
                  <div className="grid grid-cols-5 gap-2 text-center text-xs">
                    {[
                      { label: 'Clarity', val: g.healthScore.clarity },
                      { label: 'Impact', val: g.healthScore.impact },
                      { label: 'Readable', val: g.healthScore.readability },
                      { label: 'Length', val: g.healthScore.length },
                      { label: 'ATS', val: g.healthScore.atsParseability },
                    ].map((axis) => (
                      <div key={axis.label} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950">
                        <p className="text-slate-500">{axis.label}</p>
                        <p className="mt-1 font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          {axis.val}
                        </p>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {g.healthScore.notes.map((n, i) => (
                      <li key={i}>• {n}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-slate-500">Health score breakdown computed on new analyses.</p>
              )}
            </div>

            {/* Recruiter 6-Second View */}
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Recruiter 6-Second Scan Simulation
              </h2>
              {g.recruiterSixSecondView ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                      What Stands Out Immediately
                    </p>
                    <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                      {g.recruiterSixSecondView.firstImpressions.map((imp, i) => (
                        <li key={i}>• {imp}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                      Skipped or Buried
                    </p>
                    <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                      {g.recruiterSixSecondView.skippedOrBuried.map((sk, i) => (
                        <li key={i}>• {sk}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="pt-2 border-t border-slate-100 dark:border-slate-800 font-medium text-slate-900 dark:text-white">
                    {g.recruiterSixSecondView.verdict}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">6-second recruiter scan is included on all new reports.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Skill Transferability Map */}
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Skill Transferability Map
              </h2>
              {g.transferabilityMap && g.transferabilityMap.length > 0 ? (
                <div className="space-y-3">
                  {g.transferabilityMap.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-slate-900 dark:text-white">
                          {item.existingSkill} → {item.targetSkill}
                        </span>
                        <span className="font-mono text-teal-600 dark:text-teal-400 tabular-nums">
                          {item.coveragePercent}% transferable
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{item.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No partial skill transferability paths flagged.</p>
              )}
            </div>

            {/* Career Path Simulator */}
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Career Path Match Simulator
              </h2>
              {g.careerPathSimulator ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-xs text-slate-500">Current Baseline Match</p>
                      <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                        {g.careerPathSimulator.baselineAvgMatch}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Projected Match After Upskilling</p>
                      <p className="font-mono text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                        {g.careerPathSimulator.projectedAvgMatch}%
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    High-leverage skills: {g.careerPathSimulator.topSkillsToLearn.join(' · ')}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {g.careerPathSimulator.simulatedSummary}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Run a new analysis to simulate upskilling impact.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Action Plan */}
      {activeTab === 'action' && (
        <div className="space-y-4">
          {g.actionPlan.map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {idx + 1}. {item.gap}
                </h3>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  Priority: {item.priority} · Est. {item.estimatedHours} hrs
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mb-1">
                    Project to Build
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">{item.projectIdea}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 mb-1">
                    Recommended Certification
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">{item.certification}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  Learning Resources
                </p>
                <div className="flex flex-wrap gap-4">
                  {item.resources.map((res, rIdx) => (
                    <a
                      key={rIdx}
                      href={res.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>
                        {res.title} ({res.provider})
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: AI Bullet Rewriter with Honesty Guard */}
      {activeTab === 'bullets' && (
        <div className="space-y-4">
          {g.bulletRewrites.map((b, idx) => (
            <div
              key={idx}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {b.section} · Added keywords: {b.addedKeywords.join(', ')}
                </p>
                <div className="flex items-center gap-4">
                  {b.verifyBeforeApplying && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5" /> Verify before applying
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyBullet(idx, b.improved)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    {copiedId === `b-${idx}` ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Improved Bullet
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Before</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{b.original}</p>
                </div>
                <div className="p-4 rounded-lg bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900">
                  <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mb-1.5">
                    After (Honest Tailoring)
                  </p>
                  <p className="text-sm text-slate-900 dark:text-white font-medium">
                    {b.improved}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Why this helps: {b.rationale}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tab 5: Interview Prep with Sample Answers */}
      {activeTab === 'interview' && (
        <div className="space-y-4">
          {g.interviewQuestions.map((q, idx) => (
            <div
              key={idx}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Target Gap:{' '}
                  <strong className="text-slate-900 dark:text-white">{q.targetGap}</strong> ·{' '}
                  {q.difficulty}
                </span>
              </div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600 mt-1 shrink-0" />
                <span>{q.question}</span>
              </h3>
              <div>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 mb-1">
                  Key Talking Points
                </p>
                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  {q.talkingPoints.map((tp, tIdx) => (
                    <li key={tIdx}>• {tp}</li>
                  ))}
                </ul>
              </div>
              {q.sampleAnswer && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white">Sample Answer Pattern: </strong>
                  {q.sampleAnswer}
                </div>
              )}
              <textarea
                rows={2}
                value={practiceNotes[idx] || ''}
                onChange={(e) =>
                  setPracticeNotes((prev) => ({ ...prev, [idx]: e.target.value }))
                }
                placeholder="Draft your STAR / technical answer notes here..."
                className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
          ))}
        </div>
      )}

      {/* Tab 6: Market, Salary & Negotiation Tip */}
      {activeTab === 'market' && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Role Market, Compensation & Negotiation Insights
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Estimated Compensation</p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-white">
                {g.marketInsights.salaryEstimate}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Demand Outlook</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {g.marketInsights.demandOutlook}
              </p>
            </div>
          </div>
          {g.marketInsights.negotiationTip && (
            <div className="p-4 rounded-lg bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 text-xs text-slate-800 dark:text-slate-200">
              <strong className="text-teal-800 dark:text-teal-300">Negotiation Tip: </strong>
              {g.marketInsights.negotiationTip}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Top Skills Requested in Market
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {g.marketInsights.topIndustrySkills.join(' · ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
