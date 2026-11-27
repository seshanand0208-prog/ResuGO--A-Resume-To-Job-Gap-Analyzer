import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Globe,
  GripVertical,
  History,
  Loader2,
  Lock,
  Plus,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  apiFetch,
  NameProfileItem,
  ResumeItem,
  ResumeVersionItem,
} from '../lib/api';
import type {
  CustomSectionBlock,
  ParsedResumeData,
  ResumeBuilderConfig,
} from '../db/schema';
import {
  DEFAULT_BUILDER_CONFIG,
  RESUME_TEMPLATE_CATALOG,
  SECTION_LABELS,
} from '../lib/templates';
import {
  exportResumeToDocx,
  exportResumeToPdf,
  exportResumeToTxt,
} from '../lib/resumeExport';
import {
  clearGoogleAccessToken,
  ensureGoogleAccessToken,
  openGoogleDrivePicker,
} from '../lib/firebase';
import type { BuilderAssistAction } from '../server/ai';

export interface GapFixPrefill {
  skill: string;
  targetJobText?: string;
  jobTitle?: string;
}

const WEAK_VERBS = ['responsible for', 'helped with', 'worked on', 'assisted in', 'duties included'];

function emptyResume(defaultName = 'Your Name'): ParsedResumeData {
  return {
    contactInfo: {
      name: defaultName,
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      portfolio: '',
    },
    photoUrl: '',
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
}

export function ResumeBuilderView({
  resumes,
  nameProfile,
  prefillFix,
  onClearPrefillFix,
  onRefresh,
  onNavigate,
}: {
  resumes: ResumeItem[];
  nameProfile: NameProfileItem | null;
  prefillFix: GapFixPrefill | null;
  onClearPrefillFix: () => void;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
}) {
  const [activeResumeId, setActiveResumeId] = useState<number | null>(resumes[0]?.id ?? null);
  const initialResume = resumes.find((r) => r.id === activeResumeId) || resumes[0] || null;

  const [title, setTitle] = useState(initialResume?.title || 'Custom Tailored Resume');
  const [data, setData] = useState<ParsedResumeData>(
    initialResume?.parsedData || emptyResume(nameProfile?.canonicalName || 'Maya Subramanian')
  );
  const [config, setConfig] = useState<ResumeBuilderConfig>(
    initialResume?.builderConfig || DEFAULT_BUILDER_CONFIG
  );
  const [isPortfolioPublic, setIsPortfolioPublic] = useState<boolean>(
    Boolean(initialResume?.isPortfolioPublic)
  );
  const [portfolioSlug, setPortfolioSlug] = useState<string | null>(
    initialResume?.publicPortfolioSlug || null
  );

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<ParsedResumeData[]>([]);
  const [redoStack, setRedoStack] = useState<ParsedResumeData[]>([]);

  // UI panels & tools
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const [activePanel, setActivePanel] = useState<'sections' | 'design' | 'versions' | 'import'>(
    'sections'
  );
  const [activeSection, setActiveSection] = useState<string>('contact');
  const [dragSection, setDragSection] = useState<string | null>(null);

  // Save / Auto-save state
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Versions & compare
  const [versions, setVersions] = useState<ResumeVersionItem[]>([]);
  const [compareLeftIdx, setCompareLeftIdx] = useState(0);
  const [compareRightIdx, setCompareRightIdx] = useState(1);

  // AI Assistant state
  const [targetJobText, setTargetJobText] = useState(prefillFix?.targetJobText || '');
  const [aiTone, setAiTone] = useState('Executive & Metric-Focused');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    action: string;
    improvedText: string;
    suggestedSkills: string[];
    honestyFlag: boolean;
    verifyNotice: string;
    rationale: string;
    updatedSummary?: string;
  } | null>(null);

  // Import state
  const [linkedinPaste, setLinkedinPaste] = useState('');
  const [importing, setImporting] = useState(false);
  const [newSkillInput, setNewSkillInput] = useState('');

  // Export modals
  const [confirmGdocOpen, setConfirmGdocOpen] = useState(false);
  const [exportingGdoc, setExportingGdoc] = useState(false);
  const [gdocUrl, setGdocUrl] = useState<string | null>(null);
  const [copiedPortfolio, setCopiedPortfolio] = useState(false);

  const dirtyRef = useRef(false);

  // Load selected resume when switching dropdown
  const selectResume = (id: number) => {
    const found = resumes.find((r) => r.id === id);
    if (!found) return;
    setActiveResumeId(found.id);
    setTitle(found.title);
    setData(found.parsedData);
    setConfig(found.builderConfig || DEFAULT_BUILDER_CONFIG);
    setIsPortfolioPublic(Boolean(found.isPortfolioPublic));
    setPortfolioSlug(found.publicPortfolioSlug || null);
    setUndoStack([]);
    setRedoStack([]);
    dirtyRef.current = false;
  };

  useEffect(() => {
    if (!activeResumeId && resumes[0]?.id) {
      selectResume(resumes[0].id);
    }
  }, [resumes]);

  // Load version history when versions tab opens or activeResumeId changes
  useEffect(() => {
    if (!activeResumeId) return;
    apiFetch<{ versions: ResumeVersionItem[] }>(`/api/resumes/${activeResumeId}/versions`)
      .then((res) => setVersions(res.versions || []))
      .catch(() => {});
  }, [activeResumeId]);

  // Apply Gap-to-Fix prefill from ReportView
  useEffect(() => {
    if (!prefillFix) return;
    if (prefillFix.targetJobText) setTargetJobText(prefillFix.targetJobText);
    setActiveSection('summary');
    setNotice(
      `Gap-to-Fix loaded for "${prefillFix.skill}". Run AI Tailor below to weave honest transferable proof into your resume.`
    );
  }, [prefillFix]);

  const updateDataWithHistory = (updater: (prev: ParsedResumeData) => ParsedResumeData) => {
    setUndoStack((s) => [...s.slice(-24), data]);
    setRedoStack([]);
    setData((prev) => updater(prev));
    dirtyRef.current = true;
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, data]);
    setUndoStack((s) => s.slice(0, -1));
    setData(prev);
    dirtyRef.current = true;
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, data]);
    setRedoStack((r) => r.slice(0, -1));
    setData(next);
    dirtyRef.current = true;
  };

  const saveBuilder = async (saveSnapshot = false, snapshotLabel?: string, changeNote?: string) => {
    if (!activeResumeId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ resume: ResumeItem }>(`/api/resumes/${activeResumeId}/builder`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          parsedData: data,
          builderConfig: config,
          isPortfolioPublic,
          saveSnapshot,
          snapshotLabel,
          changeNote,
        }),
      });
      setPortfolioSlug(res.resume.publicPortfolioSlug || portfolioSlug);
      setLastSavedAt(new Date().toLocaleTimeString());
      dirtyRef.current = false;
      if (saveSnapshot) {
        const verRes = await apiFetch<{ versions: ResumeVersionItem[] }>(
          `/api/resumes/${activeResumeId}/versions`
        );
        setVersions(verRes.versions || []);
        setNotice(`Saved version snapshot: ${snapshotLabel || 'Revision'}`);
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to save resume.');
    } finally {
      setSaving(false);
    }
  };

  // Debounced auto-save every 2.5s after edit
  useEffect(() => {
    if (!activeResumeId || !dirtyRef.current) return;
    const timer = setTimeout(() => {
      if (dirtyRef.current) saveBuilder(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [data, config, title, isPortfolioPublic]);

  const handleCreateStarter = async (fresherMode: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ resume: ResumeItem }>('/api/resumes/blank', {
        method: 'POST',
        body: JSON.stringify({
          title: fresherMode ? 'Fresher Campus Resume' : 'Custom Resume Draft',
          fresherMode,
        }),
      });
      setActiveResumeId(res.resume.id);
      setTitle(res.resume.title);
      setData(res.resume.parsedData);
      setConfig(res.resume.builderConfig || DEFAULT_BUILDER_CONFIG);
      setPortfolioSlug(res.resume.publicPortfolioSlug || null);
      setNotice(
        fresherMode
          ? 'Fresher Mode starter resume created with Education & Capstone Projects first.'
          : 'Blank custom resume created.'
      );
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create starter resume.');
    } finally {
      setSaving(false);
    }
  };

  const runAiAssist = async (
    action: BuilderAssistAction,
    sectionText?: string,
    missingSkill?: string
  ) => {
    setAiLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        improvedText: string;
        suggestedSkills: string[];
        honestyFlag: boolean;
        verifyNotice: string;
        rationale: string;
        updatedSummary?: string;
      }>(`/api/resumes/${activeResumeId || 0}/ai-assist`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          resume: data,
          sectionText: sectionText || data.summary,
          targetJobText,
          missingSkill: missingSkill || prefillFix?.skill,
          tone: aiTone,
          language: config.targetLanguage,
        }),
      });
      setAiSuggestion({ action, ...res });
    } catch (err: any) {
      setError(err.message || 'AI resume assistant failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    updateDataWithHistory((prev) => {
      const next = { ...prev };
      if (aiSuggestion.updatedSummary || aiSuggestion.action === 'generate_summary' || aiSuggestion.action === 'tailor_to_job' || aiSuggestion.action === 'shorten_one_page') {
        next.summary = aiSuggestion.updatedSummary || aiSuggestion.improvedText;
      }
      if (aiSuggestion.suggestedSkills?.length) {
        const merged = new Set([...prev.skills, ...aiSuggestion.suggestedSkills]);
        next.skills = Array.from(merged);
      }
      return next;
    });
    setAiSuggestion(null);
    if (prefillFix) onClearPrefillFix();
    setNotice('Applied AI suggestion to your resume draft. Review before exporting.');
  };

  const handleImportLinkedInOrText = async () => {
    if (linkedinPaste.trim().length < 30) {
      setError('Paste at least 30 characters of LinkedIn profile or resume text.');
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await apiFetch<{ resume: ResumeItem }>('/api/resumes/upload', {
        method: 'POST',
        body: JSON.stringify({
          title: `${data.contactInfo.name || 'Imported'} LinkedIn Resume`,
          rawText: linkedinPaste,
          source: 'linkedin_import',
        }),
      });
      setActiveResumeId(res.resume.id);
      setTitle(res.resume.title);
      setData(res.resume.parsedData);
      setNotice('Imported & structured text into the live Resume Builder.');
      setActivePanel('sections');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleDriveImport = async () => {
    setError(null);
    try {
      const token = await ensureGoogleAccessToken();
      await openGoogleDrivePicker(
        token,
        async (picked) => {
          setImporting(true);
          try {
            const res = await apiFetch<{ resume: ResumeItem }>('/api/workspace/import-drive-file', {
              method: 'POST',
              body: JSON.stringify({
                fileId: picked.id,
                fileName: picked.name,
                mimeType: picked.mimeType,
              }),
            });
            setActiveResumeId(res.resume.id);
            setTitle(res.resume.title);
            setData(res.resume.parsedData);
            setNotice(`Imported "${picked.name}" from Google Drive into Builder.`);
            setActivePanel('sections');
            onRefresh();
          } catch (err: any) {
            if (err.code === 'GOOGLE_TOKEN_REQUIRED') {
              clearGoogleAccessToken();
            }
            setError(err.message || 'Google Drive import failed.');
          } finally {
            setImporting(false);
          }
        },
        () => setImporting(false)
      );
    } catch (err: any) {
      setError(err.message || 'Unable to authorize or launch Google Drive Picker.');
    }
  };

  const confirmExportGoogleDoc = async () => {
    setError(null);
    setExportingGdoc(true);
    try {
      await ensureGoogleAccessToken();
      let res: { docUrl: string };
      try {
        res = await apiFetch<{ docUrl: string }>('/api/workspace/export-gdoc', {
          method: 'POST',
          body: JSON.stringify({ title, parsedData: data }),
        });
      } catch (innerErr: any) {
        if (innerErr.code === 'GOOGLE_TOKEN_REQUIRED') {
          clearGoogleAccessToken();
          await ensureGoogleAccessToken(true);
          res = await apiFetch<{ docUrl: string }>('/api/workspace/export-gdoc', {
            method: 'POST',
            body: JSON.stringify({ title, parsedData: data }),
          });
        } else {
          throw innerErr;
        }
      }
      setGdocUrl(res.docUrl);
      setConfirmGdocOpen(false);
    } catch (err: any) {
      setError(err.message || 'Google Docs export failed.');
      setConfirmGdocOpen(false);
    } finally {
      setExportingGdoc(false);
    }
  };

  const moveSection = (secId: string, dir: -1 | 1) => {
    const idx = config.sectionOrder.indexOf(secId);
    if (idx === -1) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= config.sectionOrder.length) return;
    const nextOrder = [...config.sectionOrder];
    const [removed] = nextOrder.splice(idx, 1);
    nextOrder.splice(nextIdx, 0, removed);
    setConfig((c) => ({ ...c, sectionOrder: nextOrder }));
    dirtyRef.current = true;
  };

  const handleDropSection = (targetId: string) => {
    if (!dragSection || dragSection === targetId) return;
    const order = [...config.sectionOrder];
    const fromIdx = order.indexOf(dragSection);
    const toIdx = order.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);
    setConfig((c) => ({ ...c, sectionOrder: order }));
    setDragSection(null);
    dirtyRef.current = true;
  };

  // Page-length estimator & weak-verb spell-check hints
  const metrics = useMemo(() => {
    const allText = [
      data.summary,
      ...data.skills,
      ...data.experience.flatMap((e) => [e.role, e.company, ...e.bullets]),
      ...data.projects.map((p) => `${p.name} ${p.description}`),
      ...data.education.map((e) => `${e.degree} ${e.institution}`),
    ]
      .join(' ')
      .trim();
    const words = allText ? allText.split(/\s+/).length : 0;
    const pages = Math.max(0.4, Number((words / 430).toFixed(1)));
    const weakHits = WEAK_VERBS.filter((v) => allText.toLowerCase().includes(v));
    const doubleSpaces = /\s{2,}/.test(data.summary);
    return { words, pages, weakHits, doubleSpaces };
  }, [data]);

  const activeTemplate =
    RESUME_TEMPLATE_CATALOG.find((t) => t.id === config.templateId) ||
    RESUME_TEMPLATE_CATALOG[0];
  const sectionLabels = SECTION_LABELS[config.targetLanguage] || SECTION_LABELS.en;
  const effectiveTwoColumn = !config.atsSafeMode && activeTemplate.layout === 'two-column';

  const slugName = (data.contactInfo.name || 'resume')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <select
            value={activeResumeId ?? ''}
            onChange={(e) => selectResume(Number(e.target.value))}
            aria-label="Select resume to edit"
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white max-w-[230px]"
          >
            {resumes.map((r) => (
              <option key={r.id ?? r.title} value={r.id ?? ''}>
                {r.title} (v{r.version})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleCreateStarter(false)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            + Blank
          </button>
          <button
            type="button"
            onClick={() => handleCreateStarter(true)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            Fresher Starter
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo"
            aria-label="Undo edit"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo"
            aria-label="Redo edit"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {lastSavedAt && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 px-1 tabular-nums">
              Saved {lastSavedAt}
            </span>
          )}

          <button
            type="button"
            onClick={() =>
              saveBuilder(
                true,
                `Snapshot ${new Date().toLocaleTimeString()}`,
                'Manual snapshot saved from Builder'
              )
            }
            disabled={saving || !activeResumeId}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Snapshot
          </button>
        </div>
      </div>

      {/* Page Length & Spell Hints Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-300 tabular-nums">
          <span>
            Length: <strong>{metrics.words} words</strong> (~{metrics.pages}{' '}
            {metrics.pages === 1 ? 'page' : 'pages'} · {config.regionFormat})
          </span>
          {metrics.pages > 1.2 && (
            <button
              type="button"
              onClick={() => runAiAssist('shorten_one_page')}
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              AI Shorten to 1 Page →
            </button>
          )}
          {metrics.weakHits.length > 0 && (
            <span className="text-amber-700 dark:text-amber-400">
              Weak phrasing hint: "{metrics.weakHits[0]}" — use STAR action verbs
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileView('edit')}
            className={`px-3 py-1 rounded text-xs font-semibold ${
              mobileView === 'edit' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setMobileView('preview')}
            className={`px-3 py-1 rounded text-xs font-semibold ${
              mobileView === 'preview' ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-slate-800'
            }`}
          >
            <Eye className="w-3 h-3 inline mr-1" /> Preview
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-xs text-teal-800 dark:text-teal-200 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}
      {gdocUrl && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span>Exported custom resume to Google Docs!</span>
          <a href={gdocUrl} target="_blank" rel="noreferrer" className="font-semibold underline inline-flex items-center gap-1">
            Open Google Doc <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Confirmation modal for Google Docs Export */}
      {confirmGdocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Export Resume to Google Docs?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ResuGO will create a new Google Doc named <strong>"{title}"</strong> inside your Google Drive.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmGdocOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmExportGoogleDoc}
                disabled={exportingGdoc}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
              >
                {exportingGdoc ? 'Exporting...' : 'Confirm & Create Doc'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Workspace: Editor Left (6 cols) + Live Preview Right (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: EDITOR */}
        <div
          className={`lg:col-span-6 space-y-4 ${
            mobileView === 'preview' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Mode Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {[
              { id: 'sections', label: 'Sections & AI' },
              { id: 'design', label: 'Templates & Style' },
              { id: 'versions', label: `History (${versions.length})` },
              { id: 'import', label: 'Import' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePanel(tab.id as any)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  activePanel === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* PANEL: SECTIONS & AI */}
          {activePanel === 'sections' && (
            <div className="space-y-4">
              {/* Gap-to-Fix / Target Job AI Tailor Box */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> AI Tailor & Section Assistant
                  </span>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option>Executive & Metric-Focused</option>
                    <option>Crisp Technical</option>
                    <option>Fresher / Graduate</option>
                    <option>Academic & Research</option>
                  </select>
                </div>

                <textarea
                  rows={2}
                  value={targetJobText}
                  onChange={(e) => setTargetJobText(e.target.value)}
                  placeholder="Optional: Paste target job description for 1-click Tailor-to-Job..."
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />

                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'tailor_to_job', label: '1-Click Tailor to Job' },
                    { id: 'generate_summary', label: 'Generate Summary' },
                    { id: 'rewrite_star', label: 'STAR Rewrite' },
                    { id: 'quantify', label: 'Quantify Impact' },
                    { id: 'fix_grammar', label: 'Fix Grammar' },
                    { id: 'fresher_mode', label: 'Fresher Mode' },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      disabled={aiLoading}
                      onClick={() => runAiAssist(btn.id as BuilderAssistAction)}
                      className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      {btn.label}
                    </button>
                  ))}
                  {aiLoading && <Loader2 className="w-4 h-4 animate-spin text-teal-600 self-center" />}
                </div>

                {aiSuggestion && (
                  <div className="p-3.5 rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-teal-800 dark:text-teal-300">
                        AI Suggestion ({aiSuggestion.action})
                      </span>
                      {aiSuggestion.honestyFlag && (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Verify before applying
                        </span>
                      )}
                    </div>
                    <p className="text-slate-900 dark:text-white whitespace-pre-wrap">
                      {aiSuggestion.improvedText}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-teal-600" />
                      {aiSuggestion.verifyNotice || aiSuggestion.rationale}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={applyAiSuggestion}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                      >
                        Apply to Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiSuggestion(null)}
                        className="text-xs text-slate-500"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Section Picker & Drag-and-Drop Ordering */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Sections (drag or use arrows to reorder)
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('contact')}
                    className={`text-xs font-semibold ${
                      activeSection === 'contact' ? 'text-teal-600 underline' : 'text-slate-500'
                    }`}
                  >
                    Edit Contact & Name
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {config.sectionOrder.map((sec) => (
                    <div
                      key={sec}
                      draggable
                      onDragStart={() => setDragSection(sec)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropSection(sec)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-grab ${
                        activeSection === sec
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <GripVertical className="w-3 h-3 text-slate-400" />
                      <button type="button" onClick={() => setActiveSection(sec)}>
                        {sectionLabels[sec] || sec}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(sec, -1)}
                        aria-label={`Move ${sec} up`}
                        className="p-0.5 hover:text-teal-600"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(sec, 1)}
                        aria-label={`Move ${sec} down`}
                        className="p-0.5 hover:text-teal-600"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const newSec: CustomSectionBlock = {
                        id: `custom-${Date.now()}`,
                        title: 'Custom Section',
                        items: [{ heading: '', subheading: '', date: '', bullets: [''] }],
                      };
                      updateDataWithHistory((p) => ({
                        ...p,
                        customSections: [...(p.customSections || []), newSec],
                      }));
                      setActiveSection('custom');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                  >
                    <Plus className="w-3 h-3" /> Custom Section
                  </button>
                </div>
              </div>

              {/* Active Section Editor Card */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Resume Document Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      dirtyRef.current = true;
                    }}
                    className="w-full px-3 py-1.5 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  />
                </div>

                {activeSection === 'contact' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold">Contact & Header</h3>
                      {nameProfile && (
                        <button
                          type="button"
                          onClick={() =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              contactInfo: {
                                ...p.contactInfo,
                                name: nameProfile.canonicalName,
                              },
                            }))
                          }
                          className="text-xs font-semibold text-teal-600 hover:underline"
                        >
                          Sync Verified Name ({nameProfile.canonicalName})
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {(
                        [
                          ['name', 'Full Name'],
                          ['email', 'Email'],
                          ['phone', 'Phone'],
                          ['location', 'Location'],
                          ['linkedin', 'LinkedIn URL'],
                          ['github', 'GitHub URL'],
                          ['portfolio', 'Portfolio URL'],
                        ] as const
                      ).map(([field, label]) => (
                        <div key={field}>
                          <label className="block text-slate-500 mb-1">{label}</label>
                          <input
                            type="text"
                            value={(data.contactInfo as any)[field] || ''}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                contactInfo: { ...p.contactInfo, [field]: e.target.value },
                              }))
                            }
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                        </div>
                      ))}
                    </div>
                    {nameProfile?.mismatchWarning && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Name note: {nameProfile.mismatchWarning}{' '}
                        <button
                          type="button"
                          onClick={() => onNavigate('/name-check')}
                          className="underline font-semibold"
                        >
                          Review in Name Check
                        </button>
                      </p>
                    )}
                  </div>
                )}

                {activeSection === 'summary' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold">{sectionLabels.summary}</h3>
                      <button
                        type="button"
                        onClick={() => runAiAssist('generate_summary', data.summary)}
                        className="text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        AI Improve Summary
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={data.summary}
                      onChange={(e) =>
                        updateDataWithHistory((p) => ({ ...p, summary: e.target.value }))
                      }
                      className="w-full p-3 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                  </div>
                )}

                {activeSection === 'skills' && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold">{sectionLabels.skills}</h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSkillInput}
                        onChange={(e) => setNewSkillInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newSkillInput.trim()) {
                            e.preventDefault();
                            updateDataWithHistory((p) => ({
                              ...p,
                              skills: Array.from(new Set([...p.skills, newSkillInput.trim()])),
                            }));
                            setNewSkillInput('');
                          }
                        }}
                        placeholder="Add skill (e.g. PostgreSQL) and press Enter"
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newSkillInput.trim()) return;
                          updateDataWithHistory((p) => ({
                            ...p,
                            skills: Array.from(new Set([...p.skills, newSkillInput.trim()])),
                          }));
                          setNewSkillInput('');
                        }}
                        className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs"
                        >
                          {skill}
                          <button
                            type="button"
                            onClick={() =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                skills: p.skills.filter((_, i) => i !== idx),
                              }))
                            }
                            aria-label={`Remove ${skill}`}
                            className="text-slate-400 hover:text-red-600"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === 'experience' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold">{sectionLabels.experience}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateDataWithHistory((p) => ({
                            ...p,
                            experience: [
                              ...p.experience,
                              { role: '', company: '', duration: '', bullets: [''] },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        + Add Role
                      </button>
                    </div>

                    {data.experience.map((exp, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">
                            Role #{idx + 1}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                runAiAssist('rewrite_star', exp.bullets.join('\n'))
                              }
                              className="text-xs font-semibold text-indigo-600 hover:underline"
                            >
                              STAR Rewrite
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateDataWithHistory((p) => ({
                                  ...p,
                                  experience: p.experience.filter((_, i) => i !== idx),
                                }))
                              }
                              className="text-xs text-red-600 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <input
                            placeholder="Job Title"
                            value={exp.role}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                experience: p.experience.map((x, i) =>
                                  i === idx ? { ...x, role: e.target.value } : x
                                ),
                              }))
                            }
                            className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                          <input
                            placeholder="Company"
                            value={exp.company}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                experience: p.experience.map((x, i) =>
                                  i === idx ? { ...x, company: e.target.value } : x
                                ),
                              }))
                            }
                            className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                          <input
                            placeholder="Duration (e.g. 2023–Present)"
                            value={exp.duration}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                experience: p.experience.map((x, i) =>
                                  i === idx ? { ...x, duration: e.target.value } : x
                                ),
                              }))
                            }
                            className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                        </div>

                        <textarea
                          rows={3}
                          placeholder="One bullet per line..."
                          value={exp.bullets.join('\n')}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              experience: p.experience.map((x, i) =>
                                i === idx ? { ...x, bullets: e.target.value.split('\n') } : x
                              ),
                            }))
                          }
                          className="w-full p-2.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'projects' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold">{sectionLabels.projects}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateDataWithHistory((p) => ({
                            ...p,
                            projects: [
                              ...p.projects,
                              { name: '', description: '', technologies: [] },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        + Add Project
                      </button>
                    </div>
                    {data.projects.map((proj, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex justify-between gap-2">
                          <input
                            placeholder="Project Name"
                            value={proj.name}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                projects: p.projects.map((x, i) =>
                                  i === idx ? { ...x, name: e.target.value } : x
                                ),
                              }))
                            }
                            className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                projects: p.projects.filter((_, i) => i !== idx),
                              }))
                            }
                            className="text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          placeholder="Technologies (comma-separated)"
                          value={proj.technologies.join(', ')}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              projects: p.projects.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      technologies: e.target.value
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    }
                                  : x
                              ),
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <textarea
                          rows={2}
                          placeholder="Description & measurable outcome..."
                          value={proj.description}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              projects: p.projects.map((x, i) =>
                                i === idx ? { ...x, description: e.target.value } : x
                              ),
                            }))
                          }
                          className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'education' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold">{sectionLabels.education}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateDataWithHistory((p) => ({
                            ...p,
                            education: [
                              ...p.education,
                              { degree: '', institution: '', year: '' },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        + Add Education
                      </button>
                    </div>
                    {data.education.map((edu, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs items-center"
                      >
                        <input
                          placeholder="Degree"
                          value={edu.degree}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              education: p.education.map((x, i) =>
                                i === idx ? { ...x, degree: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <input
                          placeholder="Institution"
                          value={edu.institution}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              education: p.education.map((x, i) =>
                                i === idx ? { ...x, institution: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <div className="flex gap-2">
                          <input
                            placeholder="Year"
                            value={edu.year}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                education: p.education.map((x, i) =>
                                  i === idx ? { ...x, year: e.target.value } : x
                                ),
                              }))
                            }
                            className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                education: p.education.filter((_, i) => i !== idx),
                              }))
                            }
                            className="text-red-600"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'certifications' && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold">{sectionLabels.certifications}</h3>
                    <textarea
                      rows={4}
                      placeholder="One certification per line..."
                      value={data.certifications.join('\n')}
                      onChange={(e) =>
                        updateDataWithHistory((p) => ({
                          ...p,
                          certifications: e.target.value.split('\n').filter(Boolean),
                        }))
                      }
                      className="w-full p-2.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    />
                  </div>
                )}

                {activeSection === 'languages' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold">{sectionLabels.languages}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateDataWithHistory((p) => ({
                            ...p,
                            languages: [
                              ...(p.languages || []),
                              { language: '', proficiency: 'Fluent' },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        + Add Language
                      </button>
                    </div>
                    {(data.languages || []).map((langItem, idx) => (
                      <div key={idx} className="flex gap-2 text-xs">
                        <input
                          placeholder="Language"
                          value={langItem.language}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              languages: (p.languages || []).map((x, i) =>
                                i === idx ? { ...x, language: e.target.value } : x
                              ),
                            }))
                          }
                          className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <input
                          placeholder="Proficiency"
                          value={langItem.proficiency}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              languages: (p.languages || []).map((x, i) =>
                                i === idx ? { ...x, proficiency: e.target.value } : x
                              ),
                            }))
                          }
                          className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'awards' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold">{sectionLabels.awards}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateDataWithHistory((p) => ({
                            ...p,
                            awards: [...(p.awards || []), { title: '', issuer: '', year: '' }],
                          }))
                        }
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        + Add Award
                      </button>
                    </div>
                    {(data.awards || []).map((a, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2 text-xs">
                        <input
                          placeholder="Title"
                          value={a.title}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              awards: (p.awards || []).map((x, i) =>
                                i === idx ? { ...x, title: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <input
                          placeholder="Issuer"
                          value={a.issuer}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              awards: (p.awards || []).map((x, i) =>
                                i === idx ? { ...x, issuer: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <input
                          placeholder="Year"
                          value={a.year}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              awards: (p.awards || []).map((x, i) =>
                                i === idx ? { ...x, year: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'volunteering' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold">{sectionLabels.volunteering}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateDataWithHistory((p) => ({
                            ...p,
                            volunteering: [
                              ...(p.volunteering || []),
                              { role: '', organization: '', duration: '', description: '' },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        + Add Volunteering
                      </button>
                    </div>
                    {(data.volunteering || []).map((v, idx) => (
                      <div key={idx} className="space-y-2 text-xs border p-3 rounded-lg border-slate-200 dark:border-slate-800">
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            placeholder="Role"
                            value={v.role}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                volunteering: (p.volunteering || []).map((x, i) =>
                                  i === idx ? { ...x, role: e.target.value } : x
                                ),
                              }))
                            }
                            className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                          <input
                            placeholder="Organization"
                            value={v.organization}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                volunteering: (p.volunteering || []).map((x, i) =>
                                  i === idx ? { ...x, organization: e.target.value } : x
                                ),
                              }))
                            }
                            className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                          <input
                            placeholder="Duration"
                            value={v.duration}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                volunteering: (p.volunteering || []).map((x, i) =>
                                  i === idx ? { ...x, duration: e.target.value } : x
                                ),
                              }))
                            }
                            className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                        </div>
                        <input
                          placeholder="Impact summary..."
                          value={v.description}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              volunteering: (p.volunteering || []).map((x, i) =>
                                i === idx ? { ...x, description: e.target.value } : x
                              ),
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'publications' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold">{sectionLabels.publications}</h3>
                      <button
                        type="button"
                        onClick={() =>
                          updateDataWithHistory((p) => ({
                            ...p,
                            publications: [
                              ...(p.publications || []),
                              { title: '', venue: '', year: '', url: '' },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-teal-600 hover:underline"
                      >
                        + Add Publication
                      </button>
                    </div>
                    {(data.publications || []).map((pub, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-2 text-xs">
                        <input
                          placeholder="Paper Title"
                          value={pub.title}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              publications: (p.publications || []).map((x, i) =>
                                i === idx ? { ...x, title: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <input
                          placeholder="Journal / Conference"
                          value={pub.venue}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              publications: (p.publications || []).map((x, i) =>
                                i === idx ? { ...x, venue: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                        <input
                          placeholder="Year"
                          value={pub.year}
                          onChange={(e) =>
                            updateDataWithHistory((p) => ({
                              ...p,
                              publications: (p.publications || []).map((x, i) =>
                                i === idx ? { ...x, year: e.target.value } : x
                              ),
                            }))
                          }
                          className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeSection === 'custom' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold">Custom Sections</h3>
                    {(data.customSections || []).map((sec, sIdx) => (
                      <div
                        key={sec.id}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            value={sec.title}
                            onChange={(e) =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                customSections: (p.customSections || []).map((c, i) =>
                                  i === sIdx ? { ...c, title: e.target.value } : c
                                ),
                              }))
                            }
                            placeholder="Section Title"
                            className="font-bold px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateDataWithHistory((p) => ({
                                ...p,
                                customSections: (p.customSections || []).filter(
                                  (_, i) => i !== sIdx
                                ),
                              }))
                            }
                            className="text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {sec.items.map((item, iIdx) => (
                          <div key={iIdx} className="space-y-1.5 pt-1">
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                placeholder="Heading"
                                value={item.heading}
                                onChange={(e) =>
                                  updateDataWithHistory((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((c, ci) =>
                                      ci === sIdx
                                        ? {
                                            ...c,
                                            items: c.items.map((it, ii) =>
                                              ii === iIdx ? { ...it, heading: e.target.value } : it
                                            ),
                                          }
                                        : c
                                    ),
                                  }))
                                }
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                              />
                              <input
                                placeholder="Subheading"
                                value={item.subheading}
                                onChange={(e) =>
                                  updateDataWithHistory((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((c, ci) =>
                                      ci === sIdx
                                        ? {
                                            ...c,
                                            items: c.items.map((it, ii) =>
                                              ii === iIdx
                                                ? { ...it, subheading: e.target.value }
                                                : it
                                            ),
                                          }
                                        : c
                                    ),
                                  }))
                                }
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                              />
                              <input
                                placeholder="Date"
                                value={item.date}
                                onChange={(e) =>
                                  updateDataWithHistory((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((c, ci) =>
                                      ci === sIdx
                                        ? {
                                            ...c,
                                            items: c.items.map((it, ii) =>
                                              ii === iIdx ? { ...it, date: e.target.value } : it
                                            ),
                                          }
                                        : c
                                    ),
                                  }))
                                }
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                              />
                            </div>
                            <textarea
                              rows={2}
                              placeholder="Details (one per line)"
                              value={item.bullets.join('\n')}
                              onChange={(e) =>
                                updateDataWithHistory((p) => ({
                                  ...p,
                                  customSections: (p.customSections || []).map((c, ci) =>
                                    ci === sIdx
                                      ? {
                                          ...c,
                                          items: c.items.map((it, ii) =>
                                            ii === iIdx
                                              ? { ...it, bullets: e.target.value.split('\n') }
                                              : it
                                          ),
                                        }
                                      : c
                                  ),
                                }))
                              }
                              className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PANEL: DESIGN & 12 TEMPLATES */}
          {activePanel === 'design' && (
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  12+ Resume Templates & ATS Controls
                </h3>
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.atsSafeMode}
                    onChange={(e) => {
                      setConfig((c) => ({ ...c, atsSafeMode: e.target.checked }));
                      dirtyRef.current = true;
                    }}
                    className="accent-teal-600 w-4 h-4"
                  />
                  <Lock className="w-3.5 h-3.5 text-teal-600" />
                  <span>ATS Single-Column Lock</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {RESUME_TEMPLATE_CATALOG.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setConfig((c) => ({
                        ...c,
                        templateId: tpl.id,
                        accentColor: tpl.defaultAccent,
                      }));
                      dirtyRef.current = true;
                    }}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      config.templateId === tpl.id
                        ? 'border-teal-600 bg-teal-50/60 dark:bg-teal-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {tpl.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {tpl.category.toUpperCase()} · {tpl.isAtsSafe ? 'ATS-Safe' : 'Styled 2-Col'}
                    </p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Typography
                  </label>
                  <select
                    value={config.font}
                    onChange={(e) => {
                      setConfig((c) => ({ ...c, font: e.target.value as any }));
                      dirtyRef.current = true;
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="plus-jakarta">Plus Jakarta Sans</option>
                    <option value="bricolage">Bricolage Editorial</option>
                    <option value="georgia">Georgia Classic Serif</option>
                    <option value="jetbrains">JetBrains Tech Mono</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Accent Color
                  </label>
                  <select
                    value={config.accentColor}
                    onChange={(e) => {
                      setConfig((c) => ({ ...c, accentColor: e.target.value as any }));
                      dirtyRef.current = true;
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="teal">Teal Professional</option>
                    <option value="indigo">Indigo Executive</option>
                    <option value="slate">Monochrome Slate</option>
                    <option value="emerald">Emerald Clean</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Region Paper Format
                  </label>
                  <select
                    value={config.regionFormat}
                    onChange={(e) => {
                      setConfig((c) => ({ ...c, regionFormat: e.target.value as any }));
                      dirtyRef.current = true;
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="US">US (Letter · No Photo)</option>
                    <option value="UK">UK (A4 · Concise)</option>
                    <option value="India">India (A4 · Technical)</option>
                    <option value="EU">EU (Europass A4)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Spacing
                  </label>
                  <select
                    value={config.spacing}
                    onChange={(e) => {
                      setConfig((c) => ({ ...c, spacing: e.target.value as any }));
                      dirtyRef.current = true;
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="compact">Compact</option>
                    <option value="balanced">Balanced</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Margins
                  </label>
                  <select
                    value={config.margin}
                    onChange={(e) => {
                      setConfig((c) => ({ ...c, margin: e.target.value as any }));
                      dirtyRef.current = true;
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="narrow">Narrow</option>
                    <option value="standard">Standard</option>
                    <option value="wide">Wide</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Export Language
                  </label>
                  <select
                    value={config.targetLanguage}
                    onChange={(e) => {
                      setConfig((c) => ({ ...c, targetLanguage: e.target.value as any }));
                      dirtyRef.current = true;
                    }}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="en">English</option>
                    <option value="ta">Tamil (தமிழ்)</option>
                    <option value="hi">Hindi (हिंदी)</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showPhoto}
                  onChange={(e) => {
                    setConfig((c) => ({ ...c, showPhoto: e.target.checked }));
                    dirtyRef.current = true;
                  }}
                  className="accent-teal-600"
                />
                <span>Include Profile Photo (Off by default for US/UK ATS compliance)</span>
              </label>
            </div>
          )}

          {/* PANEL: VERSION HISTORY & COMPARE */}
          {activePanel === 'versions' && (
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600" />
                  Version History & Restore
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    saveBuilder(true, `Manual v${versions.length + 1}`, 'Saved from Version History')
                  }
                  className="text-xs font-semibold text-teal-600 hover:underline"
                >
                  + Save Current Snapshot
                </button>
              </div>

              {versions.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Save snapshots to compare revisions side-by-side and restore anytime.
                </p>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {versions.map((ver) => (
                      <div key={ver.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            v{ver.versionNumber} · {ver.label}
                          </p>
                          <p className="text-slate-500">
                            {ver.changeNote} · {new Date(ver.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateDataWithHistory(() => ver.parsedData);
                            if (ver.builderConfig) setConfig(ver.builderConfig);
                            setNotice(`Restored snapshot v${ver.versionNumber}`);
                          }}
                          className="px-3 py-1.5 font-semibold text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-800 rounded-lg"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>

                  {versions.length >= 2 && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                      <p className="font-bold text-slate-900 dark:text-white">
                        Compare Two Versions
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={compareLeftIdx}
                          onChange={(e) => setCompareLeftIdx(Number(e.target.value))}
                          className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        >
                          {versions.map((v, i) => (
                            <option key={v.id} value={i}>
                              v{v.versionNumber} ({v.label})
                            </option>
                          ))}
                        </select>
                        <select
                          value={compareRightIdx}
                          onChange={(e) => setCompareRightIdx(Number(e.target.value))}
                          className="px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        >
                          {versions.map((v, i) => (
                            <option key={v.id} value={i}>
                              v{v.versionNumber} ({v.label})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[versions[compareLeftIdx], versions[compareRightIdx]].map((ver, i) =>
                          ver ? (
                            <div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                              <p className="font-semibold">v{ver.versionNumber} Summary & Skills</p>
                              <p className="text-slate-600 dark:text-slate-300 line-clamp-3">
                                {ver.parsedData.summary}
                              </p>
                              <p className="text-slate-500">
                                {ver.parsedData.skills.length} skills · {ver.parsedData.experience.length} roles
                              </p>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* PANEL: IMPORT */}
          {activePanel === 'import' && (
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <h3 className="font-display text-base font-bold">
                Import Resume from Google Drive or LinkedIn Text
              </h3>
              <button
                type="button"
                onClick={handleDriveImport}
                disabled={importing}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FolderOpen className="w-4 h-4 text-indigo-600" />
                Import from Google Drive Picker
              </button>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Paste LinkedIn Profile Export or Raw Resume Text
                </label>
                <textarea
                  rows={6}
                  value={linkedinPaste}
                  onChange={(e) => setLinkedinPaste(e.target.value)}
                  placeholder="Paste your LinkedIn About + Experience + Education text here..."
                  className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleImportLinkedInOrText}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  {importing ? 'Parsing...' : 'Parse & Load into Builder'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: LIVE PREVIEW & MULTI-FORMAT EXPORTS */}
        <div
          className={`lg:col-span-6 space-y-4 ${
            mobileView === 'edit' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Export & Web Portfolio Bar */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportResumeToPdf(data, config, slugName)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
              >
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
              <button
                type="button"
                onClick={() => exportResumeToDocx(data, config, slugName)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <FileText className="w-3.5 h-3.5" /> DOCX
              </button>
              <button
                type="button"
                onClick={() => exportResumeToTxt(data, config, slugName)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
              >
                Plain Text
              </button>
              <button
                type="button"
                onClick={() => setConfirmGdocOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
              >
                Google Docs
              </button>
            </div>

            {portfolioSlug && (
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={isPortfolioPublic}
                    onChange={(e) => {
                      setIsPortfolioPublic(e.target.checked);
                      dirtyRef.current = true;
                    }}
                    className="accent-teal-600"
                  />
                  <Globe className="w-3.5 h-3.5 text-teal-600" />
                  <span>Public One-Page Web Portfolio</span>
                </label>

                {isPortfolioPublic && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/p/${portfolioSlug}`
                        );
                        setCopiedPortfolio(true);
                        setTimeout(() => setCopiedPortfolio(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                    >
                      {copiedPortfolio ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedPortfolio ? 'Copied Link' : 'Copy Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(`/p/${portfolioSlug}`)}
                      className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paper Sheet Live Preview */}
          <div
            className={`rounded-xl border border-slate-300 dark:border-slate-700 bg-white text-slate-900 shadow-sm ${
              config.margin === 'narrow' ? 'p-6' : config.margin === 'wide' ? 'p-10' : 'p-8'
            } ${
              config.font === 'georgia'
                ? 'font-serif'
                : config.font === 'jetbrains'
                ? 'font-mono'
                : 'font-sans'
            }`}
          >
            {/* Header */}
            <div className="border-b border-slate-200 pb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  {data.contactInfo.name || 'Candidate Name'}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {[
                    data.contactInfo.email,
                    data.contactInfo.phone,
                    data.contactInfo.location,
                    data.contactInfo.linkedin,
                    data.contactInfo.github,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {config.showPhoto && (
                <img
                  src={
                    data.photoUrl ||
                    '/src/assets/images/avatar_demo_candidate_1795014347829.jpg'
                  }
                  alt={data.contactInfo.name}
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                />
              )}
            </div>

            <div
              className={`mt-5 ${
                effectiveTwoColumn ? 'grid grid-cols-12 gap-6' : 'space-y-4'
              } ${
                config.spacing === 'compact'
                  ? 'text-[11px] leading-snug'
                  : config.spacing === 'relaxed'
                  ? 'text-xs leading-relaxed'
                  : 'text-xs leading-normal'
              }`}
            >
              <div className={effectiveTwoColumn ? 'col-span-8 space-y-4' : 'space-y-4'}>
                {config.sectionOrder.map((sec) => {
                  if (effectiveTwoColumn && ['skills', 'languages', 'certifications'].includes(sec)) {
                    return null;
                  }
                  const headingColor =
                    config.atsSafeMode
                      ? 'text-slate-900 border-slate-300'
                      : config.accentColor === 'indigo'
                      ? 'text-indigo-700 border-indigo-200'
                      : config.accentColor === 'emerald'
                      ? 'text-emerald-700 border-emerald-200'
                      : 'text-teal-700 border-teal-200';

                  if (sec === 'summary' && data.summary) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1.5 ${headingColor}`}>
                          {sectionLabels.summary}
                        </h3>
                        <p className="text-slate-700">{data.summary}</p>
                      </section>
                    );
                  }
                  if (sec === 'skills' && data.skills.length > 0) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1.5 ${headingColor}`}>
                          {sectionLabels.skills}
                        </h3>
                        <p className="text-slate-800 font-medium">{data.skills.join(' · ')}</p>
                      </section>
                    );
                  }
                  if (sec === 'experience' && data.experience.length > 0) {
                    return (
                      <section key={sec} className="space-y-2.5">
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 ${headingColor}`}>
                          {sectionLabels.experience}
                        </h3>
                        {data.experience.map((exp, i) => (
                          <div key={i}>
                            <div className="flex justify-between font-bold text-slate-900">
                              <span>
                                {exp.role} — {exp.company}
                              </span>
                              <span className="font-normal text-slate-500">{exp.duration}</span>
                            </div>
                            <ul className="mt-1 space-y-0.5 text-slate-700 list-disc pl-4">
                              {exp.bullets.filter(Boolean).map((b, bi) => (
                                <li key={bi}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </section>
                    );
                  }
                  if (sec === 'projects' && data.projects.length > 0) {
                    return (
                      <section key={sec} className="space-y-2">
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 ${headingColor}`}>
                          {sectionLabels.projects}
                        </h3>
                        {data.projects.map((p, i) => (
                          <div key={i}>
                            <p className="font-bold text-slate-900">
                              {p.name}{' '}
                              <span className="font-normal text-slate-500">
                                ({p.technologies.join(', ')})
                              </span>
                            </p>
                            <p className="text-slate-700">{p.description}</p>
                          </div>
                        ))}
                      </section>
                    );
                  }
                  if (sec === 'education' && data.education.length > 0) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1.5 ${headingColor}`}>
                          {sectionLabels.education}
                        </h3>
                        {data.education.map((ed, i) => (
                          <p key={i} className="text-slate-800">
                            <strong>{ed.degree}</strong> — {ed.institution} ({ed.year})
                          </p>
                        ))}
                      </section>
                    );
                  }
                  if (sec === 'certifications' && data.certifications.length > 0) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1 ${headingColor}`}>
                          {sectionLabels.certifications}
                        </h3>
                        <p className="text-slate-700">{data.certifications.join(' · ')}</p>
                      </section>
                    );
                  }
                  if (sec === 'languages' && data.languages?.length) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1 ${headingColor}`}>
                          {sectionLabels.languages}
                        </h3>
                        <p className="text-slate-700">
                          {data.languages.map((l) => `${l.language} (${l.proficiency})`).join(' · ')}
                        </p>
                      </section>
                    );
                  }
                  if (sec === 'awards' && data.awards?.length) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1 ${headingColor}`}>
                          {sectionLabels.awards}
                        </h3>
                        {data.awards.map((a, i) => (
                          <p key={i} className="text-slate-700">
                            • {a.title} — {a.issuer} ({a.year})
                          </p>
                        ))}
                      </section>
                    );
                  }
                  if (sec === 'volunteering' && data.volunteering?.length) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1 ${headingColor}`}>
                          {sectionLabels.volunteering}
                        </h3>
                        {data.volunteering.map((v, i) => (
                          <p key={i} className="text-slate-700">
                            <strong>{v.role}</strong> · {v.organization} ({v.duration}) — {v.description}
                          </p>
                        ))}
                      </section>
                    );
                  }
                  if (sec === 'publications' && data.publications?.length) {
                    return (
                      <section key={sec}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1 ${headingColor}`}>
                          {sectionLabels.publications}
                        </h3>
                        {data.publications.map((pub, i) => (
                          <p key={i} className="text-slate-700">
                            • {pub.title} ({pub.venue}, {pub.year})
                          </p>
                        ))}
                      </section>
                    );
                  }
                  return null;
                })}

                {(data.customSections || []).map((custom) => (
                  <section key={custom.id} className="space-y-1.5">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider border-b border-slate-300 text-slate-900 pb-0.5">
                      {custom.title}
                    </h3>
                    {custom.items.map((it, i) => (
                      <div key={i}>
                        <p className="font-bold text-slate-900">
                          {it.heading} {it.subheading && `— ${it.subheading}`} {it.date && `(${it.date})`}
                        </p>
                        {it.bullets.filter(Boolean).map((b, bi) => (
                          <p key={bi} className="text-slate-700">
                            • {b}
                          </p>
                        ))}
                      </div>
                    ))}
                  </section>
                ))}
              </div>

              {effectiveTwoColumn && (
                <aside className="col-span-4 space-y-4 border-l border-slate-200 pl-4">
                  {data.skills.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 border-b border-indigo-200 pb-0.5 mb-1.5">
                        {sectionLabels.skills}
                      </h3>
                      <ul className="space-y-1 text-slate-800">
                        {data.skills.map((s, i) => (
                          <li key={i}>• {s}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {data.certifications.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 border-b border-indigo-200 pb-0.5 mb-1">
                        {sectionLabels.certifications}
                      </h3>
                      <p className="text-slate-700">{data.certifications.join(' · ')}</p>
                    </section>
                  )}
                  {data.languages && data.languages.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 border-b border-indigo-200 pb-0.5 mb-1">
                        {sectionLabels.languages}
                      </h3>
                      {data.languages.map((l, i) => (
                        <p key={i} className="text-slate-700">
                          {l.language} · {l.proficiency}
                        </p>
                      ))}
                    </section>
                  )}
                </aside>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
