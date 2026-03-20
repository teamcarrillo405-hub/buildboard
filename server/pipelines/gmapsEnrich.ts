/**
 * Google Maps (Apify) enrichment pipeline for BuildBoard/ConstructFlix.
 *
 * Takes Google Maps scraper results (from Apify lukaskrivka/google-maps-with-contact-details)
 * and matches them against existing DB records to fill in missing phone, website, and email.
 *
 * Matching strategy:
 *   1. Normalize business names (strip legal suffixes, punctuation, lowercase)
 *   2. Match by normalized name + (zipCode OR city+state)
 *   3. Only update fields that are currently empty — never overwrite existing data
 *
 * Usage:
 *   npx tsx server/scripts/gmapsImport.ts <json-file-or-directory>
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmapsPlace {
  title: string;
  phone?: string | null;
  phoneUnformatted?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  location?: { lat: number; lng: number } | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
  categoryName?: string | null;
  categories?: string[];
  placeId?: string | null;
  emails?: string[];
  phones?: string[];
  phonesUncertain?: string[];
  linkedIns?: string[];
  instagrams?: string[];
  facebooks?: string[];
  imageUrl?: string | null;
  openingHours?: { day: string; hours: string }[];
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
}

export interface GmapsEnrichStats {
  totalPlaces: number;
  matched: number;
  updatedPhone: number;
  updatedWebsite: number;
  updatedEmail: number;
  updatedLatLng: number;
  skippedClosed: number;
  skippedNoMatch: number;
  skippedOutsideUS: number;
  duplicateNames: number;
  errors: number;
  startedAt: string;
  finishedAt?: string;
}

// ---------------------------------------------------------------------------
// Name normalization (reuses project pattern from stateLicenseSync)
// ---------------------------------------------------------------------------

const LEGAL_SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc|pc|pa|dba|d\/b\/a)\b\.?/gi;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCity(city: string): string {
  return city.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '').replace(/^1(\d{10})$/, '$1');
}

// ---------------------------------------------------------------------------
// Token-based name similarity (Jaccard index)
// ---------------------------------------------------------------------------

function nameSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// State abbreviation mapping
// ---------------------------------------------------------------------------

const STATE_ABBREV: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

function toStateCode(state: string): string {
  if (!state) return '';
  const upper = state.trim().toUpperCase();
  if (upper.length === 2) return upper;
  return STATE_ABBREV[state.trim().toLowerCase()] || upper;
}

// ---------------------------------------------------------------------------
// Core enrichment logic
// ---------------------------------------------------------------------------

export function runGmapsEnrich(
  dbPath: string,
  places: GmapsPlace[],
  options?: { dryRun?: boolean },
): GmapsEnrichStats {
  const stats: GmapsEnrichStats = {
    totalPlaces: places.length,
    matched: 0,
    updatedPhone: 0,
    updatedWebsite: 0,
    updatedEmail: 0,
    updatedLatLng: 0,
    skippedClosed: 0,
    skippedNoMatch: 0,
    skippedOutsideUS: 0,
    duplicateNames: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
  };

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Prepared statements
  const findByNameZip = db.prepare(`
    SELECT id, businessName, phone, website, email, latitude, longitude
    FROM companies
    WHERE zipCode = ? AND id IN (
      SELECT id FROM companies WHERE zipCode = ?
    )
  `);

  // More efficient: build an in-memory index of normalized names by zip+state
  // Query candidates in bulk per zip code
  const findByZip = db.prepare(`
    SELECT id, businessName, phone, website, email, latitude, longitude, city, state
    FROM companies
    WHERE zipCode = ?
  `);

  const findByCity = db.prepare(`
    SELECT id, businessName, phone, website, email, latitude, longitude, city, state, zipCode
    FROM companies
    WHERE LOWER(city) = ? AND UPPER(state) = ?
  `);

  const updateCompany = db.prepare(`
    UPDATE companies SET
      phone     = CASE WHEN (phone IS NULL OR phone = '') THEN ? ELSE phone END,
      website   = CASE WHEN (website IS NULL OR website = '') THEN ? ELSE website END,
      email     = CASE WHEN (email IS NULL OR email = '') THEN ? ELSE email END,
      latitude  = CASE WHEN latitude IS NULL THEN ? ELSE latitude END,
      longitude = CASE WHEN longitude IS NULL THEN ? ELSE longitude END,
      rating    = CASE WHEN (rating IS NULL OR rating = 0) THEN ? ELSE rating END,
      reviewCount = CASE WHEN (reviewCount IS NULL OR reviewCount = 0) THEN ? ELSE reviewCount END,
      imageUrl  = CASE WHEN (imageUrl IS NULL OR imageUrl = '') THEN ? ELSE imageUrl END,
      lastUpdated = ?
    WHERE id = ?
  `);

  const MIN_SIMILARITY = 0.65;
  const now = new Date().toISOString();

  const processPlace = (place: GmapsPlace): void => {
    // Skip closed businesses
    if (place.permanentlyClosed || place.temporarilyClosed) {
      stats.skippedClosed++;
      return;
    }

    // Skip non-US
    if (place.countryCode && place.countryCode !== 'US') {
      stats.skippedOutsideUS++;
      return;
    }

    const stateCode = toStateCode(place.state || '');
    if (!stateCode) {
      stats.skippedNoMatch++;
      return;
    }

    // Determine contact data from Google Maps result
    const gmapsPhone = place.phoneUnformatted || place.phone || '';
    const gmapsWebsite = place.website || '';
    const gmapsEmail = (place.emails && place.emails.length > 0) ? place.emails[0] : '';

    // Nothing to enrich with?
    if (!gmapsPhone && !gmapsWebsite && !gmapsEmail) {
      stats.skippedNoMatch++;
      return;
    }

    // Try matching: first by zip code, then by city+state
    let candidates: any[] = [];

    if (place.postalCode) {
      candidates = findByZip.all(place.postalCode) as any[];
    }

    if (candidates.length === 0 && place.city && stateCode) {
      candidates = findByCity.all(normalizeCity(place.city), stateCode) as any[];
    }

    if (candidates.length === 0) {
      stats.skippedNoMatch++;
      return;
    }

    // Find best name match
    const normalizedPlaceName = normalizeName(place.title);
    let bestMatch: any = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = nameSimilarity(place.title, candidate.businessName);
      if (score >= MIN_SIMILARITY && score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (!bestMatch) {
      stats.skippedNoMatch++;
      return;
    }

    // Check if we'd actually update anything
    const wouldUpdatePhone = (!bestMatch.phone || bestMatch.phone === '') && gmapsPhone;
    const wouldUpdateWebsite = (!bestMatch.website || bestMatch.website === '') && gmapsWebsite;
    const wouldUpdateEmail = (!bestMatch.email || bestMatch.email === '') && gmapsEmail;
    const wouldUpdateLatLng = bestMatch.latitude === null && place.location?.lat;

    if (!wouldUpdatePhone && !wouldUpdateWebsite && !wouldUpdateEmail && !wouldUpdateLatLng) {
      stats.duplicateNames++;
      return;
    }

    if (!options?.dryRun) {
      updateCompany.run(
        gmapsPhone || null,
        gmapsWebsite || null,
        gmapsEmail || null,
        place.location?.lat ?? null,
        place.location?.lng ?? null,
        place.totalScore ?? null,
        place.reviewsCount ?? null,
        place.imageUrl ?? null,
        now,
        bestMatch.id,
      );
    }

    stats.matched++;
    if (wouldUpdatePhone) stats.updatedPhone++;
    if (wouldUpdateWebsite) stats.updatedWebsite++;
    if (wouldUpdateEmail) stats.updatedEmail++;
    if (wouldUpdateLatLng) stats.updatedLatLng++;
  };

  // Process in a transaction for speed
  const runAll = db.transaction(() => {
    for (const place of places) {
      try {
        processPlace(place);
      } catch (err) {
        stats.errors++;
        if (stats.errors <= 5) {
          console.error(`[gmapsEnrich] Error processing "${place.title}":`, err);
        }
      }
    }
  });

  runAll();

  stats.finishedAt = new Date().toISOString();
  db.close();
  return stats;
}

// ---------------------------------------------------------------------------
// File/directory loader
// ---------------------------------------------------------------------------

export function loadGmapsResults(pathOrDir: string): GmapsPlace[] {
  const stat = fs.statSync(pathOrDir);
  const files: string[] = [];

  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(pathOrDir)) {
      if (f.endsWith('.json')) files.push(path.join(pathOrDir, f));
    }
  } else {
    files.push(pathOrDir);
  }

  const allPlaces: GmapsPlace[] = [];

  for (const file of files) {
    console.log(`[gmapsEnrich] Loading ${file}...`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const items = Array.isArray(raw) ? raw : raw.items || raw.data || [];
    allPlaces.push(...items);
  }

  console.log(`[gmapsEnrich] Loaded ${allPlaces.length} places from ${files.length} file(s)`);
  return allPlaces;
}
