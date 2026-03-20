---
phase: 04-authentication
plan: 02
title: Frontend Auth UI & Favorites Sync
status: complete
commits:
  - b0461af feat(04-02): add AuthContext, AuthAPI, and AuthButton component
  - cbf87b7 feat(04-02): integrate auth UI in navbar, sync favorites with server
requirements_met: [AUTH-01, AUTH-03, AUTH-04, AUTH-05]
---

# Plan 04-02 Summary: Frontend Auth UI & Favorites Sync

## What was built

### Task 1: AuthContext + API client + AuthButton

1. **`src/api/types.ts`** — Added `AuthUser` interface matching the server's `UserPayload` type (userId, email, firstName, lastName, accountId, membershipLevel).

2. **`src/api/api.ts`** — Added two new API clients following the existing pattern:
   - `AuthAPI` — `getLoginUrl()`, `getMe()`, `logout()` with `credentials: 'include'` for cookie auth
   - `FavoritesAPI` — `getAll()`, `add()`, `remove()`, `sync()` for server-backed favorites CRUD
   - Both added to the main `API` export object

3. **`src/contexts/AuthContext.tsx`** — New `AuthProvider` context:
   - On mount: calls `AuthAPI.getMe()` to check for existing session cookie
   - Detects `?login=success` URL param after OAuth callback and refetches user
   - Cleans up the URL param with `replace: true` to avoid re-triggering
   - Provides: `{ user, isAuthenticated, isLoading, login(), logout() }`
   - `login()` does full-page redirect to `/api/auth/login`
   - `logout()` calls the POST endpoint then clears local state

4. **`src/components/AuthButton.tsx`** — Navbar auth button:
   - Loading state: subtle pulse skeleton circle
   - Unauthenticated: gold outline "Sign In" button with LogIn icon (text hidden on mobile)
   - Authenticated: initials avatar circle + chevron dropdown with user name, email, and "Sign Out"
   - Click-outside dismissal for dropdown
   - Dark theme styling consistent with BuildBoard design system

### Task 2: Navbar + Favorites sync + App wiring

1. **`src/components/Navigation.tsx`** — Added `AuthButton` to right side of navbar, grouped with mobile search toggle in a flex container.

2. **`src/api/hooks.ts`** `useFavorites` — Enhanced to dual-mode operation:
   - **Unauthenticated**: keeps existing localStorage behavior (backward compatible)
   - **Authenticated**: uses `FavoritesAPI` with optimistic updates and error rollback
   - **First login sync**: detects localStorage favorites, calls `FavoritesAPI.sync()` to merge them server-side, then clears localStorage (uses `favorites_synced` flag to prevent re-syncing)
   - Transparent switching: components using `useFavorites()` don't need any changes

3. **`src/App.tsx`** — Wrapped `AppContent` with `<AuthProvider>` inside `<Router>` (AuthProvider needs `useSearchParams` for callback detection).

## Verification

- `npx tsc --noEmit` passes with zero errors
- `npm run build` produces production bundle successfully (116 kB app + 334 kB vendor)

## Architecture decisions

- **Cookie-based auth**: `credentials: 'include'` on all auth/favorites requests to send the `bb_session` httpOnly cookie
- **Optimistic updates**: Favorites add/remove update UI immediately, with rollback on server error
- **Sync-once strategy**: localStorage favorites are synced to server only on first authenticated session, tracked via `favorites_synced` localStorage flag
- **AuthProvider placement**: Inside Router but wrapping all routes, so OAuth callback detection works via `useSearchParams`
