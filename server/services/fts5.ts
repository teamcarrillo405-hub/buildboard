import { sqlite } from '../db.js';
import { parseRow } from '../helpers/parseRow.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchFilters {
  query?: string;       // Free-text for FTS5 MATCH
  category?: string;    // Exact category match
  state?: string;       // 2-letter state code
  city?: string;        // City name (case-insensitive)
  minRating?: number;   // Minimum star rating
  services?: string[];  // Service keywords
  licenseOnly?: boolean; // Only show contractors with active license
  realOnly?: boolean;    // Only show real Yelp listings (dataSource='yelp')
  sort?: string;         // Sort order (e.g. 'name_asc')
  // Geographic radius filtering -- resolved by the route before calling ftsSearch
  nearbyZips?: string[];  // Array of ZIP codes within the requested radius
  searchLat?: number;     // Center latitude (for reference / future use)
  searchLng?: number;     // Center longitude (for reference / future use)
  radiusMiles?: number;   // Requested radius in miles (for reference)
}

export interface SearchResult {
  companies: ReturnType<typeof parseRow>[];
  totalResults: number;
  searchTime: number;   // ms
  source: 'fts5' | 'like';
}

// ---------------------------------------------------------------------------
// FTS5 Index Management
// ---------------------------------------------------------------------------

let ftsReady = false;

/**
 * Check if the FTS5 virtual table exists.
 */
function ftsTableExists(): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='companies_fts'`
  ).get() as { name: string } | undefined;
  return !!row;
}

/**
 * Ensure the FTS5 index exists, creating it if necessary.
 * Safe to call multiple times -- no-ops if already built.
 * Returns true if index was newly created, false if already existed.
 */
export function ensureFtsIndex(options?: { force?: boolean }): boolean {
  if (ftsReady && !options?.force) return false;

  if (ftsTableExists() && !options?.force) {
    console.log('[FTS5] Index already exists, skipping build');
    ftsReady = true;
    return false;
  }

  console.log('[FTS5] Building full-text search index...');
  const start = Date.now();

  // Drop existing if force rebuild
  if (options?.force) {
    console.log('[FTS5] Force rebuild -- dropping existing index');
    sqlite.exec(`DROP TABLE IF EXISTS companies_fts`);
  }

  // Create the FTS5 external-content virtual table.
  // Includes subCategory and specialties for richer matching after Yelp ingestion.
  // BM25 weights: businessName=10, category=5, subCategory=4, city=3, state=1, services=2, specialties=2
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
      businessName, category, subCategory, city, state, services, specialties,
      content='companies',
      content_rowid='rowid',
      tokenize='porter unicode61'
    )
  `);

  // Populate the index from the content table
  console.log('[FTS5] Populating index from companies table...');
  sqlite.exec(`INSERT INTO companies_fts(companies_fts) VALUES('rebuild')`);

  // Drop old triggers before recreating (column list has changed)
  sqlite.exec(`DROP TRIGGER IF EXISTS companies_fts_ai`);
  sqlite.exec(`DROP TRIGGER IF EXISTS companies_fts_ad`);
  sqlite.exec(`DROP TRIGGER IF EXISTS companies_fts_au`);

  // Create sync triggers so the FTS index stays up-to-date with the content table
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS companies_fts_ai AFTER INSERT ON companies BEGIN
      INSERT INTO companies_fts(rowid, businessName, category, subCategory, city, state, services, specialties)
      VALUES (new.rowid, new.businessName, new.category, new.subCategory, new.city, new.state, new.services, new.specialties);
    END
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS companies_fts_ad AFTER DELETE ON companies BEGIN
      INSERT INTO companies_fts(companies_fts, rowid, businessName, category, subCategory, city, state, services, specialties)
      VALUES ('delete', old.rowid, old.businessName, old.category, old.subCategory, old.city, old.state, old.services, old.specialties);
    END
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS companies_fts_au AFTER UPDATE ON companies BEGIN
      INSERT INTO companies_fts(companies_fts, rowid, businessName, category, subCategory, city, state, services, specialties)
      VALUES ('delete', old.rowid, old.businessName, old.category, old.subCategory, old.city, old.state, old.services, old.specialties);
      INSERT INTO companies_fts(rowid, businessName, category, subCategory, city, state, services, specialties)
      VALUES (new.rowid, new.businessName, new.category, new.subCategory, new.city, new.state, new.services, new.specialties);
    END
  `);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const count = (sqlite.prepare(`SELECT COUNT(*) as cnt FROM companies_fts`).get() as { cnt: number }).cnt;
  console.log(`[FTS5] Index built: ${count.toLocaleString()} rows indexed in ${elapsed}s`);

  ftsReady = true;
  return true;
}

/**
 * Check if the FTS5 index is ready for searching.
 */
export function isFtsReady(): boolean {
  return ftsReady;
}

// ---------------------------------------------------------------------------
// Query Sanitization
// ---------------------------------------------------------------------------

/**
 * Common suffixes to strip for generating stem-prefix terms.
 * Example: "plumber" -> "plumb" -> "plumb*" (matches "plumbing", "plumber", etc.)
 */
const STEM_SUFFIXES = ['ians', 'ian', 'ers', 'er', 'ing', 'tion', 'ment', 'ors', 'or', 'ists', 'ist', 'ants', 'ant', 'ents', 'ent', 'ings', 'ness', 'ous', 'ive', 'able', 'ible'];

/**
 * Sanitize user input for use in FTS5 MATCH expressions.
 * Removes FTS5 syntax operators. Strips common suffixes and uses prefix
 * matching (*) so related words match across porter stemmer boundaries
 * (e.g., "plumber" -> "plumb*" matches "plumbing").
 *
 * Output is safe to combine with column-scoped filters via AND.
 */
export function sanitizeFtsQuery(input: string): string {
  if (!input || !input.trim()) return '';

  // Remove FTS5 special operators and characters.
  // Hyphens must be stripped: FTS5/unicode61 can interpret 'leak-repair' as
  // 'leak NOT repair' which either returns wrong results or throws a parse error.
  // Converting to spaces gives 'leak repair' → 'leak* repair*' (two AND terms).
  const cleaned = input
    .replace(/['"(){}[\]^~*:\-]/g, ' ')  // Remove special chars including hyphen
    .replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ')  // Remove boolean operators
    .trim()
    .replace(/\s+/g, ' ');  // Collapse whitespace

  if (!cleaned) return '';

  // Filter to alphanumeric words, skip stop words and pure numerics.
  // Pure numeric tokens (ZIP codes, phone numbers like "97140") are NOT in the
  // FTS-indexed columns (businessName/category/city/state/services), so including
  // them as AND terms produces 0 results. ZIP-radius is handled separately via nearbyZips.
  const stopWords = new Set(['in', 'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'with', 'by', 'on', 'at', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'my', 'me', 'i', 'near']);
  const words = cleaned.split(' ').filter(w =>
    w.length > 1 &&
    /^[a-zA-Z0-9]/.test(w) &&
    !stopWords.has(w.toLowerCase()) &&
    !/^\d+$/.test(w)  // Strip pure numeric tokens (ZIP codes, numbers)
  );
  if (words.length === 0) return '';

  // Convert each word to a prefix-match term for broadest matching
  const parts = words.map(word => {
    const lower = word.toLowerCase();

    // Try stripping common suffixes to find a good stem prefix
    for (const suffix of STEM_SUFFIXES) {
      if (lower.length > suffix.length + 2 && lower.endsWith(suffix)) {
        return lower.slice(0, -suffix.length) + '*';
      }
    }

    // No recognized suffix -- use the word with prefix match
    return lower + '*';
  });

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// FTS5 Search
// ---------------------------------------------------------------------------

/**
 * Execute a hybrid search combining FTS5 full-text MATCH with SQL WHERE filters.
 * Returns BM25-ranked results.
 *
 * BM25 column weights: businessName=10, category=5, city=3, state=1, services=2
 */
export function ftsSearch(
  filters: SearchFilters,
  limit = 20,
  offset = 0,
): SearchResult {
  const start = performance.now();

  const { query, category, state, city, minRating, services, licenseOnly, realOnly, nearbyZips, sort } = filters;

  // Build FTS5 MATCH expression: incorporate text query AND column-specific
  // filters (category, state, city) directly into the FTS5 query for speed.
  // Only minRating and services need SQL WHERE (they aren't in the FTS index).
  const ftsTerms: string[] = [];

  if (query) {
    const sanitized = sanitizeFtsQuery(query);
    if (sanitized) ftsTerms.push(sanitized);
  }
  // Add column-scoped FTS terms for structured filters that map to FTS columns
  if (category) ftsTerms.push(`category:${JSON.stringify(category)}`);
  if (state) ftsTerms.push(`state:${JSON.stringify(state.toUpperCase())}`);

  const hasFtsQuery = ftsTerms.length > 0;

  // Build SQL WHERE conditions for non-FTS filters only
  const whereConditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (city) {
    whereConditions.push(`UPPER(c.city) = UPPER(@city)`);
    params.city = city;
  }

  if (minRating) {
    whereConditions.push(`c.rating >= @minRating`);
    params.minRating = minRating;
  }
  if (services && services.length > 0) {
    const serviceConditions = services.map((s, i) => {
      const key = `service_${i}`;
      params[key] = `%${s}%`;
      return `c.services LIKE @${key}`;
    });
    whereConditions.push(`(${serviceConditions.join(' OR ')})`);
  }

  if (licenseOnly) {
    // 'active' covers most states; 'clear' is California CSLB's equivalent status
    whereConditions.push(`c.licenseStatus IN ('active', 'clear', 'issued')`);
  }
  if (realOnly) {
    whereConditions.push(`c.dataSource = 'yelp'`);
  }

  // Geographic radius filter: restrict to companies whose ZIP code is within
  // the pre-computed nearby list (resolved by the route via zippopotam.us).
  // SQLite doesn't support array binding, so we inline the quoted ZIP list.
  if (nearbyZips && nearbyZips.length > 0) {
    // Sanitize each ZIP to digits-only before inlining to prevent injection
    const safeZips = nearbyZips
      .filter(z => /^\d{1,10}$/.test(z.trim()))
      .map(z => `'${z.trim()}'`)
      .join(', ');
    if (safeZips) {
      whereConditions.push(`c.zipCode IN (${safeZips})`);
    }
  }

  let querySql: string;
  let countSql: string;

  params.rawQuery = query || '';

  if (hasFtsQuery) {
    // FTS5 MATCH handles text + location/category filters; SQL WHERE handles rating/services
    const ftsQuery = ftsTerms.join(' ');
    params.ftsQuery = ftsQuery;

    const extraWhere = whereConditions.length > 0
      ? `AND ${whereConditions.join(' AND ')}`
      : '';

    // Boost logic: bm25() returns NEGATIVE scores — ORDER BY ASC means most-negative = first.
    // Rule: multiplier > 1 amplifies away from 0 (MORE negative = BETTER rank = BOOST)
    //       multiplier < 1 shrinks toward 0  (LESS negative = WORSE rank = PENALIZE)
    //
    // Applied in order (all three CASE blocks multiply together):
    //   1. Bad license penalty: 0.05x → nearly zero → sinks to bottom
    //   2. Enrichment quality: 1.0x (bare data) → 1.15x (Yelp) → 1.35x (reviews+image)
    //   3. Paid verification: 1.0x default → 2.5x paid verified → 3.5x hcc_member
    //
    // BM25 column weights: businessName=10, category=5, subCategory=4, city=3, state=1, services=2, specialties=2
    querySql = `
      SELECT c.*,
             bm25(companies_fts, 10.0, 5.0, 4.0, 3.0, 1.0, 2.0, 2.0) as rank,
             bm25(companies_fts, 10.0, 5.0, 4.0, 3.0, 1.0, 2.0, 2.0)
             * CASE
                 WHEN c.licenseStatus IN ('cancelled','suspended','inactive','expired',
                      'referred to enforcement','contr bond susp','work comp susp','liab ins susp')
                      THEN 0.05
                 ELSE 1.0
               END
             * CASE
                 WHEN c.reviewCount > 0 AND c.imageUrl IS NOT NULL AND c.imageUrl != '' THEN 1.35
                 WHEN c.dataSource = 'yelp' THEN 1.15
                 WHEN c.dataSource LIKE 'license_%' THEN 0.9
                 ELSE 1.0
               END
             * CASE
                 WHEN c.verificationStatus = 'hcc_member' THEN 3.5
                 WHEN c.verificationStatus = 'verified' AND c.dataSource NOT LIKE 'license_%' THEN 2.5
                 ELSE 1.0
               END
             as boostedRank
      FROM companies_fts
      JOIN companies c ON c.rowid = companies_fts.rowid
      WHERE companies_fts MATCH @ftsQuery ${extraWhere}
      ${sort === 'name_asc' ? 'ORDER BY c.businessName ASC' : `ORDER BY CASE WHEN UPPER(c.businessName) = UPPER(@rawQuery) THEN 0.001 ELSE 1.0 END * boostedRank`}
      LIMIT @limit OFFSET @offset
    `;

    countSql = `
      SELECT COUNT(*) as cnt
      FROM companies_fts
      JOIN companies c ON c.rowid = companies_fts.rowid
      WHERE companies_fts MATCH @ftsQuery ${extraWhere}
    `;
  } else if (whereConditions.length > 0) {
    // Structured filters only (no text query).
    // Order: paid verified → enriched data → bad license penalty → rating/reviews.
    querySql = `
      SELECT c.*
      FROM companies c
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY
        -- Bad licenses sink to bottom
        CASE WHEN c.licenseStatus IN ('cancelled','suspended','inactive','expired',
             'referred to enforcement','contr bond susp','work comp susp','liab ins susp')
             THEN 1 ELSE 0 END ASC,
        -- Paid verified first
        CASE WHEN c.verificationStatus = 'hcc_member' THEN 3
             WHEN c.verificationStatus = 'verified' AND c.dataSource NOT LIKE 'license_%' THEN 2
             ELSE 0 END DESC,
        -- Enrichment score: reviews+image > yelp > bare license data
        (CASE WHEN c.reviewCount > 0 AND c.imageUrl IS NOT NULL AND c.imageUrl != '' THEN 3 ELSE 0 END +
         CASE WHEN c.website IS NOT NULL AND c.website != '' THEN 1 ELSE 0 END +
         CASE WHEN c.licenseStatus IN ('active','clear','issued') THEN 1 ELSE 0 END) DESC,
        c.rating DESC,
        c.reviewCount DESC
      LIMIT @limit OFFSET @offset
    `;

    countSql = `
      SELECT COUNT(*) as cnt
      FROM companies c
      WHERE ${whereConditions.join(' AND ')}
    `;
  } else {
    // No filters at all -- return empty
    return {
      companies: [],
      totalResults: 0,
      searchTime: Math.round(performance.now() - start),
      source: 'fts5',
    };
  }

  params.limit = limit;
  params.offset = offset;

  const rows = sqlite.prepare(querySql).all(params) as Record<string, unknown>[];

  // Count total results. If the result set is small (below limit), we can
  // calculate directly. Otherwise run the count query.
  let totalResults: number;
  if (rows.length < limit && offset === 0) {
    totalResults = rows.length;
  } else {
    const countParams = Object.fromEntries(
      Object.entries(params).filter(([k]) => k !== 'limit' && k !== 'offset')
    );
    const countRow = sqlite.prepare(countSql).all(countParams) as { cnt: number }[];
    totalResults = countRow[0]?.cnt ?? 0;
  }

  const searchTime = Math.round(performance.now() - start);

  return {
    companies: rows.map(r => parseRow(r as any)),
    totalResults,
    searchTime,
    source: 'fts5',
  };
}
