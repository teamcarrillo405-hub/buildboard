---
phase: 3
slug: search-discovery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (pairs with existing Vite config) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SRCH-01 | integration | `npx vitest run server/__tests__/fts5-search.test.ts -t "returns results under 500ms"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | SRCH-06 | unit | `npx vitest run server/__tests__/search-fallback.test.ts -t "falls back"` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | SRCH-02 | unit (mocked) | `npx vitest run server/__tests__/gemini-search.test.ts -t "extracts filters"` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | SRCH-04 | unit (mocked) | `npx vitest run server/__tests__/gemini-search.test.ts -t "returns summary"` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | SRCH-05 | integration (mocked) | `npx vitest run server/__tests__/gemini-search.test.ts -t "conversational refinement"` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | SRCH-03 | unit | `npx vitest run src/__tests__/FilterChips.test.tsx -t "chip management"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom` — test framework
- [ ] `vitest.config.ts` — Vitest config with jsdom environment for React tests
- [ ] `server/__tests__/fts5-search.test.ts` — FTS5 search integration test stubs
- [ ] `server/__tests__/gemini-search.test.ts` — Gemini function calling test stubs (mocked API)
- [ ] `server/__tests__/search-fallback.test.ts` — Fallback parser test stubs
- [ ] `src/__tests__/FilterChips.test.tsx` — Filter chip component test stubs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Search feels intuitive (navigation) | UI-03 | Subjective UX evaluation | Type natural language queries, verify results appear logically grouped with filter chips |
| AI assistant has distinct presence | UI-05 | Visual design evaluation | Verify AI response card has unique styling, animated thinking state, conversational tone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
