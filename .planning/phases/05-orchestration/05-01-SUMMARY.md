---
phase: 05-orchestration
plan: 01
subsystem: infra
tags: [orchestrator, child_process, spawnSync, pipeline, typescript, daily_summary]

# Dependency graph
requires:
  - phase: 03-website-discovery
    provides: enrichWorker.ts with progress JSON at logs/enrichWorker_0_of_1.json
  - phase: 04-contact-extraction
    provides: contactExtractor.ts with progress JSON at logs/contact_extract_progress.json
  - phase: earlier
    provides: enrichYelpContacts.ts with progress JSON at logs/yelp_contact_enrich_progress.json
provides:
  - server/scripts/orchestrator.ts — single-command sequential pipeline runner
  - npm run enrich — unified entry point for all three enrichment pipelines
  - logs/daily_summary.json — append-only per-run metrics log
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - spawnSync with stdio inherit for real-time child process output
    - Before/after snapshot pattern for computing per-run deltas from cumulative progress JSONs
    - Append-only JSON array log for observable daily metrics

key-files:
  created:
    - server/scripts/orchestrator.ts
    - logs/daily_summary.json
  modified:
    - package.json

key-decisions:
  - "spawnSync with shell:false — blocks until each child exits, inherits stdio for real-time output"
  - "Before/after progress JSON snapshot diff gives per-run deltas without each pipeline needing to reset their counters"
  - "Orchestrator does NOT re-implement resume logic — each pipeline's own SIGINT handler + lastRowId cursor handles kill-safe restart"

patterns-established:
  - "Pipeline orchestration via spawnSync: sequential blocking child processes with inherited stdio"
  - "Delta metrics: read before/after snapshots around each pipeline run, subtract to get this-run-only values"
  - "Append-only JSON array log: read existing array, push entry, write back with 2-space indent"

requirements-completed: [ORCH-01, ORCH-02, ORCH-03]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 5 Plan 01: Orchestration Summary

**Sequential pipeline runner with before/after snapshot delta metrics, writing per-run structured entries to logs/daily_summary.json via a single `npm run enrich` command**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-19T00:04:31Z
- **Completed:** 2026-03-19T00:09:00Z
- **Tasks:** 2
- **Files modified:** 3 (orchestrator.ts created, package.json updated, daily_summary.json created by smoke run)

## Accomplishments

- Created `server/scripts/orchestrator.ts` that runs all three enrichment pipelines in sequence via `spawnSync`, inheriting stdio for real-time output visibility
- Implemented before/after progress JSON snapshot pattern to compute per-run deltas (not lifetime totals) for each pipeline
- Added `npm run enrich` to package.json, preserving all 11 existing scripts
- Verified smoke-run: orchestrator prints banner, spawns all three pipelines, writes valid `logs/daily_summary.json` with correct schema

## Task Commits

Each task was committed atomically:

1. **Task 1: Create server/scripts/orchestrator.ts** - `82ac104` (feat)
2. **Task 2: Add npm run enrich to package.json** - `41d7f05` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified

- `server/scripts/orchestrator.ts` — Sequential pipeline runner: spawns Yelp, web discovery, contact extraction as child processes; reads progress JSON snapshots to compute per-run deltas; appends structured entry to logs/daily_summary.json
- `package.json` — Added `"enrich": "npx tsx server/scripts/orchestrator.ts"` script entry
- `logs/daily_summary.json` — Created during smoke-run verification; append-only array of daily run summaries

## Decisions Made

- Used `spawnSync` with `{ stdio: 'inherit', shell: false }` — blocking (exactly what sequential pipeline execution requires), inherits stdout/stderr for real-time terminal output, avoids shell injection risk
- Before/after snapshot diff pattern: reading each pipeline's progress JSON before and after the spawn lets us compute per-run deltas without requiring each pipeline to reset its counters between runs
- Resume logic deliberately NOT re-implemented in orchestrator — each pipeline already has its own SIGINT handler + lastRowId cursor, so killing orchestrator mid-run and restarting is fully handled at the pipeline level

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The smoke-run completed cleanly on the first attempt.

## User Setup Required

None - no external service configuration required. The orchestrator uses the same `.env` file (YELP_API_KEY) already required by the individual pipeline scripts.

## Next Phase Readiness

- All three enrichment pipelines are now wired into a single `npm run enrich` command
- Kill-safe at any point: each pipeline saves its own progress, orchestrator re-reads snapshots on next run
- `logs/daily_summary.json` accumulates one entry per run for monitoring enrichment velocity
- Phase 5 is complete — the full data enrichment pipeline (Yelp, web discovery, contact extraction) runs end-to-end with a single command

---
*Phase: 05-orchestration*
*Completed: 2026-03-19*

## Self-Check: PASSED

- FOUND: server/scripts/orchestrator.ts
- FOUND: logs/daily_summary.json
- FOUND: .planning/phases/05-orchestration/05-01-SUMMARY.md
- FOUND: commit 82ac104 (feat(05-01): create orchestrator.ts)
- FOUND: commit 41d7f05 (feat(05-01): add npm run enrich to package.json)
