import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser, getUserByUid } from '../db/repository.ts';

export interface AuthUserRecord {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  canonicalName?: string | null;
  photoUrl: string | null;
  preferredLang: string;
  darkMode: boolean;
  twoFactorEnabled?: boolean;
  jobAlertsEnabled: boolean;
  alertQuery: string | null;
  alertLocation: string | null;
  sessionsRevokedAt?: Date | string | null;
}

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: AuthUserRecord;
  guestSessionId?: string;
}

function getHumanSecret(): string {
  return (
    process.env.ENCRYPTION_KEY ||
    process.env.GEMINI_API_KEY ||
    'resugo-human-session-secret'
  );
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

export function createSignedSessionToken(uid: string): string {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 7 * 24 * 60 * 60 * 1000;
  const payload = `${uid}:${issuedAt}:${expiresAt}`;
  const sig = crypto
    .createHmac('sha256', getHumanSecret())
    .update(payload)
    .digest('hex');
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
}

export function verifySignedSessionToken(raw: string): { uid: string; issuedAt: number } | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  try {
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const segments = payload.split(':');
    if (segments.length !== 3) return null;
    const [uid, issuedStr, expiresStr] = segments;
    const issuedAt = Number(issuedStr);
    const expiresAt = Number(expiresStr);
    if (!uid || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return null;
    }
    const expectedSig = crypto
      .createHmac('sha256', getHumanSecret())
      .update(payload)
      .digest('hex');
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return null;
    }
    return { uid, issuedAt };
  } catch {
    return null;
  }
}

export function isHttpsRequest(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === 'production';
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || proto.includes('https') || process.env.NODE_ENV === 'production';
}

export function issueAuthSessionCookie(res: Response, uid: string, req?: Request): string {
  const cookieVal = createSignedSessionToken(uid);
  const secure = isHttpsRequest(req);
  res.cookie('resugo_session', cookieVal, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return cookieVal;
}

export function clearAuthSessionCookie(res: Response, req?: Request) {
  const secure = isHttpsRequest(req);
  res.clearCookie('resugo_session', {
    path: '/',
    sameSite: secure ? 'none' : 'lax',
    secure,
  });
}

function verifySessionCookie(req: Request): { uid: string; issuedAt: number } | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies['resugo_session'];
  if (!raw) return null;
  return verifySignedSessionToken(raw);
}

export function hasValidHumanCookie(req: Request): boolean {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies['resugo_human_verified'];
  if (!raw) return false;
  const parts = raw.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  try {
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const lastColon = payload.lastIndexOf(':');
    if (lastColon === -1) return false;
    const expiresAt = Number(payload.slice(lastColon + 1));
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
    const expectedSig = crypto
      .createHmac('sha256', getHumanSecret())
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSig, 'hex')
    );
  } catch {
    return false;
  }
}

function isTokenRevokedByUser(
  authTimeMs: number,
  sessionsRevokedAt?: Date | string | null
): boolean {
  if (!sessionsRevokedAt) return false;
  const revokedMs = new Date(sessionsRevokedAt).getTime();
  return Number.isFinite(revokedMs) && authTimeMs > 0 && authTimeMs < revokedMs - 2000;
}

function sanitizeDbUser(dbUser: any): AuthUserRecord {
  const { twoFactorSecret: _tf, passwordHash: _pw, ...safe } = dbUser;
  return safe as AuthUserRecord;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1].trim();
    if (token.startsWith('local:')) {
      const session = verifySignedSessionToken(token.slice('local:'.length));
      if (session) {
        const dbUser = await getUserByUid(session.uid);
        if (dbUser) {
          if (isTokenRevokedByUser(session.issuedAt, dbUser.sessionsRevokedAt)) {
            clearAuthSessionCookie(res, req);
            return res.status(401).json({
              code: 'SESSION_REVOKED',
              error: 'This session was signed out from all devices. Please sign in again.',
            });
          }
          req.dbUser = sanitizeDbUser(dbUser);
          return next();
        }
      }
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
    }

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      const dbUser = await getOrCreateUser({
        uid: decodedToken.uid,
        email: decodedToken.email || `${decodedToken.uid}@resugo.app`,
        displayName: decodedToken.name || null,
        photoUrl: decodedToken.picture || null,
      });

      if (isTokenRevokedByUser((decodedToken.auth_time || 0) * 1000, dbUser.sessionsRevokedAt)) {
        return res.status(401).json({
          code: 'SESSION_REVOKED',
          error: 'This session was signed out from all devices. Please sign in again.',
        });
      }

      req.firebaseUser = decodedToken;
      req.dbUser = sanitizeDbUser(dbUser);
      return next();
    } catch (error) {
      console.error('Error verifying Firebase ID token:', error);
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
    }
  }

  // Fallback to signed httpOnly cookie session (email/password accounts)
  const session = verifySessionCookie(req);
  if (session) {
    const dbUser = await getUserByUid(session.uid);
    if (dbUser) {
      if (isTokenRevokedByUser(session.issuedAt, dbUser.sessionsRevokedAt)) {
        clearAuthSessionCookie(res, req);
        return res.status(401).json({
          code: 'SESSION_REVOKED',
          error: 'This session was signed out from all devices. Please sign in again.',
        });
      }
      req.dbUser = sanitizeDbUser(dbUser);
      return next();
    }
  }

  return res.status(401).json({ error: 'Unauthorized: Please sign in to continue.' });
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const guestHeader = req.headers['x-guest-session'];
  if (typeof guestHeader === 'string' && guestHeader.trim().length > 0) {
    req.guestSessionId = guestHeader.trim().slice(0, 128);
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1].trim();
    if (token.startsWith('local:')) {
      const session = verifySignedSessionToken(token.slice('local:'.length));
      if (session) {
        const dbUser = await getUserByUid(session.uid);
        if (dbUser && !isTokenRevokedByUser(session.issuedAt, dbUser.sessionsRevokedAt)) {
          req.dbUser = sanitizeDbUser(dbUser);
          return next();
        }
      }
    } else {
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        const dbUser = await getOrCreateUser({
          uid: decodedToken.uid,
          email: decodedToken.email || `${decodedToken.uid}@resugo.app`,
          displayName: decodedToken.name || null,
          photoUrl: decodedToken.picture || null,
        });

        if (!isTokenRevokedByUser((decodedToken.auth_time || 0) * 1000, dbUser.sessionsRevokedAt)) {
          req.firebaseUser = decodedToken;
          req.dbUser = sanitizeDbUser(dbUser);
          return next();
        }
      } catch {
        // Allow fallback to session cookie or guest session
      }
    }
  }

  const session = verifySessionCookie(req);
  if (session) {
    const dbUser = await getUserByUid(session.uid);
    if (dbUser && !isTokenRevokedByUser(session.issuedAt, dbUser.sessionsRevokedAt)) {
      req.dbUser = sanitizeDbUser(dbUser);
    }
  }
  next();
};

const rateStore = new Map<string, number[]>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const identifier =
      req.dbUser?.uid ||
      req.guestSessionId ||
      req.ip ||
      'anonymous';
    const key = `${req.path}:${identifier}`;
    const now = Date.now();
    const timestamps = (rateStore.get(key) || []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit reached. Please wait a minute before running another request.',
      });
    }

    timestamps.push(now);
    rateStore.set(key, timestamps);
    next();
  };
}
