import React, { useState } from 'react';
import {
  Bookmark,
  Briefcase,
  ExternalLink,
  GitCompare,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch, AnalysisItem, ResumeItem, SavedJobItem } from '../lib/api';
import type { PrefillJob } from './NewAnalysisView';

interface LiveJobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  salaryRange: string;
  postedAt: string;
  source: string;
  applyUrl: string;
  descriptionText: string;
  highlights: string[];
}

interface JobSearchPayload {
  listings: LiveJobListing[];
  marketBenchmark: {
    salaryRange: string;
    inDemandSkills: string[];
    summary: string;
    sources: Array<{ title: string; url: string }>;
  };
  provider: string;
}

export function JobSearchView({
  savedJobs,
  isAuthenticated,
  onAnalyzeJob,
  onSavedJobsChanged,
  onRequireSignIn,
}: {
  savedJobs: SavedJobItem[];
  isAuthenticated: boolean;
  onAnalyzeJob: (job: PrefillJob) => void;
  onSavedJobsChanged: () => void;
  onRequireSignIn: () => void;
}) {
  const [query, setQuery] = useState('Senior Frontend Engineer');
  const [location, setLocation] = useState('Bengaluru');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<JobSearchPayload | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<JobSearchPayload>(
        `/api/jobs/search?q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`
      );
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch live job listings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveJob = async (listing: LiveJobListing) => {
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    setSavingId(listing.id);
    try {
      await apiFetch('/api/saved-jobs', {
        method: 'POST',
        body: JSON.stringify(listing),
      });
      onSavedJobsChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to save job.');
    } finally {
      setSavingId(null);
    }
  };

  const handleStatusChange = async (savedId: number, status: string) => {
    try {
      await apiFetch(`/api/saved-jobs/${savedId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onSavedJobsChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to update job status.');
    }
  };

  const handleDeleteSaved = async (savedId: number) => {
    try {
      await apiFetch(`/api/saved-jobs/${savedId}`, { method: 'DELETE' });
      onSavedJobsChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to remove saved job.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Live Google Jobs & Market Intelligence
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Search current openings by role and location, inspect live salary benchmarks, and run instant gap analyses.
        </p>
      </div>

      <form
        onSubmit={handleSearch}
        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-3"
      >
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Job title or skills (e.g. Full-Stack Engineer)"
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
          />
        </div>
        <div className="sm:w-56 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City or Remote"
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          {loading ? 'Searching...' : 'Search Jobs'}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
          <span>Fetching live Google Jobs listings & salary benchmarks...</span>
        </div>
      )}

      {results && !loading && (
        <div className="space-y-6">
          {/* Market Benchmark */}
          <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Market Benchmark: {query} ({location})
              </h2>
              <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                {results.marketBenchmark.salaryRange}
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {results.marketBenchmark.summary}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              In-Demand Skills: {results.marketBenchmark.inDemandSkills.join(' · ')}
            </p>
            {results.marketBenchmark.sources.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-3 text-xs">
                {results.marketBenchmark.sources.map((s, idx) => (
                  <a
                    key={idx}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    <span>{s.title}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Job Listings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results.listings.map((job) => (
              <div
                key={job.id}
                className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {job.company} · {job.location} · {job.postedAt}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {job.title}
                  </h3>
                  <p className="mt-1 font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {job.salaryRange}
                  </p>
                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 line-clamp-4 leading-relaxed">
                    {job.descriptionText}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onAnalyzeJob({
                          title: job.title,
                          company: job.company,
                          location: job.location,
                          salaryRange: job.salaryRange,
                          applyUrl: job.applyUrl,
                          source: 'google_jobs',
                          descriptionText: `${job.title} at ${job.company} (${job.location})\n${job.descriptionText}`,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Analyze Gap
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveJob(job)}
                      disabled={savingId === job.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                      {savingId === job.id ? 'Saving...' : 'Save'}
                    </button>
                  </div>

                  {job.applyUrl && (
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600"
                    >
                      Listing <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Jobs Tracker */}
      {isAuthenticated && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-indigo-600" />
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Saved Jobs Tracker ({savedJobs.length})
            </h2>
          </div>

          {savedJobs.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
              No saved jobs yet. Search above and click Save on roles you want to track.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {savedJobs.map((item) => (
                <div
                  key={item.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">
                      {item.job.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.job.company} · {item.job.location || 'Remote'} ·{' '}
                      {item.job.salaryRange || 'Salary not listed'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={item.status}
                      onChange={(e) => handleStatusChange(item.id, e.target.value)}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                    >
                      <option value="saved">Saved</option>
                      <option value="applied">Applied</option>
                      <option value="interviewing">Interviewing</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        onAnalyzeJob({
                          title: item.job.title,
                          company: item.job.company,
                          location: item.job.location || undefined,
                          salaryRange: item.job.salaryRange || undefined,
                          descriptionText: item.job.descriptionText,
                        })
                      }
                      className="text-xs font-semibold text-teal-600 hover:underline whitespace-nowrap"
                    >
                      Analyze
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSaved(item.id)}
                      aria-label="Delete saved job"
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CompareJobsView({
  resumes,
  onOpenReport,
  onComparisonComplete,
}: {
  resumes: ResumeItem[];
  onOpenReport: (analysis: AnalysisItem) => void;
  onComparisonComplete: () => void;
}) {
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(
    resumes[0]?.id ?? null
  );
  const [jobsInput, setJobsInput] = useState<
    Array<{ title: string; company: string; descriptionText: string }>
  >([
    {
      title: 'Backend Platform Engineer',
      company: 'Razorpay',
      descriptionText:
        '3+ years with Node.js, TypeScript, PostgreSQL, Redis, Docker, and Kubernetes.',
    },
    {
      title: 'Frontend Product Engineer',
      company: 'Linear',
      descriptionText:
        '4+ years building crisp React, TypeScript, CSS design systems, Web Vitals, and local-first sync engines.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranked, setRanked] = useState<AnalysisItem[] | null>(null);

  const addSlot = () => {
    if (jobsInput.length >= 5) return;
    setJobsInput((prev) => [
      ...prev,
      { title: '', company: '', descriptionText: '' },
    ]);
  };

  const removeSlot = (idx: number) => {
    if (jobsInput.length <= 2) return;
    setJobsInput((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRunCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResumeId) {
      setError('Upload or save a resume first before comparing multiple jobs.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ rankedAnalyses: AnalysisItem[] }>(
        '/api/analyses/compare',
        {
          method: 'POST',
          body: JSON.stringify({
            resumeId: selectedResumeId,
            jobs: jobsInput.filter((j) => j.descriptionText.trim().length > 10),
          }),
        }
      );
      setRanked(res.rankedAnalyses);
      onComparisonComplete();
    } catch (err: any) {
      setError(err.message || 'Multi-job comparison failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Multi-Job Comparison (Up to 5 Roles)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Benchmark one resume version against 2 to 5 target job descriptions and rank them by overall fit.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleRunCompare} className="space-y-6">
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Select Resume Version
          </label>
          <select
            value={selectedResumeId ?? ''}
            onChange={(e) => setSelectedResumeId(Number(e.target.value))}
            className="w-full sm:w-96 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            {resumes.map((r) => (
              <option key={r.id ?? r.title} value={r.id ?? ''}>
                {r.title} (v{r.version})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {jobsInput.map((job, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Target Job #{idx + 1}
                </span>
                {jobsInput.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(idx)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Role title"
                  value={job.title}
                  onChange={(e) =>
                    setJobsInput((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, title: e.target.value } : item
                      )
                    )
                  }
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Company"
                  value={job.company}
                  onChange={(e) =>
                    setJobsInput((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, company: e.target.value } : item
                      )
                    )
                  }
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <textarea
                rows={4}
                required
                placeholder="Paste job requirements..."
                value={job.descriptionText}
                onChange={(e) =>
                  setJobsInput((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, descriptionText: e.target.value } : item
                    )
                  )
                }
                className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          {jobsInput.length < 5 ? (
            <button
              type="button"
              onClick={addSlot}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" /> Add Another Job ({jobsInput.length}/5)
            </button>
          ) : (
            <span className="text-xs text-slate-500">Maximum 5 jobs selected</span>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Ranking Jobs...
              </>
            ) : (
              <>
                <GitCompare className="w-4 h-4" /> Compare & Rank Fit
              </>
            )}
          </button>
        </div>
      </form>

      {ranked && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Ranked Fit Leaderboard
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {ranked.map((item, idx) => (
              <div
                key={item.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <span className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    #{idx + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {item.job.title} · {item.job.company}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Skills {item.skillsScore}% · Experience {item.experienceScore}% · ATS Keywords {item.keywordsScore}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                    {item.overallScore}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenReport(item)}
                    className="text-xs font-semibold text-teal-600 hover:underline whitespace-nowrap"
                  >
                    Full Report →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
