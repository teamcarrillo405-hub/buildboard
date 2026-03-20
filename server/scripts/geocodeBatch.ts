#!/usr/bin/env npx tsx
/**
 * geocodeBatch.ts
 *
 * Batch-geocodes companies in constructflix.db that have a street address but
 * no latitude/longitude, using the free US Census Bureau Geocoder batch API.
 *
 * API docs: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
 *
 * Usage:
 *   npx tsx server/scripts/geocodeBatch.ts
 *   npx tsx server/scripts/geocodeBatch.ts --dry-run   (parse + log only, skip DB writes)
 *
 * The Census batch endpoint accepts up to 10,000 addresses per POST and
 * returns a CSV with matched coordinates. This script:
 *   1. Queries all un-geocoded companies
 *   2. Splits them into batches of up to BATCH_SIZE (10,000)
 *   3. Uploads each batch as a multipart CSV to the Census API
 *   4. Parses the response CSV (lon,lat order) and updates the DB
 *   5. Persists a progress file to logs/geocode_progress.json
 *   6. Waits DELAY_MS between batches to be a respectful API consumer
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE   = 10_000;
const DELAY_MS     = 1_000;
const CENSUS_URL   = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';
const BENCHMARK    = 'Public_AR_Current';

const DB_PATH      = './server/constructflix.db';
const LOGS_DIR     = './logs';
const PROGRESS_FILE = path.join(LOGS_DIR, 'geocode_progress.json');

const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyRow {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string | null;
}

interface GeoProgress {
  processed: number;
  matched: number;
  updated: number;
  errors: number;
  startedAt: string;
  lastUpdatedAt: string;
}

// Parsed record from the Census response CSV
interface CensusResult {
  id: string;
  matchIndicator: string;   // "Match" | "No_Match" | "Tie"
  matchType: string;        // "Exact" | "Non_Exact"
  matchedAddress: string;
  longitude: number | null;
  latitude: number | null;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Progress file helpers
// ---------------------------------------------------------------------------

function loadProgress(): GeoProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')) as GeoProgress;
    } catch {
      // Fall through to fresh state if file is corrupt
    }
  }
  return {
    processed:     0,
    matched:       0,
    updated:       0,
    errors:        0,
    startedAt:     new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };
}

function saveProgress(p: GeoProgress): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  p.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Build the Census batch CSV content from an array of company rows.
 * Format per Census docs: id,street,city,state,zip
 * Fields containing commas must be quoted.
 */
function buildCsvPayload(rows: CompanyRow[]): string {
  const lines: string[] = rows.map(row => {
    const escape = (v: string): string =>
      v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;

    return [
      escape(row.id),
      escape(row.address),
      escape(row.city),
      escape(row.state),
      escape(row.zipCode ?? ''),
    ].join(',');
  });
  return lines.join('\n');
}

/**
 * Parse the Census batch geocoder response CSV.
 *
 * Response columns (per Census API documentation):
 *   0: id
 *   1: input address (quoted)
 *   2: match indicator  — "Match" | "No_Match" | "Tie"
 *   3: match type       — "Exact" | "Non_Exact"
 *   4: matched address  (quoted, empty on no match)
 *   5: lon,lat          — e.g. "-86.7816,36.1627" (longitude FIRST)
 *   6: tiger_line_id
 *   7: side
 *
 * The response is NOT a well-formed RFC 4180 CSV: quoted fields containing
 * commas appear inside a larger comma-delimited line, so we split on the
 * pattern carefully rather than relying on a generic CSV parser.
 */
function parseCensusResponse(raw: string): CensusResult[] {
  const results: CensusResult[] = [];

  // Normalize line endings and drop blank lines
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');

  for (const line of lines) {
    try {
      const cols = splitCensusLine(line);
      if (cols.length < 6) continue;

      const id             = cols[0].trim();
      const matchIndicator = cols[2].trim();
      const matchType      = cols[3].trim();
      const matchedAddress = cols[4].trim();
      const lonLatStr      = cols[5].trim();

      if (!id) continue;

      let longitude: number | null = null;
      let latitude: number | null  = null;

      if (matchIndicator === 'Match' && lonLatStr) {
        // lonLatStr format: "-86.7816,36.1627"  — longitude first, latitude second
        const parts = lonLatStr.split(',');
        if (parts.length === 2) {
          const lon = parseFloat(parts[0].trim());
          const lat = parseFloat(parts[1].trim());
          if (!isNaN(lon) && !isNaN(lat)) {
            longitude = lon;
            latitude  = lat;
          }
        }
      }

      results.push({ id, matchIndicator, matchType, matchedAddress, longitude, latitude });
    } catch {
      // Skip malformed lines — do not abort the whole batch
    }
  }

  return results;
}

/**
 * Split a single Census response line into columns, respecting double-quoted
 * fields. The Census API wraps some fields in quotes; this handles that without
 * pulling in a CSV library dependency.
 */
function splitCensusLine(line: string): string[] {
  const cols: string[] = [];
  let i = 0;

  while (i <= line.length) {
    if (i === line.length) {
      cols.push('');
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let field = '';
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped quote
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i++];
        }
      }
      cols.push(field);
      // Consume trailing comma if present
      if (line[i] === ',') i++;
    } else {
      // Unquoted field — read until next comma
      const start = i;
      while (i < line.length && line[i] !== ',') i++;
      cols.push(line.slice(start, i));
      if (line[i] === ',') i++;
    }
  }

  return cols;
}

// ---------------------------------------------------------------------------
// Census API call
// ---------------------------------------------------------------------------

/**
 * Submit one CSV batch to the Census geocoder and return the raw response text.
 * Throws on HTTP errors or network failures — callers handle retries/continuations.
 */
async function submitBatch(csvContent: string): Promise<string> {
  // Build multipart/form-data manually using the FormData / Blob API
  // (available natively in Node 18+)
  const form = new FormData();

  // The Census API requires the file field to be named "addressFile" and
  // to have a filename; sending a Blob with a name property achieves this.
  const blob = new Blob([csvContent], { type: 'text/plain' });
  form.append('addressFile', blob, 'addresses.csv');
  form.append('benchmark', BENCHMARK);
  // vintage is required by the multipart form even for location-only geocoding
  form.append('vintage', 'Current_Current');
  form.append('returntype', 'locations');

  const response = await fetch(CENSUS_URL, {
    method: 'POST',
    body: form,
    // No explicit Content-Type header — fetch sets the correct multipart boundary
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '(unreadable)');
    throw new Error(
      `Census API returned HTTP ${response.status}: ${errBody.slice(0, 400)}`,
    );
  }

  return response.text();
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

function openDatabase(): Database.Database {
  const db = new Database(DB_PATH);
  // WAL mode: better concurrent read performance and crash-safety
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  return db;
}

function queryUngeocoded(db: Database.Database): CompanyRow[] {
  return db
    .prepare<[], CompanyRow>(
      `SELECT id, address, city, state, zipCode
       FROM companies
       WHERE (latitude IS NULL OR latitude = '')
         AND address  IS NOT NULL AND address  != ''
         AND city     IS NOT NULL AND city     != ''`,
    )
    .all();
}

function buildUpdateStatement(db: Database.Database) {
  return db.prepare<[number, number, string]>(
    `UPDATE companies
     SET latitude    = ?,
         longitude   = ?,
         lastUpdated = datetime('now')
     WHERE id = ?`,
  );
}

// ---------------------------------------------------------------------------
// Core batch processor
// ---------------------------------------------------------------------------

async function processBatch(
  batchNum: number,
  rows: CompanyRow[],
  updateStmt: ReturnType<typeof buildUpdateStatement>,
  progress: GeoProgress,
): Promise<{ matched: number; updated: number; errors: number }> {
  const csvContent = buildCsvPayload(rows);
  log(`Batch ${batchNum}: submitting ${rows.length} address(es) to Census Geocoder...`);

  let rawResponse: string;
  try {
    rawResponse = await submitBatch(csvContent);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Batch ${batchNum}: Census API error — ${msg}`);
    progress.errors += rows.length;
    saveProgress(progress);
    return { matched: 0, updated: 0, errors: rows.length };
  }

  let results: CensusResult[];
  try {
    results = parseCensusResponse(rawResponse);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Batch ${batchNum}: failed to parse Census response — ${msg}`);
    progress.errors += rows.length;
    saveProgress(progress);
    return { matched: 0, updated: 0, errors: rows.length };
  }

  let matched = 0;
  let updated  = 0;
  let errors   = 0;

  for (const result of results) {
    if (result.matchIndicator !== 'Match' || result.latitude === null || result.longitude === null) {
      continue;
    }

    matched++;

    if (DRY_RUN) {
      updated++;
      continue;
    }

    try {
      updateStmt.run(result.latitude, result.longitude, result.id);
      updated++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Batch ${batchNum}: DB update failed for id=${result.id} — ${msg}`);
      errors++;
    }
  }

  log(
    `Batch ${batchNum}: submitted ${rows.length}, matched ${matched}, updated ${updated}` +
    (errors > 0 ? `, errors ${errors}` : '') +
    (DRY_RUN ? ' [DRY RUN]' : ''),
  );

  // Accumulate totals into the persistent progress object
  progress.processed     += rows.length;
  progress.matched       += matched;
  progress.updated       += updated;
  progress.errors        += errors;
  saveProgress(progress);

  return { matched, updated, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  if (DRY_RUN) {
    log('DRY RUN mode — no database writes will be performed.');
  }

  const db         = openDatabase();
  const updateStmt = buildUpdateStatement(db);
  const progress   = loadProgress();

  log('Querying un-geocoded companies...');
  const rows = queryUngeocoded(db);

  if (rows.length === 0) {
    log('No companies require geocoding. Exiting.');
    db.close();
    return;
  }

  log(`Found ${rows.length.toLocaleString()} company/companies to geocode.`);

  // Partition into batches of BATCH_SIZE
  const batches: CompanyRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  log(`Processing ${batches.length} batch(es) of up to ${BATCH_SIZE.toLocaleString()} records each.`);
  log('─'.repeat(60));

  let totalMatched = 0;
  let totalUpdated  = 0;
  let totalErrors   = 0;

  for (let i = 0; i < batches.length; i++) {
    const batchNum = i + 1;
    const batch    = batches[i];

    const { matched, updated, errors } = await processBatch(
      batchNum,
      batch,
      updateStmt,
      progress,
    );

    totalMatched += matched;
    totalUpdated  += updated;
    totalErrors   += errors;

    // Respectful delay between batches (skip after the last one)
    if (i < batches.length - 1) {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  log('─'.repeat(60));
  log('Geocoding complete.');
  log(`  Total submitted : ${rows.length.toLocaleString()}`);
  log(`  Total matched   : ${totalMatched.toLocaleString()}`);
  log(`  Total updated   : ${totalUpdated.toLocaleString()}`);
  log(`  Total errors    : ${totalErrors.toLocaleString()}`);
  log(`  Progress saved  : ${PROGRESS_FILE}`);

  db.close();
}

main().catch(err => {
  log(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
