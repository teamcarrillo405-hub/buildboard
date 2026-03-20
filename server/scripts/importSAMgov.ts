/**
 * importSAMgov.ts — SAM.gov bulk entity registration importer.
 *
 * SAM.gov (System for Award Management) publishes monthly bulk extracts of
 * all registered business entities. This script filters for construction
 * contractors (NAICS 23xxxx) and imports them into the ConstructFlix DB.
 *
 * Download the Public V3 Extract CSV manually from:
 *   https://sam.gov/data-services/Entity%20Registrations/Public%20V3%20Extract%20Files
 *   → Look for "Entity_Registrations_Public_V3_YYYYMMDD.csv" (typically 3-6 GB)
 *   → The ZIP contains one large CSV. Extract it first.
 *
 * Usage:
 *   npx tsx server/scripts/importSAMgov.ts <path-to-csv>
 *   npx tsx server/scripts/importSAMgov.ts <path-to-csv> --dry-run
 *   npx tsx server/scripts/importSAMgov.ts <path-to-csv> --active-only
 *   npx tsx server/scripts/importSAMgov.ts <path-to-csv> --state TX
 *   npx tsx server/scripts/importSAMgov.ts <path-to-csv> --dry-run --active-only --state CA
 *
 * Flags:
 *   --dry-run      Parse and report stats but do not write to the database.
 *   --active-only  Only import entities whose Registration Status is "Active".
 *                  Defaults to importing all statuses. Recommended for first runs.
 *   --state <XX>   Filter to a single two-letter US state code (e.g. TX, CA).
 *
 * After importing, rebuild the full-text search index:
 *   npx tsx server/scripts/rebuildFts.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAM.gov Public V3 Extract — relevant columns (pipe-delimited, quoted strings)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The extract uses pipe (|) as the delimiter and double-quotes around fields
 * that contain commas. Column names vary slightly by extract date; this script
 * uses candidate-name matching (same pattern as stateLicenseSync.ts) to
 * handle minor schema drift between monthly releases.
 *
 * Key columns used by this script:
 *   Legal Business Name           → businessName
 *   Physical Address Line 1       → address
 *   Physical Address City         → city
 *   Physical Address Province or State → state
 *   Physical Address Zip Postal Code   → zipCode
 *   Cage Code                     → licenseNumber
 *   NAICS Code(s)                 → used for category resolution + filtering
 *   Registration Status           → used for --active-only filtering
 *   Registration Expiration Date  → licenseExpiry
 *   Correspondence Email          → email (may be absent in Public extract)
 */

import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { randomUUID } from 'crypto';
import { runMigrations, sqlite } from '../db.js';

// ─────────────────────────────────────────────────────────────────────────────
// NAICS construction code ranges
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a NAICS code string to a human-readable contractor category.
 * Returns null if the code is not in any construction range (23xxxx).
 *
 * NAICS construction division breakdown:
 *   236115-236118  Residential building construction
 *   236210-236220  Commercial / industrial building construction
 *   237110-237990  Heavy and civil engineering construction
 *   238110-238990  Specialty trade contractors (electrical, plumbing, roofing …)
 */
function resolveNaicsCategory(naicsCode: string): string | null {
  const code = naicsCode.trim().replace(/\D/g, '');
  if (code.length < 4) return null;

  // All construction NAICS codes start with 23
  if (!code.startsWith('23')) return null;

  const num = parseInt(code.slice(0, 6).padEnd(6, '0'), 10);

  // 236 — Building Construction
  if (num >= 236100 && num <= 236118) return 'Residential Construction';
  if (num >= 236200 && num <= 236299) return 'Commercial Construction';

  // 237 — Heavy / Civil Engineering
  if (num >= 237110 && num <= 237119) return 'Utility Contractor';
  if (num >= 237120 && num <= 237129) return 'Oil & Gas Pipeline Construction';
  if (num >= 237130 && num <= 237139) return 'Power & Communication Line Construction';
  if (num >= 237210 && num <= 237219) return 'Land Subdivision';
  if (num >= 237310 && num <= 237319) return 'Highway Construction';
  if (num >= 237990 && num <= 237999) return 'Heavy Civil Engineering';
  if (num >= 237000 && num <= 237999) return 'Heavy / Civil Construction';

  // 238 — Specialty Trade Contractors
  if (num >= 238110 && num <= 238119) return 'Poured Concrete Foundation';
  if (num >= 238120 && num <= 238129) return 'Structural Steel & Precast Concrete';
  if (num >= 238130 && num <= 238139) return 'Framing Contractor';
  if (num >= 238140 && num <= 238149) return 'Masonry Contractor';
  if (num >= 238150 && num <= 238159) return 'Glass & Glazing Contractor';
  if (num >= 238160 && num <= 238169) return 'Roofing Contractor';
  if (num >= 238170 && num <= 238179) return 'Siding Contractor';
  if (num >= 238190 && num <= 238199) return 'Structural Building Exterior';
  if (num >= 238210 && num <= 238219) return 'Electrical Contractor';
  if (num >= 238220 && num <= 238229) return 'Plumbing & HVAC Contractor';
  if (num >= 238290 && num <= 238299) return 'Other Building Equipment';
  if (num >= 238310 && num <= 238319) return 'Drywall & Insulation';
  if (num >= 238320 && num <= 238329) return 'Painting & Wall Covering';
  if (num >= 238330 && num <= 238339) return 'Flooring Contractor';
  if (num >= 238340 && num <= 238349) return 'Tile & Terrazzo Contractor';
  if (num >= 238350 && num <= 238359) return 'Finish Carpentry';
  if (num >= 238390 && num <= 238399) return 'Other Building Finishing';
  if (num >= 238910 && num <= 238919) return 'Site Preparation Contractor';
  if (num >= 238990 && num <= 238999) return 'Specialty Trade Contractor';
  if (num >= 238000 && num <= 238999) return 'Specialty Trade Contractor';

  return null;
}

/**
 * Given a pipe-separated, potentially multi-value NAICS string from the SAM
 * extract (e.g. "236116~236220~238210" or just "238210"), return the category
 * for the first construction code found, plus whether any construction code
 * was found at all.
 *
 * SAM.gov uses tilde (~) to delimit multiple NAICS codes within a single field.
 */
function resolveSamNaics(rawNaics: string): { category: string; isConstruction: boolean } {
  const codes = rawNaics.split('~').map(s => s.trim()).filter(Boolean);
  for (const code of codes) {
    const cat = resolveNaicsCategory(code);
    if (cat) return { category: cat, isConstruction: true };
  }
  return { category: 'General Contractor', isConstruction: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV column detection  (pipe-delimited; same candidate-name approach as
// stateLicenseSync.ts to handle column name drift across monthly releases)
// ─────────────────────────────────────────────────────────────────────────────

/** Logical field name → list of known SAM.gov column header variants */
const SAM_COLUMN_CANDIDATES: Record<string, string[]> = {
  businessName:    [
    'LEGAL BUSINESS NAME',
    'LEGAL_BUSINESS_NAME',
    'LEGALbusinessname',
    'ENTITY_NAME',
    'ENTITY NAME',
  ],
  address:         [
    'PHYSICAL ADDRESS LINE 1',
    'PHYSICAL_ADDRESS_LINE_1',
    'PHYSICALADDRESSLINE1',
    'ADDRESS LINE 1',
    'ADDRESS_LINE_1',
  ],
  city:            [
    'PHYSICAL ADDRESS CITY',
    'PHYSICAL_ADDRESS_CITY',
    'PHYSICALADDRESSCITY',
    'CITY',
  ],
  state:           [
    'PHYSICAL ADDRESS PROVINCE OR STATE',
    'PHYSICAL_ADDRESS_PROVINCE_OR_STATE',
    'PHYSICALADDRESSPROVINCE_OR_STATE',
    'PHYSICAL ADDRESS STATE',
    'PHYSICAL_ADDRESS_STATE',
    'STATE',
    'STATE/PROVINCE',
  ],
  zipCode:         [
    'PHYSICAL ADDRESS ZIP POSTAL CODE',
    'PHYSICAL_ADDRESS_ZIP_POSTAL_CODE',
    'PHYSICALADDRESSZIPPOSTALCODE',
    'ZIP CODE',
    'ZIP_CODE',
    'ZIP',
    'POSTAL CODE',
  ],
  country:         [
    'PHYSICAL ADDRESS COUNTRY CODE',
    'PHYSICAL_ADDRESS_COUNTRY_CODE',
    'PHYSICALADDRESSCOUNTRYCODE',
    'COUNTRY CODE',
    'COUNTRY',
  ],
  cageCode:        [
    'CAGE CODE',
    'CAGE_CODE',
    'CAGECODE',
    'CAGE',
  ],
  naicsCodes:      [
    'NAICS CODE(S)',
    'NAICS_CODES',
    'NAICSCODES',
    'NAICS CODE',
    'NAICS',
  ],
  registrationStatus: [
    'REGISTRATION STATUS',
    'REGISTRATION_STATUS',
    'REGISTRATIONSTATUS',
    'ENTITY STATUS',
    'STATUS',
  ],
  expirationDate:  [
    'REGISTRATION EXPIRATION DATE',
    'REGISTRATION_EXPIRATION_DATE',
    'REGISTRATIONEXPIRATIONDATE',
    'EXPIRATION DATE',
    'EXPIRATION_DATE',
  ],
  email:           [
    'CORRESPONDENCE EMAIL',
    'CORRESPONDENCE_EMAIL',
    'CORRESPONDENCEEMAIL',
    'EMAIL',
    'EMAIL ADDRESS',
    'CONTACT EMAIL',
  ],
  website:         [
    'ENTITY URL',
    'ENTITY_URL',
    'ENTITYURL',
    'WEBSITE',
    'WEB SITE',
    'WEBSITE URL',
  ],
};

type SamColKey = keyof typeof SAM_COLUMN_CANDIDATES;
type ColMap = Partial<Record<SamColKey, number>>;

/**
 * Parse a single pipe-delimited CSV line respecting double-quoted fields.
 * SAM.gov wraps fields containing pipes in double-quotes; consecutive double-
 * quotes inside a quoted field represent a literal double-quote character.
 */
function parsePipeLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === '|' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detect column positions from the SAM.gov header line.
 * Strips UTF-8 BOM if present (common in Windows-generated CSVs).
 * Returns a map from logical field name → zero-based column index.
 */
function detectColumns(headerLine: string): ColMap {
  const clean = headerLine.replace(/^\uFEFF/, '');
  const headers = parsePipeLine(clean).map(h => h.toUpperCase().replace(/^"|"$/g, ''));

  const colMap: ColMap = {};
  for (const [field, candidates] of Object.entries(SAM_COLUMN_CANDIDATES) as [SamColKey, string[]][]) {
    for (const candidate of candidates) {
      const idx = headers.findIndex(h => h === candidate.toUpperCase());
      if (idx !== -1) {
        colMap[field] = idx;
        break;
      }
    }
  }
  return colMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Record normalization
// ─────────────────────────────────────────────────────────────────────────────

interface SamRecord {
  businessName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  cageCode: string;
  naicsCodes: string;
  registrationStatus: string;
  expirationDate: string;
  email: string;
  website: string;
  // Derived
  category: string;
}

/**
 * Normalize a SAM.gov expiration date.
 * SAM exports use MM/DD/YYYY; convert to ISO YYYY-MM-DD for DB storage.
 */
function normalizeDate(raw: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s || undefined;
}

/**
 * Extract and validate a single SAM row into a SamRecord.
 * Returns null if the row should be skipped (non-construction, non-US, empty name).
 */
function extractRecord(
  cols: string[],
  colMap: ColMap,
  opts: { activeOnly: boolean; stateFilter: string | null },
): SamRecord | null {
  const get = (key: SamColKey): string => {
    const idx = colMap[key];
    return idx !== undefined ? (cols[idx] ?? '').trim() : '';
  };

  const businessName = get('businessName');
  if (!businessName) return null;

  // Only import US entities — international registrants share the same file
  const country = get('country').toUpperCase();
  if (country && country !== 'USA' && country !== 'US' && country !== 'UNITED STATES') return null;

  // Always enforce Active-only: SAM.gov includes expired/inactive entities in
  // the same extract. The requirement is to import Active registrations only.
  // --active-only flag is kept for backwards compatibility but is now a no-op
  // (the filter is always applied regardless).
  const status = get('registrationStatus').toUpperCase();
  if (status !== 'ACTIVE' && status !== 'A') return null;

  // --state filter
  const state = get('state').toUpperCase().trim();
  if (opts.stateFilter && state !== opts.stateFilter) return null;

  // NAICS filter — must have at least one construction code
  const rawNaics = get('naicsCodes');
  const { category, isConstruction } = resolveSamNaics(rawNaics);
  if (!isConstruction) return null;

  return {
    businessName,
    address:            get('address'),
    city:               get('city'),
    state,
    zipCode:            get('zipCode').slice(0, 10), // Keep ZIP+4 for US precision
    country,
    cageCode:           get('cageCode'),
    naicsCodes:         rawNaics,
    registrationStatus: get('registrationStatus'),
    expirationDate:     get('expirationDate'),
    email:              get('email'),
    website:            get('website'),
    category,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Database insertion — prepared statements (lazily initialized once)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two prepared statements:
 *
 *   checkExists  — Look up by CAGE code (our surrogate license number).
 *                  CAGE codes are globally unique, assigned by the US DoD, so
 *                  they make reliable deduplication keys.
 *                  Falls back to businessName + state + zip when no CAGE code.
 *
 *   insert       — INSERT OR IGNORE so concurrent/repeated runs are safe.
 *                  We do not overwrite enriched Yelp/license data; SAM records
 *                  have lower fidelity for phone/website.
 */
let _stmts: {
  checkByCage:    ReturnType<typeof sqlite.prepare>;
  checkByName:    ReturnType<typeof sqlite.prepare>;
  insertOrIgnore: ReturnType<typeof sqlite.prepare>;
} | null = null;

function getStmts() {
  if (_stmts) return _stmts;
  _stmts = {
    // Primary dedup: CAGE code stored in licenseNumber column
    checkByCage: sqlite.prepare(`
      SELECT id FROM companies
      WHERE licenseNumber = @cageCode
        AND licenseNumber IS NOT NULL
        AND licenseNumber != ''
      LIMIT 1
    `),

    // Fallback dedup: exact name + state + 5-digit zip prefix
    checkByName: sqlite.prepare(`
      SELECT id FROM companies
      WHERE UPPER(businessName) = @businessName
        AND UPPER(state) = @state
        AND zipCode LIKE @zipPrefix
      LIMIT 1
    `),

    // Main insert — INSERT OR IGNORE protects against race conditions and
    // re-runs without requiring a pre-check (the DB enforces the PK uniqueness)
    insertOrIgnore: sqlite.prepare(`
      INSERT OR IGNORE INTO companies (
        id, businessName, category, address, city, state, zipCode,
        email, website, licenseNumber, licenseStatus, licenseExpiry,
        verificationStatus, dataSource, lastUpdated
      ) VALUES (
        @id, @businessName, @category, @address, @city, @state, @zipCode,
        @email, @website, @licenseNumber, @licenseStatus, @licenseExpiry,
        @verificationStatus, @dataSource, @lastUpdated
      )
    `),
  };
  return _stmts;
}

type InsertResult = 'inserted' | 'skipped_cage' | 'skipped_name' | 'inserted_no_cage';

function insertRecord(rec: SamRecord, now: string, dryRun: boolean): InsertResult {
  if (dryRun) return 'inserted'; // Dry-run: count as if inserted

  const stmts = getStmts();

  // Dedup pass 1: CAGE code (most reliable — globally unique per entity)
  if (rec.cageCode) {
    const existing = stmts.checkByCage.get({ cageCode: rec.cageCode });
    if (existing) return 'skipped_cage';
  }

  // Dedup pass 2: name + state + zip (catches re-registrations or missing CAGE)
  const zipPrefix = rec.zipCode.slice(0, 5);
  if (zipPrefix.length === 5) {
    const existing = stmts.checkByName.get({
      businessName: rec.businessName.toUpperCase(),
      state:        rec.state.toUpperCase(),
      zipPrefix:    `${zipPrefix}%`,
    });
    if (existing) return 'skipped_name';
  }

  // Normalize registration status → licenseStatus vocabulary used by the app
  const rawStatus = rec.registrationStatus.toUpperCase();
  const licenseStatus =
    rawStatus === 'ACTIVE' || rawStatus === 'A'     ? 'active'  :
    rawStatus === 'EXPIRED' || rawStatus === 'E'    ? 'expired' :
    rawStatus === 'INACTIVE' || rawStatus === 'I'   ? 'inactive' :
    'unknown';

  stmts.insertOrIgnore.run({
    id:                 randomUUID(),
    businessName:       rec.businessName,
    category:           rec.category,
    address:            rec.address  || null,
    city:               rec.city     || null,
    state:              rec.state    || null,
    zipCode:            rec.zipCode  || null,
    email:              rec.email    || null,
    website:            rec.website  || null,
    licenseNumber:      rec.cageCode || null,          // CAGE code as license number
    licenseStatus,
    licenseExpiry:      normalizeDate(rec.expirationDate) ?? null,
    verificationStatus: licenseStatus === 'active' ? 'verified' : 'unverified',
    dataSource:         'sam_gov',
    lastUpdated:        now,
  });

  return rec.cageCode ? 'inserted' : 'inserted_no_cage';
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress reporting
// ─────────────────────────────────────────────────────────────────────────────

interface ImportStats {
  totalLines:       number;
  constructionRows: number;
  inserted:         number;
  skippedDupCage:   number;
  skippedDupName:   number;
  skippedFilter:    number;
  errors:           number;
  durationMs:       number;
}

function printProgress(label: string, stats: ImportStats): void {
  const rate = stats.totalLines > 0
    ? Math.round(stats.totalLines / Math.max(stats.durationMs / 1000, 1)).toLocaleString()
    : '0';
  console.log(
    `[importSAMgov] ${label}: ` +
    `${stats.totalLines.toLocaleString()} lines  |  ` +
    `${stats.constructionRows.toLocaleString()} construction  |  ` +
    `${stats.inserted.toLocaleString()} inserted  |  ` +
    `${(stats.skippedDupCage + stats.skippedDupName).toLocaleString()} dup  |  ` +
    `${rate} rows/s`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main import pipeline
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500; // Rows per SQLite transaction — balances throughput vs lock time

async function runImport(
  csvPath: string,
  opts: { dryRun: boolean; activeOnly: boolean; stateFilter: string | null },
): Promise<ImportStats> {
  const start = Date.now();
  const stats: ImportStats = {
    totalLines:       0,
    constructionRows: 0,
    inserted:         0,
    skippedDupCage:   0,
    skippedDupName:   0,
    skippedFilter:    0,
    errors:           0,
    durationMs:       0,
  };

  if (!fs.existsSync(csvPath)) {
    throw new Error(
      `CSV file not found: ${csvPath}\n` +
      'Download the SAM.gov Public V3 Extract from:\n' +
      '  https://sam.gov/data-services/Entity%20Registrations/Public%20V3%20Extract%20Files\n' +
      'Extract the ZIP and provide the path to the .csv file.',
    );
  }

  const fileSizeMB = (fs.statSync(csvPath).size / 1_048_576).toFixed(0);
  console.log(`[importSAMgov] File: ${csvPath} (${fileSizeMB} MB)`);
  console.log(`[importSAMgov] Mode: ${opts.dryRun ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  if (opts.activeOnly)  console.log('[importSAMgov] Filter: Active registrations only');
  if (opts.stateFilter) console.log(`[importSAMgov] Filter: State = ${opts.stateFilter}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, 'utf-8'),
    crlfDelay: Infinity,
  });

  let colMap: ColMap | null = null;
  let lineNum = 0;

  // Batch buffer: collect records then flush inside a single SQLite transaction
  // for dramatically better write throughput (avoids per-row fsync overhead).
  const batch: SamRecord[] = [];

  function flushBatch(): void {
    if (batch.length === 0) return;
    const now = new Date().toISOString();

    if (!opts.dryRun) {
      const tx = sqlite.transaction((recs: SamRecord[]) => {
        for (const rec of recs) {
          const result = insertRecord(rec, now, false);
          if (result === 'inserted' || result === 'inserted_no_cage') stats.inserted++;
          else if (result === 'skipped_cage')  stats.skippedDupCage++;
          else if (result === 'skipped_name')  stats.skippedDupName++;
        }
      });
      tx(batch);
    } else {
      // Dry-run: just accumulate counts without DB access
      stats.inserted += batch.length;
    }

    batch.length = 0;
  }

  for await (const rawLine of rl) {
    lineNum++;
    stats.totalLines = lineNum - 1; // Exclude header line from count
    stats.durationMs = Date.now() - start;

    // ── Line 1: header — detect column positions ───────────────────────────
    if (lineNum === 1) {
      colMap = detectColumns(rawLine);

      const detected = Object.entries(colMap)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(`[importSAMgov] Columns detected: ${detected || '(none)'}`);

      if (colMap.businessName === undefined) {
        throw new Error(
          'Required column "Legal Business Name" not found in header.\n' +
          `Header sample: ${rawLine.slice(0, 300)}\n` +
          'Verify the file is an unmodified SAM.gov Public V3 Extract.',
        );
      }
      if (colMap.naicsCodes === undefined) {
        console.warn('[importSAMgov] Warning: NAICS code column not detected — all rows will be treated as non-construction and skipped.');
      }
      continue;
    }

    if (!colMap || !rawLine.trim()) continue;

    // ── Data rows ──────────────────────────────────────────────────────────
    try {
      const cols = parsePipeLine(rawLine);
      const rec  = extractRecord(cols, colMap, opts);

      if (!rec) {
        stats.skippedFilter++;
        continue;
      }

      stats.constructionRows++;
      batch.push(rec);
      if (batch.length >= BATCH_SIZE) flushBatch();

      // Progress heartbeat every 5,000 construction records (post-filter),
      // as required by the import spec.
      if (stats.constructionRows % 5_000 === 0) {
        printProgress(`${stats.constructionRows.toLocaleString()} construction records`, stats);
      }
    } catch (err) {
      stats.errors++;
      if (stats.errors <= 5) {
        // Log the first few errors in detail; suppress after that to avoid spam
        console.error(`[importSAMgov] Parse error at line ${lineNum}:`, (err as Error).message);
      }
    }
  }

  // Flush remaining records
  flushBatch();

  stats.durationMs = Date.now() - start;
  stats.totalLines = lineNum - 1; // Final count (minus header)
  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage:
  npx tsx server/scripts/importSAMgov.ts <csv-path> [options]

Arguments:
  csv-path        Path to the extracted SAM.gov Public V3 Extract CSV file.

Options:
  --dry-run       Parse and count matching records without writing to the DB.
  --active-only   Only import entities with Registration Status = "Active".
  --state <XX>    Filter to a single US state code (e.g. TX, CA, FL).
  --help          Show this message.

Download the CSV from:
  https://sam.gov/data-services/Entity%20Registrations/Public%20V3%20Extract%20Files

After importing, rebuild the FTS index:
  npx tsx server/scripts/rebuildFts.ts
`);
  process.exit(0);
}

const csvPath    = args[0];
const dryRun     = args.includes('--dry-run');
const activeOnly = args.includes('--active-only');

const stateIdx   = args.findIndex(a => a === '--state');
const stateFilter: string | null =
  stateIdx !== -1 && args[stateIdx + 1]
    ? args[stateIdx + 1].toUpperCase().trim()
    : null;

// Validate state code if provided
if (stateFilter && !/^[A-Z]{2}$/.test(stateFilter)) {
  console.error(`[importSAMgov] Invalid state code: "${stateFilter}". Must be a 2-letter US state abbreviation (e.g. TX, CA).`);
  process.exit(1);
}

// Ensure DB schema is up to date before writing
if (!dryRun) {
  runMigrations();
}

console.log(`\n${'─'.repeat(70)}`);
console.log(' SAM.gov Construction Contractor Import');
console.log(`${'─'.repeat(70)}\n`);

let stats: ImportStats;
try {
  stats = await runImport(csvPath, { dryRun, activeOnly, stateFilter });
} catch (err) {
  console.error('\n[importSAMgov] Fatal error:', (err as Error).message);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Final summary
// ─────────────────────────────────────────────────────────────────────────────

const mins    = (stats.durationMs / 60_000).toFixed(1);
const rowsPerSec = Math.round(stats.totalLines / Math.max(stats.durationMs / 1000, 1));

console.log(`\n${'═'.repeat(70)}`);
console.log(` Import ${dryRun ? 'dry-run ' : ''}complete — SAM.gov`);
console.log(`${'═'.repeat(70)}`);
console.log(`  Duration          : ${mins} min  (${rowsPerSec.toLocaleString()} rows/s)`);
console.log(`  Total rows scanned: ${stats.totalLines.toLocaleString()}`);
console.log(`  Construction rows : ${stats.constructionRows.toLocaleString()}  (NAICS 23xxxx)`);
console.log(`  Filtered out      : ${stats.skippedFilter.toLocaleString()}  (non-construction / non-US / status)`);
if (dryRun) {
  console.log(`  Would insert      : ${stats.constructionRows.toLocaleString()}  (dry-run — no DB writes)`);
} else {
  console.log(`  Inserted          : ${stats.inserted.toLocaleString()}  (new records)`);
  console.log(`  Skipped (dup CAGE): ${stats.skippedDupCage.toLocaleString()}`);
  console.log(`  Skipped (dup name): ${stats.skippedDupName.toLocaleString()}`);
}
console.log(`  Parse errors      : ${stats.errors}`);

if (!dryRun && stats.inserted > 0) {
  console.log(`\nNext step: npx tsx server/scripts/rebuildFts.ts`);
}
console.log('');
