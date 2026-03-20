# Architecture Patterns

**Domain:** B2B Construction Directory (BuildBoard) -- Milestone 2 Feature Integration
**Researched:** 2026-03-11

## Current Architecture Baseline

The existing system is a simple two-tier SPA:

```
Browser (Vite + React SPA, port 3000)
  |
  | fetch() via /api proxy
  v
Express Server (single api.js, port 3001)
  |
  | better-sqlite3 (synchronous, read-only)
  v
SQLite File (constructflix.db, 2.1GB, 3.4M rows)
```

**Key characteristics of the existing codebase:**
- Single-file Express server (`server/api.js`, ~450 lines) with all routes inline
- No authentication, no user accounts, no write operations
- Database opened read-only with WAL mode
- No middleware beyond `cors()` and `express.json()`
- Custom React hooks for data fetching (not React Query, despite it being in package.json)
- Client-only state for favorites/recently viewed (localStorage)
- Rule-based NLP chat that is not actual AI/ML
- 22-column `companies` table with no additional tables
- No tests, no error boundaries, no deployment config

## Recommended Target Architecture

The new features fundamentally change the system from a read-only static directory to a multi-concern application with authentication, user-generated content, external API integrations, and LLM-powered search. The architecture must evolve without a ground-up rewrite.

### High-Level Component Diagram

```
                         +------------------+
                         |   React SPA      |
                         |  (Vite build)    |
                         +--------+---------+
                                  |
                    Vercel/Netlify Edge (static)
                                  |
                         /api proxy to functions
                                  |
               +------------------+------------------+
               |                  |                  |
    +----------v---+    +---------v------+   +-------v--------+
    |  Auth        |    |  API Routes    |   |  AI Search     |
    |  Middleware   |    |  (Express)     |   |  Endpoint      |
    +------+-------+    +-------+--------+   +-------+--------+
           |                    |                     |
           |              +----+----+           +-----+------+
           |              |         |           |            |
    +------v-------+  +---v---+  +--v---+  +---v----+  +----v---+
    | Wild Apricot |  | Turso |  |  R2  |  | LLM    |  | Turso  |
    | OAuth Server |  |  DB   |  | Blob |  | API    |  |  DB    |
    +------------- +  +-------+  +------+  +--------+  +--------+
                       (libSQL)  (uploads)  (OpenAI/   (SQL gen)
                                            Anthropic)
```

### Component Boundaries

| Component | Responsibility | Communicates With | Auth Required |
|-----------|---------------|-------------------|---------------|
| **React SPA** | UI rendering, routing, client state | API Routes via fetch | No (public) + Yes (verified features) |
| **Auth Middleware** | JWT validation, session management, role check | Wild Apricot OAuth, API Routes | -- |
| **API Routes (Public)** | Company browse, search, categories, stats | Turso DB (read) | No |
| **API Routes (Verified)** | Profile CRUD, file upload, favorites sync | Turso DB (read/write), R2 | Yes (verified tier) |
| **AI Search Endpoint** | Natural language query processing | LLM API, Turso DB | No |
| **Wild Apricot OAuth** | Member authentication, membership verification | External WA servers | -- |
| **Turso DB** | All persistent data (companies, users, enrichment) | API Routes, AI Search | -- |
| **Cloudflare R2** | Image/video blob storage for verified businesses | API Routes (upload), SPA (display) | -- |
| **Google Places Enrichment** | Offline batch job enriching company records | Google Places API, Turso DB | -- (background job) |
| **LLM API** | Natural language understanding, SQL generation | AI Search Endpoint | -- |

## Detailed Architecture by Feature

### 1. Database Migration: SQLite to Turso (libSQL)

**Why Turso:** The 2.1GB SQLite file cannot run on Vercel/Netlify serverless (no persistent filesystem). Turso is the natural migration path because it is SQLite-compatible -- same SQL dialect, same schema. The `@tursodatabase/libsql` client replaces `better-sqlite3` with minimal code changes.

**Confidence:** HIGH -- Turso is purpose-built for this exact scenario (SQLite apps deploying to serverless).

**Schema evolution:** The single `companies` table must be extended with new tables for the new features:

```sql
-- Existing (migrated as-is)
companies (id, businessName, category, location, state, city, ...)

-- New tables
users (
  id TEXT PRIMARY KEY,
  wild_apricot_id TEXT UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  membership_level TEXT,        -- from Wild Apricot
  is_verified_business BOOLEAN DEFAULT FALSE,
  verified_company_id TEXT REFERENCES companies(id),
  created_at TEXT,
  updated_at TEXT
)

verified_profiles (
  company_id TEXT PRIMARY KEY REFERENCES companies(id),
  owner_user_id TEXT REFERENCES users(id),
  custom_description TEXT,
  custom_services TEXT,         -- JSON array
  custom_hours TEXT,            -- JSON object
  custom_phone TEXT,
  custom_email TEXT,
  custom_website TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  verified_at TEXT,
  updated_at TEXT
)

media (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id),
  uploaded_by TEXT REFERENCES users(id),
  type TEXT CHECK(type IN ('photo', 'video')),
  r2_key TEXT NOT NULL,         -- Cloudflare R2 object key
  r2_url TEXT NOT NULL,         -- public CDN URL
  caption TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT
)

favorites (
  user_id TEXT REFERENCES users(id),
  company_id TEXT REFERENCES companies(id),
  created_at TEXT,
  PRIMARY KEY (user_id, company_id)
)

places_enrichment (
  company_id TEXT PRIMARY KEY REFERENCES companies(id),
  google_place_id TEXT,
  google_photos TEXT,           -- JSON array of photo references
  google_rating REAL,
  google_review_count INTEGER,
  google_hours TEXT,            -- JSON object
  google_formatted_address TEXT,
  enriched_at TEXT,
  match_confidence REAL         -- 0.0 to 1.0, how confident the match is
)
```

**Data flow for reads (company detail page):**
```
SPA requests /api/companies/:id
  -> API Route queries Turso:
       SELECT c.*, vp.*, pe.google_photos, pe.google_rating
       FROM companies c
       LEFT JOIN verified_profiles vp ON c.id = vp.company_id
       LEFT JOIN places_enrichment pe ON c.id = pe.company_id
       WHERE c.id = ?
  -> If verified, overlay custom fields from verified_profiles
  -> Merge Google Places photos into response
  -> Return enriched company object
```

**Migration approach:** Use Turso CLI to create a database from the existing SQLite file. `turso db create buildboard --from-file server/constructflix.db` uploads the entire database. Then switch the Express server from `better-sqlite3` to `@tursodatabase/libsql`.

**Confidence:** HIGH -- Turso documentation explicitly supports this migration path.

### 2. AI Search with LLM Integration

**Current state:** The existing `parseChat()` function in `server/api.js` is a 60-line regex/keyword matcher. It recognizes ~30 category synonyms and US state names, then builds a SQL WHERE clause. It misinterprets many queries (e.g., "good" triggers minRating: 4.0).

**Recommended approach: Function-calling text-to-SQL** -- not RAG, not vector embeddings. The data is structured (SQL table), the schema is simple (one primary table with well-defined columns), and the queries are predictable (find contractors by trade + location + rating). This is a textbook function-calling use case.

**Confidence:** HIGH -- function-calling over structured data is the consensus best practice for this type of query pattern.

**Architecture:**

```
User types: "Find me highly rated plumbers in Austin, TX that offer free estimates"
  |
  v
POST /api/ai-search { message: "..." }
  |
  v
AI Search Controller:
  1. Send message to LLM with system prompt containing:
     - Database schema (table/columns)
     - Available categories (from DB, cached)
     - Available states (from DB, cached)
     - Function definitions for search_companies()
  2. LLM returns function call:
     search_companies({
       category: "Plumbing",
       state: "TX",
       city: "Austin",
       minRating: 4.5,
       freeEstimate: true,
       sort: "rating_desc",
       limit: 10
     })
  3. Execute structured query against Turso
  4. Return results + LLM-generated summary to frontend
  |
  v
Response: {
  summary: "I found 47 highly rated plumbers in Austin, TX...",
  companies: [...],
  filters: { category: "Plumbing", state: "TX", ... },
  totalResults: 47
}
```

**LLM provider recommendation:** Use OpenAI `gpt-4o-mini` for cost efficiency. Function calling is well-supported and the queries are not complex enough to need a larger model. Estimated cost: ~$0.0001 per search query (150 input tokens + 50 output tokens at $0.15/$0.60 per 1M tokens).

**Frontend integration:** The existing `ChatAPI.send()` in `src/api/api.ts` already returns `{ text, companies }`. The new AI endpoint should return the same shape plus structured filters. The search results page can render filter chips from the parsed filters, allowing users to visually adjust what the AI extracted.

```typescript
// Enhanced response type
interface AISearchResponse {
  summary: string;           // LLM-generated natural language
  companies: Company[];      // matching results
  filters: ParsedFilters;    // structured filters the LLM extracted
  totalResults: number;
  followUpSuggestions: string[];  // "Try narrowing by city" etc.
}
```

**Anti-pattern to avoid:** Do NOT give the LLM raw SQL generation access. Define a strict function schema with allowed parameters (category, state, city, minRating, etc.) and build the SQL server-side. This prevents SQL injection and hallucinated column names.

### 3. Google Places API Enrichment

**This is a batch/offline process, not a real-time API call.** Calling Google Places API on every company page load would be prohibitively expensive (3.4M records x $0.032 per Text Search request = $108,800). Instead, enrichment runs as a background job that progressively enhances company records.

**Confidence:** HIGH -- this is the standard pattern for data enrichment at scale.

**Architecture:**

```
Enrichment Pipeline (offline Node.js script or cron job):

For each company not yet enriched:
  1. Call Google Places Text Search (New):
     POST https://places.googleapis.com/v1/places:searchText
     Body: { textQuery: "{businessName} {city} {state}" }
     FieldMask: places.id,places.photos,places.rating,places.userRatingCount,
                places.regularOpeningHours,places.formattedAddress

  2. Validate match:
     - Compare returned place name vs company.businessName (fuzzy match)
     - Compare address/city/state
     - Assign match_confidence score (0.0-1.0)
     - Only accept matches above 0.7 confidence

  3. If matched, store in places_enrichment table:
     - google_place_id for future lookups
     - photo references (not URLs -- URLs are temporary)
     - rating, review count, hours

  4. Rate limit: Google allows ~100 QPS
     At 50 QPS with overhead: ~68,000 records/day
     Full 3.4M enrichment: ~50 days at sustained rate
```

**Cost management strategy:**
- Use FieldMask to request only needed fields (reduces from Enterprise to Pro tier pricing)
- Prioritize enrichment: verified businesses first, then top-rated, then by state
- Store `google_place_id` so subsequent detail lookups use Place Details (cheaper than Text Search)
- Photo URLs from Google are temporary (expire) -- store photo references, generate URLs on demand via `/api/places/photo?ref=xxx` proxy endpoint

**Photo serving architecture:**
```
SPA requests company profile
  -> API returns company with places_enrichment.google_photos (array of photo references)
  -> Frontend renders <img> tags pointing to /api/photos/{photoReference}?maxwidth=400
  -> API proxy endpoint fetches from Google Places Photos API and streams back
  -> Add Cache-Control headers (photos do not change frequently)
```

**Alternative for photos:** Download and cache Google Places photos to Cloudflare R2 during enrichment. This avoids per-request Google API costs for photo serving but requires managing storage. Recommended for verified businesses only initially.

### 4. Wild Apricot SSO (OAuth2 Authorization Code Flow)

**Wild Apricot uses standard OAuth2 with these endpoints:**
- Authorization: `https://{account}.wildapricot.org/sys/login/OAuthLogin`
- Token: `https://oauth.wildapricot.org/auth/token`
- Scopes: `auto` or `contacts_me`

**Confidence:** MEDIUM -- Wild Apricot OAuth is documented but the documentation quality is uneven. The authorization code flow is standard OAuth2, but quirks may exist in implementation. The Wild Apricot account is not yet set up, so integration cannot be validated until it is.

**Architecture:**

```
Login Flow:
  1. User clicks "Sign In with HCC" button in React SPA
  2. SPA redirects to Wild Apricot login page:
     GET https://{org}.wildapricot.org/sys/login/OAuthLogin
       ?client_id=XXXX
       &redirect_uri=https://buildboard.com/auth/callback
       &scope=auto
       &state={csrf_token}

  3. User authenticates on Wild Apricot
  4. Wild Apricot redirects to /auth/callback?code=XXXXX&state=YYYYY

  5. SPA sends code to backend:
     POST /api/auth/callback { code, state }

  6. Backend exchanges code for tokens:
     POST https://oauth.wildapricot.org/auth/token
       Authorization: Basic base64(client_id:client_secret)
       Body: grant_type=authorization_code&code=XXXXX&redirect_uri=...

  7. Backend receives { access_token, refresh_token, expires_in }
  8. Backend calls Wild Apricot API to get member profile:
     GET https://api.wildapricot.org/v2.2/accounts/{accountId}/contacts/me
       Authorization: Bearer {access_token}

  9. Backend creates/updates user in local users table
  10. Backend issues own JWT (or session cookie) to SPA
  11. SPA stores JWT, includes in subsequent authenticated requests
```

**Key design decision: Issue your own JWT.** Do not pass Wild Apricot tokens to the frontend. The backend exchanges WA tokens for a BuildBoard JWT that contains only the information the SPA needs (userId, email, isVerified, displayName). This decouples the frontend from Wild Apricot's token lifecycle and keeps WA credentials server-side.

**Auth middleware for Express:**
```
Middleware Stack:
  app.use('/api/verified/*', authMiddleware)  -- requires valid JWT
  app.use('/api/auth/*', ...)                 -- login/callback/refresh

  All existing public endpoints (/api/companies, /api/search, etc.)
  remain unchanged and unauthenticated.
```

**React auth state:** Add an `AuthContext` provider wrapping the app. Store JWT in `httpOnly` cookie (preferred) or localStorage. The `useAuth()` hook provides `{ user, isAuthenticated, isVerified, login, logout }`. Components conditionally render verified features based on auth state.

### 5. File Uploads (Images/Videos for Verified Businesses)

**Recommended storage: Cloudflare R2** -- zero egress fees, S3-compatible API, pairs naturally with Vercel/Netlify deployment. No need for AWS billing complexity.

**Confidence:** HIGH -- R2 with presigned URLs is the standard serverless upload pattern.

**Architecture:**

```
Upload Flow (presigned URL pattern):
  1. Verified user selects file in React SPA
  2. SPA validates client-side:
     - Image: max 10MB, JPEG/PNG/WebP only
     - Video: max 100MB, MP4/MOV only
  3. SPA requests upload URL:
     POST /api/verified/upload-url
       Authorization: Bearer {jwt}
       Body: { fileName, fileType, fileSize, mediaType: "photo"|"video" }

  4. Backend validates:
     - User is verified
     - User owns this company
     - File type and size within limits
     - Company hasn't exceeded upload quota (e.g., 20 photos, 3 videos)

  5. Backend generates presigned PUT URL for R2:
     S3Client.getSignedUrl(PutObjectCommand, {
       Bucket: "buildboard-media",
       Key: `companies/${companyId}/${mediaType}/${uuid}.${ext}`,
       ContentType: fileType,
       ExpiresIn: 300  // 5 minutes
     })

  6. Backend creates media record in DB (status: "uploading")
  7. Backend returns { uploadUrl, mediaId }

  8. SPA uploads file directly to R2 via presigned URL:
     PUT {uploadUrl} with file body

  9. SPA confirms upload:
     POST /api/verified/upload-confirm
       Body: { mediaId }

  10. Backend verifies object exists in R2
  11. Backend updates media record (status: "active", r2_url)
  12. If image: trigger optional resize/optimization via R2 event notification
```

**Why presigned URLs instead of streaming through Express:** Files go directly from the browser to R2, never touching the serverless function. This avoids Vercel's 4.5MB request body limit for serverless functions and eliminates bandwidth costs on the API server.

**R2 bucket structure:**
```
buildboard-media/
  companies/
    {companyId}/
      photos/
        {uuid}.webp
        {uuid}-thumb.webp    (generated via worker)
      videos/
        {uuid}.mp4
  ai-generated/
    categories/
      {category-slug}.webp   (Gemini-generated fallback images)
```

**Public access:** Configure R2 with a custom domain (`media.buildboard.com`) for public read access to uploaded files. CDN caching is automatic with Cloudflare.

### 6. Verified Business Tier (Profile CRUD)

**Data model:** The `verified_profiles` table overlays custom data on top of the base `companies` record. This is intentional -- the original 3.4M records remain unmodified. Verified businesses get a profile layer that can override fields like description, services, hours, and contact info.

**Confidence:** HIGH -- overlay pattern is standard for user-editable data on top of imported datasets.

**API routes:**

```
GET    /api/verified/profile           -- get own profile (auth required)
PUT    /api/verified/profile           -- update profile fields
GET    /api/verified/media             -- list own uploaded media
DELETE /api/verified/media/:id         -- remove uploaded media
POST   /api/verified/upload-url        -- get presigned upload URL
POST   /api/verified/upload-confirm    -- confirm upload completion
```

**Merge logic on read (company detail page):**
```javascript
function mergeCompanyProfile(company, verifiedProfile, placesEnrichment) {
  return {
    ...company,
    // Verified profile overrides (if verified and has custom data)
    ...(verifiedProfile && {
      description: verifiedProfile.custom_description || company.description,
      services: verifiedProfile.custom_services || company.services,
      hours: verifiedProfile.custom_hours || company.hours,
      phone: verifiedProfile.custom_phone || company.phone,
      email: verifiedProfile.custom_email || company.email,
      website: verifiedProfile.custom_website || company.website,
      isVerified: true,
    }),
    // Google Places enrichment (additive, doesn't override)
    googlePhotos: placesEnrichment?.google_photos || [],
    googleRating: placesEnrichment?.google_rating,
    googleReviewCount: placesEnrichment?.google_review_count,
  };
}
```

**Search ranking boost:** Verified businesses should rank higher in search results. Add `is_verified` as a computed column (or join condition) and modify the ORDER BY clause:

```sql
SELECT c.*,
  CASE WHEN vp.company_id IS NOT NULL THEN 1 ELSE 0 END as is_verified
FROM companies c
LEFT JOIN verified_profiles vp ON c.id = vp.company_id AND vp.is_active = 1
WHERE ...
ORDER BY is_verified DESC, rating DESC, reviewCount DESC
```

## Server Architecture: Modular Express

The current single-file `server/api.js` (450 lines) must be split into modules. Do NOT rewrite to a different framework -- refactor the existing Express server into organized files.

**Recommended server structure:**

```
server/
  index.js                    -- entry point, app setup, middleware
  db.js                       -- Turso/libSQL connection
  middleware/
    auth.js                   -- JWT validation, requireAuth, requireVerified
    rateLimiter.js            -- express-rate-limit config
    errorHandler.js           -- centralized error handling
  routes/
    companies.js              -- existing company endpoints (public)
    search.js                 -- existing search + new AI search
    categories.js             -- categories, states, stats
    auth.js                   -- login, callback, refresh, logout
    verified.js               -- profile CRUD, media management
  services/
    aiSearch.js               -- LLM function-calling logic
    wildApricot.js            -- WA OAuth token exchange, profile fetch
    r2.js                     -- R2 presigned URL generation
    enrichment.js             -- Google Places enrichment logic
  scripts/
    enrich-places.js          -- standalone batch enrichment script
    generate-category-images.js -- Gemini AI image generation
    migrate-turso.js          -- SQLite-to-Turso migration helper
```

**Express middleware stack (order matters):**
```javascript
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter);           // all routes
app.use('/api/auth', authRoutes);
app.use('/api/verified', authMiddleware, verifiedRoutes);
app.use('/api', publicRoutes);  // companies, search, categories, stats
app.use(errorHandler);          // catch-all error handler
```

## Frontend Architecture Changes

### New React Components and Routes

```
src/
  context/
    AuthContext.tsx            -- auth state, JWT management
  pages/
    Login.tsx                  -- Wild Apricot OAuth redirect
    AuthCallback.tsx           -- /auth/callback route
    VerifiedDashboard.tsx      -- profile management page
  components/
    auth/
      LoginButton.tsx          -- "Sign In with HCC" button
      ProtectedRoute.tsx       -- route guard for verified pages
      UserMenu.tsx             -- dropdown with profile/logout
    verified/
      ProfileEditor.tsx        -- edit company profile form
      MediaUploader.tsx        -- drag-and-drop image/video upload
      MediaGallery.tsx         -- manage uploaded media
    search/
      AISearchChat.tsx         -- chat interface for AI search
      FilterChips.tsx          -- visual filter chips from AI results
    company/
      VerifiedBadge.tsx        -- verified checkmark badge
      GooglePhotosGallery.tsx  -- photos from Places enrichment
```

**New routes in App.tsx:**
```typescript
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/search" element={<SearchResults />} />
  <Route path="/company/:id" element={<CompanyProfile />} />
  <Route path="/auth/callback" element={<AuthCallback />} />
  <Route path="/login" element={<Login />} />
  <Route path="/dashboard" element={
    <ProtectedRoute>
      <VerifiedDashboard />
    </ProtectedRoute>
  } />
</Routes>
```

### Auth Context Integration

```typescript
// Wrap app in AuthProvider
<AuthProvider>
  <Router>
    <AppContent />
  </Router>
</AuthProvider>

// Any component can check auth state
const { user, isAuthenticated, isVerified } = useAuth();
```

## Data Flow Diagrams

### Company Detail Page (fully enriched)

```
User visits /company/:id
  |
  v
useCompany(id) hook fires
  |
  v
GET /api/companies/:id
  |
  v
Server:
  1. SELECT from companies WHERE id = ?
  2. LEFT JOIN verified_profiles
  3. LEFT JOIN places_enrichment
  4. LEFT JOIN media (photos/videos)
  5. Merge: verified overrides > base data
  6. Attach: google photos + uploaded media
  |
  v
Response: enriched Company object with:
  - Base data (from import)
  - Verified overrides (if claimed)
  - Google Places photos + rating
  - Uploaded portfolio photos/videos
  - isVerified flag
  - verifiedBadge display
```

### AI Search Flow

```
User types "best electricians in Miami with free estimates"
  |
  v
POST /api/ai-search { message: "..." }
  |
  v
Server (aiSearch.js):
  1. Load cached schema context (categories list, column descriptions)
  2. Call LLM API with function-calling:
     - System prompt with schema
     - User message
     - Function: search_companies(category, state, city, minRating, ...)
  3. LLM returns: search_companies({
       category: "Electrical Contractors",
       state: "FL",
       city: "Miami",
       minRating: 4.5,
       freeEstimate: true,
       sort: "rating_desc"
     })
  4. Build parameterized SQL from function args (server-controlled)
  5. Execute query against Turso
  6. Send results back to LLM for summary generation
  7. Return { summary, companies, filters, totalResults }
  |
  v
Frontend:
  - Display AI summary in chat bubble
  - Render filter chips (Category: Electrical, Location: Miami, FL, ...)
  - User can click chips to add/remove filters
  - Results display in existing CompanyCard grid
```

### File Upload Flow

```
Verified user clicks "Add Photo" on dashboard
  |
  v
MediaUploader component:
  1. File selected, client-side validation
  2. POST /api/verified/upload-url { fileName, fileType, fileSize }
  |
  v
Server:
  1. Validate JWT, check verified status
  2. Check upload quota
  3. Generate presigned R2 PUT URL
  4. Insert media record (status: "uploading")
  5. Return { uploadUrl, mediaId }
  |
  v
Browser:
  1. PUT file to R2 presigned URL (direct upload, bypasses server)
  2. POST /api/verified/upload-confirm { mediaId }
  |
  v
Server:
  1. Verify object exists in R2
  2. Update media record (status: "active")
  3. Return updated media list
```

## Patterns to Follow

### Pattern 1: Public/Protected Route Split
**What:** All existing endpoints remain public. New features go behind auth middleware. Never break the existing public API.
**When:** Adding any authenticated endpoint.
**Example:**
```javascript
// server/index.js
app.use('/api/companies', companiesRouter);     // public, unchanged
app.use('/api/search', searchRouter);           // public, unchanged
app.use('/api/auth', authRouter);               // new, public
app.use('/api/verified', requireAuth, verifiedRouter);  // new, protected
app.use('/api/ai-search', aiSearchRouter);      // new, public (rate-limited)
```

### Pattern 2: Overlay Data Model
**What:** User-editable data sits in a separate table that overlays/overrides imported data. The 3.4M imported records are never modified.
**When:** Verified profiles, Google Places enrichment, any data that augments the base dataset.
**Why:** Allows re-importing base data without losing customizations. Clean separation of "system data" vs "user data" vs "enrichment data."

### Pattern 3: Presigned URL Uploads
**What:** Generate time-limited signed URLs for direct browser-to-storage uploads. Files never transit through the API server.
**When:** Any file upload (photos, videos).
**Why:** Avoids serverless body size limits, reduces API server load, faster uploads for users.

### Pattern 4: LLM Function Calling (Not Raw SQL Generation)
**What:** Define a structured function schema for the LLM. The LLM returns function arguments, not SQL. The server builds SQL from validated arguments.
**When:** AI search queries.
**Why:** Prevents SQL injection, prevents hallucinated columns/tables, keeps query logic server-controlled.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Streaming Google Places in Real-Time
**What:** Calling Google Places API on every company page load.
**Why bad:** 3.4M records x real-time lookups = $100K+ monthly API costs. Slow page loads (300-500ms per Places API call). Rate limiting issues.
**Instead:** Batch enrich offline, store results in `places_enrichment` table, serve from database.

### Anti-Pattern 2: Storing Wild Apricot Tokens in Frontend
**What:** Passing WA access tokens to the SPA via localStorage or URL.
**Why bad:** Token leakage via XSS, token refresh complexity in frontend, coupling to WA token lifecycle.
**Instead:** Backend exchanges WA tokens for a BuildBoard JWT. Only BuildBoard JWT reaches the frontend.

### Anti-Pattern 3: Monolithic Server File
**What:** Adding auth, AI search, file uploads, and profile management to the existing 450-line `api.js`.
**Why bad:** Unmaintainable. Cannot test individual concerns. Merge conflicts. Difficult to reason about middleware ordering.
**Instead:** Split into route modules with shared middleware. See "Modular Express" section above.

### Anti-Pattern 4: Giving LLM Direct Database Access
**What:** Letting the LLM generate and execute arbitrary SQL.
**Why bad:** SQL injection risk, hallucinated table/column names, no control over query cost (LLM might generate full table scans).
**Instead:** Function calling with a defined parameter schema. Server builds SQL from validated parameters.

### Anti-Pattern 5: Full Database Rewrite on Migration
**What:** Redesigning the entire data model when migrating from SQLite to Turso.
**Why bad:** Introduces bugs in working features, extends timeline, no incremental value.
**Instead:** Migrate the existing schema as-is, then add new tables alongside. Existing queries should work without modification.

## Scalability Considerations

| Concern | Current (dev) | At 1K users | At 100K users |
|---------|---------------|-------------|---------------|
| **Database** | Local SQLite | Turso free tier (500 DBs, 9GB) | Turso Pro ($29/mo, replicas) |
| **Search** | LIKE queries (slow) | AI search + LIKE fallback | FTS5 virtual table on Turso |
| **File storage** | None | R2 free tier (10GB/mo) | R2 ($0.015/GB/mo) |
| **AI search** | N/A | gpt-4o-mini (~$0.01/1K queries) | gpt-4o-mini + caching ($0.10/1K) |
| **Google Places** | N/A | Enrich top 10K companies | Enrich all 3.4M over time |
| **Auth** | None | Wild Apricot OAuth | Same (WA handles scale) |
| **API hosting** | localhost:3001 | Vercel free tier (100GB/mo) | Vercel Pro ($20/mo) |

## Deployment Architecture (Vercel)

```
Vercel Project
  |
  +-- Static Assets (React SPA build output)
  |     Served from Vercel Edge Network (CDN)
  |
  +-- Serverless Functions (api/ directory)
  |     /api/companies.js      -> Turso DB
  |     /api/search.js         -> Turso DB
  |     /api/ai-search.js      -> LLM API + Turso DB
  |     /api/auth/callback.js  -> Wild Apricot + Turso DB
  |     /api/verified/*.js     -> Auth middleware + Turso DB + R2
  |
  +-- Environment Variables
        TURSO_DATABASE_URL
        TURSO_AUTH_TOKEN
        OPENAI_API_KEY
        WILD_APRICOT_CLIENT_ID
        WILD_APRICOT_CLIENT_SECRET
        WILD_APRICOT_ACCOUNT_ID
        R2_ACCOUNT_ID
        R2_ACCESS_KEY_ID
        R2_SECRET_ACCESS_KEY
        R2_BUCKET_NAME
        JWT_SECRET
```

**Express on Vercel:** Vercel supports Express apps via their serverless function adapter. The entire Express app exports as a single function. This works with zero config if structured correctly: `vercel.json` routes `/api/**` to the Express handler.

**Confidence:** HIGH -- Vercel's Express support is well-documented and widely used.

## Suggested Build Order (Dependencies)

The features have clear dependency chains that dictate build order:

```
Phase 1: Database Migration (Turso)
  |  Blocks everything else -- all features need a hosted DB
  v
Phase 2: Server Modularization + Deployment
  |  Split api.js, add middleware stack, deploy to Vercel
  |  Blocks auth (needs middleware), AI search (needs deployment)
  v
Phase 3: Wild Apricot SSO
  |  Requires: Turso (users table), modular server (auth routes)
  |  Blocks: verified profiles, file uploads, synced favorites
  v
Phase 4: AI Search (can parallel with Phase 3 if needed)
  |  Requires: Turso, deployment (for API keys)
  |  Independent of auth
  v
Phase 5: Verified Business Profiles + File Uploads
  |  Requires: Auth (Phase 3), Turso, R2 bucket
  |  This is the revenue-generating feature
  v
Phase 6: Google Places Enrichment
  |  Requires: Turso (enrichment table), can run independently
  |  Long-running background process, not user-facing urgency
  v
Phase 7: AI-Generated Category Images (Gemini)
  |  Requires: R2 (storage), can run independently
  |  Nice-to-have, visual polish
```

**Critical path:** Turso migration -> Server refactor -> Auth -> Verified profiles. This is the shortest path to the revenue-generating feature (paid verification tier).

**Parallelizable work:**
- AI Search (Phase 4) can start as soon as Turso + deployment are done
- Google Places enrichment script (Phase 6) can be developed and tested locally against SQLite before Turso migration completes
- Frontend auth components can be built while backend auth is in progress (mock the auth endpoints)

## Sources

- [Turso Documentation - libSQL](https://docs.turso.tech/libsql) -- HIGH confidence
- [Turso + Vercel Integration](https://turso.tech/blog/serverless) -- HIGH confidence
- [Express on Vercel Guide](https://vercel.com/guides/using-express-with-vercel) -- HIGH confidence
- [Wild Apricot API Authentication](https://gethelp.wildapricot.com/en/articles/484-api-authentication) -- MEDIUM confidence (docs are sparse)
- [Wild Apricot Authorizing External Apps](https://gethelp.wildapricot.com/en/articles/180-authorizing-external-applications) -- MEDIUM confidence
- [Google Places Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) -- HIGH confidence
- [Google Places API Pricing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) -- HIGH confidence
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/) -- HIGH confidence
- [Cloudflare R2 for User Generated Content](https://developers.cloudflare.com/reference-architecture/diagrams/storage/storing-user-generated-content/) -- HIGH confidence
- [LLM Function Calling for Database Search](https://neptune.ai/blog/llm-for-structured-data) -- MEDIUM confidence (multiple sources agree)
- [Turso Vercel Marketplace Integration](https://vercel.com/marketplace/tursocloud) -- HIGH confidence

---

*Architecture research: 2026-03-11*
