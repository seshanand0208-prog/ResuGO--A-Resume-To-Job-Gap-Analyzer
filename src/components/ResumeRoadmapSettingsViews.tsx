import React, { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  apiFetch,
  ResumeItem,
  RoadmapItem,
  UserProfile,
} from '../lib/api';
import {
  clearGoogleAccessToken,
  connectGoogleWorkspace,
  ensureGoogleAccessToken,
  subscribeGoogleWorkspaceStatus,
} from '../lib/firebase';
import { LANG_LABELS, LangCode, t } from '../lib/i18n';

export function ResumeVersionsView({
  resumes,
  onNavigate,
  onRefresh,
}: {
  resumes: ResumeItem[];
  onNavigate: (path: string) => void;
  onRefresh: () => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/resumes/${id}`, { method: 'DELETE' });
      setConfirmId(null);
      onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Encrypted Resume Versions
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            All resume raw text is encrypted at rest using AES-256-GCM.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('/builder')}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Open Resume Builder
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/analyze')}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
          >
            + Upload New Version
          </button>
        </div>
      </div>

      {resumes.length === 0 ? (
        <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
          <FileText className="w-8 h-8 text-teal-600 mx-auto mb-2" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            No saved resumes yet. Upload a PDF, DOCX, or Google Doc, or build one from scratch.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {resumes.map((r) => (
            <div
              key={r.id ?? r.title}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    v{r.version} · Source: {r.source} ·{' '}
                    {(r.fileSizeBytes / 1024).toFixed(1)} KB ·{' '}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                  <h2 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {r.title}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    {r.parsedData.contactInfo?.name} · {r.parsedData.totalYearsExp} yrs exp ·{' '}
                    {r.parsedData.seniorityLevel}
                  </p>
                </div>

                {r.id && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('/builder')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit in Builder
                    </button>

                    {confirmId === r.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id!)}
                          disabled={deletingId === r.id}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                        >
                          {deletingId === r.id ? 'Deleting...' : 'Confirm Delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(r.id!)}
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
                        aria-label={`Delete ${r.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                <p>
                  <strong className="text-slate-900 dark:text-white">Extracted Skills:</strong>{' '}
                  {r.parsedData.skills.join(' · ')}
                </p>
                {r.parsedData.certifications.length > 0 && (
                  <p>
                    <strong className="text-slate-900 dark:text-white">Certifications:</strong>{' '}
                    {r.parsedData.certifications.join(' · ')}
                  </p>
                )}
                {r.parsedData.projects.length > 0 && (
                  <p>
                    <strong className="text-slate-900 dark:text-white">Projects:</strong>{' '}
                    {r.parsedData.projects.map((p) => p.name).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RoadmapView({
  roadmaps,
  onRefresh,
}: {
  roadmaps: RoadmapItem[];
  onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number>(roadmaps[0]?.id ?? 0);
  const [calendarPrompt, setCalendarPrompt] = useState<{
    roadmapId: number;
    taskId: string;
    title: string;
    skill: string;
    weekNumber: number;
  } | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [calMessage, setCalMessage] = useState<{ text: string; url?: string } | null>(null);
  const [calError, setCalError] = useState<string | null>(null);

  const activeRoadmap =
    roadmaps.find((r) => r.id === selectedId) || roadmaps[0] || null;

  if (!activeRoadmap) {
    return (
      <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Run a gap analysis to generate your personalized week-by-week skill roadmap.
        </p>
      </div>
    );
  }

  const allTasks = activeRoadmap.weeks.flatMap((w) => w.tasks);
  const doneCount = allTasks.filter((t) => t.completed).length;
  const pct = allTasks.length > 0 ? Math.round((doneCount / allTasks.length) * 100) : 0;

  const toggleTask = async (taskId: string, completed: boolean) => {
    await apiFetch(`/api/roadmaps/${activeRoadmap.id}/task`, {
      method: 'PATCH',
      body: JSON.stringify({ taskId, completed }),
    });
    onRefresh();
  };

  const confirmScheduleCalendar = async () => {
    if (!calendarPrompt) return;
    setCalError(null);
    setCalMessage(null);
    setScheduling(true);
    try {
      await ensureGoogleAccessToken();
      const targetDate = new Date(
        Date.now() + calendarPrompt.weekNumber * 7 * 86400000
      );
      const payload = {
        title: `[ResuGO] ${calendarPrompt.skill}: ${calendarPrompt.title}`,
        description: `Week ${calendarPrompt.weekNumber} milestone from ${activeRoadmap.title}`,
        startDateIso: targetDate.toISOString(),
        durationHours: 2,
      };
      let res: { eventId: string; htmlLink: string };
      try {
        res = await apiFetch<{ eventId: string; htmlLink: string }>(
          '/api/workspace/calendar-schedule',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );
      } catch (innerErr: any) {
        if (innerErr.code === 'GOOGLE_TOKEN_REQUIRED') {
          clearGoogleAccessToken();
          await ensureGoogleAccessToken(true);
          res = await apiFetch<{ eventId: string; htmlLink: string }>(
            '/api/workspace/calendar-schedule',
            {
              method: 'POST',
              body: JSON.stringify(payload),
            }
          );
        } else {
          throw innerErr;
        }
      }
      await apiFetch(`/api/roadmaps/${calendarPrompt.roadmapId}/task`, {
        method: 'PATCH',
        body: JSON.stringify({
          taskId: calendarPrompt.taskId,
          calendarEventId: res.eventId,
        }),
      });
      setCalMessage({
        text: 'Learning session scheduled on Google Calendar.',
        url: res.htmlLink,
      });
      setCalendarPrompt(null);
      onRefresh();
    } catch (err: any) {
      setCalError(err.message || 'Failed to schedule on Google Calendar.');
      setCalendarPrompt(null);
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {activeRoadmap.title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {doneCount} of {allTasks.length} tasks completed ({pct}%)
          </p>
        </div>

        {roadmaps.length > 1 && (
          <select
            value={activeRoadmap.id}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          >
            {roadmaps.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-teal-600 transition-transform duration-300 origin-left"
          style={{ width: `${pct}%` }}
        />
      </div>

      {calMessage && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span>{calMessage.text}</span>
          {calMessage.url && (
            <a
              href={calMessage.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline inline-flex items-center gap-1"
            >
              Open Event <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
      {calError && (
        <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
          {calError}
        </div>
      )}

      {/* Confirmation Modal for Google Calendar creation */}
      {calendarPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Add Milestone to Google Calendar?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This will create a 2-hour study session on your primary Google Calendar for Week{' '}
              {calendarPrompt.weekNumber}: <strong>{calendarPrompt.title}</strong>.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCalendarPrompt(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmScheduleCalendar}
                disabled={scheduling}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60"
              >
                {scheduling ? 'Scheduling...' : 'Confirm & Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {activeRoadmap.weeks.map((week) => (
          <div
            key={week.weekNumber}
            className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Week {week.weekNumber}: {week.theme}
              </h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                Est. {week.estimatedHours} hrs
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {week.tasks.map((task) => (
                <div
                  key={task.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={(e) => toggleTask(task.id, e.target.checked)}
                      className="mt-1 w-4 h-4 accent-teal-600 rounded"
                    />
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          task.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Skill: {task.skill} ·{' '}
                        <a
                          href={task.resourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-600 dark:text-teal-400 hover:underline"
                        >
                          {task.resourceTitle}
                        </a>
                      </p>
                    </div>
                  </label>

                  <div className="shrink-0 pl-7 sm:pl-0">
                    {task.calendarEventId ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Scheduled
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarPrompt({
                            roadmapId: activeRoadmap.id,
                            taskId: task.id,
                            title: task.title,
                            skill: task.skill,
                            weekNumber: week.weekNumber,
                          })
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                      >
                        <Calendar className="w-3.5 h-3.5" /> Add to Calendar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsView({
  user,
  lang,
  onChangeLang,
  darkMode,
  onToggleDarkMode,
  onRefresh,
  onNavigate,
  onLogout,
}: {
  user: UserProfile;
  lang: LangCode;
  onChangeLang: (l: LangCode) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onRefresh: () => void;
  onNavigate: (path: string) => void;
  onLogout: () => Promise<void>;
}) {
  const [alertsEnabled, setAlertsEnabled] = useState(user.jobAlertsEnabled);
  const [alertQuery, setAlertQuery] = useState(
    user.alertQuery || 'Senior Frontend Engineer'
  );
  const [alertLocation, setAlertLocation] = useState(user.alertLocation || 'Remote');
  const [minFitScore, setMinFitScore] = useState(75);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('weekly');

  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [digestPreview, setDigestPreview] = useState<{
    emailDispatched: boolean;
    listings: Array<{ title: string; company: string; salaryRange: string }>;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(user.twoFactorEnabled));
  const [twoFactorInfo, setTwoFactorInfo] = useState<{
    recoveryCode: string;
    manualKey: string;
  } | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [wsConnecting, setWsConnecting] = useState(false);
  const [wsMessage, setWsMessage] = useState<string | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeGoogleWorkspaceStatus(setWsConnected);
  }, []);

  const handleConnectWorkspace = async () => {
    setWsError(null);
    setWsMessage(null);
    setWsConnecting(true);
    try {
      await connectGoogleWorkspace(true);
      setWsMessage(
        'Google Workspace authorized for this session (Drive, Docs, Sheets, Calendar).'
      );
    } catch (err: any) {
      setWsError(err?.message || 'Failed to authorize Google Workspace.');
    } finally {
      setWsConnecting(false);
    }
  };

  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveNotice(null);
    try {
      await apiFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          query: alertQuery,
          location: alertLocation,
          minFitScore,
          frequency,
          active: alertsEnabled,
        }),
      });
      setSaveNotice(`Fit Radar alert saved (threshold ${minFitScore}%+ · ${frequency}).`);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewDigest = async () => {
    setPreviewing(true);
    try {
      const res = await apiFetch<{
        emailDispatched: boolean;
        listings: Array<{ title: string; company: string; salaryRange: string }>;
      }>('/api/alerts/preview', {
        method: 'POST',
        body: JSON.stringify({ query: alertQuery, location: alertLocation }),
      });
      setDigestPreview(res);
    } finally {
      setPreviewing(false);
    }
  };

  const handleToggle2FA = async () => {
    const next = !twoFactorEnabled;
    const res = await apiFetch<{
      enabled: boolean;
      recoveryCode?: string;
      manualKey?: string;
    }>('/api/auth/2fa/toggle', {
      method: 'POST',
      body: JSON.stringify({ enable: next }),
    });
    setTwoFactorEnabled(res.enabled);
    if (res.enabled && res.recoveryCode && res.manualKey) {
      setTwoFactorInfo({ recoveryCode: res.recoveryCode, manualKey: res.manualKey });
    } else {
      setTwoFactorInfo(null);
    }
    onRefresh();
  };

  const handleLogoutAllDevices = async () => {
    setRevokingAll(true);
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
      await onLogout();
    } finally {
      setRevokingAll(false);
    }
  };

  const handleExportGdpr = async () => {
    const data = await apiFetch<Record<string, unknown>>('/api/user/export-gdpr');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resugo_gdpr_export_${user.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWipeData = async () => {
    setWiping(true);
    try {
      await apiFetch('/api/user/data', { method: 'DELETE' });
      setConfirmWipe(false);
      onRefresh();
      onNavigate('/dashboard');
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Profile, Security & Privacy
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Manage language, theme, Fit Radar alerts, 2FA, session revocation, and GDPR controls.
        </p>
      </div>

      {/* Account & Theme */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={user.photoUrl || '/src/assets/images/avatar_demo_candidate_1795014347829.jpg'}
              alt={user.displayName || user.email}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
            <div>
              <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {user.canonicalName || user.displayName || user.email.split('@')[0]}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/name-check')}
            className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
          >
            Open Name Analysis & Check →
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Interface Language
            </label>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(['en', 'ta', 'hi'] as LangCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChangeLang(code)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    lang === code
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {LANG_LABELS[code]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Appearance Theme
            </label>
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="w-full py-2 px-4 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* Google Workspace Integration (Drive, Docs, Sheets, Calendar) */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Link2 className="w-4 h-4 text-teal-600" />
              Google Workspace Access (Drive, Docs, Sheets & Calendar)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Authorize in-memory session access to import resumes from Google Drive Picker, export Gap Reports to Google Sheets & Docs, and schedule sprints on Google Calendar.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                wsConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {wsConnected ? 'Connected (Session)' : 'Not Authorized'}
            </span>
            <button
              type="button"
              onClick={handleConnectWorkspace}
              disabled={wsConnecting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60"
            >
              {wsConnecting
                ? 'Authorizing...'
                : wsConnected
                ? 'Refresh Access'
                : 'Connect Google Workspace'}
            </button>
            {wsConnected && (
              <button
                type="button"
                onClick={() => {
                  clearGoogleAccessToken();
                  setWsMessage('Google Workspace session token cleared.');
                }}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
        {wsMessage && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{wsMessage}</p>
        )}
        {wsError && <p className="text-xs text-red-600 dark:text-red-400">{wsError}</p>}
      </div>

      {/* Security: 2FA & Logout from all devices */}
      <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600" />
          Account Security & Sessions
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-teal-600" /> Two-Factor Authentication (2FA)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {twoFactorEnabled
                ? 'Enabled — recovery key active for sensitive account actions.'
                : 'Optional extra protection for your resumes and exports.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle2FA}
            className={`px-4 py-2 text-xs font-semibold rounded-lg ${
              twoFactorEnabled
                ? 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
          </button>
        </div>

        {twoFactorInfo && (
          <div className="p-3.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs space-y-1">
            <p className="font-semibold text-indigo-900 dark:text-indigo-200">
              Save your 2FA Recovery Code:
            </p>
            <p className="font-mono text-sm font-bold text-indigo-700 dark:text-indigo-300">
              {twoFactorInfo.recoveryCode} · Key: {twoFactorInfo.manualKey}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Active Sessions
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Revoke Firebase refresh tokens and invalidate active sessions across all browsers.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogoutAllDevices}
            disabled={revokingAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <LogOut className="w-3.5 h-3.5" />
            {revokingAll ? 'Revoking...' : 'Log Out All Devices'}
          </button>
        </div>
      </div>

      {/* Fit Radar Job Alerts */}
      <form
        onSubmit={handleSaveAlerts}
        className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-teal-600" />
            Fit Radar & Email Job Alerts
          </h2>
          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              className="accent-teal-600 w-4 h-4"
            />
            <span>Enabled</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Target Role Query
            </label>
            <input
              type="text"
              value={alertQuery}
              onChange={(e) => setAlertQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Preferred Location
            </label>
            <input
              type="text"
              value={alertLocation}
              onChange={(e) => setAlertLocation(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 tabular-nums">
              Minimum Fit Radar Threshold: {minFitScore}%+
            </label>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={minFitScore}
              onChange={(e) => setMinFitScore(Number(e.target.value))}
              className="w-full accent-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Alert Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="daily">Daily Digest</option>
              <option value="weekly">Weekly Digest</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save Fit Radar Alert'}
          </button>
          <button
            type="button"
            onClick={handlePreviewDigest}
            disabled={previewing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
          >
            {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Preview / Send Digest
          </button>
          {saveNotice && (
            <span className="text-xs text-teal-600 dark:text-teal-400">{saveNotice}</span>
          )}
        </div>

        {digestPreview && (
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <p className="font-semibold text-slate-900 dark:text-white">
              {digestPreview.emailDispatched
                ? `Email digest sent to ${user.email}`
                : `Alert Digest Preview for ${user.email}`}
            </p>
            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
              {digestPreview.listings.map((l, i) => (
                <li key={i}>
                  • <strong>{l.title}</strong> at {l.company} ({l.salaryRange})
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      {/* Privacy, GDPR Export & Data Deletion */}
      <div className="p-6 rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              GDPR Export & Permanent Data Erasure
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {t(lang, 'privacyNotice')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportGdpr}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" /> Export All Data (JSON)
          </button>

          {confirmWipe ? (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 space-y-3 w-full">
              <p className="text-xs font-semibold text-red-800 dark:text-red-200">
                Are you sure? This permanently deletes all encrypted resumes, name profiles, gap analyses, roadmaps, and saved jobs.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleWipeData}
                  disabled={wiping}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  {wiping ? 'Erasing Data...' : 'Yes, Delete Everything'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmWipe(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmWipe(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t(lang, 'deleteAllData')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
