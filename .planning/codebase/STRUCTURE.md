# Codebase Structure

**Analysis Date:** 2026-03-16

## Directory Layout

```
constructflix/
├── .planning/              # GSD planning documents
│   └── codebase/           # Codebase analysis (this file)
├── .superpowers/           # External tooling brainstorm
├── docs/                   # Documentation and specs
├── data/                   # Static data files
├── server/                 # Backend Express API (Drizzle + SQLite)
│   ├── index.ts            # Express entry point (routes, middleware, migrations)
│   ├── db.ts               # Drizzle ORM setup
│   ├── schema.ts           # Drizzle table definitions
│   ├── routes/             # API endpoint handlers
│   │   ├── companies.ts    # GET companies (paginated, filtered, sorted)
│   │   ├── search.ts       # FTS5 + LIKE search
│   │   ├── categories.ts   # GET categories with counts
│   │   ├── favorites.ts    # CRUD authenticated favorites
│   │   ├── auth.ts         # Login/logout/me endpoints (Wild Apricot SSO)
│   │   ├── admin.ts        # Sync/enrich triggers, status, data quality
│   │   ├── profile.ts      # Company self-edit, media upload/delete
│   │   └── ai-search.ts    # Gemini API with fallback parser
│   ├── middleware/         # Express middleware
│   │   ├── auth.ts         # optionalAuth (JWT cookie extraction)
│   │   └── errorHandler.ts # Global error handling
│   ├── services/           # Business logic services
│   │   ├── fts5.ts         # FTS5 index init/rebuild
│   │   ├── gemini-search.ts # Gemini API wrapper + fallback parser
│   │   ├── verification.ts # Verification badge schema
│   │   └── media.ts        # Media table management
│   ├── pipelines/          # Background enrichment workers
│   │   ├── yelpSync.ts     # Yelp Fusion API sync
│   │   ├── yelpEnrich.ts   # Match CSLB to Yelp, enrich with rating/photo
│   │   ├── cslbSync.ts     # State CSLB license data import
│   │   ├── stateLicenseSync.ts # Multi-state license scraping
│   │   ├── gmapsEnrich.ts  # Google Maps geocoding
│   │   └── domainUtils.ts  # Domain guessing helpers
│   ├── scripts/            # CLI scripts for maintenance/data ops
│   │   ├── build-fts5-index.ts
│   │   ├── enrichWorker.ts # Batch enrichment runner
│   │   ├── enrichStatus.ts # Check enrichment progress
│   │   ├── enrichLaunch.ts # Trigger enrichment
│   │   └── [30+ more scripts for syncs/imports/geocoding]
│   ├── helpers/            # Utility functions
│   │   ├── parseRow.ts     # Convert DB row to typed Company
│   │   ├── parseChat.ts    # NLP parsing for chat queries
│   │   └── categoryMatcher.ts # Category name normalization
│   ├── migrations/         # Database migrations (Drizzle managed)
│   ├── data/               # Static data (category maps, license configs)
│   │   ├── categoryImages.ts # Category → image URL map
│   │   ├── yelpCategoryMap.ts # Map Yelp categories to internal schema
│   │   └── stateLicenseConfigs.ts # Per-state scrape configs
│   ├── constructflix.db    # SQLite database (generated, not committed)
│   ├── constructflix.db-shm # SQLite shared memory (not committed)
│   ├── constructflix.db-wal # SQLite write-ahead log (not committed)
│   └── api.js              # Legacy API file (DO NOT USE - main logic in index.ts)
├── src/                    # Frontend React application
│   ├── api/                # API client layer
│   │   ├── api.ts          # HTTP client (CompanyAPI, CategoryAPI, AuthAPI, AdminAPI, FavoritesAPI, etc.)
│   │   ├── hooks.ts        # Custom React hooks (useCompanies, useTopRatedCompanies, useFavorites, etc.)
│   │   ├── types.ts        # TypeScript interfaces (Company, Category, Location, CompanyFilters, etc.)
│   │   └── filters.ts      # Client-side filter/sort utilities (mostly unused, filtering server-side)
│   ├── components/         # Reusable UI components
│   │   ├── CompanyCard.tsx       # White card, 185px fixed width, gold top-bar hover
│   │   ├── Top10Card.tsx         # Dark card with overlapping stroke rank number
│   │   ├── ContentRail.tsx       # Horizontal scroll container with arrows
│   │   ├── HeroBanner.tsx        # Video carousel with trade-word overlays
│   │   ├── Navigation.tsx        # Top navbar with search bar (moved from hero)
│   │   ├── CompanyImage.tsx      # Image with fallback to category photo
│   │   ├── PreviewPopup.tsx      # Hover preview popup
│   │   ├── DetailModal.tsx       # Full-screen detail modal (legacy)
│   │   ├── Footer.tsx            # Site footer
│   │   ├── ScrollProgress.tsx    # Gold progress bar
│   │   ├── VerificationBadge.tsx # Verification status indicator
│   │   ├── FilterChips.tsx       # Filter UI chips
│   │   ├── SearchResultCard.tsx  # Card variant for search grid
│   │   ├── ReviewsSection.tsx    # Reviews display
│   │   ├── StatsSection.tsx      # Statistics display
│   │   ├── HoursDisplay.tsx      # Business hours
│   │   ├── ServicesList.tsx      # Services list
│   │   ├── GuidedSearchModal.tsx # Guided search wizard
│   │   ├── AIAssistant.tsx       # AI chat assistant UI
│   │   ├── AuthButton.tsx        # Login/logout button
│   │   ├── ClaimListingCard.tsx  # Claim business CTA
│   │   ├── MediaUploader.tsx     # File upload component
│   │   ├── MediaGallery.tsx      # Media viewer
│   │   ├── FormattedText.tsx     # Markdown-to-gold text
│   │   └── ErrorBoundary.tsx     # Error boundary for fatal React errors
│   ├── contexts/           # React Context providers
│   │   ├── AuthContext.tsx       # Global user auth state
│   │   └── GuidedSearchContext.tsx # Guided search wizard state
│   ├── layouts/            # Page layout wrappers
│   │   └── MainLayout.tsx        # Nav + footer + scroll progress
│   ├── pages/              # Route-level page components
│   │   ├── Home.tsx              # Homepage (hero + category rails + Top 10 + featured)
│   │   ├── SearchResults.tsx     # Search/browse with filters + pagination
│   │   ├── CompanyProfile.tsx    # Company detail page
│   │   ├── Admin.tsx             # Admin dashboard (lazy-loaded, auth-gated)
│   │   ├── EditProfile.tsx       # Company self-edit form (lazy-loaded, auth-gated)
│   │   └── NotFound.tsx          # 404 page
│   ├── hooks/              # Custom React hooks (application-level)
│   │   └── usePageTitle.ts       # Set document title + meta tags
│   ├── data/               # Static frontend data
│   │   ├── categoryImages.ts     # Category → image URL map
│   │   └── guidedQuestions.ts    # Guided search wizard questions
│   ├── main.tsx            # React entry point (createRoot)
│   ├── App.tsx             # Router setup and route definitions
│   ├── index.css           # Global styles (Tailwind, scrollbar, focus)
│   └── vite-env.d.ts       # Vite type declarations
├── index.html              # HTML shell (Vite entry)
├── package.json            # Dependencies and npm scripts
├── package-lock.json       # Lockfile (npm)
├── tsconfig.json           # TypeScript config (strict, path aliases)
├── tsconfig.node.json      # TypeScript config for Vite
├── vite.config.ts          # Vite dev server (port 3000, /api proxy, code splitting)
├── tailwind.config.js      # Tailwind theme (brand colors, fonts)
├── postcss.config.js       # PostCSS config (Tailwind + Autoprefixer)
├── drizzle.config.ts       # Drizzle ORM config
└── [root-level scripts]    # Various PowerShell/Node scripts for data ops
    ├── check_db.cjs
    ├── check_enrich.js
    ├── check_procs.ps1
    ├── schedule_yelp_daily.ps1
    └── [10+ more maintenance scripts]
```

## Directory Purposes

**`server/`:**
- Purpose: Backend Express API with SQLite persistence and background enrichment
- Key tech: Express 5, Drizzle ORM, better-sqlite3, FTS5, Jose (JWT)
- Contains: Route handlers, middleware, database schema, migrations, enrichment pipelines, CLI scripts, utilities
- Core files: `index.ts` (server entry), `db.ts` (Drizzle setup), `schema.ts` (table definitions), `routes/*.ts` (API handlers)

**`server/routes/`:**
- Purpose: RESTful API endpoint handlers
- Contains: companies, search, categories, favorites, auth, admin, profile, ai-search endpoints
- Key pattern: Router with GET/POST/DELETE handlers, type-safe Drizzle queries, error handling

**`server/services/`:**
- Purpose: Reusable business logic services
- Contains: FTS5 index management, Gemini API wrapper, verification status, media table operations
- Key pattern: Stateless functions and lazy-initialized singletons

**`server/pipelines/`:**
- Purpose: Background data enrichment workers
- Contains: Yelp sync, CSLB license sync, state license scraping, Google Maps geocoding
- Key pattern: Async/await with batching, status tracking via global service objects, error handling

**`server/scripts/`:**
- Purpose: CLI utilities for maintenance and data operations
- Contains: Enrichment workers, status checkers, FTS index builders, data quality reports, import/sync triggers
- Key pattern: Executable CLI scripts using tsx, database queries via Drizzle

**`src/api/`:**
- Purpose: Frontend data access layer
- Contains: HTTP client (CompanyAPI, CategoryAPI, AuthAPI, AdminAPI, FavoritesAPI), custom React hooks, TypeScript type definitions
- Key files: `api.ts` (6 API objects), `hooks.ts` (~1000 lines, 16 hooks), `types.ts` (interfaces + constants)

**`src/components/`:**
- Purpose: Reusable UI building blocks
- Contains: 25+ React components, mix of active and legacy
- Key active: CompanyCard, Top10Card, ContentRail, HeroBanner, Navigation, PreviewPopup
- Key legacy: DetailModal, FilterBar, HeroSection (unused but present)

**`src/pages/`:**
- Purpose: Route-level page containers
- Contains: 6 pages matching 6 routes (Home, SearchResults, CompanyProfile, Admin, EditProfile, NotFound)
- Key pattern: Compose components, orchestrate hooks, handle URL params

**`src/contexts/`:**
- Purpose: Global application state and lifecycle
- Contains: AuthContext (user login, JWT sync), GuidedSearchContext (wizard state)
- Key pattern: useContext hook for consumption, useEffect for side effects

**`src/layouts/`:**
- Purpose: Shared page structure
- Contains: MainLayout (navigation, footer, scroll progress)
- Key pattern: Children prop for content injection

**`src/hooks/`:**
- Purpose: Application-level custom hooks (distinct from data-fetching hooks in `src/api/hooks.ts`)
- Contains: usePageTitle (SEO title/meta setup)
- Key pattern: Side effects on mount/dependency change

**`src/data/`:**
- Purpose: Static frontend configuration
- Contains: Category-to-image maps, guided search questions
- Key pattern: Exported constants for import in components/pages

## Key File Locations

**Entry Points:**
- `index.html`: HTML shell, loads fonts, mounts React to #root
- `src/main.tsx`: React root creation with StrictMode
- `src/App.tsx`: Router and route definitions
- `server/index.ts`: Express server startup, middleware setup, route mounting

**Configuration:**
- `vite.config.ts`: Dev server (port 3000), /api proxy (localhost:3001), path aliases, code splitting strategy (vendor, animation chunks)
- `tsconfig.json`: Strict mode, path aliases (@, @components, @pages, @api, @hooks, @context, @utils, @types, @styles)
- `tailwind.config.js`: Brand colors (#F5C518 gold, #141414 dark, #ffffff white), fonts (Oswald display, Inter body), custom animations
- `postcss.config.js`: Tailwind + Autoprefixer
- `src/index.css`: Global CSS (scrollbar styling, focus outlines, reduced-motion), Tailwind imports
- `drizzle.config.ts`: Drizzle schema path, SQLite connection
- `server/db.ts`: Drizzle client instantiation, schema exports

**API Layer:**
- `src/api/api.ts`: HTTP client with 6 namespace objects (CompanyAPI, CategoryAPI, FavoritesAPI, AuthAPI, AdminAPI, ProfileAPI), module-level filter cache
- `src/api/hooks.ts`: 16 custom hooks (useCompanies, useTopRatedCompanies, useCategoryCompanies, useStateCompanies, useSearch, useFavorites, etc.), batch fetchers with delay logic, category/state config
- `src/api/types.ts`: All TypeScript interfaces, constants (CATEGORY_IMAGES, US_STATES, CONSTRUCTION_CATEGORIES)
- `src/api/filters.ts`: Client-side utilities (rarely used, filtering handled server-side)

**Core Backend Logic:**
- `server/routes/companies.ts`: GET /api/companies with Drizzle WHERE clause builder (category, state, city, rating, search)
- `server/routes/search.ts`: FTS5 search via /api/search, automatic LIKE fallback if FTS not ready
- `server/routes/favorites.ts`: CRUD /api/favorites/:id (POST add, DELETE remove, GET list) with auth check
- `server/routes/admin.ts`: POST /api/admin/sync-yelp, /api/admin/enrich-yelp, status polling, verification, data quality
- `server/services/fts5.ts`: Lazy FTS5 index initialization, rebuild on schema changes
- `server/helpers/parseRow.ts`: Convert SQLite row to typed Company object

**Testing:**
- No test files exist in the codebase
- No test configuration

## Naming Conventions

**Files:**
- React components: PascalCase (`CompanyCard.tsx`, `ContentRail.tsx`)
- Non-component TypeScript: camelCase (`api.ts`, `hooks.ts`, `types.ts`)
- Server TypeScript: camelCase (`index.ts`, `db.ts`, `schema.ts`)
- Config files: lowercase with dots (`vite.config.ts`, `tailwind.config.js`)

**Directories:**
- Lowercase plural: `components/`, `pages/`, `routes/`, `services/`, `pipelines/`, `scripts/`
- Backend: `server/`
- Application-level: `hooks/`, `contexts/`, `layouts/`, `data/`

**Components:**
- One component per file (default export)
- File name matches component name: `CompanyCard.tsx` exports `CompanyCard`

**Types/Interfaces:**
- PascalCase: `Company`, `CompanyFilters`, `SearchResult`, `UseCompaniesReturn`
- Type aliases: `SortOption`, `VerificationStatus`
- Constants: SCREAMING_SNAKE_CASE (`CATEGORY_CONFIG`, `TOP_STATES`, `CATEGORY_IMAGES`)

**Functions:**
- camelCase: `useCompanies`, `getCompanyById`, `parseRow`
- API methods: `API.companies.getAll()`, `API.favorites.add()`
- Hooks start with `use`: `useCompanies`, `useFavorites`, `useLocalStorage`

## Where to Add New Code

**New Page:**
1. Create `src/pages/NewPage.tsx` with component (export default)
2. Import in `src/App.tsx`
3. Add route in Routes: `<Route path="/new-path" element={<NewPage />} />`
4. Wrap with Suspense + error boundary if lazy-loading needed
5. Page automatically gets MainLayout wrapping via App.tsx structure

**New Component:**
1. Create `src/components/ComponentName.tsx` (export default)
2. If reusable, place in `src/components/`
3. If page-specific, consider keeping it inline or in a components subdirectory
4. Import via relative path or @components alias

**New API Endpoint (Backend):**
1. Create or edit file in `server/routes/` (e.g., `server/routes/companies.ts`)
2. Import Router, set up async handler with type-safe request parsing
3. Use Drizzle ORM for database queries (prefer typed queries over raw SQL)
4. Return JSON via res.json()
5. Mount router in `server/index.ts` at `app.use('/api', routerName)`

**New API Client Method (Frontend):**
1. Add async method to appropriate API object in `src/api/api.ts` (e.g., CompanyAPI, StatsAPI)
2. Use fetchJSON helper or manual fetch with error handling
3. Create corresponding hook in `src/api/hooks.ts` following established pattern:
   ```typescript
   export function useNewData(options = {}): UseQueryReturn<T> {
     const [data, setData] = useState<T | null>(null);
     const [isLoading, setIsLoading] = useState(false);
     const [isError, setIsError] = useState(false);
     const [error, setError] = useState<Error | null>(null);

     const fetchData = useCallback(async () => {
       setIsLoading(true);
       setIsError(false);
       setError(null);
       try {
         const result = await API.namespace.method();
         setData(result);
       } catch (err) {
         setIsError(true);
         setError(err instanceof Error ? err : new Error('Failed'));
       } finally {
         setIsLoading(false);
       }
     }, []);

     useEffect(() => { fetchData(); }, [fetchData]);
     return { data, isLoading, isError, error, refetch: fetchData };
   }
   ```

**New Type/Interface:**
1. Add to `src/api/types.ts` in appropriate section (marked with comments like `// === Company Types ===`)
2. Export from types.ts for use across app

**New Service (Backend):**
1. Create `server/services/serviceName.ts`
2. Export functions or class-based service
3. Import and use in routes or scripts
4. Add initialization in `server/index.ts` if needed (e.g., FTS5 index startup)

**New Enrichment Pipeline (Backend):**
1. Create `server/pipelines/pipelineName.ts`
2. Implement async function(s) to fetch external data, upsert into companies table
3. Add admin endpoint in `server/routes/admin.ts` to trigger pipeline
4. Implement status service in `server/services/` for progress tracking
5. CLI wrapper in `server/scripts/` for manual runs

**New Admin Feature:**
1. Add route handler in `server/routes/admin.ts`
2. Create corresponding AdminAPI method in `src/api/api.ts`
3. Add UI in `src/pages/Admin.tsx` (lazy-loaded, auth-gated)

**New Utility/Helper:**
1. Create `src/utils/helperName.ts` or `server/helpers/helperName.ts`
2. Export functions
3. Import where needed

## Special Directories

**`server/constructflix.db` (and .db-shm, .db-wal):**
- Purpose: SQLite database (3M+ companies, enriched with Yelp/CSLB/Google data)
- Generated: Yes (by import scripts and enrichment pipelines)
- Committed: No (.gitignore)
- Note: Database is live; changes from pipelines are persisted

**`server/scripts/`:**
- Purpose: CLI utilities for data operations
- Generated: No (source code)
- Committed: Yes
- Note: Run via `npx tsx server/scripts/scriptName.ts` with environment variables

**`.superpowers/`:**
- Purpose: External tooling brainstorm and experiments
- Generated: Yes
- Committed: No (should be gitignored)

**`dist/`:**
- Purpose: Vite production build output
- Generated: Yes (npm run build)
- Committed: No (.gitignore)

**`data/`:**
- Purpose: Static company/enrichment data (downloaded from APIs, cached locally)
- Generated: Yes (by scraping/sync scripts)
- Committed: No (part of .gitignore)

## Path Aliases

Defined in both `vite.config.ts` and `tsconfig.json`:

| Alias | Maps To | Status |
|-------|---------|--------|
| `@/*` | `./src/*` | Available |
| `@components/*` | `./src/components/*` | Available |
| `@pages/*` | `./src/pages/*` | Available |
| `@api/*` | `./src/api/*` | Available |
| `@hooks/*` | `./src/hooks/*` | Available (dir exists) |
| `@types/*` | `./src/types/*` | Available (custom types, not used yet) |
| `@utils/*` | `./src/utils/*` | Available (custom utils, not used yet) |
| `@context/*` | `./src/context/*` | Available (not used, prefer src/contexts) |
| `@styles/*` | `./src/styles/*` | Available (custom styles, not used yet) |

Note: Codebase uses relative imports everywhere; aliases configured but not actively used.

## Routes

| Path | Page Component | Purpose | Auth Required |
|------|---------------|---------|---------------|
| `/` | `src/pages/Home.tsx` | Homepage with hero, rails | No |
| `/search` | `src/pages/SearchResults.tsx` | Search/browse with filters | No |
| `/company/:id` | `src/pages/CompanyProfile.tsx` | Company detail | No |
| `/company/:id/edit` | `src/pages/EditProfile.tsx` (lazy) | Self-edit company profile | Yes (optional, if owner) |
| `/admin` | `src/pages/Admin.tsx` (lazy) | Admin dashboard | Yes (if ADMIN_EMAILS set) |
| `*` | `src/pages/NotFound.tsx` | Catch-all 404 | No |

## API Endpoints (Major)

| Method | Path | Purpose | Handler |
|--------|------|---------|---------|
| GET | `/api/companies` | Paginated, filtered, sorted | `server/routes/companies.ts` |
| GET | `/api/companies/:id` | Single company detail | `server/routes/companies.ts` |
| GET | `/api/search?q=...` | FTS5 + LIKE search | `server/routes/search.ts` |
| GET | `/api/top-rated?limit=N` | Top-rated companies | `server/routes/companies.ts` |
| GET | `/api/featured?limit=N` | Featured companies | `server/routes/companies.ts` |
| GET | `/api/categories` | Categories with counts | `server/routes/categories.ts` |
| GET | `/api/states` | States with counts | `server/routes/companies.ts` |
| GET | `/api/favorites` | User's favorites (auth) | `server/routes/favorites.ts` |
| POST | `/api/favorites/:id` | Add favorite (auth) | `server/routes/favorites.ts` |
| DELETE | `/api/favorites/:id` | Remove favorite (auth) | `server/routes/favorites.ts` |
| GET | `/api/auth/me` | Current user info | `server/routes/auth.ts` |
| POST | `/api/auth/login` | Redirect to Wild Apricot SSO | `server/routes/auth.ts` |
| POST | `/api/auth/logout` | Logout (auth) | `server/routes/auth.ts` |
| POST | `/api/admin/sync-yelp` | Trigger Yelp sync (admin) | `server/routes/admin.ts` |
| GET | `/api/admin/sync-status` | Yelp sync progress (admin) | `server/routes/admin.ts` |
| POST | `/api/admin/enrich-yelp` | Match + enrich (admin) | `server/routes/admin.ts` |
| GET | `/api/admin/enrich-status` | Enrich progress (admin) | `server/routes/admin.ts` |
| GET | `/api/admin/data-quality` | Data quality stats (admin) | `server/routes/admin.ts` |
| PUT | `/api/profile/:id` | Update company profile (auth) | `server/routes/profile.ts` |
| POST | `/api/profile/:id/media` | Upload media (auth) | `server/routes/profile.ts` |
| GET | `/api/profile/:id/media` | Get media list (auth) | `server/routes/profile.ts` |
| DELETE | `/api/profile/:id/media/:mediaId` | Delete media (auth) | `server/routes/profile.ts` |

## Database Schema

Single table `companies` with 50+ columns in `server/constructflix.db`:

**Core Identity:**
- `id` (TEXT PRIMARY KEY) - Format: varies by import source
- `businessName` (TEXT NOT NULL)

**Location & Contact:**
- `state` (TEXT) - State code (indexed)
- `city` (TEXT) - City name (indexed)
- `address` (TEXT)
- `zipCode` (TEXT)
- `location` (TEXT) - Full location string
- `phone` (TEXT)
- `email` (TEXT)
- `website` (TEXT)

**Classification:**
- `category` (TEXT, indexed) - Primary category (e.g., 'Electrical Contractors')
- `subCategory` (TEXT) - Sub-classification (Yelp-enriched)
- `specialties` (TEXT) - JSON array of specialties

**Ratings & Reviews:**
- `rating` (REAL) - Average rating (0-5)
- `reviewCount` (INTEGER) - Total reviews

**Business Details:**
- `services` (TEXT) - JSON array
- `certifications` (TEXT) - JSON array
- `hours` (TEXT) - JSON or plain text
- `licenseNumber` (TEXT)
- `yearsInBusiness` (INTEGER) - How long operating

**Enriched Data (Yelp, CSLB, Google):**
- `imageUrl` (TEXT) - Photo from Yelp
- `yelpId` (TEXT) - Yelp business ID
- `yelpUrl` (TEXT) - Yelp profile URL
- `latitude` (REAL) - Geocoded
- `longitude` (REAL) - Geocoded
- `priceRange` (TEXT) - "$" to "$$$$"
- `licenseStatus` (TEXT) - "active", "expired", "suspended"
- `licenseType` (TEXT)
- `licenseExpiry` (TEXT) - ISO date
- `bondAmount` (REAL)
- `insuranceVerified` (INTEGER) - Boolean
- `backgroundCheck` (INTEGER) - Boolean
- `responseTime` (TEXT) - e.g., "2-4 hours"

**Admin/System:**
- `verificationStatus` (TEXT) - "unverified", "verified", "hcc_member"
- `emergencyService` (INTEGER) - Boolean
- `freeEstimate` (INTEGER) - Boolean
- `warranty` (TEXT)
- `dataSource` (TEXT) - "yelp", "cslb", "manual"
- `lastUpdated` (TEXT) - ISO timestamp

**Indexes:**
- `(state)` - For state filtering
- `(category)` - For category filtering
- `(rating DESC)` - For sorting by rating
- `(businessName)` - For name search (via FTS5 for full-text)

**Secondary Table - googlePlacesCache:**
- `companyId` (TEXT PRIMARY KEY, FK to companies.id)
- `placeId` (TEXT) - Google Places ID (cached per TOS)
- `matchConfidence` (REAL) - 0-1 confidence score
- `createdAt` (TIMESTAMP)
- `lastAccessedAt` (TIMESTAMP)

---

*Structure analysis: 2026-03-16*
