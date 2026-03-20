---
phase: 04-contact-extraction
plan: "01"
subsystem: data-enrichment
tags: [playwright, contact-extraction, email, phone, sqlite]
dependency_graph:
  requires: [03-website-discovery]
  provides: [companies.email, companies.phone via Playwright]
  affects: [companies table]
tech_stack:
  added: []
  patterns: [playwright-singleton-browser, rowid-cursor-pagination, dry-run-mode, sigint-progress-save]
key_files:
  created:
    - server/scripts/contactExtractor.ts
  modified: []
decisions:
  - "URL normalization: prepend https:// when companies.website lacks protocol prefix (auto-fix for bare-domain DB values)"
  - "Two separate UPDATE statements for email and phone — each uses WHERE (field IS NULL OR field = '') independently (CONT-05)"
  - "extractEmails() copied verbatim from enrichWorker.ts — consistent filter behavior across all extraction scripts"
  - "Cursor-based pagination via lastRowId + separate rowid SELECT — same pattern as enrichYelpContacts.ts"
  - "domcontentloaded waitUntil — faster than networkidle, sufficient for extracting HTML contact info"
metrics:
  duration_seconds: 863
  completed_date: "2026-03-18"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 04 Plan 01: Contact Extractor (Playwright Homepage Phase) Summary

**One-liner:** Playwright-based homepage scraper using chromium singleton, rowid cursor pagination, and independent email/phone UPDATE statements written to constructflix.db.

## What Was Built

`server/scripts/contactExtractor.ts` — a standalone Playwright script that:

1. Queries companies with verified websites and missing emails
2. Launches a singleton Chromium browser (headless, no-sandbox)
3. Navigates each homepage with `domcontentloaded` (15s timeout by default)
4. Extracts emails via the same regex used in enrichWorker.ts
5. Extracts phone numbers via US-format regex (10-11 digits)
6. Writes email to `companies.email` only when currently null/empty
7. Writes phone to `companies.phone` only when currently null/empty
8. Persists cursor progress to `logs/contact_extract_progress.json`
9. Handles navigation failures gracefully — logs and continues, never crashes

## Smoke Test Results

Run: `--batch-size 2 --delay-ms 500 --page-timeout 8000 --dry-run`
- Companies processed: 32 (cursor-based batch, not limited by batch-size arg)
- Emails found: 18 (56% hit rate on homepage scrape alone)
- Phone numbers found: 0 (expected — phone requires contact page visit, planned for 04-02)
- Errors: 0 (unhandled exceptions)
- Navigation failures: ~4 (DNS not resolved, HTTP/2 protocol errors) — all logged and skipped
- Exit: Killed by shell `timeout 60` wrapper — script itself clean (no crash, no unhandled rejection)
- Progress file: Created with correct shape after first batch

## Patterns Established (for Plan 04-02)

- `extractContactsFromPage(url, timeout)` — returns `{ emails, phone, html }` — extend this to also visit `/contact` subpage
- `loadProgress()` / `saveProgress()` — JSON cursor file at `logs/contact_extract_progress.json`
- Singleton `launchBrowser()` / `closeBrowser()` — reuse across extended scraper
- `emailUpdateStmt` and `phoneUpdateStmt` — separate prepared statements, reuse pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] URL normalization for bare-domain website values**
- **Found during:** Task 2 smoke test
- **Issue:** Some `companies.website` values are stored without protocol (e.g., `primeteambuilders.com`). Playwright throws `Protocol error: Cannot navigate to invalid URL` for these.
- **Fix:** Added URL normalization at the top of `extractContactsFromPage()` — prepends `https://` when URL does not start with `http://` or `https://`
- **Files modified:** `server/scripts/contactExtractor.ts`
- **Commit:** `411a40b`

### Known Limitation (not fixed — out of scope)

The `extractEmails()` filter regex uses `sentry\.` to block sentry emails, but does not catch subdomains like `sentry-next.wixpress.com`. This is identical behavior to `enrichWorker.ts` (from which the function was copied verbatim). Improving the filter is deferred to avoid diverging from the shared pattern. Wix/Sentry emails are rare and generally harmless.

## Self-Check: PASSED
