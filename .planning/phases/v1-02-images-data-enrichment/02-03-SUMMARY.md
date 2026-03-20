---
phase: 02-images-data-enrichment
plan: 03
subsystem: frontend
tags: [react, typescript, tailwind, enrichment-ui, image-fallback, google-reviews, company-profile]

# Dependency graph
requires:
  - phase: 02-images-data-enrichment
    plan: 01
    provides: Category normalization map and R2 image URL structure
  - phase: 02-images-data-enrichment
    plan: 02
    provides: Enrichment API endpoint and photo proxy route
provides:
  - CompanyImage component with 3-tier fallback chain for 100% image coverage
  - ServicesList component with feature/core tag grouping
  - ReviewsSection component displaying Google Places reviews
  - HoursDisplay component with today highlighting and open/closed badge
  - EnrichmentData types and API client for frontend enrichment fetching
affects: [company-cards, company-profiles, search-results, image-display]

# Tech tracking
tech-stack:
  added: []
  patterns: [image-fallback-chain, lazy-enrichment-ui, feature-tag-detection, progressive-enhancement]

key-files:
  created:
    - src/components/CompanyImage.tsx
    - src/components/ServicesList.tsx
    - src/components/ReviewsSection.tsx
    - src/components/HoursDisplay.tsx
  modified:
    - src/api/types.ts
    - src/api/api.ts
    - src/components/CompanyCard.tsx
    - src/pages/CompanyProfile.tsx

key-decisions:
  - "CompanyImage uses useState+onError for fallback chain instead of imperative image preloading"
  - "PreviewPopup retains string imgSrc prop -- CompanyCard passes getCategoryImageUrl() result for popup"
  - "ServicesList feature detection uses keyword matching against known feature phrases"
  - "Profile page shows DB data immediately, enhances with Google data asynchronously (progressive enhancement)"
  - "Hero image uses CSS gradient overlays on top of CompanyImage component rather than inline background-image style"

patterns-established:
  - "Image fallback chain: Google photo -> R2 category -> Unsplash default -> CSS initial div"
  - "Progressive enrichment: DB data renders first, Google Places data loads async without blocking"
  - "Feature tag detection: keyword matching separates highlights from core services"

requirements-completed: [IMG-05, DATA-04]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 2 Plan 03: Frontend Image & Data Display Summary

**CompanyImage fallback chain, Google reviews section, hours display, improved services list, and enrichment API integration into CompanyProfile page with progressive enhancement**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T02:15:15Z
- **Completed:** 2026-03-12T02:20:43Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 4

## Accomplishments
- Created CompanyImage component implementing 3-tier fallback chain (Google photo -> R2 category -> default -> CSS initial) ensuring 100% image coverage with no broken images
- Added EnrichmentData, PlacePhoto, PlaceReview, PlaceOpeningHours types to frontend type system
- Added EnrichmentAPI client with getEnrichment() and getPhotoUrl() methods
- Created ServicesList component that separates feature tags (Free Estimates, Licensed, Emergency, etc.) from core services using keyword detection, with gold accent styling for features
- Created ReviewsSection component displaying Google Places reviews with star ratings, author attribution, expandable text, relative timestamps, and required Google TOS attribution notice
- Created HoursDisplay component showing Google Places hours with today highlighting and open/closed badge, falling back to database hours string
- Updated CompanyCard to use CompanyImage component, removing legacy CATEGORY_IMAGES/Unsplash fallback
- Updated CompanyProfile to fetch enrichment data asynchronously on mount, displaying DB data immediately and enhancing with Google data when available
- Hero image now uses CompanyImage component with CSS gradient overlays instead of inline background-image style

## Task Commits

Each task was committed atomically:

1. **Task 1: Add enrichment types and API client, create CompanyImage component** - `e4f841e` (feat)
2. **Task 2: Create enrichment display components and update CompanyProfile** - `fb885fd` (feat)

## Files Created/Modified
- `src/api/types.ts` - Added EnrichmentData, PlacePhoto, PlaceReview, PlaceOpeningHours interfaces
- `src/api/api.ts` - Added EnrichmentAPI with getEnrichment() and getPhotoUrl(), added to API export
- `src/components/CompanyImage.tsx` - Smart image component with 3-tier fallback, exports CompanyImage and getCategoryImageUrl
- `src/components/ServicesList.tsx` - Services display with feature/core tag grouping and lucide-react icons
- `src/components/ReviewsSection.tsx` - Google Places reviews with star ratings, expandable text, Google attribution
- `src/components/HoursDisplay.tsx` - Hours display with today highlighting, open/closed badge, DB fallback
- `src/components/CompanyCard.tsx` - Replaced CATEGORY_IMAGES/Unsplash with CompanyImage, removed imgError state
- `src/pages/CompanyProfile.tsx` - Added enrichment fetching, replaced services/reviews/hours/hero with new components

## Decisions Made
- **CompanyImage fallback via useState+onError:** Simpler than imperative Image() preloading and works well with React's rendering model. Each error triggers state change to next fallback level.
- **PreviewPopup keeps string imgSrc:** Rather than refactoring PreviewPopup to accept a component, CompanyCard passes a URL string from getCategoryImageUrl() for the popup. This minimizes changes to a working component.
- **Feature tag keyword matching:** ServicesList detects feature tags (Free Estimates, Emergency, Licensed, etc.) via lowercase keyword matching. This is lightweight and handles the common feature phrases found in the database.
- **Progressive enhancement pattern:** CompanyProfile renders all DB data immediately, then fetches enrichment data in a separate useEffect. Loading states show subtle spinners in reviews and hours sections rather than blocking the entire page.
- **Hero image approach changed:** The old inline `background: url(...)` approach replaced with a CompanyImage component + absolute positioning + CSS gradient overlays. This allows the fallback chain to work on the hero image.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable TypeScript errors**
- **Found during:** Task 2 verification
- **Issue:** CompanyCard destructured `index` (no longer used after removing getImageForCompany), HoursDisplay declared `DAY_NAMES` array but never used it
- **Fix:** Removed `index` from CompanyCard destructuring, removed `DAY_NAMES` constant from HoursDisplay
- **Files modified:** src/components/CompanyCard.tsx, src/components/HoursDisplay.tsx
- **Commit:** fb885fd (included in Task 2 commit)

## Issues Encountered
None beyond the auto-fixed TypeScript errors.

## Self-Check: PASSED

All files verified present:
- [x] src/api/types.ts (EnrichmentData types added)
- [x] src/api/api.ts (EnrichmentAPI added)
- [x] src/components/CompanyImage.tsx (created)
- [x] src/components/ServicesList.tsx (created)
- [x] src/components/ReviewsSection.tsx (created)
- [x] src/components/HoursDisplay.tsx (created)
- [x] src/components/CompanyCard.tsx (updated)
- [x] src/pages/CompanyProfile.tsx (updated)
- [x] Commit e4f841e (Task 1)
- [x] Commit fb885fd (Task 2)
- [x] TypeScript compiles without errors
- [x] Vite production build succeeds

---
*Phase: 02-images-data-enrichment*
*Plan: 03*
*Completed: 2026-03-12*
