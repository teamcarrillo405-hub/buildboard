import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { companies, googlePlacesCache } from '../schema.js';
import { findPlaceId, getPlaceDetails } from '../services/google-places.js';

const router = Router();

// GET /api/companies/:id/enrichment
// Lazy enrichment: fetch Google Places data on profile view.
// - First visit: Text Search (Essentials ID Only) to find place_id, then Place Details
// - Repeat visit: Skip Text Search (cached place_id), go straight to Place Details
// - Content (photos, reviews, hours) is NEVER cached (Google TOS compliance)
router.get('/companies/:id/enrichment', async (req, res, next) => {
  try {
    const companyId = req.params.id;

    // 1. Get company from DB
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // 2. Check place_id cache
    const [cached] = await db
      .select()
      .from(googlePlacesCache)
      .where(eq(googlePlacesCache.companyId, companyId))
      .limit(1);

    let placeId = cached?.placeId ?? null;

    // 3. Cache miss -- do Text Search (Essentials ID Only, $10/1K)
    if (!placeId) {
      const result = await findPlaceId(
        company.businessName,
        company.city ?? '',
        company.state ?? '',
      );

      if (result) {
        placeId = result.placeId;
        // Cache place_id (allowed indefinitely per Google TOS)
        await db
          .insert(googlePlacesCache)
          .values({
            companyId,
            placeId,
            matchConfidence: 0.8,
            createdAt: new Date(),
            lastAccessedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: googlePlacesCache.companyId,
            set: { placeId, lastAccessedAt: new Date() },
          });
      }
    } else {
      // 4. Cache hit -- update lastAccessedAt timestamp
      await db
        .update(googlePlacesCache)
        .set({ lastAccessedAt: new Date() })
        .where(eq(googlePlacesCache.companyId, companyId));
    }

    // 5. If we have a place_id, fetch fresh details (TOS: no caching content)
    if (placeId) {
      const details = await getPlaceDetails(placeId);
      return res.json({
        enriched: true,
        placeId,
        photos: details.photos.slice(0, 5),
        reviews: details.reviews.slice(0, 5),
        rating: details.rating,
        userRatingCount: details.userRatingCount,
        regularOpeningHours: details.regularOpeningHours,
        websiteUri: details.websiteUri,
        nationalPhoneNumber: details.nationalPhoneNumber,
      });
    }

    // 6. No Google Places match found (or API key missing)
    return res.json({ enriched: false, placeId: null });
  } catch (err) {
    next(err);
  }
});

export default router;
