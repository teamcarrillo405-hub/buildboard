/**
 * JWT authentication middleware (jose / HS256)
 *
 * - Reads the `bb_session` httpOnly cookie set during OAuth callback
 * - optionalAuth: populates req.user if valid, continues silently if not
 * - requireAuth: returns 401 when no valid token is present
 * - createSessionToken: signs a new JWT with 7-day expiry
 */

import { SignJWT, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserPayload {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  accountId: number;
  membershipLevel: string;
}

// Module augmentation so req.user is typed across the app
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'bb_session';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing required env var: JWT_SECRET');
  return new TextEncoder().encode(secret);
}

async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    return payload as unknown as UserPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a signed JWT session token (HS256, 7-day expiry).
 */
export async function createSessionToken(payload: UserPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

/**
 * Middleware: extract user from bb_session cookie.
 * Sets req.user if valid; continues silently when absent / invalid.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (token) {
      const user = await verifyToken(token);
      if (user) req.user = user;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: require a valid session AND admin email.
 * Returns 401 if not authenticated, 403 if not an admin.
 * Admin check uses the ADMIN_EMAILS env var (comma-separated list).
 */
export async function isAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Fast-path: ADMIN_SECRET bearer token (no SSO required — for local/dev use)
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const authHeader = req.headers.authorization as string | undefined;
    const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (provided && provided === adminSecret) {
      req.user = { userId: 0, email: 'admin@local', firstName: 'Admin', lastName: '', accountId: 0, membershipLevel: 'admin' };
      next();
      return;
    }
  }

  // Standard path: JWT session cookie
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.user = user;

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0 || !adminEmails.includes(user.email.toLowerCase())) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Middleware: require a valid session. Returns 401 when missing.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.user = user;
  next();
}
