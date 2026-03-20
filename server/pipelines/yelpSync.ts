/**
 * Yelp Fusion API ingestion pipeline for BuildBoard.
 *
 * Sweeps all CA metro areas × contractor categories against the Yelp API,
 * upserts results into the companies table keyed on yelpId.
 *
 * Rate limiting: 500ms between requests (~2 req/sec, well under the 5/sec limit).
 * Daily limit: 5,000 requests. A full CA sweep (15 metros × 28 categories × ~20 pages)
 * will use ~8,400 requests and will require spreading across 2 days.
 *
 * Usage: called via POST /api/admin/sync-yelp (see routes/admin.ts).
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { sqlite } from '../db.js';
import { mapYelpCategories, CA_METROS, CATEGORY_SWEEP } from '../data/yelpCategoryMap.js';

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

export interface YelpBusiness {
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
  price?: string;           // "$" | "$$" | "$$$" | "$$$$"
  is_closed: boolean;
}

interface YelpSearchResponse {
  businesses: YelpBusiness[];
  total: number;
}

export interface SyncStats {
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'complete' | 'error';
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Global sync state (in-process, resets on server restart)
// ---------------------------------------------------------------------------

let currentSync: SyncStats | null = null;

export function getSyncStatus(): SyncStats | null {
  return currentSync;
}

// ---------------------------------------------------------------------------
// Yelp API helpers
// ---------------------------------------------------------------------------

const YELP_API_BASE = 'https://api.yelp.com/v3';
const RATE_LIMIT_MS = 500; // 500ms between requests = 2 req/sec max

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch one page (up to 50 results) from the Yelp businesses/search endpoint.
 */
async function fetchYelpPage(
  location: string,
  category: string,
  apiKey: string,
  offset: number,
): Promise<YelpSearchResponse> {
  const params = new URLSearchParams({
    location,
    categories: category,
    limit: '50',
    offset: String(offset),
    sort_by: 'rating',
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

  return resp.json() as Promise<YelpSearchResponse>;
}

/**
 * Fetch all available businesses for a given location + category combination.
 * Yelp enforces offset + limit <= 240 (free tier hard cap), so max 240 results per query.
 */
async function fetchYelpBusinesses(
  location: string,
  category: string,
  apiKey: string,
): Promise<YelpBusiness[]> {
  const businesses: YelpBusiness[] = [];
  // Yelp free tier: offset + limit must be <= 240
  const YELP_LIMIT = 50;
  const MAX_OFFSET = 190; // 190 + 50 = 240, the actual hard cap

  // First page to get total count
  const first = await fetchYelpPage(location, category, apiKey, 0);
  businesses.push(...first.businesses);

  const total = Math.min(first.total, 240); // Cap at Yelp's actual hard limit

  // Fetch remaining pages within the 240-result window
  for (let offset = YELP_LIMIT; offset < total && offset <= MAX_OFFSET; offset += YELP_LIMIT) {
    await sleep(RATE_LIMIT_MS);
    const page = await fetchYelpPage(location, category, apiKey, offset);
    businesses.push(...page.businesses);
    if (page.businesses.length === 0) break; // No more results
  }

  return businesses;
}

// ---------------------------------------------------------------------------
// Database upsert
// ---------------------------------------------------------------------------

// Lazy-initialized prepared statements (deferred so column migrations run first)
let _insertStmt: ReturnType<typeof sqlite.prepare> | null = null;
let _updateStmt: ReturnType<typeof sqlite.prepare> | null = null;
let _lookupStmt: ReturnType<typeof sqlite.prepare> | null = null;

function getInsertStmt() {
  if (!_insertStmt) {
    _insertStmt = sqlite.prepare(`
      INSERT OR IGNORE INTO companies (
        id, businessName, category, subCategory, city, state, zipCode, address,
        phone, website, yelpId, yelpUrl, imageUrl, latitude, longitude,
        rating, reviewCount, priceRange, dataSource, lastUpdated
      ) VALUES (
        @id, @businessName, @category, @subCategory, @city, @state, @zipCode, @address,
        @phone, @website, @yelpId, @yelpUrl, @imageUrl, @latitude, @longitude,
        @rating, @reviewCount, @priceRange, 'yelp', @lastUpdated
      )
    `);
  }
  return _insertStmt;
}

function getUpdateStmt() {
  if (!_updateStmt) {
    // Only update Yelp-enrichment fields — never overwrite real contact / address data
    _updateStmt = sqlite.prepare(`
      UPDATE companies SET
        imageUrl    = @imageUrl,
        latitude    = @latitude,
        longitude   = @longitude,
        yelpUrl     = @yelpUrl,
        rating      = @rating,
        reviewCount = @reviewCount,
        priceRange  = @priceRange,
        subCategory = COALESCE(@subCategory, subCategory),
        dataSource  = 'yelp',
        lastUpdated = @lastUpdated
      WHERE yelpId = @yelpId
    `);
  }
  return _updateStmt;
}

function getLookupStmt() {
  if (!_lookupStmt) {
    _lookupStmt = sqlite.prepare('SELECT id FROM companies WHERE yelpId = ?');
  }
  return _lookupStmt;
}

/**
 * Upsert a single Yelp business into the companies table.
 * INSERT OR IGNORE for new records; targeted UPDATE for re-synced records.
 * Never overwrites businessName, phone, address, city, state, zipCode, website.
 */
function upsertYelpBusiness(biz: YelpBusiness): 'inserted' | 'updated' {
  const { category, subCategory } = mapYelpCategories(biz.categories);
  const now = new Date().toISOString();

  const params = {
    id: `yelp-${biz.id}`,
    businessName: biz.name.trim(),
    category,
    subCategory,
    city: biz.location.city ?? '',
    state: biz.location.state ?? '',
    zipCode: biz.location.zip_code ?? '',
    address: biz.location.address1 ?? '',
    phone: biz.display_phone || biz.phone || '',
    website: biz.url,
    yelpId: biz.id,
    yelpUrl: biz.url,
    imageUrl: biz.image_url ?? null,
    latitude: biz.coordinates.latitude ?? null,
    longitude: biz.coordinates.longitude ?? null,
    rating: biz.rating,
    reviewCount: biz.review_count,
    priceRange: biz.price ?? null,
    lastUpdated: now,
  };

  const insertResult = getInsertStmt().run(params);
  if (insertResult.changes > 0) {
    return 'inserted';
  }

  // Record already exists — update Yelp fields only
  getUpdateStmt().run(params);
  return 'updated';
}

// ---------------------------------------------------------------------------
// Main sync orchestrator
// ---------------------------------------------------------------------------

/**
 * Run a full Yelp sync: sweep all CA metros × all contractor categories.
 *
 * Runs asynchronously in the background. Progress is tracked in `currentSync`
 * and readable via getSyncStatus().
 *
 * @param metros - Location strings to sweep (defaults to CA_METROS)
 * @param categories - Yelp aliases to sweep (defaults to CATEGORY_SWEEP)
 */
export async function runYelpSync(
  apiKey: string,
  metros: string[] = CA_METROS,
  categories: string[] = CATEGORY_SWEEP,
): Promise<void> {
  if (currentSync?.status === 'running') {
    throw new Error('Sync already in progress');
  }

  currentSync = {
    processed: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  const total = metros.length * categories.length;
  let completed = 0;

  console.log(`[yelpSync] Starting sync: ${metros.length} metros × ${categories.length} categories = ${total} queries`);

  try {
    for (const metro of metros) {
      for (const category of categories) {
        try {
          await sleep(RATE_LIMIT_MS);
          const businesses = await fetchYelpBusinesses(metro, category, apiKey);

          // Batch upsert using a transaction for speed
          const upsertBatch = sqlite.transaction((bizList: YelpBusiness[]) => {
            for (const biz of bizList) {
              try {
                const result = upsertYelpBusiness(biz);
                currentSync!.processed++;
                if (result === 'inserted') currentSync!.inserted++;
                else currentSync!.updated++;
              } catch (err) {
                if (currentSync!.errors === 0) {
                  // Log first error for diagnostics
                  console.error('[yelpSync] First upsert error:', err);
                }
                currentSync!.errors++;
              }
            }
          });
          upsertBatch(businesses);

          completed++;
          if (completed % 10 === 0) {
            console.log(`[yelpSync] ${completed}/${total} queries done — ${currentSync.inserted} inserted, ${currentSync.updated} updated`);
          }
        } catch (err) {
          currentSync.errors++;
          currentSync.lastError = String(err);
          console.error(`[yelpSync] Error for ${metro} / ${category}:`, err);
        }
      }
    }

    currentSync.status = 'complete';
    currentSync.finishedAt = new Date().toISOString();
    console.log(`[yelpSync] Sync complete: ${currentSync.inserted} inserted, ${currentSync.updated} updated, ${currentSync.errors} errors`);
  } catch (err) {
    currentSync.status = 'error';
    currentSync.lastError = String(err);
    currentSync.finishedAt = new Date().toISOString();
    console.error('[yelpSync] Fatal sync error:', err);
  }
}
