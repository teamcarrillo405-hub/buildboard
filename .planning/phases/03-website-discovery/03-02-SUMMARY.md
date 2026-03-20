---
phase: 03-website-discovery
plan: 02
subsystem: database
tags: [yelp-api, enrichment, better-sqlite3, typescript, progress-persistence]

# Dependency graph
requires:
  - phase: 03-01
    provides: enrichYelpContacts.ts script with basic Yelp enrichment and progress.json
provides:
  - enrichYelpContacts.ts hardened with SIGINT handler, imageUrl pre-call skip guard, and confirmed resume behavior
affects: [03-03, 04-contact-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-call skip guard: check existing DB values BEFORE making API call to conserve daily budget"
    - "SIGINT handler registered immediately after loadProgress() so any kill preserves resume state"
    - "Per-run counter (apiCallsThisRun) for daily limit vs lifetime counter (totalApiCalls) for metrics"

key-files:
  created: []
  modified:
    - server/scripts/enrichYelpContacts.ts

key-decisions:
  - "Pre-call skip guard fires before yelpSearch() using company.imageUrl from SELECT — not after — saving one API call per already-enriched record"
  - "imageUrl added to Company interface and SELECT query; WHERE clause already filtered these records but enrichCompany() needed the value for the guard"
  - "lastRowId tracks via separate rowid SELECT per record — advances for every processed record, not just matched ones (already correct, no change needed)"
  - "Daily limit already used apiCallsThisRun (per-run), not totalApiCalls (lifetime) — confirmed correct, no change needed"

patterns-established:
  - "API budget guard: check all skip conditions before any external API call"
  - "SIGINT + final saveProgress() = safe to kill at any point during enrichment runs"

requirements-completed: [YELP-01, YELP-02]

# Metrics
duration: 12min
completed: 2026-03-18
---

# Phase 3 Plan 02: Yelp Enrichment Hardening Summary

**enrichYelpContacts.ts hardened with SIGINT save-on-kill, imageUrl pre-call skip guard, and smoke-tested resume that confirmed rowid advances correctly across interrupted runs**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-18T20:40:00Z
- **Completed:** 2026-03-18T20:44:01Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added SIGINT handler so Ctrl+C / kill saves progress.json before exit — safe to interrupt at any point
- Added `imageUrl` to Company interface and SELECT query, enabling skip guard to fire BEFORE yelpSearch()
- Pre-call skip guard now checks `company.phone && company.imageUrl` before consuming any API call (YELP-02)
- Confirmed via dry-run smoke test: second run resumed from rowid 3520424, not 0
- TypeScript compiles cleanly with zero errors

## Task Commits

1. **Task 1: Audit and harden resume, skip, and limit behaviors** - `5429d47` (fix)
2. **Task 2: Dry-run smoke test** - no new commit (test-only, script unchanged)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `server/scripts/enrichYelpContacts.ts` - Added SIGINT handler, imageUrl to Company interface + SELECT, pre-call skip guard before yelpSearch()

## Decisions Made

- The pre-call skip guard uses `company.phone && company.imageUrl` — both must be populated to skip. The WHERE clause already excludes records where BOTH are set, so in practice this guard primarily catches edge cases where the WHERE clause ran before a previous partial update. It adds zero overhead and prevents a redundant API call.
- `wouldFillImage = !!imageUrl` at line 269 is kept as a post-call guard for the case where Yelp returned no image (e.g., business found by name but has no photo). The pre-call guard handles the common case; the post-call guard handles the pathological case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] imageUrl missing from Company interface and SELECT query**
- **Found during:** Task 1 (audit)
- **Issue:** The `Company` interface declared only `phone` and `website`. The pre-call skip guard (`if (company.phone && company.imageUrl) return`) could not work because `imageUrl` was always `undefined` on the typed object.
- **Fix:** Added `imageUrl: string | null` to the interface and added `imageUrl` to the SELECT query column list.
- **Files modified:** server/scripts/enrichYelpContacts.ts
- **Verification:** TypeScript compiles cleanly; grep confirms imageUrl appears in both interface and SELECT.
- **Committed in:** 5429d47

**2. [Rule 2 - Missing Critical] Skip guard fired after Yelp API call, not before**
- **Found during:** Task 1 (audit)
- **Issue:** `wouldFillPhone/wouldFillImage` check at line 266 was placed after `yelpSearch()` at line 210. Every company consumed an API call even if both fields were already populated. This would burn 5,000 API calls/day on already-enriched records as the DB fills up.
- **Fix:** Added `if (company.phone && company.imageUrl) return;` BEFORE `yelpSearch()` is called.
- **Files modified:** server/scripts/enrichYelpContacts.ts
- **Verification:** Grep confirms guard appears at line 212, yelpSearch() at line 215.
- **Committed in:** 5429d47

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes required for YELP-02 compliance. No scope creep.

## Issues Encountered

None — all audit checks passed or were fixed inline. Smoke test ran without errors. Real progress file restored from backup.

## Smoke Test Results

**Run 1 (limit=3):**
- Started from rowid 3520421 (existing progress file)
- Processed 3 API calls, stopped at daily limit
- Saved resume rowid: 3520424
- Exit 0

**Run 2 (limit=3, resume verification):**
- `Resume from rowid > 3520424` confirmed in log (non-zero, not reset to 0)
- Processed 3 more API calls
- Saved resume rowid: 3520427
- Exit 0

**Both runs confirmed:** daily limit enforced, resume works, no unhandled exceptions.

## User Setup Required

None - YELP_API_KEY already present in .env.

## Next Phase Readiness

- enrichYelpContacts.ts is safe to run daily unattended via cron or task scheduler
- Ctrl+C during any run will save progress — no records re-processed on resume
- Records with both phone and imageUrl already populated skip without API call — budget preserved as DB fills
- Ready for Phase 3-03: website discovery enrichment

---
*Phase: 03-website-discovery*
*Completed: 2026-03-18*
