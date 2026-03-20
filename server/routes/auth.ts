/**
 * Auth routes — Wild Apricot OAuth2 authorization-code flow
 *
 * GET  /api/auth/login    — redirect to WA login page
 * GET  /api/auth/callback  — exchange code, create session, redirect to app
 * GET  /api/auth/me        — return current user (or null)
 * POST /api/auth/logout    — clear session cookie
 */

import { Router } from 'express';
import crypto from 'crypto';
import { getLoginUrl, exchangeCode, getUserInfo } from '../services/wild-apricot.js';
import { createSessionToken, optionalAuth } from '../middleware/auth.js';
import type { UserPayload } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function getRedirectUri(req: import('express').Request): string {
  // Use explicit env var in production, fall back to request-based in dev
  if (process.env.AUTH_CALLBACK_URL) {
    return process.env.AUTH_CALLBACK_URL;
  }
  const proto = req.protocol;
  const host = req.get('host') ?? 'localhost:3001';
  return `${proto}://${host}/api/auth/callback`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/login
 * Generate a random CSRF state, store it in a short-lived cookie,
 * and redirect to the Wild Apricot OAuth login page.
 */
router.get('/auth/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');

  // Store state in a cookie so we can validate it on callback
  res.cookie('wa_oauth_state', state, {
    ...COOKIE_OPTS,
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  const redirectUri = getRedirectUri(req);
  const loginUrl = getLoginUrl(state, redirectUri);
  res.redirect(loginUrl);
});

/**
 * GET /api/auth/callback
 * Wild Apricot redirects here with ?code=&state=.
 * Validate state, exchange code for tokens, fetch user info,
 * create a JWT session cookie, and redirect to the app.
 */
router.get('/auth/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const savedState = req.cookies?.wa_oauth_state as string | undefined;

    // Validate CSRF state
    if (!state || !savedState || state !== savedState) {
      res.status(403).json({ error: 'Invalid OAuth state — possible CSRF attack' });
      return;
    }

    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    // Clear the one-time state cookie
    res.clearCookie('wa_oauth_state', { path: '/' });

    // Exchange code for tokens
    const redirectUri = getRedirectUri(req);
    const tokenData = await exchangeCode(code, redirectUri);

    // Extract accountId from permissions array
    const accountId = tokenData.permissions?.[0]?.AccountId;
    if (!accountId) {
      throw new Error('No accountId found in WA token response');
    }

    // Fetch user contact info
    const waUser = await getUserInfo(tokenData.access_token, accountId);

    // Build our session payload
    const payload: UserPayload = {
      userId: waUser.Id,
      email: waUser.Email,
      firstName: waUser.FirstName,
      lastName: waUser.LastName,
      accountId,
      membershipLevel: waUser.MembershipLevel?.Name ?? 'Unknown',
    };

    // Create JWT and set session cookie
    const token = await createSessionToken(payload);
    res.cookie('bb_session', token, {
      ...COOKIE_OPTS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to the app
    res.redirect('/?login=success');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Return the current user payload from the JWT, or { user: null }.
 */
router.get('/auth/me', optionalAuth, (req, res) => {
  res.json({ user: req.user ?? null });
});

/**
 * POST /api/auth/logout
 * Clear the session cookie and return success.
 */
router.post('/auth/logout', (_req, res) => {
  res.clearCookie('bb_session', { ...COOKIE_OPTS });
  res.json({ success: true });
});

export default router;
