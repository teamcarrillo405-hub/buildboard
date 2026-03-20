/**
 * Yelp match-and-enrich pipeline for BuildBoard.
 *
 * Finds existing companies with no yelpId, searches Yelp by name + location,
 * and if a confident match is found, enriches ONLY Yelp-specific fields
 * (yelpId, imageUrl, latitude, longitude, yelpUrl, priceRange, rating,
 * reviewCount) on the EXISTING record. Never creates duplicates, never
 * overwrites real contact data (phone, address, etc.).
 *
 * Rate limiting: 600ms between requests (~1.6 req/sec).
 *
 * Usage: called via POST /api/admin/enrich-yelp (see routes/admin.ts).
 */

import { sqlite } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YelpCategory {
  alias: string;
  title: string;
}

interface YelpCoordinates {
  latitude: number | null;
  longitude: number | null;
}

interface YelpLocation {
  address1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
}

interface YelpBusiness {
  id: string;
  alias: string;
  name: string;
  image_url: string | null;
  url: string;
  phone: string;
  display_phone: string;
  categories: YelpCategory[];
  coordinates: YelpCoordinates;
  location: YelpLocation;
  rating: number;
  review_count: number;
  price?: string;
  is_closed: boolean;
}

interface YelpSearchResponse {
  businesses: YelpBusiness[];
  total: number;
}

export interface EnrichStats {
  total: number;
  matched: number;
  skipped: number;
  errors: number;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'complete' | 'error';
  lastError?: string;
}

interface CompanyRow {
  id: string;
  businessName: string;
  city: string;
  state: string;
  zipCode: string;
}

// ---------------------------------------------------------------------------
// Module-level state (in-process, resets on server restart)
// ---------------------------------------------------------------------------

let enrichStats: EnrichStats | null = null;

export function getEnrichStatus(): EnrichStats | null {
  return enrichStats;
}

// ---------------------------------------------------------------------------
// Yelp API helpers
// ---------------------------------------------------------------------------

const YELP_API_BASE = 'https://api.yelp.com/v3';
const RATE_LIMIT_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Token overlap ratio for name similarity scoring.
 * Returns 0–1 where 1 is an exact token match.
 */
function nameSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const tokensA = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalize(b).split(/\s+/).filter(Boolean));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Search Yelp for a matching business given company name + city/state.
 * Returns the best match if confidence >= 0.6, otherwise null.
 */
async function searchYelpForCompany(
  company: CompanyRow,
  apiKey: string,
): Promise<YelpBusiness | null> {
  // Build location string: prefer "City, State" but fall back to zipCode alone
  const location = [company.city, company.state].filter(Boolean).join(', ') || company.zipCode;
  if (!location) return null;

  const params = new URLSearchParams({
    term: company.businessName,
    location,
    limit: '5',
  });

  const resp = await fetch(`${YELP_API_BASE}/businesses/search?${params}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Yelp API ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as YelpSearchResponse;
  if (!data.businesses || data.businesses.length === 0) return null;

  // Score each result by name similarity + location validation
  let bestMatch: YelpBusiness | null = null;
  let bestScore = 0;

  for (const biz of data.businesses) {
    const score = nameSimilarity(company.businessName, biz.name);
    if (score < 0.6) continue;

    // Validate location: zip match or city match
    const zipMatch = company.zipCode && biz.location.zip_code
      ? company.zipCode === biz.location.zip_code
      : false;
    const cityMatch = company.city && biz.location.city
      ? company.city.toLowerCase() === biz.location.city.toLowerCase()
      : false;

    if (!zipMatch && !cityMatch) continue;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = biz;
    }
  }

  return bestMatch;
}

/**
 * Update enrichment fields on an existing company record.
 * NEVER touches businessName, phone, address, city, state, zipCode, email, website.
 */
function applyYelpEnrichment(companyId: string, biz: YelpBusiness): void {
  const subCategory = biz.categories.length > 0 ? biz.categories[0].title : null;

  sqlite.prepare(`
    UPDATE companies SET
      yelpId       = ?,
      yelpUrl      = ?,
      imageUrl     = ?,
      latitude     = ?,
      longitude    = ?,
      rating       = ?,
      reviewCount  = ?,
      priceRange   = ?,
      subCategory  = COALESCE(?, subCategory),
      dataSource   = 'yelp',
      lastUpdated  = ?
    WHERE id = ?
  `).run(
    biz.id,
    biz.url,
    biz.image_url ?? null,
    biz.coordinates.latitude ?? null,
    biz.coordinates.longitude ?? null,
    biz.rating,
    biz.review_count,
    biz.price ?? null,
    subCategory,
    new Date().toISOString(),
    companyId,
  );
}

// ---------------------------------------------------------------------------
// Main enrich orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the Yelp match-and-enrich pipeline for all companies without a yelpId.
 *
 * Runs asynchronously in the background. Progress is tracked in `enrichStats`
 * and readable via getEnrichStatus().
 */
export async function runYelpEnrich(
  apiKey: string,
  _options?: { batchSize?: number },
): Promise<EnrichStats> {
  if (enrichStats?.status === 'running') {
    throw new Error('Enrich already in progress');
  }

  const batchSize = _options?.batchSize ?? 50;

  enrichStats = {
    total: 0,
    matched: 0,
    skipped: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  try {
    // Get all companies without a yelpId
    const companies = sqlite.prepare(
      'SELECT id, businessName, city, state, zipCode FROM companies WHERE yelpId IS NULL',
    ).all() as CompanyRow[];

    enrichStats.total = companies.length;
    console.log(`[yelpEnrich] Starting enrich for ${companies.length} companies without yelpId`);

    // Process in chunks
    for (let i = 0; i < companies.length; i += batchSize) {
      const chunk = companies.slice(i, i + batchSize);

      for (const company of chunk) {
        try {
          await sleep(RATE_LIMIT_MS);
          const match = await searchYelpForCompany(company, apiKey);

          if (match) {
            // Guard: skip if this yelpId is already assigned to another company
            const taken = sqlite.prepare(
              'SELECT id FROM companies WHERE yelpId = ? AND id != ?'
            ).get(match.id, company.id) as { id: string } | undefined;

            if (taken) {
              enrichStats.skipped++;
            } else {
              applyYelpEnrichment(company.id, match);
              enrichStats.matched++;
            }
          } else {
            enrichStats.skipped++;
          }
        } catch (err) {
          enrichStats.errors++;
          enrichStats.lastError = String(err);
          console.error(`[yelpEnrich] Error enriching ${company.id} (${company.businessName}):`, err);
        }
      }

      const processed = enrichStats.matched + enrichStats.skipped + enrichStats.errors;
      console.log(
        `[yelpEnrich] Progress: ${processed}/${enrichStats.total} — ` +
        `${enrichStats.matched} matched, ${enrichStats.skipped} skipped, ${enrichStats.errors} errors`,
      );
    }

    enrichStats.status = 'complete';
    enrichStats.finishedAt = new Date().toISOString();
    console.log(
      `[yelpEnrich] Complete: ${enrichStats.matched} matched, ` +
      `${enrichStats.skipped} skipped, ${enrichStats.errors} errors`,
    );
  } catch (err) {
    enrichStats.status = 'error';
    enrichStats.lastError = String(err);
    enrichStats.finishedAt = new Date().toISOString();
    console.error('[yelpEnrich] Fatal error:', err);
  }

  return enrichStats;
}
