#!/usr/bin/env npx tsx
/**
 * crossEnrichYelp.ts
 *
 * Cross-enriches non-Yelp companies in constructflix.db by matching them
 * against existing Yelp records — zero API calls, pure database operation.
 *
 * For each non-Yelp record missing a website OR phone, the script attempts a
 * fuzzy name match against Yelp records keyed by:
 *   normalizedName + city (lowercase) + state (uppercase)
 *
 * Name normalization:
 *   - Lowercased
 *   - Legal suffix tokens stripped (LLC, Inc, Corp, Ltd, LLP, PLLC, PA, PC,
 *     DBA, Co, Company) — whole-word, end-of-string
 *   - Ampersand replaced with space
 *   - All punctuation replaced with space
 *   - Consecutive whitespace collapsed, trimmed
 *
 * Fields filled (only when the target column is NULL or empty string):
 *   phone, website, imageUrl, latitude, longitude
 *
 * Updates are batched inside SQLite transactions every 5 000 records to keep
 * memory low while still being far faster than auto-commit.
 *
 * Summary JSON saved to logs/crossEnrich_yelp_summary.json.
 *
 * Usage:
 *   npx tsx server/scripts/crossEnrichYelp.ts
 *   npx tsx server/scripts/crossEnrichYelp.ts --dry-run
 */

import fs   from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_PATH      = './server/constructflix.db';
const LOG_DIR      = './logs';
const SUMMARY_FILE = path.join(LOG_DIR, 'crossEnrich_yelp_summary.json');
const BATCH_SIZE   = 5_000;
const DRY_RUN      = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

// ---------------------------------------------------------------------------
// Name normalisation
// ---------------------------------------------------------------------------

/**
 * Legal suffix tokens to strip from the end of a business name.
 * Ordered longest-first so "PLLC" is consumed before "LLC".
 */
const SUFFIX_TOKENS = [
  'pllc', 'llc', 'llp', 'corp', 'inc', 'ltd', 'company', 'co', 'dba', 'pa', 'pc',
];

// Regex: one or more suffix tokens separated by optional comma/whitespace at end of string.
// Built once at module load.
const SUFFIX_RE = new RegExp(
  `(?:[,\\s]+(${SUFFIX_TOKENS.join('|')}))+\\s*$`,
  'i',
);

function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';

  let s = raw.toLowerCase();

  // Replace & with space
  s = s.replace(/&/g, ' ');

  // Strip legal suffixes from the tail (loop in case of stacked: "Inc. LLC")
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(SUFFIX_RE, '');
  }

  // Replace punctuation with space
  s = s.replace(/[^a-z0-9\s]/g, ' ');

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

function lookupKey(name: string, city: string | null, state: string | null): string {
  return `${normalizeName(name)}|${(city ?? '').toLowerCase().trim()}|${(state ?? '').toUpperCase().trim()}`;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface YelpRow {
  id: string;
  businessName: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  website: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
}

interface TargetRow {
  id: string;
  businessName: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  website: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

// ---------------------------------------------------------------------------
// Summary type
// ---------------------------------------------------------------------------

interface Summary {
  runAt: string;
  dryRun: boolean;
  durationMs: number;
  yelpSourceRecords: number;
  nonYelpCandidates: number;
  matchesFound: number;
  fieldsUpdated: {
    phone: number;
    website: number;
    imageUrl: number;
    latLng: number;
  };
  recordsActuallyUpdated: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startMs = Date.now();

  fs.mkdirSync(LOG_DIR, { recursive: true });

  log('══════════════════════════════════════════════════════════');
  log('  ConstructFlix — Yelp Cross-Enrichment (DB-only)');
  log(`  DB path : ${DB_PATH}`);
  log(`  Dry run : ${DRY_RUN}`);
  log('══════════════════════════════════════════════════════════');

  // Open SQLite in WAL mode for safe concurrent reads
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');   // safe with WAL; faster than FULL
  db.pragma('cache_size = -65536');    // 64 MB page cache
  db.pragma('temp_store = MEMORY');

  // ---------------------------------------------------------------------------
  // Phase 1: Load Yelp source records into a lookup map
  // ---------------------------------------------------------------------------

  log('[Phase 1] Loading Yelp records with website into memory…');

  const yelpRows = db.prepare<[], YelpRow>(`
    SELECT
      id, businessName, city, state, zipCode,
      phone, website, imageUrl,
      latitude, longitude,
      rating, reviewCount
    FROM companies
    WHERE dataSource = 'yelp'
      AND website IS NOT NULL
      AND website != ''
  `).all();

  log(`[Phase 1] ${yelpRows.length.toLocaleString()} Yelp source records loaded`);

  // Build lookup map — last writer wins when keys collide (rare; acceptable)
  const yelpMap = new Map<string, YelpRow>();
  for (const row of yelpRows) {
    const key = lookupKey(row.businessName, row.city, row.state);
    if (key) yelpMap.set(key, row);
  }

  log(`[Phase 1] ${yelpMap.size.toLocaleString()} unique lookup keys built`);

  // ---------------------------------------------------------------------------
  // Phase 2: Query non-Yelp candidates missing website OR phone
  // ---------------------------------------------------------------------------

  log('[Phase 2] Querying non-Yelp records missing website or phone…');

  const targetRows = db.prepare<[], TargetRow>(`
    SELECT
      id, businessName, city, state, zipCode,
      phone, website, imageUrl,
      latitude, longitude
    FROM companies
    WHERE dataSource != 'yelp'
      AND (
        website  IS NULL OR website  = ''
        OR phone IS NULL OR phone    = ''
      )
  `).all();

  log(`[Phase 2] ${targetRows.length.toLocaleString()} candidate records to evaluate`);

  // ---------------------------------------------------------------------------
  // Phase 3: Match and collect updates
  // ---------------------------------------------------------------------------

  log('[Phase 3] Matching and collecting updates…');

  interface UpdateRecord {
    id: string;
    phone?: string;
    website?: string;
    imageUrl?: string;
    latitude?: number;
    longitude?: number;
  }

  const updates: UpdateRecord[] = [];
  let countMatched   = 0;
  let countPhone     = 0;
  let countWebsite   = 0;
  let countImageUrl  = 0;
  let countLatLng    = 0;

  for (const row of targetRows) {
    const key = lookupKey(row.businessName, row.city, row.state);
    if (!key) continue;

    const yelp = yelpMap.get(key);
    if (!yelp) continue;

    countMatched++;

    const update: UpdateRecord = { id: row.id };
    let hasChange = false;

    // phone — fill only when target is empty
    if ((!row.phone || row.phone === '') && yelp.phone) {
      update.phone = yelp.phone;
      countPhone++;
      hasChange = true;
    }

    // website — fill only when target is empty
    if ((!row.website || row.website === '') && yelp.website) {
      update.website = yelp.website;
      countWebsite++;
      hasChange = true;
    }

    // imageUrl — fill only when target is empty
    if ((!row.imageUrl || row.imageUrl === '') && yelp.imageUrl) {
      update.imageUrl = yelp.imageUrl;
      countImageUrl++;
      hasChange = true;
    }

    // lat/lng — treat as a pair; fill only when both are missing on target
    if (
      (row.latitude  == null || row.longitude == null) &&
      yelp.latitude  != null && yelp.longitude != null
    ) {
      update.latitude  = yelp.latitude;
      update.longitude = yelp.longitude;
      countLatLng++;
      hasChange = true;
    }

    if (hasChange) updates.push(update);
  }

  log(`[Phase 3] Matches found      : ${countMatched.toLocaleString()}`);
  log(`[Phase 3] Records to update  : ${updates.length.toLocaleString()}`);
  log(`[Phase 3]   → phone filled   : ${countPhone.toLocaleString()}`);
  log(`[Phase 3]   → website filled : ${countWebsite.toLocaleString()}`);
  log(`[Phase 3]   → imageUrl filled: ${countImageUrl.toLocaleString()}`);
  log(`[Phase 3]   → lat/lng filled : ${countLatLng.toLocaleString()}`);

  // ---------------------------------------------------------------------------
  // Phase 4: Apply updates in batched transactions
  // ---------------------------------------------------------------------------

  if (DRY_RUN) {
    log('[Phase 4] DRY RUN — skipping all database writes');
  } else {
    log(`[Phase 4] Writing updates in batches of ${BATCH_SIZE.toLocaleString()}…`);

    /**
     * Prepared statements are cached by column combination to avoid re-preparing
     * for every single row (which would be slow).  We use a Map keyed by a
     * bitmask representing which columns are present.
     */
    const stmtCache = new Map<string, ReturnType<typeof db.prepare>>();

    function getStmt(cols: string[]): ReturnType<typeof db.prepare> {
      const cacheKey = cols.join(',');
      if (stmtCache.has(cacheKey)) return stmtCache.get(cacheKey)!;

      const setClauses = cols.map(c => `${c} = @${c}`).join(', ');
      const stmt = db.prepare(`UPDATE companies SET ${setClauses} WHERE id = @id`);
      stmtCache.set(cacheKey, stmt);
      return stmt;
    }

    let totalWritten = 0;

    for (let offset = 0; offset < updates.length; offset += BATCH_SIZE) {
      const batch = updates.slice(offset, offset + BATCH_SIZE);

      const runBatch = db.transaction((rows: UpdateRecord[]) => {
        for (const u of rows) {
          const cols: string[] = [];
          if (u.phone     !== undefined) cols.push('phone');
          if (u.website   !== undefined) cols.push('website');
          if (u.imageUrl  !== undefined) cols.push('imageUrl');
          if (u.latitude  !== undefined) cols.push('latitude');
          if (u.longitude !== undefined) cols.push('longitude');
          if (cols.length === 0) continue;

          getStmt(cols).run(u as unknown as Record<string, unknown>);
        }
      });

      runBatch(batch);
      totalWritten += batch.length;

      const pct = ((totalWritten / updates.length) * 100).toFixed(1);
      log(`[Phase 4] Batch written: ${totalWritten.toLocaleString()} / ${updates.length.toLocaleString()} (${pct}%)`);
    }

    log(`[Phase 4] All updates committed`);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const durationMs = Date.now() - startMs;

  const summary: Summary = {
    runAt              : new Date().toISOString(),
    dryRun             : DRY_RUN,
    durationMs,
    yelpSourceRecords  : yelpRows.length,
    nonYelpCandidates  : targetRows.length,
    matchesFound       : countMatched,
    fieldsUpdated: {
      phone    : countPhone,
      website  : countWebsite,
      imageUrl : countImageUrl,
      latLng   : countLatLng,
    },
    recordsActuallyUpdated: DRY_RUN ? 0 : updates.length,
  };

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));

  db.close();

  log('══════════════════════════════════════════════════════════');
  log('  CROSS-ENRICHMENT COMPLETE');
  log(`  Duration              : ${(durationMs / 1000).toFixed(1)}s`);
  log(`  Yelp source records   : ${summary.yelpSourceRecords.toLocaleString()}`);
  log(`  Non-Yelp candidates   : ${summary.nonYelpCandidates.toLocaleString()}`);
  log(`  Matches found         : ${summary.matchesFound.toLocaleString()}`);
  log(`  Records updated       : ${summary.recordsActuallyUpdated.toLocaleString()}`);
  log(`    → phone filled      : ${countPhone.toLocaleString()}`);
  log(`    → website filled    : ${countWebsite.toLocaleString()}`);
  log(`    → imageUrl filled   : ${countImageUrl.toLocaleString()}`);
  log(`    → lat/lng filled    : ${countLatLng.toLocaleString()}`);
  log(`  Summary saved         : ${SUMMARY_FILE}`);
  log('══════════════════════════════════════════════════════════');
}

main().catch(err => {
  log(`[FATAL] ${(err as Error).message}`);
  process.exit(1);
});
