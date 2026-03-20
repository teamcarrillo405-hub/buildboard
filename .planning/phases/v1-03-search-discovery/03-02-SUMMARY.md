---
phase: 03-search-discovery
plan: 02
subsystem: ai-search
tags: [gemini, function-calling, nlp, search, fallback]
dependency_graph:
  requires: ["@google/genai", "server/helpers/parseChat.ts"]
  provides: ["server/services/gemini-search.ts", "server/routes/ai-search.ts"]
  affects: ["server/index.ts"]
tech_stack:
  added: []
  patterns: ["Gemini function calling with FunctionCallingConfigMode.ANY", "Promise.race timeout pattern", "Dynamic import with try/catch for optional modules"]
key_files:
  created:
    - server/services/gemini-search.ts
    - server/routes/ai-search.ts
  modified:
    - server/index.ts
decisions:
  - "Gemini function calling with FunctionCallingConfigMode.ANY forces structured filter extraction on every query"
  - "3-second Promise.race timeout prevents slow AI from blocking search results"
  - "Dynamic import for categoryMatcher allows Plan 03-01 and 03-02 to run independently"
  - "ConversationMessage type uses role+text pairs for client-side history management"
  - "Fallback maps parseChat boolean fields (emergency, freeEstimate, warranty) to services array"
metrics:
  duration: "3 min"
  completed: "2026-03-12"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 3 Plan 2: AI Search Service (Gemini) Summary

Gemini function calling service that extracts structured search filters (category, city, state, minRating, services) from natural language queries, with 3-second timeout and parseChat fallback when AI is unavailable.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Create Gemini search service with fallback | d81aa7f | server/services/gemini-search.ts |
| 2 | Create AI search endpoint and mount | 63d8993 | server/routes/ai-search.ts, server/index.ts |

## What Was Built

### Gemini Search Service (`server/services/gemini-search.ts`)

- **Function declaration** (`SEARCH_FUNCTION`): Defines `search_directory` with 7 parameters (query, category, city, state, minRating, services, summary) using the `Type` enum from `@google/genai`
- **`aiParseQuery(message, history)`**: Creates a GoogleGenAI instance, builds conversation contents with system preamble + history, calls `ai.models.generateContent()` with `gemini-2.5-flash` and `FunctionCallingConfigMode.ANY` to force function calling, extracts filters and summary from response
- **`smartSearch(message, history)`**: Wraps `aiParseQuery` in a try/catch with 3-second `Promise.race` timeout. On success returns `source: 'ai'`, on failure falls back to `parseChat()` and returns `source: 'fallback'`
- **`isAIAvailable()`**: Checks for `GEMINI_API_KEY` env var, logs warning on first call if missing
- **Fallback builder**: Maps `parseChat` output (category, state, city, minRating, emergency, freeEstimate, warranty) to the `SearchFilters` interface
- **Dynamic categoryMatcher import**: Uses top-level `await import()` in a try/catch so the module works regardless of whether Plan 03-01 has been committed

### AI Search Endpoint (`server/routes/ai-search.ts`)

- **POST /api/ai-search**: Accepts `{ message, history }`, validates input, calls `smartSearch`, applies optional category normalization via `matchCategory`, returns `{ filters, summary, source, conversationEntry }`
- **Input validation**: Rejects empty/missing messages with 400 status; sanitizes history array entries
- **Logging**: Logs source (ai/fallback) and extracted filters for monitoring

### Server Integration (`server/index.ts`)

- AI search router mounted at `/api` alongside existing routers
- Startup log shows "AI search: available" or "AI search: degraded (no API key -- using fallback parser)"

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `npx tsc --noEmit` passes cleanly
- `npm run build` succeeds (tsc + vite build in 2.89s)
- All 4 required exports verified: `aiParseQuery`, `smartSearch`, `SearchFilters`, `isAIAvailable`
- All 7 function declaration parameters verified: query, category, city, state, minRating, services, summary
- Missing API key gracefully degrades to fallback parser (no crash, no error)
- Conversation history support enables follow-up refinement queries

## Self-Check: PASSED

- [x] server/services/gemini-search.ts exists
- [x] server/routes/ai-search.ts exists
- [x] 03-02-SUMMARY.md exists
- [x] Commit d81aa7f found (Task 1)
- [x] Commit 63d8993 found (Task 2)
