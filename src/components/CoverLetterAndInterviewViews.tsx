import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AnalysisItem, apiFetch, ResumeItem } from '../lib/api';
import { LangCode } from '../lib/i18n';

export function CoverLetterAndInterviewView({
  resumes,
  analyses,
  lang,
}: {
  resumes: ResumeItem[];
  analyses: AnalysisItem[];
  lang: LangCode;
}) {
  const [activeTab, setActiveTab] = useState<'cover' | 'interview'>('cover');
  const [selectedResumeIdx, setSelectedResumeIdx] = useState(0);
  const [selectedAnalysisIdx, setSelectedAnalysisIdx] = useState(0);

  // Cover letter state
  const [jobTitle, setJobTitle] = useState(
    analyses[0]?.job.title || 'Senior Full-Stack Engineer'
  );
  const [company, setCompany] = useState(analyses[0]?.job.company || 'Stripe');
  const [jobDesc, setJobDesc] = useState(
    analyses[0]?.job.descriptionText ||
      'Looking for an engineer experienced in React, TypeScript, Node.js, and PostgreSQL.'
  );
  const [tone, setTone] = useState<'professional' | 'enthusiastic' | 'concise'>('professional');
  const [coverResult, setCoverResult] = useState<{
    subjectLine: string;
    coverLetter: string;
    honestyChecklist: string[];
  } | null>(null);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [copiedCover, setCopiedCover] = useState(false);

  // Mock interview chat state
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([
    {
      role: 'assistant',
      content:
        'Welcome to Mock Interview Coach. Pick a target role or gap question below, or type "Start interview" and I will ask your first targeted question.',
    },
  ]);
  const [interviewInput, setInterviewInput] = useState('');
  const [sendingInterview, setSendingInterview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeResume = resumes[selectedResumeIdx];
  const activeAnalysis = analyses[selectedAnalysisIdx];

  const handleSelectAnalysis = (idx: number) => {
    setSelectedAnalysisIdx(idx);
    const a = analyses[idx];
    if (a) {
      setJobTitle(a.job.title);
      setCompany(a.job.company);
      setJobDesc(a.job.descriptionText);
    }
  };

  const handleGenerateCover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResume) {
      setError('Upload or create a resume first to generate an honest tailored cover letter.');
      return;
    }
    setError(null);
    setGeneratingCover(true);
    try {
      const res = await apiFetch<{
        subjectLine: string;
        coverLetter: string;
        honestyChecklist: string[];
      }>('/api/cover-letter/generate', {
        method: 'POST',
        body: JSON.stringify({
          resume: activeResume.parsedData,
          jobTitle,
          company,
          jobDescription: jobDesc,
          tone,
          language: lang,
        }),
      });
      setCoverResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to generate cover letter.');
    } finally {
      setGeneratingCover(false);
    }
  };

  const handleDownloadCoverPdf = () => {
    if (!coverResult) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const lines = doc.splitTextToSize(
      `${coverResult.subjectLine}\n\n${coverResult.coverLetter}`,
      500
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(lines, 48, 56);
    doc.save(`cover_letter_${company.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pdf`);
  };

  const sendMockTurn = async (text: string) => {
    if (!text.trim()) return;
    const userMsg = text.trim();
    const nextHistory = [...chatHistory, { role: 'user' as const, content: userMsg }];
    setChatHistory(nextHistory);
    setInterviewInput('');
    setSendingInterview(true);
    setError(null);
    try {
      const res = await apiFetch<{ reply: string; followUpSuggestions: string[] }>(
        '/api/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            message: userMsg,
            mode: 'mock_interview',
            history: nextHistory,
            resumeContext: activeResume?.parsedData || null,
            jobContext: `${jobTitle} at ${company}: ${jobDesc}`,
          }),
        }
      );
      setChatHistory((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err: any) {
      setError(err.message || 'Mock interview turn failed.');
    } finally {
      setSendingInterview(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Cover Letter & Mock Interview Studio
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Generate honest, role-specific cover letters and rehearse targeted interview questions.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('cover')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'cover'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Cover Letter Generator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('interview')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'interview'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Mock Interview Coach
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Context Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Active Resume Version
          </label>
          <select
            value={selectedResumeIdx}
            onChange={(e) => setSelectedResumeIdx(Number(e.target.value))}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            {resumes.length === 0 ? (
              <option value={0}>No saved resume yet</option>
            ) : (
              resumes.map((r, i) => (
                <option key={r.id ?? i} value={i}>
                  {r.title} (v{r.version})
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Pre-fill from Recent Gap Analysis
          </label>
          <select
            value={selectedAnalysisIdx}
            onChange={(e) => handleSelectAnalysis(Number(e.target.value))}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            {analyses.length === 0 ? (
              <option value={0}>Manual target role below</option>
            ) : (
              analyses.map((a, i) => (
                <option key={a.id} value={i}>
                  {a.job.title} — {a.job.company} ({a.overallScore}% fit)
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {activeTab === 'cover' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleGenerateCover}
            className="lg:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
          >
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Target Role Details
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Role Title
              </label>
              <input
                type="text"
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Company
              </label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as any)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="professional">Executive & Professional</option>
                <option value="enthusiastic">Product-Minded & Enthusiastic</option>
                <option value="concise">Ultra-Concise (Startup Email)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Job Description
              </label>
              <textarea
                rows={5}
                required
                value={jobDesc}
                onChange={(e) => setJobDesc(e.target.value)}
                className="w-full p-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={generatingCover}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60"
            >
              {generatingCover ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{generatingCover ? 'Drafting...' : 'Generate Honest Cover Letter'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-4">
            {coverResult ? (
              <>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-xs text-slate-500">Subject Line</p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {coverResult.subjectLine}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${coverResult.subjectLine}\n\n${coverResult.coverLetter}`
                          );
                          setCopiedCover(true);
                          setTimeout(() => setCopiedCover(false), 1800);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                      >
                        {copiedCover ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedCover ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCoverPdf}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {coverResult.coverLetter}
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <p className="font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Honesty Guard Verification
                  </p>
                  {coverResult.honestyChecklist.map((c, idx) => (
                    <p key={idx}>• {c}</p>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400">
                <FileText className="w-10 h-10 text-teal-600 mb-3" />
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Your tailored cover letter will appear here
                </p>
                <p className="text-xs mt-1 max-w-sm">
                  Every sentence stays strictly grounded in your verified resume projects and work history.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Gap Questions List */}
          <div className="lg:col-span-5 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Gap-Targeted Interview Prompts
            </h2>
            {activeAnalysis?.gapReport.interviewQuestions.map((q, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {q.targetGap} · {q.difficulty}
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{q.question}</p>
                {q.sampleAnswer && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong>Strong Answer Pattern:</strong> {q.sampleAnswer}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => sendMockTurn(`Ask me about: ${q.question}`)}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  Practice this in Mock Interview →
                </button>
              </div>
            ))}
            {!activeAnalysis && (
              <p className="text-xs text-slate-500">
                Run a gap analysis or start typing directly in the Mock Interview chat on the right.
              </p>
            )}
          </div>

          {/* Interactive Mock Interview Chat */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-[540px]">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Interactive Mock Interview ({jobTitle})
                </span>
              </div>
              <button
                type="button"
                onClick={() => sendMockTurn('Start a realistic mock interview question based on my top skill gap.')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Ask Next Question
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {chatHistory.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto bg-teal-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {sendingInterview && (
                <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Evaluating response...
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMockTurn(interviewInput);
              }}
              className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
            >
              <input
                type="text"
                value={interviewInput}
                onChange={(e) => setInterviewInput(e.target.value)}
                placeholder="Type your STAR / technical answer for feedback..."
                className="flex-1 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={sendingInterview || !interviewInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
