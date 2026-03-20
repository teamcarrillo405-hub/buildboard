---
phase: 03-website-discovery
plan: 01
subsystem: pipeline
tags: [domainUtils, enrichWorker, playwright, better-sqlite3, dns, typescript]

requires:
  - phase: none
    provides: "domainUtils.ts already built with generateCandidateDomains, checkDomainDNS, verifyWebsite, verifyBusinessMatch"

provides:
  - "enrichWorker.ts wired to domainUtils.ts — domain guessing fires before any Playwright browser search"
  - "Only DNS-verified + HTTP-valid + title-matched URLs written to companies.website"
  - "finalUrl (post-redirect) saved, not raw candidate domain"
  - "foundDomainGuess counter in WorkerProgress — source='domain-guess' vs 'web-search' breakdown in logs"

affects:
  - "04-contact-extraction — depends on Phase 3 producing verified website URLs"
  - "05-orchestrator — will schedule enrichWorker workers"

tech-stack:
  added: []
  patterns:
    - "Domain guessing as primary path: generateCandidateDomains -> checkDomainDNS -> verifyWebsite -> verifyBusinessMatch before any Playwright search"
    - "Source tagging on EnrichResult: 'domain-guess' | 'web-search' | 'none' for attribution tracking"
    - "ESM .js extension on TypeScript relative imports (required for tsx/Node18 ESM)"

key-files:
  created: []
  modified:
    - server/scripts/enrichWorker.ts

key-decisions:
  - "Domain guessing runs unconditionally before Playwright — avoids browser spin-up cost for companies with guessable domains"
  - "isDirectoryUrl check added to domain candidate loop — prevents saving yelp.com/bbb.org etc. as company websites"
  - "smoke test showed 4 of 6 found URLs came from domain guessing (67%) — validates the optimization"

patterns-established:
  - "Verification chain: DNS -> HTTP validity -> parked-domain check -> title match (50% token overlap)"
  - "foundDomainGuess counter pattern: increment when result.source === 'domain-guess', log DomainGuess=A Search=B breakdown"

requirements-completed: [WEB-01, WEB-02, WEB-03, WEB-04]

duration: 14min
completed: 2026-03-18
---

# Phase 3 Plan 01: Website Discovery Summary

**Domain guessing wired into enrichWorker.ts as primary path — generateCandidateDomains + DNS/HTTP/title verification fires before any Playwright browser launch, saving verified post-redirect URLs with source attribution**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-03-18T20:39:55Z
- **Completed:** 2026-03-18T20:54:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Wired domainUtils.ts into enrichBusiness() as the primary discovery path — domain guessing runs before any Playwright browser launch
- Verified 4 of 6 found URLs came from domain guessing (67%) in smoke run — confirms significant browser-avoidance in practice
- Added source attribution ('domain-guess' | 'web-search' | 'none') and foundDomainGuess counter to WorkerProgress with log format `DomainGuess=A Search=B`
- Added category to Company interface and SELECT query so generateCandidateDomains gets category-aware suffix hints

## Task Commits

1. **Task 1: Add category to DB query and import domainUtils** - `6ece0ae` (feat)
2. **Task 2: Wire domain guessing into enrichBusiness() as primary path** - `d31b472` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `server/scripts/enrichWorker.ts` - Added domainUtils import, category field, domain guessing loop before Bing/Google search, foundDomainGuess counter, updated log format

## Decisions Made

- Domain guessing runs unconditionally first (no short-circuit) — every company gets up to 24 candidates checked before Playwright fires
- isDirectoryUrl() check added at the top of the candidate loop to skip yelp.com/bbb.org etc. early
- source='domain-guess' stored on EnrichResult and checked in main() to increment foundDomainGuess counter

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npx tsx -e` runs in CJS mode and cannot resolve relative ESM imports — used a temporary `.ts` file inside the project tree to verify the import. Removed after verification passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- enrichWorker.ts now produces verified website URLs with domain guessing as primary path
- Phase 4 (contact extraction) can rely on companies.website containing only verified, post-redirect URLs
- Worker smoke test confirmed: 10 companies processed, 6 found (4 via domain guessing, 2 via web search), 0 errors

---
*Phase: 03-website-discovery*
*Completed: 2026-03-18*
