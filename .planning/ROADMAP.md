# Roadmap: BuildBoard

## Milestones

- ✅ **v1.0 Homepage Redesign** — Phases 1-2 (shipped 2026-03-17)
- ✅ **v2.0 Data Enrichment Pipeline** — Phases 3-5 (shipped 2026-03-19)

## Phases

<details>
<summary>✅ v1.0 Homepage Redesign (Phases 1-2) — SHIPPED 2026-03-17</summary>

- [x] **Phase 1: Data Seeding & API** — Seed ENR Top 25 GCs into DB, create top-companies API endpoint (completed 2026-03-17)
- [x] **Phase 2: Unified Card & Homepage** — Build RankedCard component, rewire homepage with all 8 sections, remove old components (completed 2026-03-17)

Archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Data Enrichment Pipeline (Phases 3-5) — SHIPPED 2026-03-19</summary>

- [x] **Phase 3: Website Discovery** — Domain guesser wired into enrichWorker (67% hit rate), Yelp hardened with SIGINT + skip guard (completed 2026-03-18)
- [x] **Phase 4: Contact Extraction** — Playwright homepage + /contact fallback, 56% email hit rate, graceful error handling (completed 2026-03-18)
- [x] **Phase 5: Orchestration** — `npm run enrich` runs all 3 pipelines, delta summary to logs/daily_summary.json (completed 2026-03-19)

Archive: `.planning/milestones/v2.0-ROADMAP.md`

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Seeding & API | v1.0 | 1/1 | Complete | 2026-03-17 |
| 2. Unified Card & Homepage | v1.0 | 1/1 | Complete | 2026-03-17 |
| 3. Website Discovery | v2.0 | 2/2 | Complete | 2026-03-18 |
| 4. Contact Extraction | v2.0 | 2/2 | Complete | 2026-03-18 |
| 5. Orchestration | v2.0 | 1/1 | Complete | 2026-03-19 |
