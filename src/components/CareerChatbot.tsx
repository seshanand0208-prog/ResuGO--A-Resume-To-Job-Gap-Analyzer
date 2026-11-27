import React, { useState } from 'react';
import { Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ParsedResumeData } from '../db/schema';

export function CareerChatbot({
  resumeContext,
  jobContext,
}: {
  resumeContext?: ParsedResumeData | null;
  jobContext?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([
    {
      role: 'assistant',
      content:
        'Hi! Ask me anything about ATS keywords, quantifying bullets honestly, South Indian/global name formats on resumes, or closing a job skill gap.',
    },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>([
    'How do I pass ATS filters?',
    'Format "K. Ramesh" cleanly on a resume',
    'How to pitch transferable skills?',
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await apiFetch<{
        reply: string;
        followUpSuggestions: string[];
      }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          mode: 'career_chat',
          history: next,
          resumeContext: resumeContext || null,
          jobContext: jobContext || null,
        }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      if (res.followUpSuggestions?.length) {
        setSuggestions(res.followUpSuggestions.slice(0, 3));
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to reach the career assistant right now. Please try again shortly.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open ResuGO Career Chatbot"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-lg transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Career Copilot</span>
        </button>
      )}

      {open && (
        <aside
          aria-label="ResuGO Career Chatbot"
          className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-96 h-[500px] max-h-[80vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                ResuGO Career Copilot
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chatbot"
              className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto bg-teal-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" /> Thinking...
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about skills, ATS, or bullets..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="p-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
