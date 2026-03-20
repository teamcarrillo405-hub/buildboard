# Domain Pitfalls

**Domain:** B2B Construction Directory (BuildBoard) -- AI search, API integrations, auth, verification tiers
**Researched:** 2026-03-11

---

## Critical Pitfalls

Mistakes that cause rewrites, runaway costs, or compliance violations. Address these first.

---

### Pitfall 1: Google Places API Cost Explosion on 3.4M Records

**What goes wrong:** Teams call Google Places API to enrich every record at migration time, then re-call it on every page view. At $10-17 per 1,000 requests (depending on SKU tier), enriching 3.4M records costs $34,000-58,000 in a single batch. Ongoing per-view photo fetches at scale create unbounded monthly bills.

**Why it happens:** Developers treat Google Places as a "free enrichment layer" without modeling the cost curve. The pricing changed March 1, 2025 -- the old $200/month credit is gone, replaced by per-SKU free tiers (~10,000 free events/month for Essentials). Field masking is misunderstood: requesting *any* Pro-tier field (like photos) bills the entire request at Pro rates, even if you also requested Essentials-tier fields.

**Consequences:**
- A single batch enrichment run can generate a five-figure bill overnight.
- Per-view photo calls on a directory with 10K daily visitors creates 50K-500K API calls/month.
- Google can suspend your project within 24 hours if they detect TOS violations (like caching photos).

**Prevention:**
1. **Never batch-enrich all 3.4M records.** Enrich lazily: fetch Google Places data when a user visits a company profile for the first time, then cache metadata (place_id is cacheable; photos are NOT cacheable per TOS).
2. **Set hard budget caps** in Google Cloud Console (daily quotas + billing alerts at 50/75/90%).
3. **Use Place IDs as the bridge.** Match your records to Google Place IDs in a background job, store the place_id (this IS allowed). Fetch photos on-demand at view time.
4. **Separate field masks aggressively.** Make one Essentials-tier request for basic data, a separate Pro-tier request only when the user explicitly wants photos/reviews.
5. **Implement a photo proxy with CDN.** Serve Google Places photos through your own endpoint with a CDN (Cloudflare, Vercel Edge) in front. The photo URL expires, but you can re-fetch the `photo_reference` from the cached `place_id`. This minimizes redundant API calls without violating the no-cache policy for the photo content itself.

**Detection (warning signs):**
- Google Cloud billing dashboard shows >$50/day during development.
- API calls spike linearly with page views rather than plateauing.
- You're storing `photo_reference` strings in your database (these expire and cannot be cached per TOS).

**Phase:** Database enrichment / Google Places integration phase. Must be designed before any Places API code is written.

**Confidence:** HIGH -- verified against [Google Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [pricing documentation](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).

---

### Pitfall 2: Turso's 2GB Database Size Limit Blocks Your 2.1GB SQLite Migration

**What goes wrong:** You attempt to migrate the 2.1GB `constructflix.db` to Turso and the upload fails. Turso's `--from-file` upload has a hard 2GB file size limit. Your database is already over that threshold.

**Why it happens:** Teams choose Turso because it's "SQLite for serverless" without checking size constraints. The 2GB limit is documented but easy to miss. Additionally, the Developer plan ($4.99/month) only provides 9GB total storage across all databases, and at 2.1GB you'd consume nearly a quarter of that on a single database.

**Consequences:**
- Migration blocked entirely if the file exceeds 2GB.
- Even if you compress under 2GB, growth from new fields (Google Places data, verification metadata, embeddings) will push it back over.
- Cold starts on Turso fetch the first 128KB on boot and pull subsequent 128KB segments on demand -- with 3.4M records, initial queries can be slow as pages are fetched.

**Prevention:**
1. **Audit table sizes before choosing a host.** Run `SELECT SUM(length(services)) + SUM(length(certifications)) + SUM(length(hours)) FROM companies;` to see how much space JSON blob columns consume. These may be compressible or decomposable into separate tables.
2. **Trim the database before migration.** Drop unused columns (the CONCERNS.md shows `subCategory`, `videoUrl`, `imageUrl` etc. are phantom columns that exist in the frontend types but not the schema -- verify no bloat from import artifacts). Run `VACUUM` to reclaim space.
3. **Consider column projection.** Create a lean "search" table with only the columns needed for list views (name, category, city, state, rating) and a separate "details" table. This splits the load.
4. **Evaluate alternatives.** If Turso is blocked by size, Neon Postgres (free tier: 0.5GB, paid: scales), PlanetScale (MySQL, generous free tier), or Supabase Postgres are viable. All support serverless connection pooling. If staying SQLite-shaped, `@libsql/client` can connect to a self-hosted libSQL server without Turso's size cap.
5. **Test partial sync behavior.** Turso's serverless model fetches pages on demand. With 3.4M records, benchmark actual cold-start query latency before committing.

**Detection:**
- `ls -la server/constructflix.db` shows >2GB.
- Turso CLI upload fails with size error.
- Post-migration, first query takes >2 seconds (partial sync cold start).

**Phase:** Database migration phase. This is a blocking decision that must be resolved before any serverless deployment work begins.

**Confidence:** HIGH -- [Turso CLI docs](https://docs.turso.tech/cli/db/create) confirm the 2GB file upload limit.

---

### Pitfall 3: Wild Apricot CORS Block Kills Your SPA Authentication Flow

**What goes wrong:** You implement OAuth2 authorization_code flow in the React SPA, the user authenticates on Wild Apricot, the redirect comes back, and the token exchange fails because Wild Apricot's OAuth endpoint (`oauth.wildapricot.org`) does not support CORS. The browser blocks the cross-origin POST to exchange the authorization code for an access token.

**Why it happens:** Wild Apricot's API was designed for server-side applications, not SPAs. Their own documentation states: "Cross domain requests to both API and auth service are not allowed." The only JavaScript exception is code hosted on `yourdomain.wildapricot.org` itself. External SPAs are explicitly unsupported.

**Consequences:**
- Frontend-only OAuth flow is impossible. The authorization code exchange must happen server-side.
- Developers waste days debugging CORS errors before discovering this is by design, not a configuration issue.
- If you try to work around CORS with a proxy, you must handle token storage, refresh, and session management server-side -- fundamentally changing the auth architecture.

**Prevention:**
1. **Accept server-side token exchange from day one.** Design the auth flow as: React SPA redirects to Wild Apricot login -> Wild Apricot redirects back with `code` -> SPA sends `code` to YOUR serverless function -> serverless function exchanges code for token with Wild Apricot (server-to-server, no CORS) -> serverless function creates a session/JWT for the SPA.
2. **Use `authorization_code` grant type**, not `password` or `client_credentials`. The `password` grant requires collecting user credentials in your UI (bad UX, security risk). The `client_credentials` grant gives admin access, not user-scoped access.
3. **Handle refresh tokens explicitly.** Wild Apricot does NOT return refresh tokens by default. You must include `obtain_refresh_token=true` in the token request. Without this, user sessions expire silently and users are forced to re-authenticate.
4. **Store the Wild Apricot `contact_id` and membership level** in your own user table after first login. Don't call the Wild Apricot API on every page load to check membership -- their API is slow and rate-limited.

**Detection:**
- `Access-Control-Allow-Origin` header missing from Wild Apricot responses.
- Token exchange works in Postman but fails in the browser.
- Users report being logged out randomly (missing refresh token handling).

**Phase:** Authentication / Wild Apricot SSO phase. This architectural decision (server-side proxy for auth) must be made before writing any auth code.

**Confidence:** HIGH -- verified via [Wild Apricot API authentication docs](https://gethelp.wildapricot.com/en/articles/484-api-authentication) and [community forums confirming CORS is not supported](https://forums.wildapricot.com/forums/309658-developers/suggestions/9958881-api-implement-cors-for-cross-domain-api-requests).

---

### Pitfall 4: AI Search Vector Embeddings Blow Up Memory and Costs at 3.4M Records

**What goes wrong:** You generate vector embeddings for 3.4M business records (name + category + services + location) using an embedding model (e.g., OpenAI `text-embedding-3-small` at 1536 dimensions). Storing 3.4M x 1536-dimension float32 vectors requires ~20GB of RAM for the index. The embedding generation itself takes hours on GPU and costs $100-400+ for the initial batch. Then the vector database hosting adds $50-200/month.

**Why it happens:** Tutorials show vector search working beautifully on 10K records. At 3.4M records, the infrastructure requirements scale non-linearly. HNSW indexing (the standard for fast ANN search) requires the entire graph in memory. Teams discover this after spending days generating embeddings.

**Consequences:**
- Vector database hosting costs dwarf the rest of the infrastructure.
- Cold starts with vector indexes are slow (loading 20GB into memory).
- Search quality for structured data (business names, categories, cities) is often WORSE with pure vector search than with keyword search, because semantic similarity doesn't help when users type "plumber in Dallas."

**Prevention:**
1. **Use hybrid search, not pure vector search.** For a construction directory, 80%+ of queries are structured (category + location). Use SQLite FTS5 or a search engine (Typesense, MeiliSearch) for keyword/structured search as the primary path. Layer vector search only for natural language queries like "someone who can fix foundation cracks after flooding."
2. **Embed summaries, not full records.** Generate a 1-2 sentence description per company (category + key services + city), embed that. This reduces token costs 10x and improves relevance.
3. **Consider Typesense or MeiliSearch over a vector database.** Both support hybrid search (BM25 + vector) natively, handle millions of records, and are cheaper than dedicated vector databases like Pinecone. Typesense Cloud handles 3M+ records well and costs $30-60/month.
4. **Use the AI for query understanding, not record matching.** Instead of embedding 3.4M records, use Gemini/GPT to parse the natural language query into structured filters (category, location, services, rating) and then run a traditional database query. This is an "AI-assisted search" pattern that scales infinitely because the AI only processes the query, not the corpus.
5. **If you must use vectors:** Use a smaller model (384 dimensions via `all-MiniLM-L6-v2` instead of 1536), quantize to int8 (reduces memory 4x), and use a hosted solution with built-in quantization (Qdrant, Weaviate).

**Detection:**
- Embedding generation takes >4 hours and costs >$100.
- Vector database memory usage exceeds 8GB.
- Users report that searching "plumber Dallas TX" returns worse results than the old keyword search.
- Most queries (>80%) are simple category + location patterns, not natural language.

**Phase:** AI search phase. The search architecture decision (hybrid vs. pure vector) is the single most important decision in this phase.

**Confidence:** HIGH -- based on [vector bottleneck research](https://www.shaped.ai/blog/the-vector-bottleneck-limitations-of-embedding-based-retrieval) and production reports of embedding models breaking at 4M documents.

---

### Pitfall 5: Vercel Serverless 4.5MB Body Limit Blocks File Uploads

**What goes wrong:** Verified businesses try to upload portfolio photos or video through your API, and uploads fail silently or with a `413 FUNCTION_PAYLOAD_TOO_LARGE` error. Vercel serverless functions have a hard 4.5MB request body limit. A single high-resolution construction site photo can exceed this. Video files are 10-500MB+.

**Why it happens:** Developers build file upload the "normal" way (POST multipart form to API endpoint) without realizing serverless platforms impose strict body size limits. This is a fundamental serverless constraint, not a bug.

**Consequences:**
- File upload feature appears broken to users who try to upload standard photos (iPhone photos are 3-8MB each).
- Video upload is completely impossible through the serverless function.
- Developers waste time trying to increase limits that are non-configurable on Vercel.

**Prevention:**
1. **Use presigned URLs for all uploads.** The upload flow must be: client requests a presigned URL from your serverless function (tiny request) -> client uploads directly to S3/R2/Vercel Blob (bypasses serverless function entirely) -> client notifies your API that upload is complete (tiny request) -> serverless function validates and records the upload.
2. **Choose storage: Vercel Blob, Cloudflare R2, or AWS S3.**
   - Vercel Blob: simplest integration, supports up to 5TB files, built-in CDN. Costs: $0.15/GB storage + $0.06/GB bandwidth.
   - Cloudflare R2: zero egress fees, $0.015/GB storage. Better for video (high bandwidth).
   - AWS S3: most flexible, multipart upload support, but egress fees add up.
3. **Implement client-side validation** before upload: max file size (e.g., 50MB photos, 500MB video), allowed MIME types (image/jpeg, image/png, video/mp4), image dimension limits.
4. **For video:** Use multipart upload (chunked) with progress indication. Construction site videos can be large. Consider a video processing pipeline (transcode to web-friendly format, generate thumbnails) using a background job, not the serverless function.
5. **Set upload quotas per verified business** (e.g., 20 photos + 3 videos) to prevent storage cost surprises.

**Detection:**
- Any direct `fetch()` POST with a file body to a Vercel function.
- Upload errors on files >4.5MB.
- `multer` or `formidable` middleware in serverless function code (these are designed for traditional servers, not serverless).

**Phase:** Verified business profile / file upload phase. Must be designed with presigned URLs from the start -- retrofitting is painful.

**Confidence:** HIGH -- [Vercel explicitly documents the 4.5MB limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).

---

## Moderate Pitfalls

Mistakes that cause significant rework or degraded user experience, but are recoverable.

---

### Pitfall 6: Gemini Image Generation Rate Limits and Free Tier Traps

**What goes wrong:** You plan to generate category fallback images using Gemini's free tier, hit the rate limit after a handful of images, and discover that as of December 2025, the free tier has 0 IPM (zero images per minute) -- image generation is completely unavailable without billing enabled. Even with billing, Tier 1 limits are 10 images/minute.

**Why it happens:** Google quietly reduced free tier quotas by 50-80% in December 2025. Blog posts and tutorials from before that date show generous free limits that no longer exist. Multiple API keys don't help -- all keys in the same project share a single quota pool.

**Prevention:**
1. **Enable billing from day one.** Do not prototype on the free tier for image generation.
2. **Pre-generate, don't generate on-demand.** You have ~50 construction categories. Generate 3-5 high-quality images per category (150-250 images total) in a one-time batch job, store them locally in `public/images/categories/`. Cost: ~$5-10 total at $0.02-0.04/image. This eliminates runtime API dependency entirely.
3. **Use Imagen 4 Fast** (not Gemini 2.5 Flash/Pro for images) -- it's the cheapest at $0.02/image and designed for image generation.
4. **Implement exponential backoff** for the batch job. Rate limits can hit any of four dimensions (RPM, RPD, TPM, IPM) independently, and the 429 error doesn't always indicate which one.
5. **Cache generated images permanently.** These are your assets, not Google's data. Store in your own CDN/bucket.

**Detection:**
- 429 `RESOURCE_EXHAUSTED` errors during image generation.
- Image generation code runs in a request handler (on-demand generation at runtime).
- reliance on Gemini free tier for any production feature.

**Phase:** Image pipeline phase. Should be a one-time batch operation, not a runtime feature.

**Confidence:** HIGH -- verified against [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

---

### Pitfall 7: Verified Tier Search Boosting Creates a "Pay-to-Win" Perception

**What goes wrong:** You implement verification boosting by simply multiplying verified businesses' search scores by 2x or always sorting them first. Users quickly notice that the "best" results are always the same paid businesses regardless of relevance. General contractors lose trust in the directory because results feel like paid ads, not genuine recommendations.

**Why it happens:** The simplest implementation is `ORDER BY is_verified DESC, relevance DESC`, which creates a hard partition where every verified business ranks above every non-verified business. This is technically correct but destroys the utility of the directory for the majority of users searching for the best subcontractor, not the one who paid more.

**Consequences:**
- Users stop trusting search results and leave.
- Verified businesses in irrelevant categories appear above highly-rated unverified businesses in the correct category.
- The "verified" badge loses its meaning -- it becomes a "promoted" badge.

**Prevention:**
1. **Boost, don't partition.** Verification should be a score modifier (e.g., +15-25% relevance boost), not an absolute sort key. A 4.8-star unverified plumber in the user's city should still outrank a 3.2-star verified plumber 200 miles away.
2. **Make the boost contextual.** Verification boost only applies when category and location already match. Don't boost a verified electrician into plumbing search results.
3. **Visually distinguish, don't position-stack.** A verified badge, richer profile card, and "Verified Business" label communicate trust without manipulating ranking.
4. **Separate "Sponsored" from "Verified."** If you later add paid promotion (top placement), keep it visually distinct from verification (trust signal). Mixing them erodes both.

**Detection:**
- Search results page shows verified businesses as the first N results regardless of query.
- User complaints about "irrelevant" results.
- SQL query contains `ORDER BY is_verified DESC` as the primary sort.

**Phase:** Verified business tier / search ranking phase.

**Confidence:** MEDIUM -- based on general B2B marketplace best practices and directory product patterns.

---

### Pitfall 8: SQLite-to-Hosted-DB Migration Breaks the Server Without a Query Abstraction Layer

**What goes wrong:** The existing `server/api.js` uses `better-sqlite3` directly with synchronous API calls (`db.prepare().all()`, `db.prepare().get()`). When migrating to Turso, Neon, or any hosted database, every query becomes asynchronous (`await`). This means rewriting every single route handler in the server, not just changing the connection string.

**Why it happens:** `better-sqlite3` is deliberately synchronous (a feature of its design -- it blocks the event loop for simplicity). Every other database client is async. There's no adapter that makes this transition transparent.

**Consequences:**
- Every route handler must be rewritten from `const rows = stmt.all()` to `const { rows } = await client.execute()`.
- Error handling patterns change (sync try/catch vs. async try/catch or promise chains).
- The fragile `parseChat` NLP function (lines 286-344 in `server/api.js`) that chains multiple queries will need careful async refactoring.
- If you miss converting even one query, it silently returns a Promise object instead of data, causing bizarre frontend bugs.

**Prevention:**
1. **Create a data access layer (DAL) NOW, before migration.** Wrap all database queries in async functions: `async function getCompanies(filters)`. The current implementation can use `better-sqlite3` synchronously inside the async wrapper. When you migrate, only the DAL internals change.
2. **Convert `server/api.js` to TypeScript before migration.** TypeScript will catch sync/async mismatches at compile time. The CONCERNS.md already flags that the server has no TypeScript and no input validation.
3. **Use Drizzle ORM or Kysely as the query builder.** Both support SQLite (local dev) AND Turso/Postgres (production) with the same query API. This makes the migration a configuration change, not a rewrite.
4. **Write integration tests for each API endpoint BEFORE migration.** Without tests (zero exist currently), you won't know if the migration broke anything until users report it.

**Detection:**
- Direct `db.prepare()` calls in route handlers (no abstraction).
- `server/api.js` is still plain JavaScript with no type checking.
- No test suite to validate query results after migration.

**Phase:** This should be addressed BEFORE the database migration phase. It's a prerequisite, not part of the migration itself.

**Confidence:** HIGH -- the current codebase in `server/api.js` is confirmed to use synchronous `better-sqlite3` calls with no abstraction layer.

---

### Pitfall 9: Enriching 3.4M Records with Google Places Without a Matching Strategy

**What goes wrong:** You try to match your 3.4M construction company records to Google Places by searching for `business_name + city + state`. Match rates are low (40-60%) because your data uses different name formats, abbreviations, or outdated information. You end up with mismatches (wrong business linked to wrong Place ID) or millions of unmatched records.

**Why it happens:** Business name matching is hard. "Smith & Sons Construction LLC" vs. "Smith and Sons Construction" vs. "Smith Construction" are all the same company but different strings. Google Places may return a different "Smith Construction" in the same city. Without a verification step, you silently link wrong businesses.

**Consequences:**
- Wrong photos, reviews, or hours displayed for businesses (destroys credibility).
- Wasted API budget on failed match attempts.
- Matched businesses show conflicting information (your data says one phone number, Google says another).

**Prevention:**
1. **Match lazily, not eagerly.** Don't batch-match all 3.4M records. Match when a user views a company profile. Cache the match result (place_id) for future visits.
2. **Use a confidence scoring approach.** Match on name + address + phone number. Require at least 2 of 3 to match. If only name matches, flag for manual review or show "unverified" data.
3. **Store match confidence.** Add a `google_match_confidence` column (HIGH/MEDIUM/LOW/NONE). Only display Google data for HIGH confidence matches.
4. **Show Google data as supplementary, not primary.** Display your data as the source of truth, with Google reviews/photos as "Additional Information" below. This way, mismatches are supplementary, not misleading.
5. **Start with verified businesses only.** Verified businesses can confirm their Google Places match manually, ensuring 100% accuracy for the businesses that matter most.

**Detection:**
- Batch job running through all 3.4M records against Google Places API.
- No match confidence threshold in the code.
- Users report wrong photos or reviews on business profiles.

**Phase:** Google Places integration phase.

**Confidence:** MEDIUM -- based on data quality research and B2B directory patterns. Specific match rates are estimated.

---

## Minor Pitfalls

Issues that cause friction or tech debt but are manageable.

---

### Pitfall 10: Home Page 17+ API Requests Will Multiply After Adding Google Places Data

**What goes wrong:** The current home page fires 17+ API requests on every mount (documented in CONCERNS.md). Adding Google Places photos to each company card means each of those 17+ requests could trigger additional Places API calls to fetch photos. Without caching, the home page could generate 50-100+ API calls per visit.

**Prevention:**
1. Migrate to React Query (already in `package.json` but unused) BEFORE adding Google Places data. This gives you automatic caching, deduplication, and stale-while-revalidate.
2. Create a single `/api/home` endpoint that returns all home page data in one response, with photos pre-resolved server-side.
3. For category rails, pre-cache the top 20 companies per category with their photo URLs in a Redis/KV store that refreshes daily.

**Phase:** Should be resolved as part of tech debt cleanup BEFORE Google Places integration.

**Confidence:** HIGH -- confirmed from CONCERNS.md analysis of current codebase.

---

### Pitfall 11: Unsplash Hotlinking Dies When You Achieve Any Real Traffic

**What goes wrong:** The current fallback images are hotlinked from Unsplash. Unsplash's TOS requires attribution, and their CDN may rate-limit or block hotlinking from high-traffic sites. When this happens, every company card without a Google Places photo shows a broken image.

**Prevention:**
1. Download the ~10 Unsplash images to `public/images/categories/` immediately. This is a 5-minute fix.
2. Replace with AI-generated category images (Gemini batch job) as the long-term solution.
3. Add `onerror` fallback on all `<img>` tags to a local placeholder SVG.

**Phase:** Should be fixed immediately, before any other work. It's a ticking time bomb.

**Confidence:** HIGH -- confirmed from CONCERNS.md, all images currently hotlink to `images.unsplash.com`.

---

### Pitfall 12: No `.gitignore` Means the 2.1GB Database Could Be Committed

**What goes wrong:** Without a `.gitignore`, someone runs `git add .` and commits the 2.1GB database, the 461MB `companies.json`, the 292MB `output/` directory, and any future `.env` files with API keys.

**Prevention:**
1. Create `.gitignore` as the very first task before any other work.
2. Include: `server/*.db`, `output/`, `*.env`, `node_modules/`, `dist/`, `.env*`.
3. If these files were already committed, use `git rm --cached` to remove them from tracking.

**Phase:** Immediate prerequisite. Do this before the first commit of any new work.

**Confidence:** HIGH -- confirmed from CONCERNS.md.

---

### Pitfall 13: Express 5.x Middleware Incompatibility

**What goes wrong:** The project uses Express 5.x (`^5.2.1`), which is a relatively new major version. When you add middleware like `express-rate-limit`, `helmet`, `cors` with specific configs, or `multer`, you may encounter breaking changes from Express 4.x patterns. Community examples and Stack Overflow answers almost all reference Express 4.x.

**Prevention:**
1. Pin Express version exactly in `package.json` (remove `^`).
2. Test each middleware addition against Express 5.x specifically.
3. If stability is critical, evaluate downgrading to Express 4.x before adding new middleware.

**Phase:** Affects every phase that modifies the server.

**Confidence:** MEDIUM -- Express 5.x is relatively new and middleware ecosystem compatibility varies.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| **Database migration** | 2.1GB exceeds Turso's 2GB upload limit | CRITICAL | Trim DB, consider alternatives (Neon, Supabase), or self-host libSQL |
| **Database migration** | Sync-to-async query rewrite breaks every route | CRITICAL | Build DAL abstraction layer BEFORE migration |
| **Google Places integration** | Cost explosion from batch enrichment | CRITICAL | Lazy enrichment, budget caps, field mask separation |
| **Google Places integration** | Photo caching violates TOS, leads to suspension | CRITICAL | Serve photos via CDN proxy, never cache `photo_reference` |
| **Google Places integration** | Low match rates cause wrong data on profiles | MODERATE | Confidence scoring, lazy matching, manual verification for paid tier |
| **AI search** | Vector embeddings at 3.4M records costs too much and returns worse results | CRITICAL | Use AI for query parsing + traditional search, not corpus embedding |
| **Wild Apricot SSO** | CORS blocks frontend OAuth flow | CRITICAL | Server-side token exchange from day one |
| **Wild Apricot SSO** | Refresh tokens not returned by default | MODERATE | Include `obtain_refresh_token=true` in token request |
| **File uploads** | Vercel 4.5MB body limit blocks photos/video | CRITICAL | Presigned URL pattern from the start |
| **Verified business tier** | Pay-to-win perception from naive sort boosting | MODERATE | Score-based boosting, not positional partition |
| **Image generation (Gemini)** | Free tier has 0 IPM, rate limits aggressive | MODERATE | Pre-generate batch of ~250 images, store locally |
| **Tech debt (pre-req)** | 17+ API calls per home page will compound with Places data | MODERATE | Migrate to React Query + batch endpoints first |
| **Tech debt (pre-req)** | Unsplash hotlinking breaks at scale | LOW (but easy to fix) | Download images locally immediately |
| **Infrastructure** | No `.gitignore` risks committing 2.1GB database + secrets | CRITICAL | Create `.gitignore` as literal first action |

---

## Sources

- [Google Places API Policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Places API Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Google Maps Platform TOS](https://cloud.google.com/maps-platform/terms)
- [Turso CLI db create docs (2GB limit)](https://docs.turso.tech/cli/db/create)
- [Turso serverless blog](https://turso.tech/blog/serverless)
- [Wild Apricot API Authentication](https://gethelp.wildapricot.com/en/articles/484-api-authentication)
- [Wild Apricot CORS forum thread](https://forums.wildapricot.com/forums/309658-developers/suggestions/9958881-api-implement-cors-for-cross-domain-api-requests)
- [Vector Bottleneck: Limitations of Embedding-Based Retrieval](https://www.shaped.ai/blog/the-vector-bottleneck-limitations-of-embedding-based-retrieval)
- [Vercel body size limit guide](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Maps API 2025 pricing changes](https://www.storelocatorwidgets.com/blogpost/20499/New_Google_Maps_API_free_credit_system_from_March_1st_2025)

---

*Pitfalls audit: 2026-03-11*
