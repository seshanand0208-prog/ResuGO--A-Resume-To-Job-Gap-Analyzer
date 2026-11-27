import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import {
  apiFetch,
  AnalysisItem,
  DashboardPayload,
} from './lib/api';
import {
  checkGoogleRedirectResult,
  formatFirebaseAuthError,
  logoutUser,
  signInWithGoogle,
  subscribeAuthState,
} from './lib/firebase';
import { LangCode } from './lib/i18n';
import {
  AboutPage,
  LandingPage,
  LegalPage,
  PricingPage,
  PublicFooter,
  PublicHeader,
} from './components/PublicPages';
import { AuthPage } from './components/AuthPage';
import { ResuGoLogo } from './components/ResuGoLogo';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { DashboardView } from './components/DashboardView';
import { NewAnalysisView, PrefillJob } from './components/NewAnalysisView';
import { ReportView } from './components/ReportView';
import {
  CompareJobsView,
  JobSearchView,
} from './components/JobSearchAndCompareViews';
import {
  ResumeVersionsView,
  RoadmapView,
  SettingsView,
} from './components/ResumeRoadmapSettingsViews';
import {
  GapFixPrefill,
  ResumeBuilderView,
} from './components/ResumeBuilderView';
import { NameAnalysisView } from './components/NameAnalysisView';
import { CoverLetterAndInterviewView } from './components/CoverLetterAndInterviewViews';
import { PublicPortfolioView } from './components/PublicPortfolioView';

export default function App() {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Intro flow when opening '/': 'splash' (centered logo + name) -> 'login' (logo docked to top + login credentials)
  const [introPhase, setIntroPhase] = useState<'splash' | 'login'>(() =>
    window.location.pathname === '/' ? 'splash' : 'login'
  );

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [activeReport, setActiveReport] = useState<AnalysisItem | null>(null);
  const [sharedReport, setSharedReport] = useState<AnalysisItem | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [prefillJob, setPrefillJob] = useState<PrefillJob | null>(null);
  const [prefillFix, setPrefillFix] = useState<GapFixPrefill | null>(null);

  const [lang, setLang] = useState<LangCode>(() => {
    const saved = window.localStorage.getItem('resugo_lang');
    return saved === 'ta' || saved === 'hi' ? saved : 'en';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = window.localStorage.getItem('resugo_dark');
    if (saved === 'true' || saved === 'false') {
      return saved === 'true';
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const isAuthenticated = Boolean(firebaseUser || dashboard?.user);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    window.localStorage.setItem('resugo_dark', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    window.localStorage.setItem('resugo_lang', lang);
  }, [lang]);

  useEffect(() => {
    const handlePop = () => {
      setPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (nextPath.startsWith('/#')) {
      window.history.pushState({}, '', '/features');
      setPath('/features');
      const id = nextPath.slice(2);
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
      return;
    }
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0 });
  }, []);

  const applyDashboardUserPrefs = useCallback((data: DashboardPayload) => {
    if (
      data.user.preferredLang === 'ta' ||
      data.user.preferredLang === 'hi' ||
      data.user.preferredLang === 'en'
    ) {
      setLang(data.user.preferredLang);
    }
    const hasLocalDarkPref = window.localStorage.getItem('resugo_dark') !== null;
    if (!hasLocalDarkPref && typeof data.user.darkMode === 'boolean') {
      setDarkMode(data.user.darkMode);
    }
  }, []);

  const fetchDashboard = useCallback(
    async (quiet = false): Promise<DashboardPayload | null> => {
      setDashLoading(true);
      try {
        const data = await apiFetch<DashboardPayload>('/api/dashboard');
        setDashboard(data);
        applyDashboardUserPrefs(data);
        return data;
      } catch (err) {
        if (!quiet) {
          console.error('Failed to load dashboard:', err);
        }
        return null;
      } finally {
        setDashLoading(false);
      }
    },
    [applyDashboardUserPrefs]
  );

  useEffect(() => {
    let mounted = true;
    checkGoogleRedirectResult().then((u) => {
      if (mounted && u && (window.location.pathname === '/' || window.location.pathname === '/login')) {
        navigate('/dashboard');
      }
    });

    const unsub = subscribeAuthState(async (user) => {
      if (!mounted) return;
      setFirebaseUser(user);
      if (user) {
        setAuthError(null);
        await fetchDashboard();
        if (mounted) {
          setAuthReady(true);
          if (window.location.pathname === '/' || window.location.pathname === '/login') {
            navigate('/dashboard');
          }
        }
      } else {
        // Check if user has an active signed httpOnly email session cookie
        const cookieData = await fetchDashboard(true);
        if (!mounted) return;
        if (!cookieData) {
          setDashboard(null);
        } else if (window.location.pathname === '/' || window.location.pathname === '/login') {
          navigate('/dashboard');
        }
        setAuthReady(true);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [fetchDashboard, navigate]);

  // Animate Intro Splash -> Top Bar + Login Credentials when opening '/' logged out (5.8s showcase)
  useEffect(() => {
    if (path !== '/' || isAuthenticated) {
      return;
    }
    if (introPhase === 'splash') {
      const timer = window.setTimeout(() => {
        setIntroPhase('login');
      }, 5800);
      return () => window.clearTimeout(timer);
    }
  }, [path, isAuthenticated, introPhase]);

  // If authenticated user lands on '/', go straight to Dashboard
  useEffect(() => {
    if (authReady && isAuthenticated && (path === '/' || path === '/login')) {
      navigate('/dashboard');
    }
  }, [authReady, isAuthenticated, path, navigate]);

  // Load shared report or report by ID when navigating directly
  useEffect(() => {
    if (path.startsWith('/report/share/')) {
      const token = path.replace('/report/share/', '');
      setSharedError(null);
      apiFetch<{ analysis: AnalysisItem }>(`/api/analyses/share/${encodeURIComponent(token)}`)
        .then((res) => setSharedReport(res.analysis))
        .catch((err) => setSharedError(err.message || 'Shared report not found.'));
    } else if (path.startsWith('/report/')) {
      const id = Number(path.replace('/report/', ''));
      if (Number.isFinite(id) && (!activeReport || activeReport.id !== id)) {
        const localMatch = dashboard?.analyses.find((a) => a.id === id);
        if (localMatch) {
          setActiveReport(localMatch);
        } else {
          apiFetch<{ analysis: AnalysisItem }>(`/api/analyses/${id}`)
            .then((res) => setActiveReport(res.analysis))
            .catch(() => {});
        }
      }
    }
  }, [path, dashboard, activeReport]);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      await fetchDashboard();
      if (path === '/' || path === '/login') {
        navigate('/dashboard');
      }
    } catch (err: any) {
      const formatted = formatFirebaseAuthError(err);
      setAuthError(formatted);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSuccess = async () => {
    const data = await fetchDashboard(true);
    if (!data) {
      throw new Error('Could not load your workspace session. Please try signing in again.');
    }
    navigate('/dashboard');
  };

  const handleToggleDarkMode = async () => {
    const next = !darkMode;
    setDarkMode(next);
    if (isAuthenticated) {
      apiFetch('/api/user/settings', {
        method: 'PATCH',
        body: JSON.stringify({ darkMode: next }),
      }).catch(() => {});
    }
  };

  const handleChangeLang = async (nextLang: LangCode) => {
    setLang(nextLang);
    if (isAuthenticated) {
      apiFetch('/api/user/settings', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLang: nextLang }),
      }).catch(() => {});
    }
  };

  const handleLogout = async () => {
    await Promise.allSettled([
      logoutUser(),
      apiFetch('/api/auth/logout', { method: 'POST' }),
    ]);
    setFirebaseUser(null);
    setDashboard(null);
    setIntroPhase('login');
    navigate('/');
  };

  const handleOpenReport = (analysis: AnalysisItem) => {
    setActiveReport(analysis);
    navigate(`/report/${analysis.id}`);
  };

  const handleLoadDemo = async () => {
    await apiFetch('/api/user/load-demo', { method: 'POST' });
    await fetchDashboard();
  };

  // Public Web Portfolio View (/p/:slug)
  if (path.startsWith('/p/')) {
    const slug = path.replace('/p/', '').replace(/\/+$/, '');
    return <PublicPortfolioView slug={slug} onNavigate={navigate} />;
  }

  // Public Shareable Report View
  if (path.startsWith('/report/share/')) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
        <PublicHeader
          currentPath={path}
          onNavigate={navigate}
          isAuthenticated={isAuthenticated}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
        />
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
          {sharedError ? (
            <div className="p-8 rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{sharedError}</p>
            </div>
          ) : sharedReport ? (
            <ReportView
              analysis={sharedReport}
              isAuthenticated={isAuthenticated}
              isPublicShare
              lang={lang}
              onNavigate={navigate}
            />
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              Loading shared gap report...
            </div>
          )}
        </main>
        <PublicFooter
          onNavigate={navigate}
          lang={lang}
          onChangeLang={handleChangeLang}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
        />
      </div>
    );
  }

  // Intro Experience on '/' when unauthenticated:
  // 1) Centered ResuGO Logo + Name splash
  // 2) Smooth dock animation to top header + Login Credentials right below -> opens Dashboard on login
  if (path === '/' && !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-x-hidden">
        <AnimatePresence mode="wait">
          {introPhase === 'splash' ? (
            <motion.div
              key="splash"
              onClick={() => setIntroPhase('login')}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 min-h-screen flex flex-col items-center justify-center px-6 cursor-pointer select-none"
            >
              <motion.div
                layoutId="resugo-brand-dock"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1.5, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                className="flex flex-col items-center gap-4"
              >
                <ResuGoLogo />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.35 }}
                className="mt-9 text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400"
              >
                Resume Gap Analyzer & Builder
              </motion.p>
              <div className="mt-5 w-48 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 5.7, ease: 'linear' }}
                  className="h-full bg-teal-600 origin-left"
                />
              </div>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                transition={{ delay: 0.9, duration: 0.4 }}
                className="mt-3 text-[11px] text-slate-400 dark:text-slate-500"
              >
                Click anywhere to continue
              </motion.span>
            </motion.div>
          ) : (
            <motion.div
              key="login-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="min-h-screen flex flex-col"
            >
              <motion.div
                layoutId="resugo-brand-dock"
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              >
                <PublicHeader
                  currentPath="/login"
                  onNavigate={navigate}
                  isAuthenticated={false}
                  darkMode={darkMode}
                  onToggleDarkMode={handleToggleDarkMode}
                />
              </motion.div>

              <motion.main
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.35 }}
                className="flex-1 flex flex-col items-center justify-center px-6 py-10"
              >
                <AuthPage
                  embedded
                  onGoogleLogin={handleGoogleLogin}
                  onContinueGuest={() => navigate('/analyze')}
                  onSuccess={handleAuthSuccess}
                  onNavigate={navigate}
                />
              </motion.main>

              <PublicFooter
                onNavigate={navigate}
                lang={lang}
                onChangeLang={handleChangeLang}
                darkMode={darkMode}
                onToggleDarkMode={handleToggleDarkMode}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Public Pages: Features Landing, Pricing, About, Legal, Login
  const isPublicPage =
    path === '/features' ||
    path === '/pricing' ||
    path === '/about' ||
    path === '/legal' ||
    path === '/login';

  if (isPublicPage) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
        <PublicHeader
          currentPath={path}
          onNavigate={navigate}
          isAuthenticated={isAuthenticated}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
        />
        <div className="flex-1">
          {path === '/features' && (
            <LandingPage
              onNavigate={navigate}
              onGoogleLogin={handleGoogleLogin}
              onStartGuest={() => navigate('/analyze')}
              authLoading={authLoading}
              authError={authError}
              lang={lang}
            />
          )}
          {path === '/pricing' && <PricingPage onNavigate={navigate} />}
          {path === '/about' && <AboutPage onNavigate={navigate} />}
          {path === '/legal' && <LegalPage onNavigate={navigate} />}
          {path === '/login' && (
            <AuthPage
              onGoogleLogin={handleGoogleLogin}
              onContinueGuest={() => navigate('/analyze')}
              onSuccess={handleAuthSuccess}
              onNavigate={navigate}
            />
          )}
        </div>
        <PublicFooter
          onNavigate={navigate}
          lang={lang}
          onChangeLang={handleChangeLang}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
        />
      </div>
    );
  }

  // Workspace Routes (Authenticated + Guest Mode for /analyze, /name-check, /jobs, /report/:id)
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 dark:text-slate-400">
        Loading ResuGO workspace...
      </div>
    );
  }

  const protectedPaths = [
    '/dashboard',
    '/builder',
    '/compare',
    '/resumes',
    '/roadmap',
    '/cover-letter',
    '/settings',
  ];
  if (!isAuthenticated && protectedPaths.some((p) => path.startsWith(p))) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
        <PublicHeader
          currentPath="/login"
          onNavigate={navigate}
          isAuthenticated={false}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
        />
        <AuthPage
          onGoogleLogin={handleGoogleLogin}
          onContinueGuest={() => navigate('/analyze')}
          onSuccess={handleAuthSuccess}
          onNavigate={navigate}
        />
      </div>
    );
  }

  const getBreadcrumb = () => {
    if (path === '/dashboard') return 'Dashboard Overview';
    if (path === '/analyze') return 'New Gap Analysis';
    if (path === '/builder') return 'Custom Resume Builder';
    if (path === '/name-check') return 'Bias-Safe Name Analysis';
    if (path === '/jobs') return 'Live Job Search';
    if (path === '/compare') return 'Multi-Job Comparison';
    if (path === '/resumes') return 'Resume Versions';
    if (path === '/roadmap') return 'Skill Roadmap';
    if (path === '/cover-letter') return 'Cover Letter & Interview Coach';
    if (path === '/settings') return 'Profile & Settings';
    if (path.startsWith('/report/')) return activeReport?.job.title || 'Gap Report';
    return 'Workspace';
  };

  return (
    <WorkspaceLayout
      currentPath={path}
      onNavigate={navigate}
      user={dashboard?.user ?? null}
      isGuest={!isAuthenticated}
      lang={lang}
      onChangeLang={handleChangeLang}
      darkMode={darkMode}
      onToggleDarkMode={handleToggleDarkMode}
      onLogout={handleLogout}
      breadcrumb={getBreadcrumb()}
      activeResume={dashboard?.resumes?.[0]?.parsedData ?? null}
      activeJobContext={activeReport?.job.descriptionText ?? null}
    >
      {path === '/dashboard' && (
        <DashboardView
          data={dashboard}
          loading={dashLoading}
          onNavigate={navigate}
          onOpenReport={handleOpenReport}
          onLoadDemo={handleLoadDemo}
        />
      )}

      {path === '/analyze' && (
        <NewAnalysisView
          resumes={dashboard?.resumes || []}
          isAuthenticated={isAuthenticated}
          prefillJob={prefillJob}
          lang={lang}
          onAnalysisComplete={(analysis) => {
            setActiveReport(analysis);
            if (isAuthenticated) fetchDashboard();
            navigate(`/report/${analysis.id}`);
          }}
          onRequireSignIn={() => navigate('/login')}
          onResumeUploaded={fetchDashboard}
          onOpenNameCheck={() => navigate('/name-check')}
        />
      )}

      {path === '/builder' && (
        <ResumeBuilderView
          resumes={dashboard?.resumes || []}
          nameProfile={dashboard?.nameProfile ?? null}
          prefillFix={prefillFix}
          onClearPrefillFix={() => setPrefillFix(null)}
          onRefresh={fetchDashboard}
          onNavigate={navigate}
        />
      )}

      {path === '/name-check' && (
        <NameAnalysisView
          user={dashboard?.user ?? null}
          nameProfile={dashboard?.nameProfile ?? null}
          resumes={dashboard?.resumes || []}
          onRefresh={fetchDashboard}
          onNavigate={navigate}
        />
      )}

      {path === '/jobs' && (
        <JobSearchView
          savedJobs={dashboard?.savedJobs || []}
          isAuthenticated={isAuthenticated}
          onAnalyzeJob={(job) => {
            setPrefillJob(job);
            navigate('/analyze');
          }}
          onSavedJobsChanged={fetchDashboard}
          onRequireSignIn={() => navigate('/login')}
        />
      )}

      {path === '/compare' && (
        <CompareJobsView
          resumes={dashboard?.resumes || []}
          onOpenReport={handleOpenReport}
          onComparisonComplete={fetchDashboard}
        />
      )}

      {path === '/resumes' && (
        <ResumeVersionsView
          resumes={dashboard?.resumes || []}
          onNavigate={navigate}
          onRefresh={fetchDashboard}
        />
      )}

      {path === '/roadmap' && (
        <RoadmapView
          roadmaps={dashboard?.roadmaps || []}
          onRefresh={fetchDashboard}
        />
      )}

      {path === '/cover-letter' && (
        <CoverLetterAndInterviewView
          resumes={dashboard?.resumes || []}
          analyses={dashboard?.analyses || []}
          lang={lang}
        />
      )}

      {path === '/settings' && dashboard?.user && (
        <SettingsView
          user={dashboard.user}
          lang={lang}
          onChangeLang={handleChangeLang}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
          onRefresh={fetchDashboard}
          onNavigate={navigate}
          onLogout={handleLogout}
        />
      )}

      {path.startsWith('/report/') && activeReport && (
        <ReportView
          analysis={activeReport}
          isAuthenticated={isAuthenticated}
          lang={lang}
          onNavigate={navigate}
          onFixSkillInBuilder={(skill, targetJobText, jobTitle) => {
            setPrefillFix({ skill, targetJobText, jobTitle });
            navigate('/builder');
          }}
        />
      )}
    </WorkspaceLayout>
  );
}
