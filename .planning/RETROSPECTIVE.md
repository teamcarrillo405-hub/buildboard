# BuildBoard — Retrospective

## Milestone: v2.0 — Data Enrichment Pipeline

**Shipped:** 2026-03-19
**Phases:** 3 (Phases 3-5) | **Plans:** 5

### What Was Built

- **enrichWorker.ts refactored** — `generateCandidateDomains()` now runs first for every company; 67% of websites found via domain guessing, eliminating most Playwright browser launches
- **enrichYelpContacts.ts hardened** — SIGINT-safe saves, per-record `lastRowId` advance, `imageUrl` in Company interface enabling pre-call skip guard
- **contactExtractor.ts created** — Playwright Chromium scraper: homepage email/phone extraction + `/contact`, `/contact-us`, `/about`, `/about-us` fallback; 56% email hit rate; URL normalization (bare domains get `https://` prepended)
- **orchestrator.ts created** — `npm run enrich` runs all three pipelines in sequence; delta-based daily summary to `logs/daily_summary.json`; kill-safe via inherited progress JSON cursors

### What Worked

- **Parallel plan execution within waves** — Plans 03-01 and 03-02 ran simultaneously, saving ~12 minutes
- **Wave-based dependency enforcement** — contactExtractor.ts fallback (04-02) correctly waited for homepage scraper (04-01) to be built first
- **Phase 3 pre-existing code** — `domainUtils.ts` was fully built and only needed wiring, not rebuilding; recognized early from codebase analysis
- **Smoke tests catching real issues** — URL normalization bug (bare domains without `https://`) was caught immediately in smoke test, not after a full run

### What Was Inefficient

- **v1.0 phase directory conflicts** — Old `04-authentication`, `05-verification`, `06-business-profiles` dirs kept being resolved by gsd-tools as Phase 4/5/6 targets; required renaming all v1.0 dirs to `v1-` prefix (should have been done at v2.0 start)
- **gsd-tools init finding wrong directories** — The rename fix was applied incrementally (first just Phase 3, then all remaining v1.0 dirs when Phase 4 started) — a single cleanup at milestone start would have been cleaner

### Patterns Established

- **v1.x phase dirs → rename to `v1-XX-name/` at new milestone start** — prevents gsd-tools phase resolution collisions
- **Progress JSON per script** — each standalone pipeline owns its own `logs/*.json` cursor; orchestrator reads snapshots for delta accounting rather than owning the state
- **URL normalization at entry point** — prepend `https://` to bare domains at the navigation layer, not at the DB write layer

### Key Lessons

- Verify phase directory namespace before starting a new milestone (check for conflicts with existing `NN-name/` dirs)
- When connecting pre-built utilities, read them before planning — the domainUtils.ts interface was already stable, which let the plan skip rebuilding it
- Delta-based daily summaries are more useful than lifetime counters for operational monitoring

### Cost Observations

- Model mix: ~100% sonnet (balanced profile)
- Sessions: 1 (continued from v1.0 session after context compaction)
- Notable: All 5 plans executed without revision loops — plan checker passed on first attempt each time

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Revision Loops | Avg Plan Duration |
|-----------|--------|-------|----------------|-------------------|
| v1.0 Homepage Redesign | 2 | 2 | 0 | ~14 min |
| v2.0 Data Enrichment | 3 | 5 | 0 | ~13 min |
