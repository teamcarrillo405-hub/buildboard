---
phase: 01-infrastructure-rebrand
plan: 02
status: partial
requirements_completed: []
requirements_deferred: [INFRA-01, INFRA-04]
---

# Plan 01-02 Summary: Turso Database Migration (Partial)

## What was done

### Code changes (COMPLETE)
- **server/schema.ts**: Removed `dataSource` and `importedAt` columns (22 → 20 columns)
  - `dataSource` was identical ('state_directory') for all 3.4M rows — pure waste
  - `importedAt` was identical timestamp for all rows — no meaningful sort
- **server/routes/companies.ts**: Updated `/api/new` endpoint to sort by `rating DESC, reviewCount DESC` instead of the removed `importedAt`
- **server/db.ts**: Already configured for env-var switching (falls back to `file:./server/constructflix.db` when Turso vars not set)

### Database file trimmed (COMPLETE)
- Dropped `dataSource` and `importedAt` columns from SQLite file
- VACUUM'd database: 2.09 GB → 1.95 GB (under Turso's 2GB --from-file limit)

### Turso cloud upload (DEFERRED)
- Turso CLI installed and authenticated in WSL as `teamcarrillo`
- Upload blocked: free plan quota exhausted ("organization teamcarrillo is blocked from creating databases")
- User chose to defer cloud migration and continue with local SQLite

## Deferred work
- Upload trimmed database to Turso when plan limits are resolved
- Generate fresh auth token and update `.env` with real credentials
- This also defers Plan 01-04 (Vercel deployment) since serverless can't host 1.95GB SQLite

## Files modified
- `server/schema.ts` — 20-column schema (removed dataSource, importedAt)
- `server/routes/companies.ts` — /api/new sorts by rating
- `.env` — Template with commented-out Turso placeholders
- `server/constructflix.db` — Trimmed to 1.95GB

## Verification
- Local server starts and serves all 12 API endpoints from local SQLite ✓
- Schema matches actual database structure (20 columns) ✓
- Turso upload deferred due to plan limits
