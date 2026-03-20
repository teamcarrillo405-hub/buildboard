# Project Research Summary

**Project:** BuildBoard (ConstructFlix evolution)
**Domain:** B2B Construction Subcontractor Directory with AI search, business verification, and HCC integration
**Researched:** 2026-03-11
**Confidence:** HIGH (stack, architecture, pitfalls) / MEDIUM (Wild Apricot SSO, AI SDK versions)

## Executive Summary

BuildBoard is evolving from a read-only SQLite directory of 3.4M construction companies into a full-featured B2B platform with AI-powered search, Google Places enrichment, business verification tiers, and HCC member authentication via Wild Apricot SSO. The existing stack (Vite + React + TypeScript + Tailwind + Express + SQLite) is sound for the frontend, but the backend requires fundamental changes: the 2.1GB SQLite file cannot run on serverless platforms, the single-file Express server (450 lines, no auth, no writes, no tests) must be modularized, and the current regex-based chat "AI" must be replaced with real LLM function-calling.

The recommended approach is an incremental migration that preserves the working frontend while transforming the backend. Turso (hosted libSQL, SQLite-compatible) replaces the local SQLite file, Drizzle ORM provides a type-safe query layer that abstracts the sync-to-async transition, and Cloudflare R2 handles file storage with zero egress fees. For AI search, the consensus is clear: use LLM function-calling to parse natural language queries into structured SQL parameters -- do NOT embed 3.4M records into vectors (costs $100-400+, requires 20GB RAM, and returns worse results than keyword search for structured data). Google Places enrichment must be lazy and on-demand, not batch -- enriching all 3.4M records upfront would cost $58K-82K.

The three make-or-break risks are: (1) Turso has a 2GB upload limit, and the database is 2.1GB -- the DB must be trimmed or the migration strategy reconsidered before any work begins; (2) Wild Apricot does not support CORS, so the OAuth token exchange must be server-side from day one; (3) Google Places API costs can explode overnight without budget caps, field mask discipline, and lazy enrichment. All three are well-understood problems with documented solutions, but each requires upfront architectural decisions that cannot be retrofitted.

## Key Findings

### Recommended Stack

The existing Vite + React + TypeScript + Tailwind frontend stays. The backend adds a database hosting layer (Turso + Drizzle ORM), AI capabilities (Vercel AI SDK + Gemini), authentication (Wild Apricot OAuth + jose for JWTs), and file storage (Cloudflare R2). Total estimated cost at launch is $0-25/month, staying within free tiers for all services.

**Core technologies:**
- **Turso + @libsql/client** -- hosted SQLite-compatible database for serverless deployment. Same SQL dialect as existing codebase, 5GB free storage.
- **Drizzle ORM + drizzle-kit** -- type-safe query builder replacing raw SQL strings. Handles sync-to-async migration transparently. Lightweight runtime (200ms cold start vs 3-5s for Prisma).
- **Vercel AI SDK (v5) + @ai-sdk/google** -- streaming, tool calling, and React hooks for AI search. Uses Gemini 2.0 Flash for cost-efficient query parsing.
- **jose** -- pure-JS JWT library for session management. Zero native dependencies (unlike jsonwebtoken), works in serverless.
- **Cloudflare R2 + @aws-sdk/client-s3** -- S3-compatible object storage with zero egress fees. Presigned URLs for direct browser uploads, bypassing Vercel's 4.5MB body limit.
- **Vercel** -- deployment platform with native Turso integration, Express serverless support, and free tier sufficient for launch.

### Expected Features

**Must have (table stakes):**
- Real company photos on every listing (Google Places API, AI-generated fallbacks)
- Google reviews and ratings display with proper attribution
- Business hours from Google Places
- Proper full-text search replacing current LIKE '%term%' on 3.4M rows
- Authenticated synced favorites (requires Wild Apricot SSO)
- Mobile-responsive search and profiles (already built, needs validation)

**Should have (differentiators):**
- AI-powered search with chat interface and smart filter chips -- no competitor in construction directories offers this
- Business verification tiers with badges and contextual search boosting (not pay-to-win partitioning)
- Verified business profile management (self-service editing, photo/video uploads)
- Wild Apricot SSO for HCC member authentication

**Defer (v2+):**
- Video uploads (photos first, storage infrastructure proves out)
- User-generated reviews (use Google reviews; proprietary reviews invite moderation nightmares)
- In-app messaging, bidding/RFQ, payment processing, social features, native mobile apps
- Multi-language/i18n (build i18n-friendly, but don't implement translations)

### Architecture Approach

The system evolves from a two-tier SPA (React + Express + SQLite file) to a serverless architecture with Turso for persistence, R2 for files, and LLM APIs for intelligent search. The key architectural pattern is the "overlay data model" -- the 3.4M imported company records are never modified. Verified profiles, Google Places enrichment, and user media sit in separate tables that overlay the base data. This allows re-importing without losing customizations. The Express server splits from one 450-line file into modular routes with shared middleware (auth, rate limiting, error handling).

**Major components:**
1. **React SPA** -- UI rendering, routing, auth context, served as static assets from Vercel CDN
2. **Public API Routes (Express)** -- company browse, search, categories, stats. Read-only against Turso. Unchanged from current behavior.
3. **AI Search Endpoint** -- LLM function-calling converts natural language to structured query parameters. Server builds parameterized SQL (never lets LLM generate raw SQL).
4. **Auth Middleware + Wild Apricot OAuth** -- server-side token exchange (CORS blocks frontend OAuth). Issues BuildBoard JWTs. Maps WA member IDs to local user table.
5. **Verified Business Routes** -- profile CRUD, presigned URL upload, media management. Protected by auth middleware.
6. **Google Places Enrichment** -- offline/background process, not real-time. Stores place_id and metadata in enrichment table with confidence scores.
7. **Cloudflare R2** -- blob storage for uploaded photos/videos and AI-generated category images. CDN-fronted with custom domain.

### Critical Pitfalls

1. **Turso 2GB upload limit vs 2.1GB database** -- the migration is blocked until the database is trimmed below 2GB (VACUUM, drop unused columns, audit JSON blob columns) or an alternative is chosen (self-hosted libSQL, Neon Postgres). This is a blocking prerequisite.

2. **Google Places API cost explosion** -- enriching 3.4M records costs $58K-82K at once. Prevention: lazy on-demand enrichment with aggressive caching, hard budget caps in Google Cloud Console, field mask separation (Essentials vs Pro tier requests), and starting with verified businesses only.

3. **Wild Apricot CORS blocks SPA auth** -- Wild Apricot explicitly does not support CORS. The OAuth token exchange must be server-side from the start. Attempting a frontend-only flow will fail silently and waste days of debugging.

4. **Vector embeddings are wrong for this data** -- embedding 3.4M structured records costs $100-400+, needs 20GB RAM, and returns worse results than keyword search for "plumber in Dallas" queries. Use LLM function-calling for query parsing + traditional SQL/FTS5 search instead.

5. **Vercel 4.5MB body limit blocks file uploads** -- all uploads must use the presigned URL pattern (client uploads directly to R2, not through the API). This is non-negotiable and must be designed from the start.

## Implications for Roadmap

### Phase 0: Infrastructure Prerequisites
**Rationale:** Three items must be resolved before any feature work: .gitignore (prevents committing 2.1GB DB + secrets), database size audit (determines if Turso migration is viable), and downloading Unsplash images locally (hotlinking will break at scale).
**Delivers:** Safe git workflow, validated migration path, stable fallback images.
**Avoids:** Pitfall 12 (.gitignore), Pitfall 2 (Turso 2GB limit), Pitfall 11 (Unsplash hotlinking).

### Phase 1: Database Migration + Server Modularization
**Rationale:** Every other feature depends on a hosted database and a modular server. The current SQLite file blocks serverless deployment. The single-file Express server cannot accommodate auth middleware, protected routes, or AI endpoints.
**Delivers:** Turso-hosted database, Drizzle ORM query layer, modular Express server with middleware stack, Vercel deployment.
**Addresses:** Database write capability (prerequisite for favorites, verification, enrichment storage).
**Uses:** Turso, @libsql/client, Drizzle ORM, Vercel.
**Avoids:** Pitfall 8 (sync-to-async breakage -- Drizzle abstracts this), Pitfall 2 (size limit -- resolved in Phase 0).

### Phase 2: Google Places Enrichment + Search Upgrade
**Rationale:** This is the single highest-impact change. Replacing 10 stock Unsplash photos with real Google Places images and reviews transforms bare listings into credible profiles. FTS5 search upgrade is also needed here because it unblocks AI search and handles 3.4M records at acceptable speed.
**Delivers:** Real photos and reviews on company profiles, proper full-text search, AI-generated category fallback images, home page API consolidation.
**Addresses:** Table stakes (photos, reviews, hours, search quality).
**Uses:** Google Places API (New v2), @google/genai (category images), R2 (image storage).
**Avoids:** Pitfall 1 (cost explosion -- lazy enrichment with budget caps), Pitfall 9 (matching strategy -- confidence scoring, start with high-quality records), Pitfall 10 (home page API explosion -- consolidate endpoints, activate React Query).

### Phase 3: AI Search with Chat + Filter Chips
**Rationale:** Depends on FTS5 from Phase 2. This is the flagship differentiator -- no competitor in construction directories offers natural language search with visual filter chips. Can be developed in parallel with Phase 4 backend (frontend AI search UI vs backend auth).
**Delivers:** Natural language query parsing via LLM function-calling, filter chip UI, conversational refinement, fallback to keyword search.
**Uses:** Vercel AI SDK, @ai-sdk/google (Gemini 2.0 Flash), Zod (tool parameter validation).
**Avoids:** Pitfall 4 (vector embeddings -- uses function-calling instead), Anti-Pattern 4 (no raw SQL generation by LLM).

### Phase 4: Wild Apricot SSO Authentication
**Rationale:** Authentication is the gateway to all personalized features (synced favorites, profile management, verification). Depends on modular server (Phase 1) for auth middleware. Wild Apricot account setup is an external dependency controlled by HCC.
**Delivers:** "Sign in with HCC" flow, user table, JWT session management, auth context in React, synced favorites.
**Uses:** jose (JWT), Wild Apricot OAuth2 (authorization_code grant).
**Avoids:** Pitfall 3 (CORS -- server-side token exchange), Pitfall 3 detail (refresh tokens -- include obtain_refresh_token=true).

### Phase 5: Verified Business Profiles + File Uploads
**Rationale:** This is the revenue-generating feature. Requires auth (Phase 4) and R2 storage. Verified businesses get badges, search boost, and self-service profile management with photo/video uploads.
**Delivers:** Verification tier system, profile editing dashboard, photo uploads via presigned URLs, verification badges with contextual search boosting, media management.
**Uses:** Cloudflare R2, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, sharp (image processing).
**Avoids:** Pitfall 5 (4.5MB body limit -- presigned URLs), Pitfall 7 (pay-to-win -- score-based boost, not positional partition).

### Phase Ordering Rationale

- **Dependency chain is strict:** Turso migration blocks everything. Server modularization blocks auth. Auth blocks verified profiles. This defines the critical path: Phase 0 -> 1 -> 4 -> 5.
- **Google Places (Phase 2) and AI Search (Phase 3) are parallelizable** with the auth track (Phases 4-5) since they are public features requiring no authentication.
- **Revenue path is Phase 1 -> 4 -> 5.** If speed-to-revenue matters most, defer Phases 2-3 and go straight from database migration to auth to verification.
- **Credibility path is Phase 1 -> 2 -> 3.** If user adoption matters most, make the directory look real (photos, reviews) and search intelligently before adding auth gating.
- **Pitfall avoidance drives grouping:** Google Places cost management must be designed holistically (Phase 2), not piecemeal. Auth must be server-side from the start (Phase 4). File uploads must use presigned URLs from the start (Phase 5).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Database Migration):** Turso 2GB limit is a potential blocker. Need to audit actual DB size after VACUUM, evaluate whether trimming gets under 2GB, and have a fallback plan (self-hosted libSQL or Neon Postgres). Research the Express-on-Vercel adapter pattern in detail.
- **Phase 2 (Google Places):** Cost modeling needs real-world testing. The March 2025 pricing change eliminated the old $200/month credit. Field mask tier separation (Essentials vs Pro) determines actual per-request cost. Photo TOS compliance (no caching photo content) needs careful implementation.
- **Phase 4 (Wild Apricot SSO):** Documentation is sparse and uneven. The Wild Apricot account has not been set up yet (external HCC dependency). OAuth quirks (CORS, refresh tokens, API rate limits) may surface during implementation.

Phases with standard patterns (skip deep research):
- **Phase 3 (AI Search):** LLM function-calling over structured data is a well-documented pattern. Vercel AI SDK has extensive docs and examples.
- **Phase 5 (File Uploads):** Presigned URL upload to R2/S3 is a thoroughly documented pattern. No novel challenges.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against npm registries and official docs. Version numbers confirmed. Cost estimates based on published pricing. |
| Features | HIGH | Table stakes validated against competitors (ConstructConnect, BuildZoom, Google Maps). Differentiators grounded in industry patterns (Airbnb filter chips, Google My Business profile management). Anti-features well-reasoned. |
| Architecture | HIGH | Overlay data model, presigned uploads, LLM function-calling are all proven production patterns. Turso + Vercel integration is well-documented. |
| Pitfalls | HIGH | Critical pitfalls (Turso 2GB limit, Google Places cost, Wild Apricot CORS, vector embedding cost, Vercel body limit) all verified against official documentation and community reports. |

**Overall confidence:** HIGH

### Gaps to Address

- **Turso 2GB limit resolution:** Must run `VACUUM` and audit the actual DB file size. If still over 2GB, need to decide between trimming columns, splitting tables, or switching to an alternative (self-hosted libSQL, Neon Postgres). This is a blocking decision.
- **Wild Apricot account setup:** HCC has not set up their Wild Apricot instance yet. OAuth integration cannot be validated until this exists. Phase 4 has an external dependency.
- **Google Places March 2025 pricing:** The pricing structure changed. Need to run a small-scale enrichment test (100 records) to measure actual costs per request with specific field masks before committing to an enrichment strategy.
- **Express 5.x middleware compatibility:** The project uses Express 5.x, which is relatively new. Each middleware addition (rate-limit, helmet, etc.) should be tested against Express 5.x specifically. Community examples mostly reference Express 4.x.
- **Vercel AI SDK version stability:** v5.0 is recommended. v6.x exists but is too new. Pin versions and test before upgrading.
- **Google Places photo TOS compliance:** The no-caching policy for photo content needs careful implementation. The CDN proxy pattern (re-fetching via photo_reference) needs validation against Google's actual enforcement.

## Sources

### Primary (HIGH confidence)
- [Turso Documentation](https://docs.turso.tech/) -- database hosting, migration, CLI, 2GB limit
- [Turso + Vercel Integration](https://vercel.com/marketplace/tursocloud) -- marketplace plugin, deployment
- [Drizzle ORM + Turso](https://orm.drizzle.team/docs/tutorials/drizzle-with-turso) -- ORM setup, libSQL driver
- [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview) -- enrichment, photos, reviews
- [Google Places API Pricing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) -- cost modeling, field masks
- [Google Places API Policies](https://developers.google.com/maps/documentation/places/web-service/policies) -- TOS, photo caching rules
- [Wild Apricot API Authentication](https://gethelp.wildapricot.com/en/articles/484-api-authentication) -- OAuth2 flow, CORS limitation
- [Wild Apricot CORS Forum](https://forums.wildapricot.com/forums/309658-developers/suggestions/9958881-api-implement-cors-for-cross-domain-api-requests) -- confirmed no CORS support
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/) -- storage, presigned URLs, pricing
- [Vercel Express Guide](https://vercel.com/docs/frameworks/backend/express) -- serverless deployment, body limits
- [jose npm](https://www.npmjs.com/package/jose) -- JWT library, zero native deps
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits) -- free tier changes, IPM limits

### Secondary (MEDIUM confidence)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) -- v5 API, tool calling, useChat hook
- [Vector Bottleneck Research](https://www.shaped.ai/blog/the-vector-bottleneck-limitations-of-embedding-based-retrieval) -- embedding limitations at scale
- [Verified Badge Psychology](https://www.jasminedirectory.com/blog/the-verified-badge-consumer-psychology-and-click-through-rates/) -- 15-30% CTR increase
- [BuildZoom Scoring System](https://www.buildzoom.com/blog/guides/buildzoom-contractor-scoring-system-works) -- competitor verification approach

### Tertiary (LOW confidence)
- [Construction Portfolio Best Practices](https://batieu.com/en/blog/construction-portfolio-best-practices/) -- photo/video guidelines for profiles
- [Search Algorithm Ranking for Marketplaces](https://www.onrampfunds.com/resources/how-search-algorithms-rank-marketplace-listings) -- general ranking patterns

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
