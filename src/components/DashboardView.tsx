import React from 'react';
import {
  ArrowUpRight,
  Briefcase,
  Database,
  FileText,
  PlusCircle,
  TrendingUp,
} from 'lucide-react';
import type { AnalysisItem, DashboardPayload } from '../lib/api';

export function DashboardView({
  data,
  loading,
  onNavigate,
  onOpenReport,
  onLoadDemo,
}: {
  data: DashboardPayload | null;
  loading: boolean;
  onNavigate: (path: string) => void;
  onOpenReport: (analysis: AnalysisItem) => void;
  onLoadDemo: () => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  const analyses = data?.analyses || [];
  const resumes = data?.resumes || [];
  const roadmaps = data?.roadmaps || [];
  const savedJobs = data?.savedJobs || [];

  const latestScore = analyses[0]?.overallScore ?? 0;

  let totalTasks = 0;
  let completedTasks = 0;
  for (const rm of roadmaps) {
    for (const w of rm.weeks) {
      totalTasks += w.tasks.length;
      completedTasks += w.tasks.filter((t) => t.completed).length;
    }
  }
  const roadmapPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Chronological order for score trend SVG
  const trendPoints = [...analyses].reverse().slice(-8);

  if (analyses.length === 0 && resumes.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center max-w-2xl mx-auto mt-8">
        <FileText className="w-10 h-10 text-teal-600 mx-auto mb-3" />
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Your workspace is ready
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Upload your first resume and compare it against a target job, or load a sample Career Readiness workspace to explore reports and roadmaps.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/analyze')}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> Run First Analysis
          </button>
          <button
            type="button"
            onClick={onLoadDemo}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Database className="w-4 h-4" /> Load Demo Workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-Column KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Latest Match Score
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
            {latestScore}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {analyses[0]?.job.title || 'No analyses yet'}
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Gap Analyses Run
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {analyses.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {resumes.length} encrypted resume versions
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Roadmap Completion
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
            {roadmapPct}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {completedTasks} of {totalTasks} tasks completed
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Saved Target Jobs
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {savedJobs.length}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/jobs')}
            className="mt-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
          >
            Browse live jobs →
          </button>
        </div>
      </div>

      {/* Score Trend & Saved Jobs Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-600" />
                Match Score Trend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fit progression across recent target roles
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {trendPoints.length} data points
            </span>
          </div>

          {trendPoints.length >= 2 ? (
            <div className="w-full overflow-x-auto">
              <svg viewBox="0 0 560 180" className="w-full h-44" role="img" aria-label="Match score trend over time">
                {[25, 50, 75, 100].map((val) => {
                  const y = 150 - (val / 100) * 125;
                  return (
                    <g key={val}>
                      <line
                        x1="36"
                        y1={y}
                        x2="540"
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-800"
                        strokeDasharray="3 3"
                      />
                      <text
                        x="6"
                        y={y + 4}
                        className="fill-slate-400 text-[10px] font-mono"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}
                <polyline
                  fill="none"
                  stroke="#0D9488"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={trendPoints
                    .map((p, idx) => {
                      const x = 50 + (idx * 470) / Math.max(1, trendPoints.length - 1);
                      const y = 150 - (p.overallScore / 100) * 125;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
                {trendPoints.map((p, idx) => {
                  const x = 50 + (idx * 470) / Math.max(1, trendPoints.length - 1);
                  const y = 150 - (p.overallScore / 100) * 125;
                  return (
                    <g key={p.id}>
                      <circle cx={x} cy={y} r="5" fill="#0D9488" stroke="white" strokeWidth="2" />
                      <text
                        x={x}
                        y={y - 10}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 text-[11px] font-mono font-semibold"
                      >
                        {p.overallScore}%
                      </text>
                      <text
                        x={x}
                        y="170"
                        textAnchor="middle"
                        className="fill-slate-400 text-[10px]"
                      >
                        {p.job.company.slice(0, 11)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              Run at least 2 analyses to visualize score progression over time.
            </div>
          )}
        </div>

        <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              Saved Jobs
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/jobs')}
              className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline"
            >
              Manage all
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 flex-1">
            {savedJobs.slice(0, 4).map((item) => (
              <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {item.job.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.job.company} · {item.job.location || 'Remote'} ·{' '}
                    <span className="capitalize font-medium text-indigo-600 dark:text-indigo-400">
                      {item.status}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/jobs')}
                  className="p-1.5 text-slate-400 hover:text-teal-600 shrink-0"
                  aria-label={`View ${item.job.title}`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            ))}
            {savedJobs.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6">
                No saved jobs yet. Search live listings to bookmark roles.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Analysis History Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Analysis History
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('/compare')}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
          >
            Compare up to 5 jobs →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-3 px-6">Target Role</th>
                <th className="py-3 px-4 text-right">Overall</th>
                <th className="py-3 px-4 text-right">Skills</th>
                <th className="py-3 px-4 text-right">ATS Keywords</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {analyses.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-3.5 px-6">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {a.job.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {a.job.company} · {a.job.location || 'Remote'}
                    </p>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                    {a.overallScore}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {a.skillsScore}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {a.keywordsScore}%
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenReport(a)}
                      className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
                    >
                      Open Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
