# External Integrations

**Analysis Date:** 2026-03-11

## APIs & External Services

**None - Fully Self-Contained:**
This application has no external API dependencies at runtime. All data is served from a local SQLite database via an Express API. The frontend communicates only with its own backend.

**Internal REST API (Express backend):**
- Base URL: `/api` (proxied in dev from port 3000 to port 3001)
- Server: `server/api.js`
- No authentication required on any endpoint
- All endpoints are read-only GET requests

| Endpoint | Purpose |
|---|---|
| `GET /api/companies` | Paginated, filtered, sorted company listing |
| `GET /api/companies/:id` | Single company by ID |
| `GET /api/search?q=` | Full-text search across name, category, city, state |
| `GET /api/featured` | Top companies by rating + review count |
| `GET /api/top-rated` | Companies with rating >= 4.5 |
| `GET /api/new` | Most recently imported companies |
| `GET /api/similar/:id` | Similar companies by category or city |
| `GET /api/companies-by-state` | Grouped by states (up to 10 states) |
| `GET /api/categories` | Category list with counts and avg ratings |
| `GET /api/states` | State list with company counts |
| `GET /api/stats` | Directory-wide statistics |
| `GET /api/chat?message=` | Natural language search assistant |

**Frontend API Client:**
- Location: `src/api/api.ts`
- Uses native `fetch()` (not axios, despite axios being installed)
- Organized as namespace objects: `CompanyAPI`, `CategoryAPI`, `LocationAPI`, `StatsAPI`, `ChatAPI`
- No request caching beyond React component state
- No retry logic or error recovery beyond basic try/catch

## Data Storage

**Primary Database:**
- SQLite 3 via better-sqlite3
- File: `server/constructflix.db` (2.1 GB)
- ~3.4 million company records
- Read-only mode in production (API server opens with `{ readonly: true }`)
- WAL journal mode for concurrent read performance

**Database Schema (`companies` table):**
```sql
CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    businessName TEXT NOT NULL,
    category TEXT DEFAULT 'General Contractor',
    location TEXT,
    state TEXT,
    city TEXT,
    address TEXT,
    zipCode TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    licenseNumber TEXT,
    rating REAL DEFAULT 0,
    reviewCount INTEGER DEFAULT 0,
    hours TEXT,           -- JSON string
    services TEXT,        -- JSON array string
    certifications TEXT,  -- JSON array string
    emergencyService INTEGER DEFAULT 0,
    freeEstimate INTEGER DEFAULT 0,
    warranty TEXT,
    dataSource TEXT,
    importedAt TEXT
);
```

**Indexes:**
```sql
CREATE INDEX idx_state ON companies(state);
CREATE INDEX idx_category ON companies(category);
CREATE INDEX idx_city ON companies(city);
CREATE INDEX idx_rating ON companies(rating DESC);
CREATE INDEX idx_name ON companies(businessName);
CREATE INDEX idx_state_category ON companies(state, category);
```

**Data Import Tools:**
- `server/import-data.js` - Node.js stream parser for large JSON (3GB source file)
- `server/import-data.py` - Python alternative importer (loads entire JSON into memory)
- Source: `../../output/constructflix_complete_database.json` (relative to server dir)
- Batch insert: 10,000 records per transaction (JS) or 50,000 (Python)

**File Storage:**
- Local filesystem only
- `output/company_images/` - Scraped company images organized by company ID subdirectories
- `public/constructflix-icon.svg` - Application icon
- `public/database.json` - Small static JSON (217 KB, likely legacy/subset)

**Caching:**
- No server-side caching
- No client-side caching beyond React component state (TanStack Query is installed but not wired up)
- Browser localStorage used for: favorites list, recently viewed companies (`src/api/hooks.ts`)

## Authentication & Identity

**Auth Provider:**
- None - application is fully public with no user accounts
- No login, registration, or session management
- No API keys or tokens required
- All API endpoints are unauthenticated

**Client-Side User Data:**
- Favorites stored in `localStorage` key `favorites` (array of company IDs)
- Recently viewed stored in `localStorage` key `recentlyViewed` (array of company IDs, max 10)
- Implemented in `src/api/hooks.ts` via `useFavorites()` and `useRecentlyViewed()` hooks

## Monitoring & Observability

**Error Tracking:**
- None - no Sentry, DataDog, or similar service

**Logs:**
- Server: `console.log` / `console.error` to stdout
- Log files present but not structured: `server/api.log`, `server/vite.log`
- No structured logging framework
- Chat endpoint errors caught and logged via `console.error('Chat error:', err)`

**Analytics:**
- None - no Google Analytics, Mixpanel, Plausible, or similar

## CI/CD & Deployment

**Hosting:**
- Not configured - runs locally on Windows
- Dev: Vite dev server (port 3000) + Express API (port 3001)
- Production build output: `dist/` directory (static SPA)

**CI Pipeline:**
- None - no GitHub Actions, Jenkins, or similar configured
- No `.gitignore` file present

**Deployment Process:**
- Manual / not defined
- `npm run build` produces static files in `dist/`
- API server started manually with `node server/api.js`

## External Image Sources

**Unsplash (hotlinked, no API key):**
- Category-specific construction images used as company card backgrounds
- Defined in `src/api/types.ts` as `CATEGORY_IMAGES` and `PORTRAIT_IMAGES` constants
- URLs use Unsplash's CDN with query params for sizing: `?w=400&q=75`
- Used as fallbacks when companies have no `imageUrl` field
- No Unsplash API calls - direct image URL hotlinking only

**Google Fonts (CDN):**
- Loaded in `index.html` and `src/index.css`
- Fonts: Oswald (700 weight, display headings), Inter (400, 500, 600 weights, body text)
- Preconnect hints configured for `fonts.googleapis.com` and `fonts.gstatic.com`

## Chat / AI Assistant

**Custom Rule-Based Chat (NOT an AI/LLM integration):**
- Endpoint: `GET /api/chat?message=`
- Implementation: `server/api.js` lines 240-431
- Pure keyword/regex parsing, no external AI service
- Category synonym mapping (e.g., "plumber" -> "Plumbing", "electrician" -> "Electrical Contractors")
- US state name-to-code mapping for natural language location extraction
- Intent detection: `stats`, `compare`, `recommend`, `find`
- Feature extraction: emergency service, free estimates, warranty, min rating
- Fallback: LIKE search on raw message text if structured parsing yields no results

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Offline Data Pipeline

**Image Scraping Utility (`scrape_images.py`):**
- Standalone Python script, not part of the web application
- Reads CSV files named `{STATE}_CONSTRUCTION_DIRECTORY.csv` from `C:/Users/glcar/Upload/`
- Scrapes company websites for images using `requests` + `BeautifulSoup`
- 200 concurrent threads via `ThreadPoolExecutor`
- Downloads up to 3 images per company (minimum 5KB size filter)
- Skips logos, icons, social media images
- Output: `output/company_images/{company_id}/image_N.ext`
- Progress tracking: `output/progress.json`, `output/results.json`

**Data Import Pipeline:**
1. Source CSV files (`{STATE}_CONSTRUCTION_DIRECTORY.csv`) are processed by `scrape_images.py`
2. A separate process (not in this repo) generates `constructflix_complete_database.json`
3. `server/import-data.js` or `server/import-data.py` imports the JSON into SQLite
4. The resulting `constructflix.db` is used by the Express API server

## Environment Configuration

**Required env vars:**
- None strictly required
- `PORT` - Optional, defaults to `3001` for the Express server (`server/api.js`)

**Secrets location:**
- No secrets needed - no external service integrations
- No `.env` file present

**Configuration locations:**
- `vite.config.ts` - Dev server port (3000), API proxy target, build settings
- `server/api.js` line 13 - DB path and server port
- `tailwind.config.js` - Design system tokens (colors, fonts, spacing)
- `tsconfig.json` - Path aliases and compiler options

---

*Integration audit: 2026-03-11*
