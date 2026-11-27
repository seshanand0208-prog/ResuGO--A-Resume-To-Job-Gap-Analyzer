import React, { useState } from 'react';
import {
  BarChart3,
  Briefcase,
  FileEdit,
  FileText,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquare,
  Moon,
  PlusCircle,
  Settings,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { ResuGoLogo } from './ResuGoLogo';
import { CareerChatbot } from './CareerChatbot';
import { LANG_LABELS, LangCode, t } from '../lib/i18n';
import type { UserProfile } from '../lib/api';
import type { ParsedResumeData } from '../db/schema';

export function WorkspaceLayout({
  currentPath,
  onNavigate,
  user,
  isGuest,
  lang,
  onChangeLang,
  darkMode,
  onToggleDarkMode,
  onLogout,
  breadcrumb,
  activeResume,
  activeJobContext,
  children,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
  user: UserProfile | null;
  isGuest: boolean;
  lang: LangCode;
  onChangeLang: (lang: LangCode) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
  breadcrumb: string;
  activeResume?: ParsedResumeData | null;
  activeJobContext?: string | null;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', label: t(lang, 'dashOverview'), icon: LayoutDashboard, authOnly: false },
    { path: '/analyze', label: t(lang, 'dashAnalyze'), icon: PlusCircle, authOnly: false },
    { path: '/builder', label: t(lang, 'dashBuilder'), icon: FileEdit, authOnly: true },
    { path: '/name-check', label: t(lang, 'dashNameCheck'), icon: UserCheck, authOnly: false },
    { path: '/jobs', label: t(lang, 'dashJobs'), icon: Briefcase, authOnly: false },
    { path: '/compare', label: t(lang, 'dashCompare'), icon: GitCompare, authOnly: true },
    { path: '/resumes', label: t(lang, 'dashResumes'), icon: FileText, authOnly: true },
    { path: '/roadmap', label: t(lang, 'dashRoadmap'), icon: Map, authOnly: true },
    { path: '/cover-letter', label: t(lang, 'dashCoverLetter'), icon: MessageSquare, authOnly: true },
    { path: '/settings', label: t(lang, 'dashSettings'), icon: Settings, authOnly: true },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            onNavigate('/');
            setMobileOpen(false);
          }}
        >
          <ResuGoLogo />
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            currentPath === item.path ||
            (item.path === '/dashboard' && currentPath.startsWith('/report/') && !currentPath.startsWith('/report/share'));
          const locked = isGuest && item.authOnly;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                onNavigate(locked ? '/login' : item.path);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-3 truncate">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {locked && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Sign in
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        {user ? (
          <div className="flex items-center gap-3">
            <img
              src={user.photoUrl || '/src/assets/images/avatar_demo_candidate_1795014347829.jpg'}
              alt={user.displayName || user.email}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {user.displayName || user.email.split('@')[0]}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(lang, 'guestBanner')}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="w-full py-2 px-3 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
            >
              Sign In to Save History
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-10">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 truncate">
              <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="truncate font-medium text-slate-900 dark:text-white">
                {breadcrumb}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(['en', 'ta', 'hi'] as LangCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChangeLang(code)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    lang === code
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {LANG_LABELS[code]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              <span className="hidden sm:inline">{darkMode ? 'Light' : 'Dark'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/analyze')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              + {t(lang, 'dashAnalyze')}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      <CareerChatbot resumeContext={activeResume} jobContext={activeJobContext} />
    </div>
  );
}
