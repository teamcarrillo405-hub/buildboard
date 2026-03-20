# Phase 2: Images & Data Enrichment - Research

**Researched:** 2026-03-11
**Domain:** Image generation (Gemini), object storage (Cloudflare R2), Google Places API (photos/reviews/hours), database schema extensions
**Confidence:** HIGH

## Summary

Phase 2 transforms BuildBoard from a text-only directory into a visually credible B2B platform. The strategy has three layers: (1) AI-generated category images via Gemini stored in Cloudflare R2 as baseline fallbacks, (2) Google Places photos fetched on-demand when users view company profiles, and (3) enriched data (reviews, hours) from Google Places cached with TTL to manage costs.

The critical constraint is Google Places API pricing and Terms of Service. Reviews require the Enterprise + Atmosphere tier ($35/1000 requests for Text Search, $20/1000 for Place Details), photos trigger Enterprise billing ($7/1000 for photo serving), and the TOS prohibits caching most content except place_id (indefinitely) and lat/lng (30 days). This means every profile view that needs fresh Google data costs money. The architecture must minimize API calls through smart caching of place_id, lazy enrichment, and aggressive use of AI-generated category fallbacks.

The database has 134 distinct categories (not ~50 as originally estimated), though many are duplicates differing only in casing or phrasing (e.g., "Plumbing" vs "Plumbing Contractor" vs "Plumbing Contractors"). For image generation, these should be normalized into ~50-60 visual groups. Services data is already stored as JSON arrays in 97% of records (3.3M of 3.4M). Hours are plain text strings like "Mon-Fri 8:00 AM - 5:00 PM".

**Primary recommendation:** Use Imagen 4 Fast ($0.02/image) for category image generation, Cloudflare R2 with a custom domain for CDN-backed image serving, and a two-tier Google Places request strategy (cheap Text Search Essentials ID Only to get place_id, then Place Details Enterprise only on profile view) with place_id cached indefinitely in the database.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IMG-01 | AI-generated category images for all ~50 categories (5 variations, ~250 images) via Gemini | Imagen 4 Fast at $0.02/image = ~$5 total. Use `@google/genai` SDK. 134 actual categories should be normalized to ~50-60 visual groups. |
| IMG-02 | Category images stored in Cloudflare R2 and served as CDN-backed defaults | R2 public bucket with custom domain. Use `@aws-sdk/client-s3` v3 for uploads. Zero egress fees. |
| IMG-03 | Google Places photos fetched on-demand when viewing company profile | Place Photos API at $7/1000. Use photo resource name from Place Details. Cannot cache photo names per TOS. |
| IMG-04 | Google Places photo results cached in DB with 30-90 day TTL | Can cache place_id indefinitely. Cannot cache photo names, review text, or hours per TOS. Must re-fetch on each view but can cache place_id to skip Text Search step. |
| IMG-05 | 100% image coverage via layered fallback | Fallback chain: Google Places photo (if place_id cached + photos available) -> R2 category image -> hardcoded default. |
| DATA-01 | Google Places reviews for company profiles | Reviews are in Enterprise + Atmosphere tier ($35/1000 Text Search, $20/1000 Place Details). Must fetch fresh per TOS. Cache place_id only. |
| DATA-02 | Google Places hours of operation | `regularOpeningHours` is Enterprise tier ($20/1000). Can be fetched alongside reviews in same Place Details request. |
| DATA-03 | Google Places data cached with TTL | Cache place_id indefinitely. Display data (reviews, hours, photos) must be fetched fresh per TOS, but using cached place_id avoids the Text Search step. |
| DATA-04 | Services breakdown on company profiles | Services already stored as JSON arrays in 97% of records. Need UI component to display them clearly. Possible category-based grouping. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | ^1.5.0 | Gemini/Imagen API for image generation | Official unified Google GenAI SDK. Supports Imagen 4 models for image generation. |
| `@aws-sdk/client-s3` | ^3.x | S3 client for Cloudflare R2 | Official AWS SDK v3, works with R2 via S3-compatible API. Tree-shakeable. |
| `@aws-sdk/s3-request-presigner` | ^3.x | Presigned URL generation for R2 | Creates time-limited signed URLs. Used for admin upload of generated images. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sharp` | ^0.33.x | Image processing (resize, optimize) | Resize AI-generated images to web-optimized dimensions before R2 upload. |

### Not Needed

| What | Why Not |
|------|---------|
| Google Places SDK/npm package | Places API (New) is REST-only. Use native `fetch()` on the server. |
| Image CDN service (Cloudinary, imgix) | R2 + custom domain provides CDN via Cloudflare's network. No extra service needed. |
| `googleapis` npm package | Massive package. Direct REST calls to Places API are simpler and lighter. |

**Installation:**
```bash
npm install @google/genai @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp
npm install -D @types/sharp
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  schema.ts              # Add new tables: google_places_cache, category_images
  routes/
    companies.ts         # Existing - add image URL resolution to responses
    enrichment.ts        # NEW - Google Places lazy enrichment endpoint
    images.ts            # NEW - Image proxy for Google Places photos
  services/
    google-places.ts     # NEW - Google Places API client (Text Search, Place Details, Photos)
    r2.ts                # NEW - Cloudflare R2 client (upload, get public URL)
  scripts/
    generate-category-images.ts  # NEW - One-time batch script for Imagen 4
    upload-to-r2.ts             # NEW - Upload generated images to R2
src/
  components/
    CompanyCard.tsx       # Update image source to use fallback chain
    CompanyImage.tsx      # NEW - Smart image component with fallback chain
    ServicesList.tsx      # NEW - Services breakdown component
    ReviewsSection.tsx    # NEW - Google Places reviews display
    HoursDisplay.tsx      # NEW - Hours of operation display
  pages/
    CompanyProfile.tsx    # Add enrichment trigger, reviews, hours sections
```

### Pattern 1: Lazy Enrichment on Profile View

**What:** When a user views a company profile, check if we have a cached `place_id`. If not, call Text Search to find the place, store the `place_id`, then fetch Place Details for photos/reviews/hours. Display the data. On subsequent views, skip Text Search (cached place_id) and go straight to Place Details.

**When to use:** Every company profile view where Google Places data is desired.

**Why:** Avoids the catastrophic cost of batch-enriching 3.4M records. Only enriches companies that users actually view. The Text Search Essentials ID Only call (to get place_id) costs ~$10/1000; the Place Details Enterprise call costs $20/1000. Total per-profile-view: ~$0.027 for first visit, ~$0.020 for subsequent (skip Text Search).

**Example:**
```typescript
// server/services/google-places.ts
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

interface PlaceSearchResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
}

// Step 1: Find place_id via Text Search (Essentials ID Only - $10/1000)
export async function findPlaceId(
  businessName: string,
  city: string,
  state: string
): Promise<PlaceSearchResult | null> {
  const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({
      textQuery: `${businessName} ${city} ${state}`,
      pageSize: 1,
    }),
  });
  const data = await response.json();
  if (!data.places?.length) return null;
  const place = data.places[0];
  return {
    placeId: place.id,
    displayName: place.displayName?.text ?? '',
    formattedAddress: place.formattedAddress ?? '',
  };
}

// Step 2: Get enrichment data via Place Details (Enterprise - $20/1000)
// Photos, reviews, hours - fetched fresh per Google TOS
export async function getPlaceDetails(placeId: string) {
  const response = await fetch(
    `${PLACES_API_BASE}/places/${placeId}`,
    {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!,
        'X-Goog-FieldMask': [
          'photos',
          'reviews',
          'rating',
          'userRatingCount',
          'regularOpeningHours',
          'websiteUri',
          'nationalPhoneNumber',
        ].join(','),
      },
    }
  );
  return response.json();
}

// Step 3: Get photo media URL (Enterprise - $7/1000)
export async function getPhotoUrl(
  photoName: string,
  maxWidthPx: number = 400
): Promise<string> {
  // photoName format: "places/PLACE_ID/photos/PHOTO_REFERENCE"
  const url = `${PLACES_API_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
  // This URL redirects to the actual image - return it directly
  return url;
}
```

### Pattern 2: Image Fallback Chain

**What:** Every company image resolves through a priority chain: Google Places photo > R2 category image > hardcoded default.

**When to use:** Everywhere a company image is displayed (cards, profile hero, search results).

**Example:**
```typescript
// src/components/CompanyImage.tsx
interface CompanyImageProps {
  company: {
    id: string;
    category: string;
    googlePhotoUrl?: string | null; // From enrichment
  };
  className?: string;
  width?: number;
}

function getCategoryImageUrl(category: string, index: number = 0): string {
  // Normalize category to slug for R2 path
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const variation = (index % 5) + 1;
  return `https://images.buildboard.com/categories/${slug}/${variation}.webp`;
}

const FALLBACK_IMAGE = 'https://images.buildboard.com/defaults/construction.webp';

export function CompanyImage({ company, className, width = 400 }: CompanyImageProps) {
  const [imgSrc, setImgSrc] = useState(
    company.googlePhotoUrl || getCategoryImageUrl(company.category)
  );
  const [fallbackLevel, setFallbackLevel] = useState(0);

  const handleError = () => {
    if (fallbackLevel === 0 && company.googlePhotoUrl) {
      setImgSrc(getCategoryImageUrl(company.category));
      setFallbackLevel(1);
    } else if (fallbackLevel <= 1) {
      setImgSrc(FALLBACK_IMAGE);
      setFallbackLevel(2);
    }
  };

  return (
    <img
      src={imgSrc}
      alt={company.businessName}
      className={className}
      loading="lazy"
      onError={handleError}
    />
  );
}
```

### Pattern 3: Category Image Generation (One-Time Batch)

**What:** A standalone script that generates AI images for each normalized category and uploads them to R2.

**When to use:** Run once during development, re-run only when adding new categories.

**Example:**
```typescript
// server/scripts/generate-category-images.ts
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const CATEGORY_PROMPTS: Record<string, string> = {
  'plumbing': 'Professional plumber working on copper pipes in a modern commercial building, construction site, photorealistic, high quality, 16:9 aspect ratio',
  'electrical-contractors': 'Licensed electrician installing wiring in a commercial electrical panel, construction site, photorealistic, high quality, 16:9 aspect ratio',
  'roofing-contractors': 'Roofers installing shingles on a large commercial roof, aerial view, construction site, photorealistic, high quality, 16:9 aspect ratio',
  // ... ~60 category prompts
};

async function generateAndUpload(slug: string, prompt: string, variation: number) {
  // Generate with Imagen 4 Fast ($0.02/image)
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-fast-generate-001',
    prompt: prompt,
    config: { numberOfImages: 1 },
  });

  const imageData = response.generatedImages[0].image.imageBytes;
  const buffer = Buffer.from(imageData, 'base64');

  // Optimize with sharp
  const optimized = await sharp(buffer)
    .resize(800, 450, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();

  // Upload to R2
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: `categories/${slug}/${variation}.webp`,
    Body: optimized,
    ContentType: 'image/webp',
  }));

  console.log(`Uploaded: categories/${slug}/${variation}.webp`);
}
```

### Anti-Patterns to Avoid

- **Batch-enriching all 3.4M records:** NEVER call Google Places API for all companies. At $20-35/1000, this costs $68K-$119K. Use lazy on-demand enrichment only.
- **Caching Google Places content in the database:** TOS prohibits caching photos, reviews, hours. Only cache `place_id` (indefinitely). Everything else must be fetched fresh.
- **Requesting reviews in the same field mask as basic data:** Reviews trigger Enterprise + Atmosphere billing ($35/1000 for Text Search vs $10/1000 for Essentials). Separate the requests.
- **Generating images at runtime:** AI image generation is slow (2-5 seconds) and rate-limited. Pre-generate all category images in a batch script and store in R2.
- **Using Gemini native image generation when Imagen 4 is cheaper:** Gemini 2.5 Flash Image costs $0.039/image. Imagen 4 Fast costs $0.02/image -- nearly half the price for category images where text-interleaved output is not needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Object storage + CDN | Custom file server or local disk storage | Cloudflare R2 with custom domain | Zero egress fees, global CDN, S3-compatible API, handles scale |
| Image optimization | Manual resize/compress logic | `sharp` library | Handles WebP conversion, resize, quality optimization. Battle-tested. |
| S3 presigned URLs | Custom signing logic | `@aws-sdk/s3-request-presigner` | AWS Signature V4 is complex. The SDK handles it correctly. |
| Image fallback chains | Complex conditional rendering per component | Single `CompanyImage` component | Centralizes fallback logic, avoids inconsistent image handling across 4+ components |
| Rate limiting for Google API | Sleep loops or manual counters | Simple queue with configurable concurrency | Avoid 429 errors on batch operations. A basic promise queue with concurrency=5 suffices. |

**Key insight:** The expensive problems in this phase are API cost management and TOS compliance, not code complexity. Get the architecture right (lazy enrichment, place_id caching, pre-generated fallbacks) and the code is straightforward.

## Common Pitfalls

### Pitfall 1: Google Places TOS Violation -- Caching Content

**What goes wrong:** Developer caches reviews, hours, or photo references in the database to avoid repeat API calls. Google detects the violation and suspends the API key.

**Why it happens:** The instinct to "cache everything with a TTL" is natural for reducing API costs. But Google's Places API TOS explicitly prohibits caching all content except `place_id`. The earlier project research mentioned 30-90 day TTL caching, but the actual TOS is stricter.

**How to avoid:** Cache ONLY `place_id` (indefinitely). On each profile view, use the cached `place_id` to make a Place Details request for fresh photos/reviews/hours. The place_id cache still saves money by eliminating the Text Search call on repeat visits.

**Warning signs:** Database tables with columns like `cached_reviews`, `cached_hours`, `photo_reference`, or `review_text` with timestamps.

### Pitfall 2: Requesting Pro/Enterprise Fields When You Only Need IDs

**What goes wrong:** You use a field mask like `places.id,places.displayName,places.formattedAddress,places.photos` in Text Search. The `photos` field triggers Enterprise billing at $35/1000 instead of Essentials ID Only at $10/1000. Your costs 3.5x what they should be.

**Why it happens:** The pricing tiers are determined by the HIGHEST-tier field in your mask. Any Enterprise field promotes the entire request to Enterprise pricing. `photos` and `regularOpeningHours` are Enterprise fields.

**How to avoid:** Use TWO separate requests: (1) Text Search with `places.id` only (Essentials ID Only, $10/1000) to get the place_id, (2) Place Details with Enterprise fields only when viewing the full profile ($20/1000). Never mix cheap and expensive fields in one request.

**Warning signs:** Google Cloud billing shows higher-than-expected Places API costs. All requests billed at the same (high) tier.

### Pitfall 3: Category Count Mismatch -- 134 Categories, Not 50

**What goes wrong:** You generate images for ~50 categories based on the constants in `types.ts`, but the database has 134 distinct normalized categories. Companies in ungrouped categories get no AI image and fall through to a generic default.

**Why it happens:** The `CONSTRUCTION_CATEGORIES` constant in `types.ts` lists only 15 categories. The actual database has 134 case-normalized categories (163 raw, with duplicates like "Plumbing" vs "Plumbing Contractor" vs "Plumbing Contractors").

**How to avoid:** Query the database for all distinct categories. Build a mapping table that normalizes variants to visual groups (e.g., "plumbing", "plumbing contractor", "plumbing contractors", "plumbing and hvac contractors" all map to the "plumbing" image set). Generate images for each visual group (~50-60 groups). The mapping lives in code, not the database.

**Warning signs:** Many company cards showing the same generic fallback image despite having well-known categories.

### Pitfall 4: Google Places Photo URLs Require API Key in Query String

**What goes wrong:** You try to serve Google Places photo URLs directly to the frontend. The URL contains your API key as a query parameter (`?key=YOUR_KEY`), exposing it in the browser's network tab.

**Why it happens:** Place Photos API requires the API key in the URL: `https://places.googleapis.com/v1/places/PLACE_ID/photos/PHOTO_REF/media?maxWidthPx=400&key=API_KEY`. This URL redirects to the actual image.

**How to avoid:** Create a server-side photo proxy endpoint (`/api/places/photos/:placeId/:photoIndex`). The server calls Google's API with the key, follows the redirect, and streams the image to the client. The client never sees the API key. Add Cache-Control headers (max-age=3600) so the browser caches the image for the session.

**Warning signs:** API key visible in frontend network requests. Google Places API key has no HTTP referrer restrictions on server-side key.

### Pitfall 5: Imagen 3 Is Deprecated -- Use Imagen 4

**What goes wrong:** Following the earlier project research, you try to use Imagen 3 or `gemini-2.5-flash-image` for category images. Imagen 3 has been shut down. Gemini image models cost 2x more than Imagen 4 Fast.

**Why it happens:** The project-level research from 2026-03-11 referenced Imagen 3 ($0.03/image). Imagen 3 was shut down and replaced by Imagen 4. Gemini native image generation costs $0.039-0.15/image depending on model.

**How to avoid:** Use `imagen-4.0-fast-generate-001` at $0.02/image. For ~300 images (60 groups x 5 variations), total cost is ~$6.

**Warning signs:** API errors referencing deprecated model IDs. Higher-than-expected image generation costs.

## Code Examples

Verified patterns from official sources:

### Cloudflare R2 Client Setup
```typescript
// server/services/r2.ts
// Source: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;
// Public URL via custom domain (e.g., images.buildboard.com)
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

export function getPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}
```

### Drizzle Schema for Google Places Cache
```typescript
// Addition to server/schema.ts
// Source: Drizzle ORM docs + project conventions
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

// Cache place_id mapping (place_id can be cached indefinitely per Google TOS)
export const googlePlacesCache = sqliteTable('google_places_cache', {
  companyId: text('companyId').primaryKey().references(() => companies.id),
  placeId: text('placeId').notNull(),
  matchConfidence: real('matchConfidence'), // 0-1, how confident the match is
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  lastAccessedAt: integer('lastAccessedAt', { mode: 'timestamp' }).notNull(),
});

// Category image mappings (which R2 images exist for which categories)
export const categoryImages = sqliteTable('category_images', {
  id: text('id').primaryKey(),
  categorySlug: text('categorySlug').notNull(), // normalized slug
  variation: integer('variation').notNull(), // 1-5
  r2Key: text('r2Key').notNull(), // e.g., "categories/plumbing/1.webp"
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
});

// Category normalization map
export const categoryMap = sqliteTable('category_map', {
  rawCategory: text('rawCategory').primaryKey(), // exact DB category value
  normalizedSlug: text('normalizedSlug').notNull(), // maps to image folder
});
```

### Enrichment API Endpoint
```typescript
// server/routes/enrichment.ts
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { companies, googlePlacesCache } from '../schema.js';
import { findPlaceId, getPlaceDetails } from '../services/google-places.js';

const router = Router();

// GET /api/companies/:id/enrichment
// Lazy enrichment: fetch Google Places data on profile view
router.get('/companies/:id/enrichment', async (req, res, next) => {
  try {
    const companyId = req.params.id;

    // 1. Get company from DB
    const [company] = await db.select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) return res.status(404).json({ error: 'Not found' });

    // 2. Check place_id cache
    let [cached] = await db.select()
      .from(googlePlacesCache)
      .where(eq(googlePlacesCache.companyId, companyId))
      .limit(1);

    let placeId = cached?.placeId;

    // 3. If no cached place_id, do Text Search (Essentials ID Only)
    if (!placeId) {
      const result = await findPlaceId(
        company.businessName,
        company.city ?? '',
        company.state ?? ''
      );
      if (result) {
        placeId = result.placeId;
        // Cache place_id (allowed indefinitely per TOS)
        await db.insert(googlePlacesCache).values({
          companyId,
          placeId,
          matchConfidence: 0.8, // Can improve with address matching
          createdAt: new Date(),
          lastAccessedAt: new Date(),
        }).onConflictDoUpdate({
          target: googlePlacesCache.companyId,
          set: { placeId, lastAccessedAt: new Date() },
        });
      }
    } else {
      // Update last accessed timestamp
      await db.update(googlePlacesCache)
        .set({ lastAccessedAt: new Date() })
        .where(eq(googlePlacesCache.companyId, companyId));
    }

    // 4. If we have a place_id, fetch fresh details (TOS: no caching content)
    if (placeId) {
      const details = await getPlaceDetails(placeId);
      return res.json({
        enriched: true,
        placeId,
        photos: details.photos?.slice(0, 5) ?? [],
        reviews: details.reviews?.slice(0, 5) ?? [],
        rating: details.rating ?? null,
        userRatingCount: details.userRatingCount ?? null,
        regularOpeningHours: details.regularOpeningHours ?? null,
      });
    }

    // 5. No Google Places match found
    return res.json({ enriched: false, placeId: null });
  } catch (err) {
    next(err);
  }
});

export default router;
```

### Photo Proxy Endpoint (Hides API Key)
```typescript
// server/routes/images.ts
import { Router } from 'express';

const router = Router();

// GET /api/places/photo?name=places/xxx/photos/yyy&maxWidth=400
// Proxies Google Places photo to hide API key from client
router.get('/places/photo', async (req, res, next) => {
  try {
    const { name, maxWidth = '400' } = req.query as Record<string, string>;
    if (!name) return res.status(400).json({ error: 'name required' });

    const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidth}&key=${process.env.GOOGLE_PLACES_API_KEY}`;

    // Fetch with redirect follow
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) return res.status(response.status).json({ error: 'Photo fetch failed' });

    // Stream the image to client
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Browser cache 1hr
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Imagen 3 ($0.03/img) | Imagen 4 Fast ($0.02/img) | Early 2026 | Imagen 3 shut down. Imagen 4 is cheaper and better quality. |
| Google Places API Legacy | Google Places API New (v2) | March 2025 | New pricing tiers (Essentials/Pro/Enterprise). Field mask billing. Legacy being sunset. |
| `@google/generative-ai` | `@google/genai` | 2025 | Old package deprecated. New unified SDK for both Gemini and Imagen. |
| $200/month Google Maps credit | Per-SKU free tiers | March 2025 | No universal credit. Each SKU has its own free quota (1K-10K/month). |
| Cache everything with TTL | Cache place_id only | Ongoing | TOS stricter than commonly believed. Only place_id is cacheable. |

**Deprecated/outdated:**
- `@google/generative-ai`: Replaced by `@google/genai`. Do not use the old package.
- Imagen 3 (`imagen-3.0-generate-002`): Model shut down. Use Imagen 4 models.
- Google Places API Legacy endpoints: Being sunset. Use the New (v2) endpoints exclusively.

## Google Places API Pricing Summary

Critical pricing information for cost planning:

### Text Search (New)

| Tier | Triggered By | Price per 1K | Free/Month |
|------|-------------|-------------|------------|
| Essentials ID Only | `places.id`, `places.name` | $10.00 | 10,000 |
| Pro | `places.displayName`, `places.formattedAddress`, `places.photos` | $32.00 | 5,000 |
| Enterprise | `places.rating`, `places.regularOpeningHours`, `places.websiteUri` | $35.00 | 1,000 |
| Enterprise + Atmosphere | `places.reviews`, `places.editorialSummary` | $35.00 | 1,000 |

### Place Details (New)

| Tier | Triggered By | Price per 1K | Free/Month |
|------|-------------|-------------|------------|
| Essentials | `formattedAddress`, `location`, `types` | $5.00 | 10,000 |
| Pro | `displayName`, `googleMapsUri`, `businessStatus` | $17.00 | 5,000 |
| Enterprise | `regularOpeningHours`, `rating`, `userRatingCount`, `websiteUri` | $20.00 | 1,000 |
| Enterprise + Atmosphere | `reviews`, `reviewSummary`, `editorialSummary` | $20.00 | 1,000 |

### Place Photos

| SKU | Price per 1K | Free/Month |
|-----|-------------|------------|
| Place Details Photos | $7.00 | 1,000 |

### Cost Per Profile View (Estimated)

| Scenario | API Calls | Cost |
|----------|-----------|------|
| First visit (no cached place_id) | Text Search Essentials ID Only + Place Details Enterprise + 1 Photo | $0.010 + $0.020 + $0.007 = ~$0.037 |
| Repeat visit (cached place_id) | Place Details Enterprise + 1 Photo | $0.020 + $0.007 = ~$0.027 |
| Photo-only view (card image) | 1 Photo fetch | $0.007 |

### Monthly Budget Estimates

| Daily Unique Profile Views | Monthly Cost (approx.) |
|---------------------------|----------------------|
| 100 | $50-80 |
| 500 | $250-400 |
| 1,000 | $500-800 |
| 5,000 | $2,500-4,000 |

### Free Tier Coverage

Per-SKU free quotas reset monthly:
- Text Search Essentials ID Only: 10,000 free (covers ~10K first-time profile views)
- Place Details Enterprise: 1,000 free (covers ~1K profile views)
- Place Photos: 1,000 free (covers ~1K photo fetches)

For a new directory with low traffic, the free tiers cover the initial launch period.

## Cloudflare R2 Setup Guide

### Requirements
1. Cloudflare account (free)
2. Custom domain added to Cloudflare DNS (for CDN-backed serving)

### Setup Steps
1. **Create R2 bucket:** Cloudflare dashboard > R2 > Create Bucket > Name: `buildboard-images`
2. **Create API token:** R2 > Manage R2 API Tokens > Create API Token > Permissions: Object Read & Write
3. **Note credentials:** Account ID, Access Key ID, Secret Access Key
4. **Enable public access:** Bucket Settings > Public Access > Connect Domain > `images.buildboard.com`
5. **Configure CORS:** Bucket Settings > CORS Policy > Allow your domain origins

### Environment Variables
```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=buildboard-images
R2_PUBLIC_URL=https://images.buildboard.com
GOOGLE_PLACES_API_KEY=your_google_places_api_key
GEMINI_API_KEY=your_gemini_api_key
```

### R2 Pricing (for reference)
- Storage: $0.015/GB/month (10GB free)
- Class A operations (writes): $4.50/million (1M free)
- Class B operations (reads): $0.36/million (10M free)
- Egress: **FREE** (the killer feature)

For ~300 images at ~50KB each = ~15MB total storage. Negligible cost.

## Category Normalization Strategy

The database has 134 case-normalized categories (163 raw). These must be mapped to ~50-60 visual image groups.

### Normalization Rules
1. **Case normalize:** "Plumbing" = "plumbing"
2. **Suffix merge:** "Plumbing Contractor" = "Plumbing Contractors" = "Plumbing" -> `plumbing`
3. **Compound merge:** "Plumbing and HVAC Contractors" -> `plumbing` (primary image set)
4. **Subtype to parent:** "Kitchen remodeling contractors" -> `residential-remodelers`
5. **Activity to trade:** "Foundation repair" -> `foundation`

### Implementation
A static `categoryMap` object in code (not database) that maps raw category strings to image slugs:

```typescript
export const CATEGORY_TO_IMAGE_SLUG: Record<string, string> = {
  'Plumbing': 'plumbing',
  'Plumbing Contractor': 'plumbing',
  'Plumbing Contractors': 'plumbing',
  'Plumbing and HVAC Contractors': 'plumbing',
  'Foundation': 'foundation',
  'Foundation Contractors': 'foundation',
  'Foundation repair': 'foundation',
  'Other Foundation': 'foundation',
  'Electrical Contractors': 'electrical',
  'Electrical Contractor': 'electrical',
  // ... all 163 raw categories mapped
};
```

## Services Display Strategy (DATA-04)

Services are already stored as JSON arrays in 97% of records (3.33M of 3.44M). The `parseRow` helper already parses them. Current profile page displays them as flat tag chips.

### Current State
- Data format: `["Design-Build", "Code Compliance", "Preventive Maintenance"]`
- Average 5-8 services per company
- Services are generic labels, not category-specific

### Improvement for DATA-04
The current flat-chip display is adequate but could be improved:
1. **Group by type:** Separate "core services" from "features" (e.g., "Free Estimates", "Emergency Services", "24/7 Service" are features, not trade services)
2. **Visual hierarchy:** Larger/bolder chips for primary trade services, smaller for supplementary
3. **Icon mapping:** Map common services to lucide-react icons for visual scanning

No schema change needed -- this is a frontend display improvement.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently installed |
| Config file | None -- Wave 0 setup needed |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMG-01 | Category images generated for all groups | manual-only | Visual inspection of R2 bucket contents | N/A |
| IMG-02 | Images stored in R2, served via CDN | integration | `curl -s -o /dev/null -w "%{http_code}" https://images.buildboard.com/categories/plumbing/1.webp` | N/A |
| IMG-03 | Google Places photos fetched on-demand | integration | Test `/api/companies/:id/enrichment` endpoint returns photos | N/A |
| IMG-04 | Place_id cached, no repeated Text Search calls | unit | Verify cache hit skips Text Search, cache miss calls it | N/A |
| IMG-05 | Fallback chain works (Google -> R2 -> default) | unit | Mock different scenarios, verify correct image URL returned | N/A |
| DATA-01 | Reviews returned from enrichment endpoint | integration | Test `/api/companies/:id/enrichment` returns reviews array | N/A |
| DATA-02 | Hours returned from enrichment endpoint | integration | Test enrichment returns regularOpeningHours | N/A |
| DATA-03 | Place_id cached indefinitely, content fetched fresh | unit | Verify place_id persists, content not stored | N/A |
| DATA-04 | Services displayed in profile | manual-only | Visual inspection of company profile page | N/A |

### Wave 0 Gaps
- [ ] Install test framework (vitest recommended -- works with Vite, TypeScript-first)
- [ ] `vitest.config.ts` -- test configuration
- [ ] `server/__tests__/google-places.test.ts` -- mock Google Places API responses
- [ ] `server/__tests__/enrichment.test.ts` -- test enrichment endpoint logic
- [ ] `server/__tests__/r2.test.ts` -- test R2 upload/URL generation

## Open Questions

1. **Google Places match accuracy**
   - What we know: Text Search with "businessName city state" returns results, but may not match the correct business (common names, chains).
   - What's unclear: Match accuracy rate across 3.4M records. Some businesses may not exist on Google Places.
   - Recommendation: Add a `matchConfidence` field. Consider address-based verification (compare returned address with database address). Log mismatches for manual review.

2. **Category image quality with Imagen 4 Fast**
   - What we know: Imagen 4 Fast is the cheapest ($0.02/image) and designed for speed.
   - What's unclear: Whether "fast" quality is sufficient for hero-quality construction images.
   - Recommendation: Generate a small test batch (5 images) with both Imagen 4 Fast and Imagen 4 Standard ($0.04/image) to compare quality before committing to full batch.

3. **TOS enforcement strictness for practical caching**
   - What we know: TOS says "must not pre-fetch, cache, or store" content except place_id. This is strict.
   - What's unclear: Whether Google actively enforces against caching reviews/hours with short TTLs (30 days). Many production apps appear to cache Google Places data.
   - Recommendation: Follow TOS strictly. Cache only place_id. The cost difference is manageable for a directory with moderate traffic. Do not risk API key suspension.

4. **Custom domain for R2 requires Cloudflare DNS**
   - What we know: R2 custom domains require the domain to be added to Cloudflare as a zone (i.e., Cloudflare manages DNS).
   - What's unclear: Whether the project's domain is currently on Cloudflare.
   - Recommendation: If domain is not on Cloudflare, use the `r2.dev` managed subdomain for development and plan domain migration. Alternatively, use Cloudflare for a subdomain only.

## Sources

### Primary (HIGH confidence)
- [Google Places API Pricing](https://developers.google.com/maps/billing-and-pricing/pricing) - Exact per-SKU pricing, free tier quotas
- [Place Data Fields (New)](https://developers.google.com/maps/documentation/places/web-service/data-fields) - Field-to-tier mapping
- [Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details) - API endpoint, headers, field masks
- [Place Photos (New)](https://developers.google.com/maps/documentation/places/web-service/place-photos) - Photo name format, caching restrictions
- [Places API Policies](https://developers.google.com/maps/documentation/places/web-service/policies) - Caching restrictions, attribution requirements
- [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) - Business matching endpoint
- [Cloudflare R2 AWS SDK v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) - S3Client configuration for R2
- [Cloudflare R2 Public Buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) - Custom domain setup
- [Gemini API Image Generation](https://ai.google.dev/gemini-api/docs/image-generation) - Model IDs, config options
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) - Per-image costs for all models
- [Imagen API](https://ai.google.dev/gemini-api/docs/imagen) - Imagen 4 models, Imagen 3 deprecated

### Secondary (MEDIUM confidence)
- [Gemini Image Generation Free Limits 2026](https://blog.laozhang.ai/en/posts/gemini-image-generation-free-limit-2026) - Free tier details, model comparisons
- [@google/genai npm](https://www.npmjs.com/package/@google/genai) - SDK usage patterns
- [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) - Service-specific caching terms

### Tertiary (LOW confidence)
- None -- all findings verified with official sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified against official docs and npm
- Architecture (lazy enrichment): HIGH - Pricing and TOS verified against Google official docs
- Architecture (R2 setup): HIGH - Verified against Cloudflare official docs
- Pitfalls (TOS caching): HIGH - Verified against Google Places API policies
- Pitfalls (pricing tiers): HIGH - Verified against Google pricing page
- Image generation (Imagen 4): HIGH - Verified against Gemini API docs and pricing page
- Category count (134 not 50): HIGH - Verified by direct database query

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (30 days -- Google pricing and model availability may change)
