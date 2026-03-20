---
phase: 02-images-data-enrichment
plan: 01
subsystem: infra
tags: [gemini, imagen, cloudflare-r2, sharp, aws-sdk-s3, image-generation, cdn]

# Dependency graph
requires:
  - phase: 01-infrastructure-rebrand
    provides: database schema with companies table and category column
provides:
  - Category normalization map (163 raw categories -> 61 image slugs)
  - AI image generation prompts for all 61 category groups
  - Cloudflare R2 upload/URL service module
  - Batch image generation script with dry-run, single-slug, and resume support
affects: [02-images-data-enrichment, 03-google-places, ui-components]

# Tech tracking
tech-stack:
  added: ["@google/genai", "@aws-sdk/client-s3", "sharp", "@types/sharp"]
  patterns: ["R2 S3-compatible client with env validation", "Category normalization via static map", "Batch script with CLI flags and resume support"]

key-files:
  created:
    - server/data/category-map.ts
    - server/services/r2.ts
    - server/scripts/generate-category-images.ts
  modified: []

key-decisions:
  - "163 raw categories normalized to 61 image slugs (not ~50 as estimated)"
  - "R2 service warns on missing env vars instead of throwing, allowing server to start in local dev"
  - "Sequential image generation with 1s delay to respect Gemini rate limits"
  - "HeadObject-based resume support allows re-running after partial failures"

patterns-established:
  - "Category normalization: static CATEGORY_TO_IMAGE_SLUG map in server/data/category-map.ts"
  - "R2 service: graceful degradation when env vars missing"
  - "Batch scripts: --dry-run and --slug CLI flags for safe testing"

requirements-completed: [IMG-01, IMG-02]

# Metrics
duration: 9min
completed: 2026-03-11
---

# Phase 2 Plan 01: Category Image Generation & R2 Storage Summary

**163 database categories normalized to 61 image groups with Imagen 4 Fast prompts, Cloudflare R2 upload service, and resumable batch generation script producing 305 WebP images**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-12T01:55:50Z
- **Completed:** 2026-03-12T02:05:00Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Queried all 163 distinct categories from the 3.4M-row database and built a complete normalization map to 61 visual image slugs
- Created photorealistic AI image generation prompts for all 61 category groups, optimized for professional B2B construction imagery
- Built Cloudflare R2 service with upload, public URL generation, and existence checking via S3-compatible API
- Created batch generation script with --dry-run, --slug, resume support, error recovery, and env var validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create category normalization map and R2 service** - `7a48430` (feat)
2. **Task 2: Create batch image generation script** - `8b2e81a` (feat)

## Files Created/Modified
- `server/data/category-map.ts` - Category normalization map (163 categories -> 61 slugs), IMAGE_SLUGS array, CATEGORY_PROMPTS for all slugs
- `server/services/r2.ts` - Cloudflare R2 client with uploadToR2, getPublicUrl, existsInR2 exports
- `server/scripts/generate-category-images.ts` - Batch script to generate 305 images via Imagen 4 Fast and upload to R2

## Decisions Made
- **61 slugs instead of ~50-60:** The 163 raw categories normalized to 61 distinct visual groups. This is slightly above the estimated range but ensures every category has a relevant image without over-consolidating distinct trades.
- **Graceful R2 degradation:** R2 service logs a warning when env vars are missing but does not throw, so the server can start normally for local development without R2 credentials.
- **Sequential generation with delay:** Images generated one-at-a-time with 1-second delays between API calls to stay within Gemini rate limits. Tradeoff: slower (~5-6 minutes for full batch) but reliable.
- **HeadObject resume:** Before generating each image, checks if the R2 key already exists. This allows safely re-running the script after partial failures without regenerating (and re-paying for) images that were already uploaded.

## Deviations from Plan
None - plan executed exactly as written.

## User Setup Required

Before running the generation script, the user must configure Cloudflare R2:

1. **Create R2 bucket** named `buildboard-images` in Cloudflare Dashboard
2. **Create R2 API token** with Object Read & Write permissions
3. **Enable public access** on the bucket (custom domain or r2.dev subdomain)
4. **Add environment variables** to `.env`:
   ```
   R2_ACCOUNT_ID=your_cloudflare_account_id
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret_key
   R2_BUCKET_NAME=buildboard-images
   R2_PUBLIC_URL=https://images.buildboard.com
   ```
5. **Run the script:**
   ```bash
   # Test with a single category first
   npx tsx server/scripts/generate-category-images.ts --slug plumbing

   # Generate all 305 images (~$6.10 total)
   npx tsx server/scripts/generate-category-images.ts
   ```

GEMINI_API_KEY is already configured in `.env`.

## Issues Encountered
None.

## Next Phase Readiness
- Category map ready for use by image fallback components and company card rendering
- R2 service ready for Google Places photo proxying in future plans
- Script ready to run once R2 credentials are configured
- IMAGE_SLUGS and CATEGORY_TO_IMAGE_SLUG exports available for frontend image URL resolution

## Self-Check: PASSED

- [x] server/data/category-map.ts exists
- [x] server/services/r2.ts exists
- [x] server/scripts/generate-category-images.ts exists
- [x] Commit 7a48430 found (Task 1)
- [x] Commit 8b2e81a found (Task 2)
- [x] 02-01-SUMMARY.md exists

---
*Phase: 02-images-data-enrichment*
*Completed: 2026-03-11*
