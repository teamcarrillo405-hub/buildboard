---
phase: 02-images-data-enrichment
plan: 02
subsystem: api
tags: [google-places, enrichment, photo-proxy, sqlite, drizzle, express, lazy-loading]

# Dependency graph
requires:
  - phase: 01-infrastructure-rebrand
    provides: Express server with Router pattern, Drizzle ORM with libsql, companies schema
provides:
  - googlePlacesCache table for caching place_id (Google TOS compliant)
  - Google Places API service with findPlaceId and getPlaceDetails
  - GET /api/companies/:id/enrichment endpoint for lazy on-demand enrichment
  - GET /api/places/photo proxy endpoint that hides API key from frontend
affects: [02-03-frontend-enrichment-ui, company-profiles, image-display]

# Tech tracking
tech-stack:
  added: [native-fetch]
  patterns: [lazy-enrichment, photo-proxy, place-id-caching, two-tier-api-strategy]

key-files:
  created:
    - server/services/google-places.ts
    - server/routes/enrichment.ts
    - server/routes/images.ts
    - server/scripts/create-places-cache-table.ts
  modified:
    - server/schema.ts
    - server/index.ts

key-decisions:
  - "Native fetch() for Google Places API calls (Node 18+ built-in, no extra HTTP library)"
  - "Two-tier request strategy: Text Search Essentials ID Only ($10/1K) for place_id, Place Details Enterprise ($20/1K) for content"
  - "Place_id cached indefinitely in DB; photos/reviews/hours fetched fresh per Google TOS"
  - "Photo proxy streams image buffer rather than redirecting to preserve API key secrecy"
  - "Enrichment returns { enriched: false, placeId: null } when API key missing (graceful degradation)"

patterns-established:
  - "Lazy enrichment: fetch external data on-demand at profile view time, not batch"
  - "Photo proxy pattern: server-side fetch of Google image, stream to client, hide API key"
  - "Place_id caching with onConflictDoUpdate upsert for concurrent safety"
  - "Service module pattern: server/services/ directory for external API wrappers"

requirements-completed: [IMG-03, IMG-04, DATA-01, DATA-02, DATA-03]

# Metrics
duration: 14min
completed: 2026-03-11
---

# Phase 2 Plan 02: Google Places Lazy Enrichment Summary

**Google Places lazy enrichment backend with place_id caching, two-tier API strategy (Text Search + Place Details), and photo proxy to hide API key from frontend**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-12T01:56:02Z
- **Completed:** 2026-03-12T02:10:25Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added google_places_cache table to schema for indefinite place_id caching (Google TOS compliant -- no content caching)
- Built Google Places API service with two-tier cost optimization: Essentials ID Only for Text Search ($10/1K), Enterprise for Place Details ($20/1K)
- Created lazy enrichment endpoint that fetches photos, reviews, and hours on-demand when a user views a profile
- Implemented photo proxy that streams Google Places images while keeping the API key server-side
- All endpoints gracefully degrade when GOOGLE_PLACES_API_KEY is not set

## Task Commits

Each task was committed atomically:

1. **Task 1: Add google_places_cache table and create Google Places service** - `9f3a877` (feat)
2. **Task 2: Create enrichment and photo proxy routes, mount in server** - `061856f` (feat)

## Files Created/Modified
- `server/schema.ts` - Added googlePlacesCache table definition (companyId, placeId, matchConfidence, createdAt, lastAccessedAt)
- `server/services/google-places.ts` - Google Places API client: findPlaceId (Text Search), getPlaceDetails (Place Details), type definitions
- `server/routes/enrichment.ts` - GET /api/companies/:id/enrichment with place_id cache lookup/store and fresh content fetch
- `server/routes/images.ts` - GET /api/places/photo proxy with API key hiding, Cache-Control headers
- `server/index.ts` - Mounts enrichmentRouter and imagesRouter at /api
- `server/scripts/create-places-cache-table.ts` - One-time script to create the SQLite table
- `server/scripts/verify-places-cache-table.ts` - Verification script for table existence
- `server/scripts/test-routes.ts` - In-process endpoint verification script

## Decisions Made
- Used native `fetch()` for all Google Places API calls (Node 18+ built-in, avoids adding axios or node-fetch dependency)
- Two-tier request strategy minimizes costs: Text Search uses only `places.id,places.displayName,places.formattedAddress` (Essentials ID Only at $10/1K) while Place Details uses Enterprise fields only when fetching the full profile
- Photo proxy buffers the entire image before sending (not streaming) -- simpler and works with Express 5 response handling
- Enrichment endpoint limits photos and reviews to first 5 results to reduce response payload size
- Match confidence hardcoded at 0.8 for initial implementation -- can be improved with address verification later

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Express 5 route testing required in-process HTTP server creation (importing app directly) rather than background process + curl, due to working directory issues with tsx on Windows. All routes work correctly when tested in-process.

## User Setup Required

To enable Google Places enrichment, the user needs to:
1. Enable Places API (New) in Google Cloud Console
2. Create an API key restricted to Places API
3. Set `GOOGLE_PLACES_API_KEY` in `.env` file
4. Set a budget alert ($50/month recommended)

Without the API key, all endpoints return graceful fallback responses (enriched: false, 503 for photos).

## Next Phase Readiness
- Backend enrichment endpoints are ready for frontend integration
- Frontend can call GET /api/companies/:id/enrichment on profile view to get photos, reviews, hours
- Frontend can use GET /api/places/photo?name=...&maxWidth=400 as image src for Google Places photos
- No API key needed for development -- endpoints return empty/false responses without it

## Self-Check: PASSED

All files verified present:
- server/schema.ts (googlePlacesCache table added)
- server/services/google-places.ts (findPlaceId, getPlaceDetails, 7 type exports)
- server/routes/enrichment.ts (GET /companies/:id/enrichment)
- server/routes/images.ts (GET /places/photo)
- server/index.ts (both routers mounted)
- server/scripts/create-places-cache-table.ts
- Commit 9f3a877 (Task 1)
- Commit 061856f (Task 2)

---
*Phase: 02-images-data-enrichment*
*Plan: 02*
*Completed: 2026-03-11*
