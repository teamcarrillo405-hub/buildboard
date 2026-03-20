/**
 * Google Places API (New) client.
 *
 * Two-tier request strategy:
 *   1. Text Search (Essentials ID Only) -- find place_id ($10/1K)
 *   2. Place Details (Enterprise) -- fetch photos, reviews, hours ($20/1K)
 *
 * Both functions gracefully degrade when GOOGLE_PLACES_API_KEY is missing:
 * they log a warning and return null/empty results so the server can run
 * without the key during local development.
 */

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface PlaceSearchResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
}

export interface PlacePhoto {
  name: string; // e.g., "places/xxx/photos/yyy"
  widthPx: number;
  heightPx: number;
  authorAttributions: Array<{ displayName: string; uri: string }>;
}

export interface PlaceReview {
  authorAttribution: { displayName: string; uri: string; photoUri: string };
  rating: number;
  text: { text: string; languageCode: string };
  relativePublishTimeDescription: string;
  publishTime: string;
}

export interface PlaceOpeningHours {
  openNow?: boolean;
  weekdayDescriptions: string[];
}

export interface PlaceDetailsResult {
  photos: PlacePhoto[];
  reviews: PlaceReview[];
  rating: number | null;
  userRatingCount: number | null;
  regularOpeningHours: PlaceOpeningHours | null;
  websiteUri: string | null;
  nationalPhoneNumber: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.warn(
      '[google-places] GOOGLE_PLACES_API_KEY is not set. ' +
        'Google Places enrichment is disabled. Set the key in your .env file ' +
        'to enable photo, review, and hours data.',
    );
    return null;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Text Search (Essentials ID Only) -- $10/1K requests
// ---------------------------------------------------------------------------

/**
 * Find a Google place_id for a business using Text Search (New).
 *
 * Uses ONLY Essentials ID Only fields (places.id, places.displayName,
 * places.formattedAddress) to stay in the cheapest billing tier.
 * DO NOT add places.photos, places.rating, or places.reviews -- those
 * promote the request to Enterprise billing ($35/1K).
 */
export async function findPlaceId(
  businessName: string,
  city: string,
  state: string,
): Promise<PlaceSearchResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const textQuery = [businessName, city, state].filter(Boolean).join(' ');

  try {
    const response = await fetch(`${PLACES_API_BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({
        textQuery,
        pageSize: 1,
      }),
    });

    if (!response.ok) {
      console.error(
        `[google-places] Text Search failed: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();
    if (!data.places?.length) return null;

    const place = data.places[0];
    return {
      placeId: place.id,
      displayName: place.displayName?.text ?? '',
      formattedAddress: place.formattedAddress ?? '',
    };
  } catch (err) {
    console.error('[google-places] Text Search error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Place Details (Enterprise) -- $20/1K requests
// ---------------------------------------------------------------------------

/**
 * Fetch detailed place data (photos, reviews, hours) using Place Details (New).
 *
 * This is Enterprise + Atmosphere tier ($20/1K) because it includes `reviews`.
 * Content returned here MUST NOT be cached in the database per Google TOS.
 * Only place_id may be cached indefinitely.
 */
export async function getPlaceDetails(
  placeId: string,
): Promise<PlaceDetailsResult> {
  const empty: PlaceDetailsResult = {
    photos: [],
    reviews: [],
    rating: null,
    userRatingCount: null,
    regularOpeningHours: null,
    websiteUri: null,
    nationalPhoneNumber: null,
  };

  const apiKey = getApiKey();
  if (!apiKey) return empty;

  try {
    const fieldMask = [
      'photos',
      'reviews',
      'rating',
      'userRatingCount',
      'regularOpeningHours',
      'websiteUri',
      'nationalPhoneNumber',
    ].join(',');

    const response = await fetch(`${PLACES_API_BASE}/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
    });

    if (!response.ok) {
      console.error(
        `[google-places] Place Details failed: ${response.status} ${response.statusText}`,
      );
      return empty;
    }

    const data = await response.json();

    return {
      photos: (data.photos ?? []).map((p: Record<string, unknown>) => ({
        name: p.name ?? '',
        widthPx: p.widthPx ?? 0,
        heightPx: p.heightPx ?? 0,
        authorAttributions: (p.authorAttributions as Array<Record<string, string>> ?? []).map(
          (a) => ({ displayName: a.displayName ?? '', uri: a.uri ?? '' }),
        ),
      })),
      reviews: (data.reviews ?? []).map((r: Record<string, unknown>) => ({
        authorAttribution: {
          displayName: (r.authorAttribution as Record<string, string>)?.displayName ?? '',
          uri: (r.authorAttribution as Record<string, string>)?.uri ?? '',
          photoUri: (r.authorAttribution as Record<string, string>)?.photoUri ?? '',
        },
        rating: (r.rating as number) ?? 0,
        text: {
          text: (r.text as Record<string, string>)?.text ?? '',
          languageCode: (r.text as Record<string, string>)?.languageCode ?? '',
        },
        relativePublishTimeDescription: (r.relativePublishTimeDescription as string) ?? '',
        publishTime: (r.publishTime as string) ?? '',
      })),
      rating: (data.rating as number) ?? null,
      userRatingCount: (data.userRatingCount as number) ?? null,
      regularOpeningHours: data.regularOpeningHours
        ? {
            openNow: data.regularOpeningHours.openNow,
            weekdayDescriptions: data.regularOpeningHours.weekdayDescriptions ?? [],
          }
        : null,
      websiteUri: (data.websiteUri as string) ?? null,
      nationalPhoneNumber: (data.nationalPhoneNumber as string) ?? null,
    };
  } catch (err) {
    console.error('[google-places] Place Details error:', err);
    return empty;
  }
}
