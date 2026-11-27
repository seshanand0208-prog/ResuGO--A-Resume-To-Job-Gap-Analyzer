import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Volume2,
} from 'lucide-react';
import { apiFetch, NameProfileItem, ResumeItem, UserProfile } from '../lib/api';
import type { NameAnalysisResult } from '../db/schema';

export function NameAnalysisView({
  user,
  nameProfile,
  resumes,
  onRefresh,
  onNavigate,
}: {
  user: UserProfile | null;
  nameProfile: NameProfileItem | null;
  resumes: ResumeItem[];
  onRefresh: () => void;
  onNavigate: (path: string) => void;
}) {
  const resumeName = resumes[0]?.parsedData?.contactInfo?.name || '';
  const [inputName, setInputName] = useState(
    nameProfile?.canonicalName || user?.canonicalName || user?.displayName || resumeName || ''
  );
  const [result, setResult] = useState<NameAnalysisResult | null>(
    nameProfile
      ? {
          rawInputName: nameProfile.rawInputName,
          normalizedName: nameProfile.normalizedName,
          canonicalName: nameProfile.canonicalName,
          parsedParts: nameProfile.parsedParts,
          validityStatus: nameProfile.validityStatus,
          validityFlags: nameProfile.validityFlags,
          mismatchWarning: nameProfile.mismatchWarning,
          duplicateWarning: nameProfile.duplicateWarning,
          phoneticSpelling: nameProfile.phoneticSpelling || '',
          pronunciationText: nameProfile.pronunciationText || nameProfile.canonicalName,
          suggestions: nameProfile.suggestions,
        }
      : null
  );
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const handleAnalyze = async (e?: React.FormEvent, overrideName?: string) => {
    if (e) e.preventDefault();
    const target = (overrideName ?? inputName).trim();
    if (!target) {
      setError('Enter a name to analyze.');
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ analysis: NameAnalysisResult }>('/api/names/analyze', {
        method: 'POST',
        body: JSON.stringify({
          rawName: target,
          accountName: user?.displayName,
          googleProfileName: user?.displayName,
          resumeExtractedName: resumeName || undefined,
          email: user?.email,
          save: Boolean(user),
        }),
      });
      setResult(res.analysis);
      setInputName(res.analysis.normalizedName);
      if (user) onRefresh();
    } catch (err: any) {
      setError(err.message || 'Name analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCanonical = async (chosenName: string) => {
    if (!user) {
      setInputName(chosenName);
      setNotice(`Selected "${chosenName}" for this session.`);
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const res = await apiFetch<{ analysis: NameAnalysisResult }>('/api/names/confirm', {
        method: 'PATCH',
        body: JSON.stringify({ canonicalName: chosenName }),
      });
      setResult(res.analysis);
      setInputName(res.analysis.canonicalName);
      setNotice(`Confirmed canonical resume name: ${res.analysis.canonicalName}`);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm canonical name.');
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteNameData = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await apiFetch('/api/names', { method: 'DELETE' });
      setResult(null);
      setConfirmDeleteOpen(false);
      setNotice('Name analysis data permanently deleted.');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete name data.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSpeak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setNotice('Audio pronunciation is not supported by this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  };

  const copyValue = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedItem(key);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  const sourceOptions = [
    user?.displayName ? { label: 'Account / Google Name', value: user.displayName } : null,
    resumeName ? { label: 'Resume Header Name', value: resumeName } : null,
    result?.normalizedName ? { label: 'Normalized Format', value: result.normalizedName } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Name Analysis & Professional Identity Check
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
            Parse global & South Indian initials formats, normalize casing without altering cultural spellings, cross-check resume vs. Google profile names, and generate ATS-safe handles.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('/builder')}
          className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap"
        >
          Open Resume Builder →
        </button>
      </div>

      {/* Bias-Safe Notice */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
        <ShieldCheck className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
        <span>
          <strong>Bias-Safe by Design:</strong> ResuGO parses structure, casing, and ATS compatibility only. Name analysis never infers gender, ethnicity, or religion, and never blocks real cultural names.
        </span>
      </div>

      {/* Input & Quick Examples */}
      <form
        onSubmit={(e) => handleAnalyze(e)}
        className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Name to Parse & Normalize
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-400">Test examples:</span>
            {['K. Ramesh', 'Ramesh Kumar S', 'mcDONALD, sarah', 'asdf123'].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setInputName(ex);
                  handleAnalyze(undefined, ex);
                }}
                className="text-teal-700 dark:text-teal-400 hover:underline font-medium"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            placeholder="e.g. K. Ramesh, Ramesh Kumar S, Maya Subramanian"
            className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{loading ? 'Analyzing...' : 'Analyze Name'}</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200">
            {notice}
          </div>
        )}
      </form>

      {result && (
        <div className="space-y-6">
          {/* Warnings: Soft Validity, Mismatch, or Duplicate */}
          {(result.validityFlags.length > 0 || result.mismatchWarning || result.duplicateWarning) && (
            <div className="p-5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 space-y-3">
              <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-1.5 text-xs">
                  {result.validityFlags.length > 0 && (
                    <p>
                      <strong>Soft Validity Check ({result.validityStatus}):</strong>{' '}
                      {result.validityFlags.join(' · ')}. Real or unique names are never blocked—confirm below if intentional.
                    </p>
                  )}
                  {result.mismatchWarning && (
                    <p>
                      <strong>Cross-Check Mismatch:</strong> {result.mismatchWarning}
                    </p>
                  )}
                  {result.duplicateWarning && (
                    <p>
                      <strong>Duplicate Account Notice:</strong> {result.duplicateWarning}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={confirming}
                  onClick={() => handleConfirmCanonical(result.normalizedName)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Confirm "{result.normalizedName}" as Canonical Name
                </button>
                {sourceOptions.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={confirming}
                    onClick={() => handleConfirmCanonical(opt.value)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  >
                    Use {opt.label}: {opt.value}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Normalization & Structural Parsing */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  Structural Parsing
                </h2>
                <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
                  {result.parsedParts.formatType}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Prefix</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                    {result.parsedParts.prefix || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">First Name</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                    {result.parsedParts.firstName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Middle Name</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                    {result.parsedParts.middleName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Last Name</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                    {result.parsedParts.lastName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Initials</p>
                  <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                    {result.parsedParts.initials || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Suffix</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                    {result.parsedParts.suffix || '—'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Normalized Display
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {result.rawInputName !== result.normalizedName ? (
                      <>
                        <span className="line-through text-slate-400 mr-2">
                          {result.rawInputName}
                        </span>
                        <span className="text-teal-700 dark:text-teal-400">
                          {result.normalizedName}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {result.normalizedName}
                      </span>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSpeak(result.pronunciationText)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Listen: {result.phoneticSpelling}</span>
                </button>
              </div>
            </div>

            {/* Professional Display Formats & Handles */}
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Resume Formats & Professional Handles
              </h2>

              <div className="space-y-2.5 text-xs">
                {[
                  { key: 'full', label: 'Full Resume Style', val: result.suggestions.fullName },
                  { key: 'init', label: 'Initials Style', val: result.suggestions.initialsStyle },
                  { key: 'ats', label: 'ATS-Safe ASCII Format', val: result.suggestions.atsSafeName },
                ].map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800"
                  >
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">{row.label}: </span>
                      <strong className="text-slate-900 dark:text-white">{row.val}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmCanonical(row.val)}
                        className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        onClick={() => copyValue(row.key, row.val)}
                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        aria-label={`Copy ${row.label}`}
                      >
                        {copiedItem === row.key ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Professional Email Ideas
                  </p>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-400 font-mono">
                    {result.suggestions.emailIdeas.map((em) => (
                      <li key={em}>{em}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    LinkedIn Handle Ideas
                  </p>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-400 font-mono">
                    {result.suggestions.handleIdeas.map((h) => (
                      <li key={h}>in/{h}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Delete Stored Name Profile */}
          {user && nameProfile && (
            <div className="flex items-center justify-end">
              {confirmDeleteOpen ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-600 dark:text-red-400">
                    Erase stored name analysis?
                  </span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDeleteNameData}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                  >
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="text-xs text-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Saved Name Profile Data
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
