# Phase 4 Research: Authentication (Wild Apricot SSO)

## Domain Analysis

### Wild Apricot OAuth2 Flow (Authorization Code)
**Endpoints:**
- Authorization: `https://{org}.wildapricot.org/sys/login/OAuthLogin`
- Token exchange: `POST https://oauth.wildapricot.org/auth/token`
- API base: `https://api.wildapricot.org/v2`
- Logout nonce: `POST /sys/login/logoutnonce`
- Logout redirect: `/sys/login/logout?nonce=<code>`

**Flow:**
1. User clicks "Sign In with HCC" → redirect to Wild Apricot login page
2. User authenticates → WA redirects back with `?code=xxx&state=yyy`
3. Server exchanges code for tokens (POST with Basic auth, client_id:client_secret base64)
4. Server gets access_token (expires_in: 1800s / 30min), refresh_token
5. Server calls WA API to get user contact info
6. Server creates JWT session cookie

**Authorization request params:**
- client_id: from WA authorized app
- redirect_uri: must be in trusted domains list
- scope: `contacts_me` (MUST be this value, others error)
- state: CSRF protection token

**Token exchange:**
- Headers: `Authorization: Basic base64(client_id:client_secret)`, `Content-Type: application/x-www-form-urlencoded`
- Body: `grant_type=authorization_code&code=XXX&client_id=YYY&redirect_uri=ZZZ&scope=contacts_me`

**Token response:**
```json
{
  "access_token": "string",
  "token_type": "Bearer",
  "expires_in": 1800,
  "refresh_token": "string",
  "permissions": [{ "accountId": number, "availableScopes": [...] }]
}
```

**Rate limits:**
- 40 req/min for contact lists
- 120 req/min for contact by ID
- 400 req/min for everything else

### Key Constraint: No CORS
Wild Apricot API does NOT support CORS. All OAuth token exchange and API calls MUST happen server-side. The client cannot talk to WA directly.

### User Info
After SSO, use the access_token with Bearer auth to call:
`GET https://api.wildapricot.org/v2/accounts/{accountId}/contacts/me`
(accountId comes from token response permissions array)

Returns contact object with: Id, FirstName, LastName, Email, MembershipLevel, Status, etc.

## Current Codebase State

### Existing auth: NONE
- No auth middleware, no JWT, no sessions
- No cookie-parser, jsonwebtoken, or jose installed
- Favorites use localStorage only (src/api/hooks.ts useFavorites hook)
- 3 pages: Home.tsx, SearchResults.tsx, CompanyProfile.tsx
- No login/logout UI

### Server structure
- Express with cors(), express.json()
- 6 route modules mounted at /api
- errorHandler middleware
- No cookie middleware

### Dependencies needed
- `jose` (JWT creation/verification - zero-dependency, edge-compatible)
- `cookie-parser` (read httpOnly cookies on server)

## Architecture Decisions

### JWT Strategy
- Use `jose` (not jsonwebtoken) — modern, TypeScript-native, no native bindings
- Sign with HS256 using JWT_SECRET env var
- Store in httpOnly, secure, sameSite=lax cookie named `bb_session`
- 7-day expiry (WA refresh_token handles re-auth)
- JWT payload: { userId, email, firstName, lastName, accountId, membershipLevel }

### Session Flow
1. GET /api/auth/login → redirect to Wild Apricot OAuth
2. GET /api/auth/callback → exchange code, get user info, set JWT cookie, redirect to app
3. GET /api/auth/me → return current user from JWT (no WA API call)
4. POST /api/auth/logout → clear cookie, redirect
5. GET /api/auth/refresh → if JWT expired but has WA refresh_token, re-issue

### Favorites Migration
- When user logs in: merge localStorage favorites into server-side favorites table
- Server stores favorites in SQLite: `user_favorites(userId, companyId, createdAt)`
- Authenticated: read/write via /api/favorites
- Unauthenticated: localStorage fallback (current behavior preserved)

### Protected Routes
- No routes are auth-REQUIRED in v1
- Auth enables: synced favorites, future verification features
- Auth middleware extracts user from cookie but doesn't block requests

## File Plan

### Wave 1: Backend Auth (parallel-safe)
- server/routes/auth.ts — OAuth endpoints (login, callback, me, logout)
- server/middleware/auth.ts — JWT extraction middleware (optionalAuth)
- server/services/wild-apricot.ts — WA token exchange + user info client
- server/routes/favorites.ts — CRUD favorites (authenticated)

### Wave 2: Frontend Auth (depends on Wave 1)
- src/contexts/AuthContext.tsx — AuthProvider, useAuth hook
- src/components/AuthButton.tsx — Login/logout button in navbar
- Update src/api/hooks.ts — useFavorites to sync with server when authenticated
- Update src/components/Navbar.tsx — add AuthButton
