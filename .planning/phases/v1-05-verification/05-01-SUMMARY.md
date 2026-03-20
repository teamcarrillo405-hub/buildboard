# Summary: 05-01 — Verification Backend

## What was built
- `verificationStatus` column added to companies table via idempotent migration (checks pragma table_info first)
- Verification service with full CRUD: get/set status, bulk update, stats by status
- Admin API with 3 endpoints gated by `isAdmin` middleware (email whitelist)
- FTS5 search rank boost for verified companies via BM25 score manipulation
- AdminAPI client in frontend for the upcoming admin page

## Key decisions
- **Admin gating via email whitelist** (ADMIN_EMAILS env var) rather than role-based auth — simpler for v1 with small admin team
- **BM25 score multiplication** for rank boost: hcc_member × 0.5, verified × 0.7 (BM25 scores are negative, so lower = better; multiplying by <1 boosts). This is proportional — a high-relevance unverified company still outranks a low-relevance verified one
- **COALESCE for null safety** — existing companies with NULL verificationStatus treated as 'unverified'
- **Transaction-based bulk update** for batch verification operations

## Endpoints
- `GET /api/admin/companies?q=&status=&limit=&offset=` — search with verification filter
- `PUT /api/admin/companies/:id/verification` — set status (body: { status })
- `GET /api/admin/stats` — counts by verification status

## Files created
- server/services/verification.ts — migration + CRUD service
- server/routes/admin.ts — admin API endpoints

## Files modified
- server/middleware/auth.ts — added isAdmin middleware
- server/services/fts5.ts — boostedRank ORDER BY for verified companies
- server/helpers/parseRow.ts — includes verificationStatus in output
- server/index.ts — mounts admin router, logs admin status
- src/api/types.ts — verificationStatus on Company interface
- src/api/api.ts — AdminAPI client
