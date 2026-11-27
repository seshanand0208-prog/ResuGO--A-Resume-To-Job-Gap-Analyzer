import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Lock,
  Map,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { GoogleSignInButton, ResuGoLogo } from './ResuGoLogo';
import { LANG_LABELS, LangCode, t } from '../lib/i18n';

export function PublicHeader({
  currentPath,
  onNavigate,
  isAuthenticated,
  darkMode,
  onToggleDarkMode,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
  isAuthenticated: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="focus-visible:outline-2 focus-visible:outline-teal-600 rounded-md"
        >
          <ResuGoLogo />
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            type="button"
            onClick={() => onNavigate('/#features')}
            className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/pricing')}
            className={`hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              currentPath === '/pricing' ? 'text-teal-700 dark:text-teal-400 font-semibold' : ''
            }`}
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/jobs')}
            className={`hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              currentPath === '/jobs' ? 'text-teal-700 dark:text-teal-400 font-semibold' : ''
            }`}
          >
            Job Search
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/about')}
            className={`hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              currentPath === '/about' ? 'text-teal-700 dark:text-teal-400 font-semibold' : ''
            }`}
          >
            About
          </button>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{darkMode ? 'Light' : 'Dark'}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate(isAuthenticated ? '/dashboard' : '/login')}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            {isAuthenticated ? 'Open Workspace' : 'Sign In'}
          </button>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({
  onNavigate,
  lang,
  onChangeLang,
  darkMode,
  onToggleDarkMode,
}: {
  onNavigate: (path: string) => void;
  lang: LangCode;
  onChangeLang: (l: LangCode) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <ResuGoLogo />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-md">
            {t(lang, 'privacyNotice')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-600 dark:text-slate-300">
          <button type="button" onClick={() => onNavigate('/pricing')} className="hover:text-teal-600 whitespace-nowrap">
            Pricing
          </button>
          <button type="button" onClick={() => onNavigate('/about')} className="hover:text-teal-600 whitespace-nowrap">
            About
          </button>
          <button type="button" onClick={() => onNavigate('/legal')} className="hover:text-teal-600 whitespace-nowrap">
            Privacy & Terms
          </button>
          <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1">
            {(['en', 'ta', 'hi'] as LangCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onChangeLang(code)}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  lang === code
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {LANG_LABELS[code]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label="Toggle dark mode"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage({
  onNavigate,
  onGoogleLogin,
  onStartGuest,
  authLoading,
  authError,
  lang,
}: {
  onNavigate: (path: string) => void;
  onGoogleLogin: () => void;
  onStartGuest: () => void;
  authLoading: boolean;
  authError?: string | null;
  lang: LangCode;
}) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <main>
      {/* Hero Split Section */}
      <section className="max-w-7xl mx-auto px-6 py-14 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-semibold tracking-wide text-teal-700 dark:text-teal-400 mb-3">
              Gap Analyzer & Custom Resume Builder · Open Access
            </p>
            <h1
              className="font-display font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08]"
              style={{
                fontSize: 'clamp(2.25rem, 4vw, 3.6rem)',
                textWrap: 'balance',
              }}
            >
              {t(lang, 'heroTitle')}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              {t(lang, 'heroSubtitle')}
            </p>

            {authError && (
              <div
                role="alert"
                className="mt-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 max-w-xl"
              >
                {authError}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onStartGuest}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 rounded-lg transition-colors whitespace-nowrap shrink-0 min-h-[42px]"
              >
                <span>{t(lang, 'startGuest')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <GoogleSignInButton
                onClick={onGoogleLogin}
                disabled={authLoading}
                label={t(lang, 'signInGoogle')}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>12 ATS & modern templates</span>
              <span aria-hidden="true">·</span>
              <span>PDF, DOCX, Google Docs & Web Portfolio</span>
              <span aria-hidden="true">·</span>
              <span>AES-256-GCM encrypted</span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_career_workspace_1795014348212.jpg"
                  alt="ResuGO annotated resume and career analysis desk"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full lg:h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-10 bg-gradient-to-br from-teal-50 via-slate-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 text-center">
                  <FileSearch className="w-12 h-12 text-teal-600 mb-3" />
                  <p className="font-display font-semibold text-slate-900 dark:text-white">
                    Structured Resume & Gap Workspace
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Skills, ATS keywords, live resume builder, and career milestones
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4-Column Capability Strip Below Hero Split */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 border-t border-slate-200 dark:border-slate-800 pt-10">
          <div>
            <p className="font-mono text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              0–100%
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              4-Axis Fit & Health Score
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Skills, experience, ATS keywords, and a 6-second recruiter scan heatmap.
            </p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              12
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              Custom Builder Templates
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              ATS single-column, modern, academic, and fresher layouts with PDF/DOCX export.
            </p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              Global
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              Bias-Safe Name Engine
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Handles South Indian initials, casing normalization, cross-checks & audio phonetics.
            </p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              4-Week
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              Roadmaps, Coach & Alerts
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Google Calendar milestones, tailored cover letters, mock interviews & Fit Radar.
            </p>
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Built for honest, verifiable career readiness
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Find every gap in one report, then click "Fix this" to update your live resume inside the Custom Resume Builder with Honesty Guard checks.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                01. Gap-to-Fix Loop & Live Custom Builder
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                Pinpoint missing skills and fix them in a 12-template live editor
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Inspect color-coded hard & soft skill gaps, transferability maps, and recruiter 6-second scans—then jump straight into the Custom Resume Builder with STAR bullet assistance, version snapshots, and instant PDF, Word (.docx), Google Docs, or public portfolio exports.
              </p>
              <div className="mt-5 flex flex-wrap gap-6 text-xs font-medium">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> ATS single-column strict mode
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <Sparkles className="w-4 h-4" /> Honesty Guard prevents fake claims
                </span>
              </div>
            </div>

            <div className="p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                02. Bias-Safe Name Analysis
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                Global & South Indian name parsing
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Splits initials ("K. Ramesh", "Ramesh Kumar S"), fixes casing ("mcDONALD" → "McDonald"), cross-checks Google vs. resume names, and generates phonetic audio guides without bias.
              </p>
            </div>

            <div className="p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                03. Google Workspace Sync
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                Drive, Docs, Sheets & Calendar
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Import resumes via Google Drive Picker, save tailored resumes directly to Google Docs, export gap reports to Google Sheets, and sync milestones on Calendar.
              </p>
            </div>

            <div className="md:col-span-2 p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                04. Cover Letter, Mock Interview Coach & Career Copilot
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold text-slate-900 dark:text-white">
                Close every gap from application to salary negotiation
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Generate tailored cover letters, practice gap-focused mock interviews with constructive scoring, simulate career pivots, and track Fit Radar threshold alerts.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate('/jobs')}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  <Map className="w-4 h-4" /> Explore Live Job Search
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/legal')}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:underline"
                >
                  <Lock className="w-4 h-4" /> Security & Encryption Details
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PricingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <main className="max-w-6xl mx-auto px-6 py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
          Simple, open access pricing
        </h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          Try your first gap analysis and bias-safe name check immediately in Guest Mode, or sign in to unlock the 12-template Custom Resume Builder, Drive/Docs/Sheets sync, and unlimited history.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              For First-Time Explorers
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Guest Mode
            </h2>
            <p className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              $0
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <li>• 1 complete AI resume-to-job analysis</li>
              <li>• Bias-safe Name Analysis & audio pronunciation</li>
              <li>• Match score, 6-second scan & ATS keyword check</li>
              <li>• PDF report download & shareable link</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/analyze')}
            className="mt-8 w-full py-2.5 px-4 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Start Guest Analysis
          </button>
        </div>

        <div className="p-7 rounded-xl border-2 border-teal-600 dark:border-teal-500 bg-white dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              For Active Job Seekers
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Signed-In Workspace
            </h2>
            <p className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              Free
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <li>• 12-template Custom Resume Builder (PDF, DOCX, GDocs, Web)</li>
              <li>• Unlimited gap analyses & multi-job comparison (up to 5)</li>
              <li>• Gap-to-Fix builder loop, Cover Letters & Mock Interviews</li>
              <li>• Google Drive Picker, Sheets export & Calendar roadmap sync</li>
              <li>• Version snapshots, Fit Radar alerts & GDPR export</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="mt-8 w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors"
          >
            Sign In Free
          </button>
        </div>

        <div className="p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              For Career Coaches & Bootcamps
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
              Cohort Workspace
            </h2>
            <p className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              Custom
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <li>• Shared cohort rubric calibration</li>
              <li>• Dedicated SerpAPI & Resend alert quotas</li>
              <li>• Priority Cloud SQL & audit exports</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/about')}
            className="mt-8 w-full py-2.5 px-4 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Learn About Architecture
          </button>
        </div>
      </div>
    </main>
  );
}

export function AboutPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 space-y-10">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
          About ResuGO
        </h1>
        <p className="mt-4 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          ResuGO helps engineers, product builders, and graduates understand exactly why a resume passes or misses screening criteria—and gives them a realistic plan to close skill gaps honestly.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <ShieldCheck className="w-6 h-6 text-teal-600 mb-3" />
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Honest Rewriting Policy
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            ResuGO never fabricates job titles, metrics, or skills you have not practiced. Bullet rewrites clarify impact and integrate legitimate ATS keywords from your real work.
          </p>
        </div>
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <Lock className="w-6 h-6 text-indigo-600 mb-3" />
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Zero-Scraping & Encrypted Storage
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Job market lookups rely strictly on legal search APIs and grounded search with caching. Uploaded resume text is encrypted with AES-256-GCM at rest in PostgreSQL.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('/analyze')}
        className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
      >
        Try a Gap Analysis Now
      </button>
    </main>
  );
}

export function LegalPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 space-y-8">
      <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
        Privacy Policy & Terms of Service
      </h1>
      <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
            1. Resume Encryption & Data Ownership
          </h2>
          <p>
            Uploaded resumes (PDF, DOCX, Google Docs, or plain text up to 5 MB) are parsed transiently for structured skill extraction and stored encrypted at rest using AES-256-GCM in PostgreSQL. You retain full ownership of your resume text and may permanently erase all resumes, analyses, saved jobs, and roadmaps from Profile & Settings at any time.
          </p>
        </section>
        <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
            2. Google Workspace Permissions
          </h2>
          <p>
            When you connect Google Sign-In, Google Drive Picker, Google Sheets, or Google Calendar, access tokens remain strictly in browser memory for your active session and are never persisted in localStorage. ResuGO only accesses files you explicitly pick or spreadsheets/calendar events you explicitly ask to create.
          </p>
        </section>
        <section className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
            3. Acceptable Use & Rate Limits
          </h2>
          <p>
            Guest mode provides 1 complimentary gap analysis per session. Automated scraping, exceeding 5 MB upload limits, or bypassing rate limits is prohibited.
          </p>
        </section>
      </div>
      <button
        type="button"
        onClick={() => onNavigate('/')}
        className="text-sm font-semibold text-teal-600 hover:underline"
      >
        ← Return to Home
      </button>
    </main>
  );
}
