# Architecture

**Analysis Date:** 2026-03-16

## Pattern Overview

**Overall:** Multi-layered full-stack SPA with React frontend + Express backend, SQLite persistence, and content-rail UI pattern

**Key Characteristics:**
- **Frontend:** React 18 with React Router SPA (Vite dev server, static builds to `/dist`)
- **Backend:** Express 5 with Drizzle ORM + better-sqlite3, FTS5 full-text search, background enrichment pipelines
- **Data:** SQLite with real-time enrichment (Yelp, CSLB, Google Maps, state licenses)
- **UI:** White canvas background (#ffffff) with dark cards, gold accents (#F5C518), horizontal scroll rails
- **State:** Custom React hooks with localStorage fallback + server-backed favorites
- **Auth:** Wild Apricot SSO (optional; JWT cookies) + local admin secret (dev-only)

## Layers

**Presentation Layer (React Components):**
- Purpose: Render UI, handle user interactions, manage visual state
- Location: `src/components/`
- Contains: CompanyCard (white card w/ gold top-bar hover), Top10Card (dark card w/ stroke rank), ContentRail (horizontal scroll), HeroBanner (video hero), Navigation, Footer, PreviewPopup, DetailModal, FilterChips, and specialized cards
- Depends on: API hooks from `src/api/hooks.ts`, types from `src/api/types.ts`, Tailwind CSS, lucide-react icons
- Used by: Pages and other components

**Page Layer (Route-level Components):**
- Purpose: Compose components into full pages, orchestrate data fetching and routing logic
- Location: `src/pages/`
- Contains: Home (hero + category rails + Top 10 + featured sections), SearchResults (filterable grid), CompanyProfile (detail view), Admin (sync/enrich monitoring), EditProfile (company self-edit), NotFound
- Depends on: Components, API hooks, React Router
- Used by: `src/App.tsx` router

**Layout Layer:**
- Purpose: Shared page structure and global navigation
- Location: `src/layouts/MainLayout.tsx`
- Contains: Navigation (with search bar moved from hero), Footer, ScrollProgress, content wrapper
- Depends on: Navigation, Footer, ScrollProgress components
- Used by: `src/App.tsx` wrapper

**API Client Layer:**
- Purpose: Type-safe fetch wrappers, HTTP error handling, module-level caching
- Location: `src/api/api.ts`
- Contains: Namespace API objects (CompanyAPI, CategoryAPI, FavoritesAPI, AdminAPI, AuthAPI, etc.), module-level filterOptionsCache, fetchJSON helper
- Depends on: Fetch API, types in `src/api/types.ts`
- Used by: Custom hooks in `src/api/hooks.ts`

**Business Logic (Frontend Hooks):**
- Purpose: Data fetching, pagination, filtering, search, state management, favorites lifecycle
- Location: `src/api/hooks.ts` (~1000 lines)
- Contains: useCompanies (paginated + filterable), useTopRatedCompanies, useCategoryCompanies, useStateCompanies, useSearch (with debounce), useFavorites (hybrid localStorage/server), useRecentlyViewed, useLocalStorage, CATEGORY_CONFIG, TOP_STATES, category/state batch fetchers
- Depends on: API client, React hooks (useState, useEffect, useRef, useCallback)
- Used by: Pages (Home, SearchResults, CompanyProfile) and components

**Routing & App Shell:**
- Purpose: React Router setup, lazy loading, context providers
- Location: `src/App.tsx`, `src/main.tsx`
- Contains: Router definition, route paths (/search, /company/:id, /admin, /company/:id/edit, 404), lazy-loaded Admin/EditProfile with Suspense fallbacks, AuthProvider + GuidedSearchProvider wrapping
- Depends on: React Router v6, contexts
- Used by: Index.html entry point

**Context Providers:**
- Purpose: Global application state and side effects
- Location: `src/contexts/`
- Contains: AuthContext (isAuthenticated, user, login/logout), GuidedSearchContext (wizard state)
- Depends on: React hooks, API client
- Used by: App.tsx and components needing user info or search state

**Express Backend Server:**
- Purpose: REST API serving company data, search, auth, admin operations
- Location: `server/index.ts` (main entry)
- Contains: CORS setup (configurable origins), middleware chain (optionalAuth, errorHandler), route mounting at `/api/*`, FTS5 lazy initialization, schema migrations (background), sitemap generation
- Depends on: Express 5, Drizzle ORM, better-sqlite3, dotenv
- Used by: Frontend via fetch; external pipelines via direct DB calls

**Route Handlers:**
- Purpose: HTTP endpoint logic for data access, mutations, admin tasks
- Location: `server/routes/` (index.ts mounts all)
- Contains:
  - `companies.ts` - GET paginated/filtered companies (Drizzle + WHERE clause builder)
  - `search.ts` - FTS5 search with LIKE fallback
  - `categories.ts` - List categories with company counts
  - `favorites.ts` - CRUD for authenticated user favorites (protected by optionalAuth)
  - `auth.ts` - Login redirect (Wild Apricot), logout, /me endpoint
  - `admin.ts` - Sync/enrich triggers, status polling, verification status, data quality
  - `profile.ts` - Company self-edit, media upload/delete
  - `ai-search.ts` - Gemini API with fallback parser
- Depends on: Express Router, Drizzle ORM, db.ts
- Used by: Express app (mounted at `/api`)

**Database Layer:**
- Purpose: SQLite connection management, schema definitions, migrations
- Location: `server/db.ts`, `server/schema.ts`
- Contains: Drizzle db instance (sqlite3 dialect), companies table schema (100+ fields including enriched data), googlePlacesCache table, migration runner
- Depends on: Drizzle ORM, better-sqlite3, drizzle-kit
- Used by: All route handlers and enrichment pipelines

**Enrichment Pipelines:**
- Purpose: Background workers syncing external data into database
- Location: `server/pipelines/` (background runners), `server/scripts/` (manual CLI)
- Contains:
  - `yelpSync.ts` - Yelp Fusion API → companies table (insert/update), batched
  - `yelpEnrich.ts` - Match existing CSLB records to Yelp, enrich with rating/photo
  - `cslbSync.ts` - State CSLB database → companies (license status, bond, insurance)
  - `stateLicenseSync.ts` - Multi-state license scraping (Firecrawl + manual parsing)
  - `gmapsEnrich.ts` - Google Maps geocoding + photo caching
  - `domainUtils.ts` - Domain guessing and validation helpers
- Depends on: Axios, external APIs (Yelp, Google, Firecrawl), db.ts, helpers
- Used by: Admin endpoints (background triggers), cron jobs, manual script runs

**Search Services:**
- Purpose: Full-text search implementation and fallback parsing
- Location: `server/services/fts5.ts`, `server/services/gemini-search.ts`
- Contains: FTS5 index init/rebuild (lazy on startup), query builder, Gemini API wrapper with fallback parser (regex-based NLP)
- Depends on: better-sqlite3, @google/genai SDK
- Used by: search.ts and ai-search.ts routes

**Middleware & Error Handling:**
- Purpose: HTTP request processing, authentication, error responses
- Location: `server/middleware/`
- Contains: optionalAuth (JWT cookie extraction via jose), errorHandler (500 responses with logging)
- Depends on: Express, jose (JWT library)
- Used by: Express app (global middleware chain)

**Admin & Data Quality Services:**
- Purpose: Status tracking, verification workflow, data purge, enrichment monitoring
- Location: `server/routes/admin.ts`, `server/services/`
- Contains: Yelp/state-license sync status service, verification badge state machine, FTS rebuild progress, data quality aggregation
- Depends on: Routes, database, pipelines, services
- Used by: Admin.tsx page (UI) via AdminAPI client

## Data Flow

**Homepage Load:**
1. User navigates to `/` → App.tsx routes to Home.tsx
2. Home.tsx mounts with optional category filter from URL params (`?category=X`)
3. Three parallel hook chains fire with batching (100ms gaps to prevent Windows port exhaustion):
   - `useTopRatedCompanies(20)` → API.companies.getTopRated(20) → `/api/top-rated` → server SQL: `SELECT * FROM companies ORDER BY rating DESC LIMIT 20`
   - `useCategoryCompanies(15)` → batches CATEGORY_CONFIG (9 curated categories) in groups of 3, each calls API.companies.getByCategory(cat, 15) → `/api/companies?category=X&limit=15&sort=rating_desc`
   - `useStateCompanies(15)` → batches TOP_STATES (6 states) in groups of 3, each calls API.companies.getByState(state, 15)
4. Server returns Company[] via parseRow helper (converts DB row to typed object)
5. Home.tsx renders:
   - HeroBanner (rotating video carousel with trade-word overlays, no search bar)
   - CategoryRail (5-column grid with images, horizontal scroll, scroll arrows)
   - Top10Section (hardcoded array of 10 general contractors with overlapping stroke numbers)
   - ContentRail sections for each category + state
   - "Are You a Contractor?" CTA section (mailto link)

**Search Flow:**
1. User types in Navigation header search bar and submits
2. Navigation.handleSearch callback navigates to `/search?q=<query>&sort=<selected>&page=1`
3. SearchResults.tsx reads URL params via useSearchParams
4. useCompanies hook called with { searchQuery: query, ...otherFilters }
5. API.companies.getAll() → `/api/companies?search=<query>&sort=<sort>&page=<page>&limit=<limit>`
6. Backend search handler checks if FTS5 ready (isFtsReady()):
   - If yes: FTS5 query against companies_fts (name, category, subCategory, specialties columns)
   - If no: Falls back to LIKE (businessName, category, city, state)
7. Results display in grid with FilterChips sidebar (category, state, rating dropdowns), sort dropdown, pagination
8. Each result is CompanyCard or custom card variant

**Company Detail Flow:**
1. User clicks CompanyCard/Top10Card link → navigates to `/company/<id>`
2. CompanyProfile.tsx mounts, calls useCompany({ id })
3. API.companies.getById(id) → `/api/companies/<id>`
4. Server queries companies table by PRIMARY KEY, returns single Company
5. Company object includes enriched fields: imageUrl, rating, subCategory, specialties, yearsInBusiness, licenseStatus, licenseExpiry, bondAmount, insuranceVerified, backgroundCheck, responseTime, dataSource
6. Detail view renders:
   - CompanyImage (Yelp photo or fallback category image)
   - Name + rating stars + verification badge (if verificationStatus = 'verified' or 'hcc_member')
   - Contact section (phone, email, website, hours, location map)
   - Services + certifications + specialties
   - License info (status, type, expiry, bond, insurance)
   - Reviews section (if available)
   - Similar companies via useSimilarCompanies hook (6 results)
   - Claim/Edit button (auth-gated)

**Authentication & Favorites:**
1. User clicks AuthButton → window.location = API.auth.getLoginUrl() → `/api/auth/login`
2. Backend redirects to Wild Apricot SSO (if WA_CLIENT_ID set), verifies callback JWT, sets httpOnly jwt cookie, redirects to `/`
3. AuthContext useEffect (on mount + dependency) polls `/api/auth/me` with credentials: include
4. optionalAuth middleware extracts jwt cookie, verifies with jose, sets req.user (or undefined if no cookie)
5. /api/auth/me endpoint returns { user: AuthUser | null }
6. AuthContext updates isAuthenticated + user state
7. useFavorites hook detects isAuthenticated change:
   - If false→true: Syncs localStorage favorites to server (FavoritesAPI.sync(ids)), clears localStorage, loads server favorites (FavoritesAPI.getAll), sets serverLoaded=true
   - If true→false: Clears server state, falls back to localStorage
8. CompanyCard favorite button calls toggleFavorite(id):
   - If using server: Optimistic update on setServerFavorites, POST/DELETE `/api/favorites/<id>`, rollback on error
   - If using localStorage: Direct setState to useLocalStorage

**Enrichment Trigger Flow (Admin):**
1. Admin user clicks "Start Yelp Sync" in Admin.tsx
2. AdminAPI.startYelpSync() → POST `/api/admin/sync-yelp`
3. Backend routes/admin.ts handler calls background trigger (not awaited), returns immediately { status: 'idle', message: 'sync started' }
4. Background script (e.g., yelpSync.ts) runs independently, polls Yelp API, inserts/updates companies table
5. Admin.tsx polls AdminAPI.getSyncStatus() → GET `/api/admin/sync-status` to show progress bar
6. On completion, data available in subsequent searches

## State Management

**Frontend State:**
- **React useState/useRef:** Page-level hooks manage data, isLoading, isError, pagination (page, limit), sort option
- **localStorage:** useFavorites (unauthenticated), useRecentlyViewed, future theme preference
- **Server-backed:** Authenticated user's favorites synced to `/api/favorites` endpoints
- **Context:** AuthContext (global user + login/logout), GuidedSearchContext (guided search wizard state)
- **URL params:** SearchResults page uses query params as source of truth (q, category, state, sort, page)

**Backend State:**
- **Database (SQLite):** Companies table is source of truth for all directory data
- **Enrichment status:** Global in-memory state (not persisted) updated by background scripts, polled by admin endpoints
- **Cache:** Module-level filterOptionsCache in api.ts (categories + states), fetched once per app session

## Key Abstractions

**Company Data Type:**
- Purpose: Core domain entity representing a construction contractor
- Examples: `src/api/types.ts` (Company interface), `server/schema.ts` (Drizzle companies table)
- Pattern: Read from SQLite via Drizzle, serialized to JSON via parseRow helper, typed on both client/server

**API Client Object Pattern:**
- Purpose: Organize endpoints by domain, provide type-safe methods
- Examples: CompanyAPI, CategoryAPI, FavoritesAPI, AdminAPI, AuthAPI in `src/api/api.ts`
- Pattern: Static/async methods, module-level caching, fetch-based error handling

**React Hook Composition:**
- Purpose: Encapsulate data fetching, pagination, filtering, state management
- Examples: useCompanies (paginated + filterable), useTopRatedCompanies (simple list + limit), useFavorites (hybrid localStorage/server), useSearch (debounced input)
- Pattern: Returns { data, isLoading, isError, error, refetch, ...domain-specific helpers }

**Content Rail Component:**
- Purpose: Horizontal scroll container with optional scroll arrows, lazy loading, empty states
- Examples: `src/components/ContentRail.tsx` (reusable for categories, states, featured, Top 10)
- Pattern: Accepts companies[], title, flags (isTop10, exploreCategory); manages scroll state internally via ref + checkScroll effect; renders CompanyCard or Top10Card

**Card Variants:**
- Purpose: Different visual representations of Company data
- Examples: CompanyCard (white, 185px fixed, gold top-bar hover), Top10Card (dark, overlapping stroke rank)
- Pattern: Accept Company + metadata (index, rank, fill flag); render image + stars + title + details

**FTS5 Search Index:**
- Purpose: Fast full-text search over company name, category, address, specialties
- Examples: `server/services/fts5.ts`
- Pattern: Lazy-initialized on server startup (setTimeout 0), async rebuild via admin endpoint, automatic fallback to LIKE if not ready

**Enrichment Pipeline Pattern:**
- Purpose: Background syncing of external data (Yelp, CSLB, Google Maps, state licenses)
- Examples: yelpSync.ts, cslbSync.ts, gmapsEnrich.ts, stateLicenseSync.ts
- Pattern: Admin endpoint returns immediately, background script runs independently with status tracking (global service state), admin UI polls for progress

**Batch Fetcher Pattern:**
- Purpose: Prevent Windows TCP port exhaustion by grouping requests with delays
- Examples: fetchInBatches in hooks.ts (used by useCategoryCompanies, useStateCompanies)
- Pattern: Loop in batches (default 3), await Promise.all per batch, 100ms delay between batches, per-item try/catch for graceful partial load

## Entry Points

**Frontend App:**
- Location: `src/main.tsx`
- Triggers: Browser loads `/` (production) or dev server HMR (npm run dev)
- Responsibilities: Mount React app to #root, initialize Router + AuthProvider + GuidedSearchProvider

**Express Server:**
- Location: `server/index.ts`
- Triggers: npm start (dev/prod), NODE_ENV=production, or VERCEL=1 (serverless)
- Responsibilities: Set up Express + middleware, mount route handlers, initialize database, background schema migrations/FTS indexing, serve static frontend (production only), setup CORS with configurable origins

**Homepage:**
- Location: `src/pages/Home.tsx`
- Triggers: User navigates to `/` or `/` (matches root route in App.tsx)
- Responsibilities: Render hero banner, category/state/featured rails, fetch data via hooks, handle category filter from URL params, render CTA section

**Search Results:**
- Location: `src/pages/SearchResults.tsx`
- Triggers: User submits search or navigates to `/search?q=...&category=...&state=...&sort=...`
- Responsibilities: Parse URL params, fetch paginated filtered results, render grid + sidebar + controls, support sort/pagination/filtering

**Company Profile:**
- Location: `src/pages/CompanyProfile.tsx`
- Triggers: User clicks card or navigates to `/company/<id>`
- Responsibilities: Fetch company detail, render full profile + enriched data, show similar companies, handle favorite toggle, show claim/edit button (if owner)

**Admin Dashboard:**
- Location: `src/pages/Admin.tsx` (lazy-loaded)
- Triggers: Navigation to `/admin` (auth-gated if ADMIN_EMAILS set)
- Responsibilities: Trigger Yelp/state-license syncs, poll enrichment status, display data quality stats, manage verification badges

**Company Edit Profile:**
- Location: `src/pages/EditProfile.tsx` (lazy-loaded)
- Triggers: Navigation to `/company/<id>/edit` (auth-required)
- Responsibilities: Load company data, render edit form, handle media uploads (ProfileAPI), save changes

## Error Handling

**Strategy:** Graceful degradation with fallback modes and local error states

**Patterns:**
- **API failures:** Hooks set isError + error state, components show error toast or empty state
- **FTS unavailable:** Server automatically falls back to LIKE queries (no client changes needed)
- **Enrichment failures:** Per-item try/catch in batched hooks allows partial load (e.g., 2 of 3 category rails load)
- **Server 500:** errorHandler middleware catches exceptions, logs to console, returns { error: 'message' } JSON
- **Missing features:** AI search gracefully degrades to regex parser if Gemini SDK missing, API key absent, or rate-limited
- **Search timeout:** Fetch operations will timeout after 30s (browser default), user sees error state
- **Network offline:** Favorites fall back to localStorage; search shows error
- **ErrorBoundary:** Present (src/components/ErrorBoundary.tsx) for fatal React errors

## Cross-Cutting Concerns

**Logging:**
- Frontend: console.warn/error in catch blocks, mostly silent in success paths
- Backend: console.log for startup status (FTS5, AI search availability, auth config), console.error for exceptions logged to stdout

**Validation:**
- Frontend: TS strict mode prevents most issues; form components validate before submission
- Backend: Route handlers parse/coerce query params (parseInt with fallbacks), clamp page/limit with Math.min/Math.max, Drizzle ORM prevents SQL injection

**Authentication:**
- Frontend: AuthContext manages user state, checks isAuthenticated before rendering admin/edit routes
- Backend: optionalAuth middleware extracts JWT from httpOnly cookie, verifies with jose, sets req.user; admin endpoints check ADMIN_EMAILS env var

**Caching:**
- Frontend: Module-level filterOptionsCache (categories + states fetched once), no HTTP cache headers
- Backend: SQLite indexes on (category, state, rating), FTS5 index (built once), no Redis cache

**Performance:**
- Frontend: Code splitting (vendor, animation chunks in Vite), lazy-loaded Admin/EditProfile routes, image lazy loading, smooth scroll
- Backend: SQLite LIMIT/OFFSET pagination, Drizzle compiled queries, FTS5 for text search, batched category/state fetches (100ms delays)

**CORS:**
- Frontend: Vite dev server proxies `/api` to http://localhost:3001
- Backend: CORS configured to allow origins from `CORS_ORIGINS` env var (default: localhost:5173, localhost:3000), credentials: true for cookies

---

*Architecture analysis: 2026-03-16*
