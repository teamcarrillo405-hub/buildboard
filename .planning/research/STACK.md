# Technology Stack Additions

**Project:** BuildBoard (evolving ConstructFlix)
**Researched:** 2026-03-11
**Scope:** New libraries/services to ADD to existing Vite+React+TS+Tailwind+Express+SQLite stack

---

## Recommended Stack Additions

### Database: SQLite to Serverless Migration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Turso | Cloud service | Hosted libSQL database (SQLite-compatible) | The 2.1GB SQLite file cannot run on Vercel/Netlify serverless -- better-sqlite3 requires a persistent filesystem. Turso is a libSQL fork of SQLite, so the existing data model and queries remain compatible. Free tier provides 5GB storage (2.1GB DB fits comfortably), 500M row reads/month. No migration to Postgres needed. | HIGH |
| @libsql/client | ^0.17.0 | TypeScript client for Turso/libSQL | Official Turso client. Drop-in replacement for better-sqlite3 in serverless. Supports both local SQLite files (dev) and remote Turso (prod). Zero-config switching via environment variable. | HIGH |
| drizzle-orm | ^0.45.1 | Type-safe SQL query builder and ORM | Replaces raw SQL string queries in server/api.js with typed, composable queries. Native Turso/libSQL driver support. Schema-as-code with TypeScript. Lightweight (no heavy runtime like Prisma). Generates migrations via drizzle-kit. | HIGH |
| drizzle-kit | ^0.30.0 | Schema migration tool for Drizzle | Generates and runs SQL migrations. Supports `drizzle-kit push` for rapid SQLite schema changes during development. Works with both local SQLite and Turso. | HIGH |

**Why not Prisma:** Prisma's runtime is too heavy for serverless cold starts (~3-5s vs ~200ms for Drizzle). Prisma also requires a schema file separate from TypeScript -- Drizzle keeps everything in TS.

**Why not PlanetScale:** PlanetScale is MySQL-compatible, not SQLite-compatible. Would require rewriting all queries and schema. Turso preserves SQLite compatibility.

**Why not keep better-sqlite3:** It requires native C++ bindings and a persistent filesystem. Neither Vercel nor Netlify serverless functions support this. better-sqlite3 stays for local development only.

**Dev/Prod pattern:**
```typescript
// Use local SQLite file in dev, Turso in production
const client = NODE_ENV === 'production'
  ? createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN })
  : createClient({ url: 'file:./server/constructflix.db' });
```

### AI Search: Chat Interface + Smart Filters

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ai (Vercel AI SDK) | ^5.0.0 | AI orchestration, streaming, tool calling | Framework-agnostic (works with Express, not just Next.js). Provides `streamText`, `generateText`, tool definitions for structured AI search. Handles streaming responses for chat UI. The `useChat` React hook eliminates boilerplate for chat state management. Version 5.x is the latest stable line; 6.x exists but is brand new and still stabilizing. | MEDIUM |
| @ai-sdk/google | ^1.2.0 | Gemini provider for Vercel AI SDK | Connects AI SDK to Google Gemini models. Use `gemini-2.0-flash` for fast, cheap search queries. Unified interface means swapping to another model later requires changing one line. | MEDIUM |

**Why Vercel AI SDK over raw @google/genai for search:** The AI SDK provides streaming, tool calling, and React hooks (`useChat`) out of the box. Building chat + tool-use on raw Gemini SDK means reinventing streaming protocols, message history management, and UI state. The AI SDK already solved these problems.

**Why not LangChain:** Over-engineered for this use case. BuildBoard needs "take user query, call Gemini, extract filters, return results" -- not a multi-step agent chain. AI SDK's tool calling handles this directly.

**Why not OpenAI:** Gemini is already in the stack for image generation. Using one provider (Google) for both search AI and image generation simplifies API key management, billing, and reduces vendor count.

**Search architecture pattern:**
```typescript
// Server: Define tools that map to database queries
const tools = {
  searchCompanies: tool({
    description: 'Search construction companies by filters',
    parameters: z.object({
      category: z.string().optional(),
      state: z.string().optional(),
      city: z.string().optional(),
      minRating: z.number().optional(),
      query: z.string().optional(),
    }),
    execute: async (params) => db.searchCompanies(params),
  }),
};

// AI converts natural language to structured tool calls
const result = streamText({
  model: google('gemini-2.0-flash'),
  tools,
  messages,
});
```

### Image Generation: AI Category Fallbacks

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @google/genai | ^1.44.0 | Gemini API for AI-generated category images | Official unified Google GenAI SDK (replaces deprecated @google/generative-ai). Supports image generation via `gemini-2.5-flash-image` (fast, free tier: 500 images/day) and `gemini-3-pro-image-preview` (higher quality). Use for generating category hero images as fallback when Google Places has no photos. | MEDIUM |

**Why @google/genai directly (not through AI SDK) for image generation:** The Vercel AI SDK is optimized for text generation and tool calling. Image generation is a different workflow -- batch-generate category images offline, cache them, serve as static assets. No streaming or chat hooks needed. Direct SDK is simpler.

**Why not DALL-E / Stable Diffusion:** Gemini offers free tier (500 images/day), already in the stack for search AI, single billing relationship with Google. DALL-E adds OpenAI as a second vendor. Stable Diffusion requires self-hosting GPU infrastructure.

**Generation strategy:** Pre-generate ~50 category images (one per construction category) at build time or via admin script. Cache in Cloudflare R2. This is NOT real-time generation per request -- that would be expensive and slow.

### Google Places Integration: Photos and Reviews

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Google Places API (New) | v2 | Company photos, reviews, hours, ratings | Server-side REST API calls to enrich company listings with real photos and Google reviews. Use Text Search to match companies by name+location, then Place Details for photos/reviews. Field masking controls cost -- request only what you need. | HIGH |

**No npm package needed.** Google Places API (New) is a REST API called server-side via `fetch`. No client SDK required. Keep API key server-side only.

**Cost management strategy:**
- Use field masks to request only `photos`, `reviews`, `rating`, `currentOpeningHours` -- avoid expensive "Preferred" tier fields
- Cache results in Turso (company_enrichment table) with TTL (30-day refresh)
- Batch-enrich on a schedule (nightly cron for top-viewed companies), not real-time per request
- Google provides $200/month free credit for Maps Platform (covers ~6,600 Place Details Basic requests)

**Why not Google Maps JavaScript API:** The Maps JS API runs client-side and exposes the API key. Server-side REST calls keep the key secure and enable caching.

### Authentication: Wild Apricot SSO

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| jose | ^6.2.1 | JWT signing, verification, encryption | Zero-dependency, works in all runtimes (Node.js, serverless, edge). After Wild Apricot OAuth returns user data, mint a JWT session token. 43M+ weekly npm downloads. Replaces jsonwebtoken which has native dependencies. | HIGH |

**Wild Apricot OAuth2 flow (no npm package exists -- implement directly):**

Wild Apricot exposes standard OAuth2 Authorization Code flow endpoints:

| Endpoint | URL |
|----------|-----|
| Authorization | `https://{org}.wildapricot.org/sys/login/OAuthLogin` |
| Token | `https://oauth.wildapricot.org/auth/token` |
| User Info | `https://api.wildapricot.org/v2.1/accounts/{account_id}/contacts/me` |
| Scope | `auto` |

**Implementation pattern:**
1. Register BuildBoard as "Server application" in Wild Apricot admin
2. Add redirect URL to Wild Apricot "Trusted redirect domains"
3. Frontend redirects to Wild Apricot authorization URL
4. Wild Apricot redirects back with authorization code
5. Backend exchanges code for access token (POST to token endpoint, credentials in Authorization header)
6. Backend fetches user profile from User Info endpoint
7. Backend mints JWT session token via `jose`, returns to frontend
8. Frontend stores JWT, sends in Authorization header for subsequent requests

**Why not Auth0/Clerk/NextAuth:** The requirement is specifically Wild Apricot SSO for HCC members. Adding a third-party auth service creates unnecessary indirection. Wild Apricot IS the identity provider -- talk to it directly.

**Why jose over jsonwebtoken:** jsonwebtoken has native C++ dependencies (similar problem to better-sqlite3 in serverless). jose is pure JavaScript, zero dependencies, works everywhere.

### File Uploads: Photos and Videos

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Cloudflare R2 | Cloud service | Object storage for uploaded photos/videos | S3-compatible API, zero egress fees (critical for a directory that serves lots of images), 10GB free tier. Presigned URLs enable direct browser-to-R2 uploads without routing through serverless functions (which have 4.5MB body limits on Vercel). | HIGH |
| @aws-sdk/client-s3 | ^3.x | S3 client for generating presigned URLs | Official AWS SDK v3, works with Cloudflare R2 via S3-compatible API. Tree-shakeable -- only import what you use. Used server-side to generate upload/download URLs. | HIGH |
| @aws-sdk/s3-request-presigner | ^3.x | Generate presigned upload URLs | Creates time-limited signed URLs for direct browser uploads. Keeps R2 credentials server-side. | HIGH |
| sharp | ^0.33.x | Server-side image processing | Resize uploaded photos to standard dimensions, generate thumbnails, strip EXIF data. Fast (libvips-based). Use in a build/upload pipeline, not in serverless hot path. | MEDIUM |

**Upload flow:**
1. Verified business requests upload URL from API
2. API generates presigned PUT URL for R2 (with content-type and size constraints)
3. Browser uploads file directly to R2 via presigned URL
4. API receives upload confirmation, stores R2 key in database
5. Serve images via R2 public URL or Cloudflare CDN

**Why not Vercel Blob:** Vercel Blob has higher egress costs and vendor lock-in. R2's zero egress is significant for an image-heavy directory with 3.4M listings.

**Why not AWS S3:** S3 charges egress fees ($0.09/GB). For a directory serving images to thousands of users, this adds up fast. R2's zero egress is the killer feature.

**Video constraints:** Set max video size (100MB), max duration (60s), accepted formats (mp4, webm). Process server-side via a background job, not in the upload request. Consider ffmpeg-wasm for thumbnail extraction if needed.

### Deployment: Serverless Platform

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vercel | Cloud service | Frontend hosting + serverless API | Native Vite/React support, zero-config deployment for frontend. Express apps deploy as serverless functions via `vercel.json` routing config. Free tier includes 100GB bandwidth, serverless function invocations. Git-push deploys. | HIGH |
| dotenv | ^16.x | Environment variable management (dev only) | Load .env file in local development. Vercel/Netlify handle env vars in production via their dashboards. Keeps API keys out of code. | HIGH |

**Vercel deployment structure:**
```
/api/index.ts        # Express app exported as serverless function
/dist/               # Vite build output (static frontend)
/vercel.json         # Route config: /api/* -> serverless, /* -> static
```

**Why Vercel over Netlify:** Vercel has first-class Turso integration (marketplace plugin), better serverless function support for Express, and the AI SDK is built by Vercel (tighter integration). Both work, but Vercel has fewer friction points for this stack.

**Serverless limitations to plan for:**
- 10s execution limit (free tier), 60s (Pro) -- AI streaming responses need to complete within this
- 4.5MB request body limit -- hence presigned URLs for file uploads
- Cold starts (~200ms with Drizzle+libSQL, acceptable)
- No persistent filesystem -- hence Turso for DB, R2 for files

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| zod | ^3.24.x | Schema validation | Validate API inputs, AI tool parameters, form submissions. Already a dependency of Vercel AI SDK. | HIGH |
| dotenv | ^16.x | Env var loading in development | Load API keys from .env file locally. Not needed in production (Vercel dashboard). | HIGH |
| @tanstack/react-query | ^5.90.x | Server state management | Already installed (unused). Activate it to replace manual useState/useEffect fetch patterns. Provides caching, deduplication, background refetching. | HIGH |
| nanoid | ^5.x | ID generation | Generate unique IDs for uploads, sessions, cache keys. Tiny, fast, URL-safe. | MEDIUM |

### Clean Up: Remove Unused Dependencies

| Package | Action | Reason |
|---------|--------|--------|
| axios | REMOVE | Not used anywhere. fetch() is the standard. |
| @tanstack/react-query-devtools | KEEP (dev only) | Useful once React Query is actually activated. |
| better-sqlite3 | KEEP (dev only) | Use for local development via @libsql/client's file: protocol. Remove from production build. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Database hosting | Turso | PlanetScale | MySQL-based, requires query/schema rewrite from SQLite |
| Database hosting | Turso | Neon (Postgres) | Requires full migration from SQLite to Postgres. Turso preserves SQLite compatibility |
| ORM | Drizzle | Prisma | Heavy runtime (~3-5s cold starts), schema file separate from TS, worse for serverless |
| ORM | Drizzle | Kysely | Similar philosophy but less ecosystem momentum, no built-in migration tool |
| AI SDK | Vercel AI SDK | LangChain | Over-engineered for search-with-tools. Heavy dependency tree, abstraction overkill |
| AI SDK | Vercel AI SDK | Raw @google/genai | No streaming helpers, no React hooks, no tool-calling abstraction. More code to write |
| Auth | Direct OAuth2 + jose | Auth0 | Adds unnecessary middleman. Wild Apricot IS the IdP |
| Auth | Direct OAuth2 + jose | Clerk | Same -- extra service, extra cost, extra dependency for a simple OAuth2 flow |
| Auth | jose | jsonwebtoken | Native C++ deps break in serverless. jose is pure JS, zero deps |
| File storage | Cloudflare R2 | AWS S3 | Egress fees. R2 has zero egress, critical for image-heavy directory |
| File storage | Cloudflare R2 | Vercel Blob | Higher egress costs, less control, vendor lock-in |
| File storage | Cloudflare R2 | Uploadthing | Adds abstraction layer over S3. For this use case, direct R2 with presigned URLs is simpler |
| Deployment | Vercel | Netlify | Both work. Vercel has Turso marketplace integration, better Express serverless support |
| Image processing | sharp | Cloudinary | Cloudinary charges per transformation. sharp is free, runs server-side |

---

## Installation

```bash
# Database layer (Turso + Drizzle)
npm install drizzle-orm @libsql/client
npm install -D drizzle-kit

# AI search (Vercel AI SDK + Gemini)
npm install ai @ai-sdk/google

# Image generation (direct Gemini SDK)
npm install @google/genai

# Authentication (JWT handling)
npm install jose

# File uploads (S3-compatible client for Cloudflare R2)
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Validation (likely auto-installed with ai, but pin explicitly)
npm install zod

# Environment variables
npm install dotenv

# Image processing (for upload pipeline)
npm install sharp

# ID generation
npm install nanoid

# Remove unused
npm uninstall axios
```

---

## Environment Variables Required

```bash
# .env (local development)

# Turso Database
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Google APIs
GOOGLE_GEMINI_API_KEY=your-gemini-api-key
GOOGLE_PLACES_API_KEY=your-places-api-key

# Wild Apricot OAuth
WILD_APRICOT_CLIENT_ID=your-client-id
WILD_APRICOT_CLIENT_SECRET=your-client-secret
WILD_APRICOT_ACCOUNT_ID=your-account-id
WILD_APRICOT_REDIRECT_URI=http://localhost:3000/auth/callback

# JWT
JWT_SECRET=your-jwt-signing-secret

# Cloudflare R2
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=buildboard-uploads
R2_PUBLIC_URL=https://your-r2-public-domain.com

# App
NODE_ENV=development
PORT=3001
```

---

## API Cost Estimates

| Service | Free Tier | Estimated Monthly Cost (at scale) | Notes |
|---------|-----------|-----------------------------------|-------|
| Turso | 5GB storage, 500M reads | $0 (free tier covers 2.1GB DB) | Upgrade to $4.99/mo Developer plan if reads exceed 500M |
| Gemini (search) | 15 RPM free (gemini-2.0-flash) | ~$5-20/mo at moderate usage | Flash model is cheapest; per-token pricing |
| Gemini (images) | 500 images/day free (2.5-flash-image) | $0 for category images | Only ~50 categories to generate. One-time cost. |
| Google Places | $200/mo free credit | $0-50/mo with caching | Cache aggressively. Field masks reduce per-request cost |
| Cloudflare R2 | 10GB storage, 10M Class A ops | $0-5/mo | Zero egress. Only pay for storage beyond 10GB |
| Vercel | 100GB bandwidth, 100 hrs serverless | $0 (free tier) | Upgrade to Pro ($20/mo) for 60s function timeout |
| Wild Apricot | Depends on HCC plan | $0 (API included) | OAuth is included in Wild Apricot subscription |

**Total estimated cost at launch: $0-25/month** (mostly within free tiers)

---

## Version Verification Notes

| Package | Stated Version | Source | Verification Date |
|---------|---------------|--------|-------------------|
| @libsql/client | ^0.17.0 | npm registry search | 2026-03-11 |
| drizzle-orm | ^0.45.1 | npm registry search | 2026-03-11 |
| ai (Vercel AI SDK) | ^5.0.0 | npm/Vercel blog (5.x stable, 6.x exists but too new) | 2026-03-11 |
| @google/genai | ^1.44.0 | npm registry search | 2026-03-11 |
| jose | ^6.2.1 | npm registry search | 2026-03-11 |
| @aws-sdk/client-s3 | ^3.x | npm/Cloudflare R2 docs | 2026-03-11 |
| sharp | ^0.33.x | npm (training data, MEDIUM confidence) | 2026-03-11 |
| zod | ^3.24.x | npm (training data, MEDIUM confidence) | 2026-03-11 |

---

## Sources

- [Turso + Vercel Integration](https://vercel.com/marketplace/tursocloud)
- [Turso Serverless JavaScript Driver](https://turso.tech/blog/introducing-turso-serverless-javascript-driver)
- [Drizzle ORM + Turso Tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-turso)
- [Drizzle ORM Connect Turso](https://orm.drizzle.team/docs/connect-turso)
- [Vercel AI SDK Introduction](https://ai-sdk.dev/docs/introduction)
- [AI SDK 5 Announcement](https://vercel.com/blog/ai-sdk-5)
- [AI SDK Google Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [@google/genai npm](https://www.npmjs.com/package/@google/genai)
- [Gemini Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [Google Places API Overview](https://developers.google.com/maps/documentation/places/web-service/overview)
- [Google Places Photos (New)](https://developers.google.com/maps/documentation/places/web-service/place-photos)
- [Google Places API Pricing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Wild Apricot API Authentication](https://gethelp.wildapricot.com/en/articles/484-api-authentication)
- [Wild Apricot Authorizing External Apps](https://gethelp.wildapricot.com/en/articles/180-authorizing-external-applications)
- [Wild Apricot SSO Docs](https://gethelp.wildapricot.com/en/articles/200-single-sign-on-service-sso)
- [Wild Apricot OAuth Setup (Drupal reference)](https://www.drupal.org/docs/extending-drupal/contributed-modules/contributed-module-documentation/oauth-openid-connect-login-oauth2-client-sso-login/wild-apricot-oauth-sso-setup)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 with AWS SDK v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [jose npm](https://www.npmjs.com/package/jose)
- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Vercel Express Deployment Guide](https://vercel.com/kb/guide/using-express-with-vercel)
- [Turso Pricing](https://turso.tech/pricing)

---

*Stack research: 2026-03-11*
