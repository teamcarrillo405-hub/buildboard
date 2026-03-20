---
phase: 1
plan: 1
subsystem: data-seeding-api
tags: [seed, api, frontend, general-contractors, enr]
dependency_graph:
  requires: []
  provides: [top-companies-api, gc-seed-data, useTopCompanies-hook, HOMEPAGE_CATEGORIES]
  affects: [homepage, company-listings, category-browsing]
tech_stack:
  added: []
  patterns:
    - better-sqlite3 direct for seed scripts (synchronous, no Drizzle overhead)
    - UPDATE-first upsert pattern (enrich pre-existing records rather than insert duplicates)
    - reviewCount formula for deterministic ENR sort: 1000 - (rank-1)*10
    - ref-based cache in React hook to prevent re-fetch on every render
key_files:
  created:
    - server/scripts/seed-top-gc.ts
    - .planning/phases/01-data-seeding-api/01-01-SUMMARY.md
  modified:
    - server/routes/companies.ts
    - src/api/api.ts
    - src/api/hooks.ts
decisions:
  - ENR GC seed uses UPDATE (not INSERT OR IGNORE) to enrich pre-existing permit-import records
  - reviewCount formula: 1000 - (rank-1)*10 ensures 25 distinct values preserving ENR sort order
  - HOMEPAGE_CATEGORIES config co-located in hooks.ts for consumer convenience
  - useTopCompanies cache uses useRef(Map) for per-instance module-level caching
metrics:
  duration: 7 min
  completed: 2026-03-17
  tasks_completed: 4
  files_changed: 4
---

# Phase 1 Plan 1: Seed ENR Top 25 GCs & Create Top Companies API Summary

**One-liner:** ENR Top 25 GC data seeded via UPDATE-first upsert, with typed `GET /api/top-companies` endpoint and `useTopCompanies` React hook with in-memory cache.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Create GC seed script (`server/scripts/seed-top-gc.ts`) | f8cdd03 / cc23c07 | Done |
| 2 | Add `GET /api/top-companies` endpoint | d9acf47 | Done |
| 3 | Add `useTopCompanies` hook + `HOMEPAGE_CATEGORIES` | efced21 | Done |
| 4 | Verify all data and endpoints | (runtime) | Done |

## Verification Results

- [x] SEED-01: 25 GC records in DB with businessName, city, state, services
- [x] SEED-02: All 25 have website, category = "General Contractor"
- [x] SEED-03: `/api/top-companies?category=General Contractor` returns them in ENR order (Turner #1, Ryan #25)
- [x] API-01: Endpoint returns top N sorted by rating DESC, reviewCount DESC
- [x] API-02: All 7 HOMEPAGE_CATEGORIES have 2,540+ records (Masonry/Concrete is lowest at 2,540)
- [x] API-03: Response includes id, businessName, city, state, rating, reviewCount, category, subCategory

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seed script needed UPDATE logic for pre-existing records**

- **Found during:** Task 4 verification
- **Issue:** The original INSERT OR IGNORE approach skipped the 17 GC companies already in the DB from permit/SIC imports. Those pre-existing records had `rating: 0`, no `website`, no `services` — failing SEED-02 criteria.
- **Fix:** Rewrote to use UPDATE-first upsert: select best existing record (preferring `enr_top25` source, then highest rating), then UPDATE it with ENR-enriched values (rating 5.0, reviewCount, website, services, subCategory, verificationStatus='verified').
- **Files modified:** `server/scripts/seed-top-gc.ts`
- **Commit:** cc23c07

## Key Decisions Made

1. **UPDATE-first upsert:** Pre-existing permit records for ENR GCs were enriched in-place rather than creating duplicate records. This keeps DB clean (no duplicate company names for the same GC).

2. **reviewCount formula `1000 - (rank-1)*10`:** Gives rank 1 → reviewCount 1000, rank 25 → 760. Creates 25 unique values so `ORDER BY rating DESC, reviewCount DESC` produces exact ENR order without ties.

3. **HOMEPAGE_CATEGORIES in hooks.ts:** Co-located with the `useTopCompanies` hook for easy import in components.

4. **useRef(Map) cache in useTopCompanies:** Per-render caching via a module-level ref ensures categories fetched once per component mount are not re-fetched on re-renders.

## Self-Check: PASSED

Files created/modified:
- FOUND: server/scripts/seed-top-gc.ts
- FOUND: server/routes/companies.ts (modified - added /api/top-companies endpoint)
- FOUND: src/api/hooks.ts (modified - added useTopCompanies + HOMEPAGE_CATEGORIES)
- FOUND: src/api/api.ts (modified - added getTopCompanies method)

Commits:
- FOUND: f8cdd03
- FOUND: d9acf47
- FOUND: efced21
- FOUND: cc23c07
