import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  KeyRound,
  Mail,
  UserPlus,
} from 'lucide-react';
import { GoogleSignInButton, ResuGoLogo } from './ResuGoLogo';
import { apiFetch } from '../lib/api';
import {
  formatFirebaseAuthError,
  requestPasswordReset,
  setLocalSessionToken,
  signInWithEmail,
  signUpWithEmail,
} from '../lib/firebase';
import type { NameAnalysisResult } from '../db/schema';

export function AuthPage({
  onGoogleLogin,
  onContinueGuest,
  onSuccess,
  onNavigate,
  embedded = false,
}: {
  onGoogleLogin: () => Promise<void>;
  onContinueGuest: () => void;
  onSuccess: () => Promise<void> | void;
  onNavigate: (path: string) => void;
  embedded?: boolean;
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [nameSoftWarning, setNameSoftWarning] = useState<NameAnalysisResult | null>(null);
  const [nameConfirmed, setNameConfirmed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestSignUp, setSuggestSignUp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const shouldUseServerAuthFallback = (err: any) => {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    return (
      code.includes('operation-not-allowed') ||
      code.includes('unauthorized-domain') ||
      code.includes('configuration-not-found') ||
      code.includes('admin-restricted-operation') ||
      /operation-not-allowed|disabled in Firebase|unauthorized-domain/i.test(msg)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuggestSignUp(false);
    setNotice(null);
    setLoading(true);

    try {
      if (mode === 'reset') {
        try {
          await requestPasswordReset(email.trim());
          setNotice('Password reset instructions sent to your email address.');
        } catch (resetErr: any) {
          if (shouldUseServerAuthFallback(resetErr)) {
            setError(
              'Email password reset is managed locally here. Switch to Sign Up to create a new password or sign in with Google.'
            );
          } else {
            throw resetErr;
          }
        }
      } else if (mode === 'signup') {
        const trimmedName = name.trim();
        const looksSuspicious =
          /\d/.test(trimmedName) ||
          /(.)\1{3,}/i.test(trimmedName) ||
          ['asdf', 'qwerty', 'test user', 'admin', 'unknown', 'xyz'].some((s) =>
            trimmedName.toLowerCase().includes(s)
          );

        if (!nameConfirmed && trimmedName.length > 0 && looksSuspicious) {
          try {
            const nameRes = await apiFetch<{ analysis: NameAnalysisResult }>(
              '/api/names/analyze',
              {
                method: 'POST',
                body: JSON.stringify({
                  rawName: trimmedName,
                  email: email.trim(),
                  save: false,
                }),
              }
            );
            if (nameRes.analysis.validityFlags.length > 0 || nameRes.analysis.duplicateWarning) {
              setNameSoftWarning(nameRes.analysis);
              setLoading(false);
              return;
            }
          } catch {
            // Non-blocking
          }
        }

        const finalName = nameSoftWarning?.normalizedName || trimmedName;
        let signedUpViaServer = false;
        try {
          await signUpWithEmail(finalName, email.trim(), password);
        } catch (fbErr: any) {
          if (!shouldUseServerAuthFallback(fbErr)) {
            throw fbErr;
          }
          const regRes = await apiFetch<{ user: unknown; sessionToken?: string }>(
            '/api/auth/register',
            {
              method: 'POST',
              body: JSON.stringify({
                displayName: finalName,
                email: email.trim(),
                password,
              }),
            }
          );
          if (regRes.sessionToken) {
            setLocalSessionToken(regRes.sessionToken);
          }
          signedUpViaServer = true;
        }

        void apiFetch('/api/names/analyze', {
          method: 'POST',
          body: JSON.stringify({
            rawName: finalName,
            email: email.trim(),
            save: true,
          }),
        }).catch(() => {});

        setNotice(
          signedUpViaServer
            ? 'Account created and signed in! Opening your ResuGO dashboard...'
            : 'Account created! Signed in to your ResuGO workspace.'
        );
        await onSuccess();
      } else {
        try {
          await signInWithEmail(email.trim(), password);
        } catch (fbErr: any) {
          const code = String(fbErr?.code || '');
          const tryServerLogin =
            shouldUseServerAuthFallback(fbErr) ||
            code.includes('invalid-credential') ||
            code.includes('user-not-found') ||
            code.includes('wrong-password');
          if (!tryServerLogin) {
            throw fbErr;
          }
          try {
            const loginRes = await apiFetch<{ user: unknown; sessionToken?: string }>(
              '/api/auth/login',
              {
                method: 'POST',
                body: JSON.stringify({
                  email: email.trim(),
                  password,
                }),
              }
            );
            if (loginRes.sessionToken) {
              setLocalSessionToken(loginRes.sessionToken);
            }
          } catch (serverErr: any) {
            if (serverErr?.code === 'INVALID_CREDENTIALS') {
              setSuggestSignUp(true);
            }
            if (shouldUseServerAuthFallback(fbErr)) {
              throw serverErr;
            }
            throw fbErr;
          }
        }
        await onSuccess();
      }
    } catch (err: any) {
      setError(err?.code ? formatFirebaseAuthError(err) : err?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await onGoogleLogin();
    } catch (err: any) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const card = (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 sm:p-8 shadow-sm">
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <ResuGoLogo />
          <button
            type="button"
            onClick={() => onNavigate('/features')}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            Explore Features
          </button>
        </div>
      )}

        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {mode === 'signin'
            ? 'Sign in to ResuGO'
            : mode === 'signup'
            ? 'Create your ResuGO account'
            : 'Reset your password'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
          Save unlimited gap reports, build custom resumes, and sync with Google Workspace.
        </p>

        <div className="mt-6">
          <GoogleSignInButton
            onClick={handleGoogleClick}
            disabled={loading}
            className="w-full"
          />
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span>or with email</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
              setNameSoftWarning(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === 'signin'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
              setNameSoftWarning(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === 'signup'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('reset');
              setError(null);
              setNameSoftWarning(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === 'reset'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Forgot Password
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 space-y-2"
          >
            <p>{error}</p>
            {suggestSignUp && mode === 'signin' && (
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setSuggestSignUp(false);
                }}
                className="font-semibold underline underline-offset-2 text-teal-700 dark:text-teal-300"
              >
                New here? Switch to Sign Up with this email →
              </button>
            )}
          </div>
        )}
        {notice && (
          <div className="mb-4 p-3 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-xs text-teal-800 dark:text-teal-300">
            {notice}
          </div>
        )}

        {nameSoftWarning && (
          <div className="mb-4 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 space-y-2 text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Name Check Notice
            </p>
            {nameSoftWarning.validityFlags.length > 0 && (
              <p>Flags: {nameSoftWarning.validityFlags.join(' · ')}</p>
            )}
            {nameSoftWarning.duplicateWarning && <p>{nameSoftWarning.duplicateWarning}</p>}
            <p>
              Suggested format: <strong>{nameSoftWarning.normalizedName}</strong>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setName(nameSoftWarning.normalizedName);
                  setNameConfirmed(true);
                  setNameSoftWarning(null);
                }}
                className="px-3 py-1 font-semibold bg-teal-600 text-white rounded"
              >
                Use "{nameSoftWarning.normalizedName}"
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameConfirmed(true);
                  setNameSoftWarning(null);
                }}
                className="px-3 py-1 font-medium border border-amber-400 rounded"
              >
                Keep "{name}" & Continue
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameConfirmed(false);
                }}
                placeholder="e.g. K. Ramesh or Maya Subramanian"
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {mode === 'signin' && <Mail className="w-4 h-4" />}
            {mode === 'signup' && <UserPlus className="w-4 h-4" />}
            {mode === 'reset' && <KeyRound className="w-4 h-4" />}
            <span>
              {loading
                ? 'Signing in...'
                : mode === 'signin'
                ? 'Sign in with Email'
                : mode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </span>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            disabled={loading}
            onClick={onContinueGuest}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <span>Continue as Guest (1 free analysis)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
  );

  if (embedded) {
    return card;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-12 bg-slate-50 dark:bg-slate-950">
      {card}
    </div>
  );
}
