---
phase: 04-authentication
plan: 01
title: Wild Apricot OAuth Backend & Favorites API
status: complete
---

# Plan 04-01 Summary: Wild Apricot OAuth Backend & Favorites API

## Commits

1. `e8ce514` — feat(04-01): add Wild Apricot OAuth service and JWT auth middleware
2. `b83f572` — feat(04-01): add auth routes, favorites CRUD, and server wiring

## Files Created

- `server/services/wild-apricot.ts` — OAuth client (getLoginUrl, exchangeCode, getUserInfo)
- `server/middleware/auth.ts` — JWT middleware (optionalAuth, requireAuth, createSessionToken)
- `server/routes/auth.ts` — OAuth endpoints (login, callback, me, logout)
- `server/routes/favorites.ts` — Favorites CRUD (GET, POST, DELETE, sync)

## Files Modified

- `server/index.ts` — added cookie-parser, optionalAuth global middleware, mounted auth + favorites routers, auth status log
- `package.json` / `package-lock.json` — added jose, cookie-parser, @types/cookie-parser
- `.env` — added placeholder WA_CLIENT_ID, WA_CLIENT_SECRET, WA_ACCOUNT_URL, JWT_SECRET (gitignored)

## Requirements Covered

| Requirement | Description | Status |
|---|---|---|
| AUTH-01 | Wild Apricot OAuth2 authorization-code flow (server-side) | Done |
| AUTH-02 | JWT session management (HS256 via jose, httpOnly cookie) | Done |
| AUTH-03 | optionalAuth middleware (non-blocking user extraction) | Done |
| AUTH-04 | requireAuth middleware (401 on missing/invalid token) | Done |
| AUTH-05 | Favorites CRUD with localStorage sync endpoint | Done |

## Architecture Notes

- All Wild Apricot communication is server-side (no CORS support from WA API)
- Token exchange uses HTTP Basic auth with base64(client_id:client_secret)
- JWT stored in `bb_session` httpOnly cookie (secure in prod, sameSite=lax, 7-day expiry)
- Favorites table uses raw better-sqlite3 (consistent with FTS5 pattern, not Drizzle)
- `user_favorites` table created idempotently on module load via CREATE TABLE IF NOT EXISTS
- CSRF protection via random state cookie during OAuth flow
- Prepared statements reused for favorites queries (performance)

## Verification

- `npx tsc --noEmit` passes
- `npm run build` (tsc + vite build) succeeds
