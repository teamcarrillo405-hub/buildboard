# Phase 1: Infrastructure & Rebrand - Research

**Researched:** 2026-03-11
**Domain:** Database migration, Express modularization, Vercel deployment, UI rebrand
**Confidence:** HIGH

## Summary

Phase 1 transforms the ConstructFlix prototype into a deployable BuildBoard application. The work spans four distinct domains: (1) migrating a 2.1GB SQLite database to Turso via Drizzle ORM, (2) modularizing a 450-line single-file Express server into route modules, (3) deploying the Vite+React frontend and Express API to Vercel, and (4) rebranding the UI from a Netflix-inspired dark entertainment theme to a clean, professional B2B construction directory.

The most critical blocker is the database: the `constructflix.db` file is 2,247,634,944 bytes (2.09 GB), which exceeds Turso's 2GB `--from-file` upload limit. However, analysis shows the database contains removable columns (`dataSource` is identical for all 3.4M rows at 49.2 MB, `importedAt` is identical for all rows) and VACUUM can reclaim internal fragmentation. The `--from-dump` route supports up to 8GB, providing a reliable fallback. The Vercel deployment is straightforward: Express apps are now first-class on Vercel with zero-config detection, static files serve from `public/`, and `vercel.json` is only needed for custom routing.

**Primary recommendation:** Trim the database below 2GB by dropping `dataSource` and `importedAt` columns (both identical across all 3.4M rows), then VACUUM. If still over 2GB, use `--from-dump` with the SQLite `.dump` command. Build the Drizzle schema as a typed DAL wrapping the existing `companies` table before touching any route code. Modularize Express routes first (pure refactor, no behavior change), then swap the database layer, then deploy.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Database migrated from local SQLite (2.1GB) to hosted Turso with Drizzle ORM | Turso migration strategy with 2GB workaround, Drizzle schema definition, @libsql/client connection pattern, dev/prod switching |
| INFRA-02 | Express server modularized from single-file into route modules with middleware | Express.Router pattern, recommended folder structure, middleware stack ordering |
| INFRA-03 | Application deployed to Vercel (static frontend + serverless API functions) | Vercel Express zero-config deployment, vercel.json routing, static file serving from public/ |
| INFRA-04 | Environment variables managed via Vercel env config | Vercel env var dashboard, dotenv for local dev, no hardcoded values |
| INFRA-05 | Unused dependencies removed (axios, @tanstack/react-query, react-query-devtools) | Package audit confirms axios unused, react-query unused, devtools unimported |
| UI-01 | Application rebranded from ConstructFlix to BuildBoard (name, logo, identity) | Current branding already partially updated in Navigation.tsx and index.html; remaining ConstructFlix references in package.json name and database filename |
| UI-02 | Visual design is clean, professional, easy on the eyes (B2B appropriate) | Color palette adjustment from entertainment dark to professional dark, typography refinement, spacing improvements |
| UI-04 | Responsive design works well on mobile | Current Navigation.tsx search bar needs mobile treatment, ContentRail touch scrolling, CompanyCard grid breakpoints |
</phase_requirements>

## Standard Stack

### Core (Phase 1 Only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.x | Type-safe SQL query builder / ORM | Replaces raw SQL strings with typed queries. Native Turso/libSQL driver. Lightweight (~7.4kb). Schema-as-TypeScript. |
| @libsql/client | ^0.17.x | Turso/libSQL database client | Official Turso client. Supports both `file:` protocol (local SQLite dev) and `libsql://` (remote Turso prod). Drop-in replacement for better-sqlite3 in async context. |
| drizzle-kit | ^0.30.x | Schema migration CLI tool | Generates SQL migrations from TypeScript schema. Supports `drizzle-kit push` for rapid dev. Works with both SQLite and Turso. |
| dotenv | ^16.x | Environment variable loading (dev only) | Loads `.env` in local dev. Vercel handles env vars in production via dashboard. |

### Already Installed (Keep)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| express | ^5.2.1 | REST API framework | Keep. Express 5 with modular routes. |
| cors | ^2.8.6 | CORS middleware | Keep. Still needed for API. |
| react | ^18.2.0 | UI framework | Keep unchanged. |
| react-dom | ^18.2.0 | DOM renderer | Keep unchanged. |
| react-router-dom | ^6.21.1 | Client routing | Keep unchanged. |
| framer-motion | ^10.17.0 | Animation | Keep. Used for transitions. |
| lucide-react | ^0.303.0 | Icons | Keep. Used on profile/search pages. |
| better-sqlite3 | ^12.6.2 | Local SQLite driver | Keep for dev only. @libsql/client `file:` protocol replaces it for prod. |
| tailwindcss | ^3.4.0 | CSS framework | Keep. Theme config gets updated for rebrand. |

### Remove

| Library | Action | Reason |
|---------|--------|--------|
| axios | `npm uninstall axios` | Not imported anywhere. All fetches use native `fetch()`. |
| @tanstack/react-query | `npm uninstall @tanstack/react-query` | Listed but unused. Custom hooks in `src/api/hooks.ts` handle all data fetching. |
| @tanstack/react-query-devtools | `npm uninstall @tanstack/react-query-devtools` | Not imported anywhere. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Turso | Neon Postgres | Would require rewriting all queries from SQLite dialect to Postgres. Turso preserves SQLite compatibility. |
| Turso | Supabase Postgres | Same query rewrite issue. Supabase adds auth/storage features not needed yet. |
| Drizzle ORM | Prisma | Heavy runtime (3-5s cold starts vs ~200ms for Drizzle). Separate schema file vs TypeScript-native. |
| Drizzle ORM | Raw @libsql/client | No type safety, manual query strings, no migration tooling. Drizzle is thin enough to not add overhead. |
| Vercel | Netlify | Both work. Vercel has first-class Express support, Turso marketplace integration, better DX for this stack. |
| Vercel | Railway/Render | Traditional server hosting, not serverless. Would work but loses CDN edge for static assets, preview deployments. |

**Installation (Phase 1):**
```bash
# Add database layer
npm install drizzle-orm @libsql/client dotenv
npm install -D drizzle-kit

# Remove unused
npm uninstall axios @tanstack/react-query @tanstack/react-query-devtools
```

## Architecture Patterns

### Recommended Server Structure (Post-Modularization)

```
server/
  index.ts              # Entry point: app setup, middleware stack, mount routes, export app
  db.ts                 # Database connection (Turso prod / local SQLite dev)
  schema.ts             # Drizzle schema definition (companies table)
  middleware/
    errorHandler.ts     # Centralized error handler (catch-all)
  routes/
    companies.ts        # GET /api/companies, GET /api/companies/:id, GET /api/featured, etc.
    search.ts           # GET /api/search, GET /api/chat
    categories.ts       # GET /api/categories, GET /api/states, GET /api/stats
  helpers/
    parseRow.ts         # parseRow() and tryParseJSON() extracted from api.js
    parseChat.ts        # parseChat() NLP function + synonym/state maps
```

### Pattern 1: Express Router Modules

**What:** Each route file creates an `express.Router()`, defines its endpoints, and exports the router. The main `index.ts` mounts them at their prefixes.

**When:** Always. This is the standard Express pattern for any app beyond ~100 lines.

**Example:**
```typescript
// server/routes/companies.ts
import { Router } from 'express';
import { db } from '../db';
import { companies } from '../schema';
import { eq, desc, sql } from 'drizzle-orm';

const router = Router();

// GET /api/companies - paginated, filtered
router.get('/', async (req, res, next) => {
  try {
    const { page = '1', limit = '20', category, state } = req.query;
    // ... build query with Drizzle
    const results = await db.select().from(companies)
      .where(/* conditions */)
      .limit(lim)
      .offset(offset);
    res.json({ data: results, total, page: p, /* ... */ });
  } catch (err) {
    next(err);
  }
});

export default router;
```

```typescript
// server/index.ts
import express from 'express';
import cors from 'cors';
import companiesRouter from './routes/companies';
import searchRouter from './routes/search';
import categoriesRouter from './routes/categories';
import { errorHandler } from './middleware/errorHandler';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/companies', companiesRouter);
app.use('/api', searchRouter);          // /api/search, /api/chat
app.use('/api', categoriesRouter);      // /api/categories, /api/states, /api/stats

app.use(errorHandler);

export default app;
```

### Pattern 2: Database Abstraction Layer (Sync to Async Migration)

**What:** The current `server/api.js` uses synchronous `better-sqlite3` calls (`db.prepare().all()`, `db.prepare().get()`). Drizzle + @libsql/client is fully async. Every query becomes `await`. Route handlers must be `async` and errors must use `next(err)` or try/catch.

**When:** This is the fundamental change in the database migration. Cannot be avoided.

**Example:**
```typescript
// BEFORE (synchronous better-sqlite3)
const rows = db.prepare('SELECT * FROM companies WHERE state = ? LIMIT ?').all(state, limit);

// AFTER (async Drizzle + libSQL)
const rows = await db.select().from(companies)
  .where(eq(companies.state, state))
  .limit(limit);
```

### Pattern 3: Dev/Prod Database Switching

**What:** Use environment variables to switch between local SQLite file (development) and remote Turso (production).

**When:** Every environment. This is the standard Turso dev workflow.

**Example:**
```typescript
// server/db.ts
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./server/constructflix.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
```

### Pattern 4: Vercel Express Deployment

**What:** Vercel detects Express apps automatically. Place the entry point at one of the standard locations (`src/index.ts`, `index.ts`, `app.ts`, etc.) and export default the app. Static assets go in `public/`. Use `vercel.json` only for custom routing rules.

**When:** Deployment.

**Example:**
```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" }
  ]
}
```

**Key insight:** Vercel's Express support is zero-config as of 2025. The Express app becomes a single Vercel Function. `express.static()` is ignored on Vercel -- static files must be in `public/` directory.

### Anti-Patterns to Avoid

- **Adding new features during refactor:** Phase 1 is a pure infrastructure change. Do NOT add auth routes, AI search, or new tables. Keep the `companies` table schema identical. Refactor and deploy the exact same functionality.
- **Keeping synchronous query calls:** Forgetting to `await` Drizzle queries returns Promise objects instead of data. TypeScript will catch some of these, but not all (especially in untyped helper functions).
- **Using `express.static()` for Vercel deployment:** It does not work on Vercel. Use the `public/` directory or configure `vercel.json` for static file routing.
- **Hardcoding database paths:** The `constructflix.db` path is currently resolved via `import.meta.dirname`. This must become environment-variable driven for Turso URL switching.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL query building | String concatenation with `?` params | Drizzle ORM query builder | Type safety, SQL injection protection, composable queries |
| Database migrations | Manual ALTER TABLE scripts | `drizzle-kit push` / `drizzle-kit generate` | Tracks schema diffs, generates correct migration SQL, idempotent |
| Environment variables | Custom config loading | `dotenv` (dev) + Vercel dashboard (prod) | Standard pattern, no custom code needed |
| Error handling middleware | Per-route try/catch (existing) | Centralized Express error handler | Consistent error responses, single place to add logging |
| JSON field parsing | `tryParseJSON()` per field | Drizzle `.$type<string[]>()` with custom serializer | Type-safe JSON columns at the schema level |

**Key insight:** The entire point of Phase 1 is to replace hand-rolled infrastructure with standard tooling. The current codebase has hand-rolled: query building (raw SQL strings), config management (hardcoded paths), and deployment (none). Each of these has a mature, standard solution.

## Common Pitfalls

### Pitfall 1: 2.1GB Database Exceeds Turso's 2GB Upload Limit

**What goes wrong:** `turso db create --from-file constructflix.db` fails because the file is 2,247,634,944 bytes (2.09 GB), exceeding the 2GB `--from-file` limit.

**Why it happens:** The database contains redundant columns and has never been VACUUMed. Analysis shows:
- `dataSource` column: identical value `'state_directory'` for all 3,439,856 rows = 49.2 MB of pure waste
- `importedAt` column: identical timestamp for all rows = wasted space
- 6 indexes consuming ~905 MB of overhead
- 0 freelist pages (no internal fragmentation to reclaim via VACUUM alone)

**How to avoid:**
1. **Strategy A (Preferred): Trim and VACUUM.** Drop `dataSource` column (49 MB), drop `importedAt` column (saves more), VACUUM to rebuild and compact. This may bring the file under 2GB.
2. **Strategy B (Reliable fallback): Use `--from-dump`.** SQLite's `.dump` command exports as SQL text. Turso's `--from-dump` supports up to 8GB. Run `sqlite3 constructflix.db .dump > dump.sql`, then `turso db create buildboard --from-dump dump.sql`.
3. **Strategy C (Programmatic): Use @libsql/client directly.** Create an empty Turso database, then run an import script that reads from local better-sqlite3 and batch-inserts into Turso via @libsql/client. This handles any size but is slower.

**Warning signs:** `turso db create` command fails with a size error. Always check file size with `ls -la` before attempting upload.

### Pitfall 2: Synchronous-to-Async Query Migration Breaks Routes

**What goes wrong:** The existing `server/api.js` uses synchronous `better-sqlite3` calls: `db.prepare().all()`, `db.prepare().get()`. Drizzle + @libsql/client is fully async. Missing a single `await` returns a Promise object instead of data, causing silent frontend bugs.

**Why it happens:** `better-sqlite3` is deliberately synchronous (blocks event loop, returns immediately). Every other database client is async. There is no adapter that makes this transparent.

**How to avoid:**
1. Convert `server/api.js` to TypeScript before migration. TypeScript catches async/sync mismatches at compile time.
2. Use Drizzle ORM as the query builder. Its API is consistently async -- you cannot accidentally call it synchronously.
3. Make all route handlers `async` and wrap bodies in try/catch with `next(err)`.
4. Test each endpoint after conversion. There are currently zero tests, so manual verification per endpoint is required.

**Warning signs:** Frontend receives `[object Promise]` or `{}` instead of actual data. API returns 200 OK but with empty/malformed response body.

### Pitfall 3: Vite Proxy Config Disappears in Production

**What goes wrong:** In development, Vite proxies `/api/*` requests to `localhost:3001`. In production on Vercel, there is no Vite dev server -- the proxy configuration in `vite.config.ts` is build-time only. API requests fail with 404 unless Vercel routing is configured.

**Why it happens:** Developers assume the proxy works in production because it works in dev. The `vite.config.ts` proxy is a dev-server feature, not a build output feature.

**How to avoid:**
1. Configure `vercel.json` with rewrites: `{ "source": "/api/(.*)", "destination": "/api" }`.
2. Ensure the Express app is exported from one of Vercel's expected entry points.
3. Keep API paths relative in frontend code (`/api/companies`, not `http://localhost:3001/api/companies`). The frontend already does this correctly.

**Warning signs:** API calls return HTML (Vercel's 404 page) instead of JSON. Works locally, fails on Vercel preview deployment.

### Pitfall 4: Express 5.x Middleware Differences

**What goes wrong:** Express 5.x has breaking changes from Express 4.x. Community middleware examples and Stack Overflow answers almost universally reference Express 4.x patterns. Some middleware packages may not be fully compatible.

**Why it happens:** Express 5 was released recently. The ecosystem is still catching up.

**How to avoid:**
1. Pin Express version exactly in `package.json` (the `^` prefix allows minor version drift).
2. Test any new middleware (e.g., `express-rate-limit`, `helmet`) against Express 5.x before adding.
3. Note: Express 5 already handles async route handler errors (rejected promises automatically call `next(err)`), which simplifies error handling compared to Express 4.

**Warning signs:** Middleware throws at startup. Route handlers that throw errors behave differently than expected.

### Pitfall 5: Vercel Ignores `express.static()`

**What goes wrong:** You add `app.use(express.static('dist'))` to serve the Vite build output. It works locally but on Vercel, static files return 404.

**Why it happens:** Vercel explicitly does not support `express.static()`. Static assets must be placed in the `public/` directory or configured via `vercel.json`.

**How to avoid:**
1. Place the Vite `dist/` output as Vercel's static output (configure `outputDirectory` in vercel.json or Vercel project settings).
2. Do not add `express.static()` to the Express app.
3. Vercel serves static files from its CDN edge network, which is faster than serving through the Express function anyway.

## Code Examples

### Drizzle Schema for Existing Companies Table

```typescript
// server/schema.ts
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  businessName: text('businessName').notNull(),
  category: text('category').default('General Contractor'),
  location: text('location'),
  state: text('state'),
  city: text('city'),
  address: text('address'),
  zipCode: text('zipCode'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  licenseNumber: text('licenseNumber'),
  rating: real('rating').default(0),
  reviewCount: integer('reviewCount').default(0),
  hours: text('hours'),         // JSON string
  services: text('services'),   // JSON array string
  certifications: text('certifications'),  // JSON array string
  emergencyService: integer('emergencyService', { mode: 'boolean' }),
  freeEstimate: integer('freeEstimate', { mode: 'boolean' }),
  warranty: text('warranty'),
});

// Type inference
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
```

### Database Connection with Dev/Prod Switch

```typescript
// server/db.ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./server/constructflix.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
```

### Drizzle Config for Migrations

```typescript
// drizzle.config.ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  },
});
```

### Modularized Route Example (Companies)

```typescript
// server/routes/companies.ts
import { Router } from 'express';
import { db } from '../db';
import { companies } from '../schema';
import { eq, desc, sql, and, like, gte, lte } from 'drizzle-orm';
import { parseRow } from '../helpers/parseRow';

const router = Router();

// GET /api/companies - paginated, filtered, sorted
router.get('/', async (req, res) => {
  const { page = '1', limit = '20', category, state, city, search, minRating } = req.query;
  const p = Math.max(1, parseInt(page as string));
  const lim = Math.min(100, Math.max(1, parseInt(limit as string)));
  const offset = (p - 1) * lim;

  const conditions = [];
  if (category) conditions.push(eq(companies.category, category as string));
  if (state) conditions.push(eq(companies.state, state as string));
  if (city) conditions.push(eq(companies.city, city as string));
  if (minRating) conditions.push(gte(companies.rating, parseFloat(minRating as string)));
  if (search) {
    const term = `%${search}%`;
    conditions.push(sql`(${companies.businessName} LIKE ${term} OR ${companies.category} LIKE ${term})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(companies).where(where)
      .orderBy(desc(companies.rating), desc(companies.reviewCount))
      .limit(lim).offset(offset),
    db.select({ count: sql<number>`COUNT(*)` }).from(companies).where(where),
  ]);

  const total = countResult[0].count;
  res.json({
    data: rows.map(parseRow),
    total,
    page: p,
    limit: lim,
    totalPages: Math.ceil(total / lim),
    hasNextPage: p < Math.ceil(total / lim),
    hasPrevPage: p > 1,
  });
});

// GET /api/companies/:id
router.get('/:id', async (req, res) => {
  const [row] = await db.select().from(companies)
    .where(eq(companies.id, req.params.id))
    .limit(1);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});

export default router;
```

### Vercel Deployment Configuration

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" }
  ]
}
```

### Environment Variables (.env for local dev)

```bash
# .env (local development - DO NOT commit)

# Database (Turso - production)
TURSO_DATABASE_URL=libsql://buildboard-[account].turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# Database (local dev - fallback when TURSO vars not set)
# Uses file:./server/constructflix.db automatically

# Server
PORT=3001
NODE_ENV=development
```

### Tailwind Config Update for BuildBoard Rebrand

```javascript
// tailwind.config.js - Updated color palette (B2B professional)
colors: {
  brand: {
    // Primary: Steel Blue (professional, trustworthy, construction-adjacent)
    primary: '#2563EB',        // Blue-600 - main actions, links
    'primary-hover': '#1D4ED8', // Blue-700
    'primary-light': '#DBEAFE', // Blue-100 - backgrounds
    // Accent: Amber/Gold (retained for warmth, HCC identity)
    gold: '#F59E0B',           // Amber-500 - badges, highlights
    'gold-hover': '#D97706',   // Amber-600
  },
  // Surfaces: Slightly warmer dark palette (less Netflix, more professional)
  background: '#0F172A',      // Slate-900 - main bg
  surface: '#1E293B',         // Slate-800 - cards, panels
  'surface-hover': '#334155', // Slate-700 - hover states
  'surface-elevated': '#1E293B', // Slate-800 - modals, dropdowns
  border: '#334155',          // Slate-700
  // Text
  text: '#F8FAFC',            // Slate-50
  'text-muted': '#94A3B8',    // Slate-400
  'text-disabled': '#64748B', // Slate-500
  // Semantic
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
},
```

**Note on rebrand colors:** The existing gold/black Netflix-inspired palette is entertainment-coded. For a B2B construction directory, a slate-blue dark theme with amber accents reads as professional and trustworthy while retaining warmth. The gold accent can be preserved for the HCC identity connection. The planner should decide the final palette -- the above is a researched starting point based on B2B SaaS design patterns.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `api/` directory for Vercel Functions | Express zero-config detection | Vercel 2025 (CLI 47.0.5+) | No need for `api/index.ts` shim. Export Express app from standard locations. |
| `better-sqlite3` direct usage | Drizzle ORM + @libsql/client | Drizzle stable 2024+ | Type-safe queries, async-native, Turso/local switching |
| Express 4.x async error handling | Express 5.x native async support | Express 5 GA 2025 | Rejected promises in route handlers automatically call `next(err)`. No need for `express-async-errors` wrapper. |
| `@vercel/node` build step for Express | Zero-config Express detection | Vercel late 2024 | `vercel.json` builds array no longer needed for Express apps |

**Deprecated/outdated:**
- **`@vercel/node` in vercel.json builds:** Not needed for Express apps since Vercel's zero-config detection. Only use `vercel.json` for rewrites/routing.
- **`express-async-errors` package:** Express 5 handles async errors natively. Do not install this.
- **`api/index.ts` Vercel function shim:** The old pattern of wrapping Express in `module.exports = app` inside `api/index.ts` is replaced by zero-config detection from standard entry points.

## Open Questions

1. **Final Color Palette for Rebrand**
   - What we know: Current gold/black is entertainment-themed. B2B directories typically use blues, grays, or slate dark themes.
   - What's unclear: Whether the user wants to keep the gold accent (HCC branding), or shift entirely.
   - Recommendation: Keep gold as accent, switch primary surfaces from pure black (#141414) to slate-blue (#0F172A). Planner should present a before/after for user approval.

2. **Database Trimming Sufficient to Get Under 2GB?**
   - What we know: Dropping `dataSource` (49 MB) and `importedAt` columns frees some space, but the file is only 0.09 GB over the 2GB limit. After dropping columns, VACUUM must be run -- this rebuilds the entire B-tree and may compact further.
   - What's unclear: Exact post-VACUUM file size. SQLite overhead for indexes and B-tree structure is ~905 MB, which cannot be easily reduced without dropping indexes.
   - Recommendation: Try trim + VACUUM first. Have `--from-dump` as tested fallback (8GB limit). The planner should include both strategies.

3. **Vercel Express Entry Point Location**
   - What we know: Vercel auto-detects Express from `app.ts`, `index.ts`, `src/index.ts`, etc. Current server lives at `server/api.js`.
   - What's unclear: Whether `server/index.ts` is auto-detected by Vercel, or whether it must be at root level (`index.ts`, `app.ts`).
   - Recommendation: Place the Express entry at `api/index.ts` or root `app.ts` for maximum Vercel compatibility. Test with `vercel dev` before deploying.

4. **React Query Removal Impact on Build**
   - What we know: `@tanstack/react-query` is listed in `vite.config.ts` manualChunks as the `query` chunk. Removing the package will cause a build error unless the chunk config is also updated.
   - What's unclear: Nothing -- this is a known issue.
   - Recommendation: Remove `query: ['@tanstack/react-query']` from `manualChunks` in `vite.config.ts` when uninstalling the package.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None currently installed |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Drizzle queries return same data as better-sqlite3 queries | integration | Manual comparison per endpoint | No - Wave 0 |
| INFRA-02 | All existing API endpoints return identical responses after modularization | smoke | `curl` each endpoint, compare responses | No - Wave 0 |
| INFRA-03 | Vercel deployment serves frontend + API | smoke | `curl https://[deploy-url]/api/stats` | No - Wave 0 |
| INFRA-04 | Env vars loaded correctly in production | smoke | Check API response from Vercel deployment | No - Wave 0 |
| INFRA-05 | Build succeeds without removed packages | build | `npm run build` | Existing script |
| UI-01 | No ConstructFlix references remain in UI | manual | Visual inspection + `grep -r "ConstructFlix"` | No - Wave 0 |
| UI-02 | Clean professional appearance | manual-only | Visual review | N/A |
| UI-04 | Mobile responsive | manual-only | Browser devtools mobile viewport | N/A |

### Sampling Rate

- **Per task commit:** `npm run build && npm run type-check` (type + build verification)
- **Per wave merge:** Full build + `vercel dev` smoke test of all endpoints
- **Phase gate:** Vercel preview deployment accessible, all endpoints returning data

### Wave 0 Gaps

- [ ] No test framework installed -- consider adding Vitest for future phases (not blocking Phase 1)
- [ ] No endpoint smoke tests -- create a simple `scripts/smoke-test.sh` that curls all 12 API endpoints
- [ ] Build verification: `npm run build` already exists and is sufficient for Phase 1

## Sources

### Primary (HIGH confidence)

- [Turso CLI `db create` docs](https://docs.turso.tech/cli/db/create) - Confirmed 2GB `--from-file` limit, 8GB `--from-dump` limit
- [Drizzle ORM + Turso connection](https://orm.drizzle.team/docs/connect-turso) - Connection configuration, schema syntax
- [Drizzle ORM SQLite column types](https://orm.drizzle.team/docs/column-types/sqlite) - Schema definition syntax
- [Drizzle + Turso tutorial](https://docs.turso.tech/sdk/ts/orm/drizzle) - Full integration guide
- [Vercel Express on Vercel docs](https://vercel.com/docs/frameworks/backend/express) - Zero-config deployment, static files, limitations
- [Vercel Vite docs](https://vercel.com/docs/frameworks/frontend/vite) - Frontend deployment
- [Turso pricing](https://turso.tech/pricing) - Plan limits (Free: 5GB storage, 500M reads/month)
- Local codebase analysis - Database file size (2,247,634,944 bytes), column sizes, schema structure

### Secondary (MEDIUM confidence)

- [Vite+Express Vercel starter](https://github.com/internetdrew/vite-express-vercel) - Combined deployment pattern with vercel.json
- [Express routing best practices (MDN)](https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs/routes) - Router modularization patterns
- [SQLite VACUUM documentation](https://sqlite.org/lang_vacuum.html) - Space reclamation behavior

### Tertiary (LOW confidence)

- B2B SaaS dark theme design patterns - General web search, no single authoritative source. Color recommendations should be validated with the user.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Drizzle + @libsql/client + Turso is the documented, official stack for SQLite-to-serverless migration
- Architecture: HIGH - Express Router modularization is a well-documented, universally practiced pattern
- Database migration: HIGH - 2GB limit is confirmed; workarounds (trim/dump) are documented
- Vercel deployment: HIGH - Official Vercel docs confirm Express zero-config support
- Pitfalls: HIGH - All pitfalls verified against official docs or codebase analysis
- Rebrand design: MEDIUM - Color palette is opinionated; will need user validation

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (30 days -- all technologies are stable)
