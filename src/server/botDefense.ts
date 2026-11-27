import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { checkAttemptLockout, recordLoginAttempt } from '../db/repository.ts';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'throwawaymail.com',
  'sharklasers.com',
  'dispostable.com',
  'maildrop.cc',
  'trashmail.com',
  'getnada.com',
  'temp-mail.org',
  'fakeinbox.com',
  'mintemail.com',
  'mohmal.com',
  'burnermail.io',
]);

function getSigningSecret(): string {
  return (
    process.env.ENCRYPTION_KEY ||
    process.env.GEMINI_API_KEY ||
    'resugo-human-session-secret'
  );
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

export function createAccessibleChallenge(): {
  challengeId: string;
  question: string;
  token: string;
} {
  const a = crypto.randomInt(2, 12);
  const b = crypto.randomInt(1, 9);
  const challengeId = crypto.randomBytes(6).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const payload = `${challengeId}:${a + b}:${expiresAt}`;
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('hex');

  return {
    challengeId,
    question: `What is ${a} + ${b}?`,
    token: `${expiresAt}.${sig}`,
  };
}

export function verifyAccessibleChallenge(
  challengeId: string,
  answer: string,
  token: string
): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const num = Number(String(answer).trim());
  if (!Number.isFinite(num)) return false;

  const expectedPayload = `${challengeId}:${num}:${expiresAt}`;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(expectedPayload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSig, 'hex')
    );
  } catch {
    return false;
  }
}

export function issueHumanSessionCookie(res: Response, identifier: string) {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  const payload = `${identifier}:${expiresAt}`;
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('hex');
  const cookieVal = `${Buffer.from(payload).toString('base64url')}.${sig}`;
  res.cookie('resugo_human_verified', cookieVal, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearHumanSessionCookie(res: Response) {
  res.clearCookie('resugo_human_verified', { path: '/' });
}

export async function verifyHumanSubmission(
  req: Request,
  input: {
    attemptType: 'login' | 'signup' | 'guest' | 'reset';
    email?: string;
    honeypot?: string;
    elapsedMs?: number;
    recaptchaToken?: string;
    recaptchaVersion?: 'v3' | 'v2';
    challengeId?: string;
    challengeAnswer?: string;
    challengeToken?: string;
    deviceId?: string;
  }
): Promise<{
  ok: boolean;
  requireV2Fallback?: boolean;
  score?: number;
  error?: string;
}> {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';
  const identifier = input.email?.toLowerCase().trim() || `${ip}:${input.deviceId || 'web'}`;

  // 1. Check lockout first
  const lockState = await checkAttemptLockout(identifier);
  if (lockState.locked) {
    return {
      ok: false,
      error:
        'Temporary lockout due to repeated failed attempts. Please try again in 15 minutes.',
    };
  }

  // 2. Honeypot field must remain empty
  if (input.honeypot && input.honeypot.trim().length > 0) {
    await recordLoginAttempt({
      identifier,
      ipAddress: ip,
      email: input.email,
      attemptType: input.attemptType,
      success: false,
      reason: 'honeypot_triggered',
    });
    return { ok: false, error: 'Verification failed, try again.' };
  }

  // 3. Time-to-submit bot check (at least 600ms human interaction time)
  if (typeof input.elapsedMs === 'number' && input.elapsedMs < 600) {
    await recordLoginAttempt({
      identifier,
      ipAddress: ip,
      email: input.email,
      attemptType: input.attemptType,
      success: false,
      reason: 'submitted_too_fast',
    });
    return { ok: false, error: 'Verification failed, try again.' };
  }

  // 4. Disposable email domain check
  if (input.email && isDisposableEmail(input.email)) {
    await recordLoginAttempt({
      identifier,
      ipAddress: ip,
      email: input.email,
      attemptType: input.attemptType,
      success: false,
      reason: 'disposable_email',
    });
    return {
      ok: false,
      error: 'Disposable email addresses are not permitted. Please use a real email address.',
    };
  }

  // 5. Google reCAPTCHA v3 / v2 server verification if secret key is configured
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (secretKey && input.recaptchaToken) {
    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: input.recaptchaToken,
        remoteip: ip,
      });
      const verifyRes = await fetch(
        'https://www.google.com/recaptcha/api/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        }
      );
      const verifyJson = (await verifyRes.json()) as {
        success: boolean;
        score?: number;
      };

      if (!verifyJson.success) {
        await recordLoginAttempt({
          identifier,
          ipAddress: ip,
          email: input.email,
          attemptType: input.attemptType,
          success: false,
          reason: 'recaptcha_failed',
        });
        return {
          ok: false,
          requireV2Fallback: input.recaptchaVersion === 'v3',
          error: 'Verification failed, try again.',
        };
      }

      if (
        input.recaptchaVersion === 'v3' &&
        typeof verifyJson.score === 'number' &&
        verifyJson.score < 0.5
      ) {
        return {
          ok: false,
          requireV2Fallback: true,
          score: verifyJson.score,
          error: 'Additional verification required. Complete the checkbox challenge.',
        };
      }

      await recordLoginAttempt({
        identifier,
        ipAddress: ip,
        email: input.email,
        attemptType: input.attemptType,
        success: true,
        captchaScore: String(verifyJson.score ?? 'v2_pass'),
      });
      return { ok: true, score: verifyJson.score ?? 1.0 };
    } catch {
      return { ok: false, error: 'Verification failed, try again.' };
    }
  }

  // 6. Accessible Human Verification Challenge (when reCAPTCHA keys are omitted or chosen for accessibility)
  if (!input.challengeId || !input.challengeAnswer || !input.challengeToken) {
    return {
      ok: false,
      error: 'Please complete the human verification check before continuing.',
    };
  }

  const challengeOk = verifyAccessibleChallenge(
    input.challengeId,
    input.challengeAnswer,
    input.challengeToken
  );

  if (!challengeOk) {
    const nextFailures = lockState.recentFailures + 1;
    await recordLoginAttempt({
      identifier,
      ipAddress: ip,
      email: input.email,
      attemptType: input.attemptType,
      success: false,
      reason: 'challenge_mismatch',
      lockedUntil:
        nextFailures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
    });
    return { ok: false, error: 'Verification failed, try again.' };
  }

  await recordLoginAttempt({
    identifier,
    ipAddress: ip,
    email: input.email,
    attemptType: input.attemptType,
    success: true,
    captchaScore: 'accessible_pass',
  });
  return { ok: true, score: 0.95 };
}
