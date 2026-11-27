import React, { useEffect, useState } from 'react';
import { ExternalLink, Globe, Mail, MapPin } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ParsedResumeData, ResumeBuilderConfig } from '../db/schema';

export function PublicPortfolioView({
  slug,
  onNavigate,
}: {
  slug: string;
  onNavigate: (path: string) => void;
}) {
  const [portfolio, setPortfolio] = useState<{
    title: string;
    parsedData: ParsedResumeData;
    builderConfig: ResumeBuilderConfig | null;
    updatedAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ portfolio: any }>(`/api/portfolio/${encodeURIComponent(slug)}`)
      .then((res) => setPortfolio(res.portfolio))
      .catch((err) => setError(err.message || 'Portfolio not found or set to private.'));
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 text-center">
        <Globe className="w-10 h-10 text-slate-400 mb-3" />
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Portfolio Unavailable
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{error}</p>
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="mt-5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
        >
          Go to ResuGO
        </button>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Loading portfolio...
      </div>
    );
  }

  const d = portfolio.parsedData;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-12 px-6">
      <article className="max-w-3xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-12 space-y-8">
        <header className="border-b border-slate-200 dark:border-slate-800 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">
              {d.contactInfo?.name}
            </h1>
            <p className="mt-1 text-sm text-teal-700 dark:text-teal-400 font-medium">
              {d.seniorityLevel} · {d.totalYearsExp} yrs experience
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              {d.contactInfo?.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {d.contactInfo.location}
                </span>
              )}
              {d.contactInfo?.email && (
                <a
                  href={`mailto:${d.contactInfo.email}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <Mail className="w-3.5 h-3.5" /> {d.contactInfo.email}
                </a>
              )}
              {d.contactInfo?.linkedin && (
                <a
                  href={
                    d.contactInfo.linkedin.startsWith('http')
                      ? d.contactInfo.linkedin
                      : `https://${d.contactInfo.linkedin}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  LinkedIn <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {d.contactInfo?.github && (
                <a
                  href={
                    d.contactInfo.github.startsWith('http')
                      ? d.contactInfo.github
                      : `https://${d.contactInfo.github}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  GitHub <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
          {portfolio.builderConfig?.showPhoto && d.photoUrl && (
            <img
              src={d.photoUrl}
              alt={d.contactInfo?.name}
              className="w-20 h-20 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
          )}
        </header>

        {d.summary && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-2">
              About
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {d.summary}
            </p>
          </section>
        )}

        {d.skills.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-2">
              Core Skills
            </h2>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {d.skills.join(' · ')}
            </p>
          </section>
        )}

        {d.experience.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Experience
            </h2>
            {d.experience.map((exp, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {exp.role} · {exp.company}
                  </h3>
                  <span className="text-xs font-mono text-slate-500">{exp.duration}</span>
                </div>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {exp.bullets.map((b, bIdx) => (
                    <li key={bIdx}>• {b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {d.projects.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Selected Projects
            </h2>
            {d.projects.map((p, idx) => (
              <div key={idx} className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {p.name}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({p.technologies.join(', ')})
                  </span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{p.description}</p>
              </div>
            ))}
          </section>
        )}

        {d.education.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
              Education
            </h2>
            {d.education.map((edu, idx) => (
              <p key={idx} className="text-xs text-slate-700 dark:text-slate-300">
                <strong>{edu.degree}</strong> — {edu.institution} ({edu.year})
              </p>
            ))}
          </section>
        )}

        <footer className="pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Published via ResuGO Portfolio</span>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="text-teal-600 dark:text-teal-400 hover:underline font-medium"
          >
            Build yours on ResuGO
          </button>
        </footer>
      </article>
    </div>
  );
}
