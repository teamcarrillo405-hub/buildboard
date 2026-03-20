/**
 * importCityPermits.ts — CLI runner for city permit data imports via Socrata SODA API.
 *
 * Fetches contractor records from major city open data portals that expose the
 * Socrata SODA API format, normalizes them to the companies table schema, and
 * inserts new records while skipping duplicates (INSERT OR IGNORE by normalized
 * business name + address).
 *
 * Usage:
 *   npx tsx server/scripts/importCityPermits.ts --city nyc
 *   npx tsx server/scripts/importCityPermits.ts --city chicago
 *   npx tsx server/scripts/importCityPermits.ts --city sf
 *   npx tsx server/scripts/importCityPermits.ts --all
 *   npx tsx server/scripts/importCityPermits.ts --all --dry-run
 *   npx tsx server/scripts/importCityPermits.ts --list
 *
 * After importing, run:
 *   npx tsx server/scripts/rebuildFts.ts
 * to refresh the full-text search index.
 *
 * Socrata SODA API pagination pattern:
 *   https://{domain}/resource/{datasetId}.json?$limit=1000&$offset=N
 *
 * Data sources:
 *   nyc_dob     — NYC DOB Permit Issuance         (data.cityofnewyork.us / ipu4-2q9a)
 *   nyc_now     — NYC DOB NOW Build                (data.cityofnewyork.us / rbx6-tga4)
 *   chicago     — Chicago Building Permits         (data.cityofchicago.org / ydr8-5enu)
 *   sf          — SF Building Permits              (data.sfgov.org / i98e-djp9)
 */

import 'dotenv/config';
import https from 'https';
import http from 'http';
import { randomUUID } from 'crypto';
import { runMigrations, sqlite } from '../db.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw record shape returned by a Socrata SODA API endpoint.
 * All values are strings or undefined — Socrata returns everything as text.
 */
type SodaRecord = Record<string, string | undefined>;

/**
 * Maps a raw SodaRecord to the normalized permit record fields.
 * Return null to skip the record entirely (e.g. no usable business name).
 */
type FieldMapper = (raw: SodaRecord) => NormalizedPermitRecord | null;

/** One configured city/dataset combination. */
interface CityConfig {
  /** Short key used in --city flag and dataSource column, e.g. 'nyc', 'chicago'. */
  cityKey: string;
  /** Human-readable label for log output. */
  label: string;
  /** Socrata open data domain, e.g. 'data.cityofnewyork.us'. */
  domain: string;
  /** Socrata dataset identifier, e.g. 'ipu4-2q9a'. */
  datasetId: string;
  /**
   * Optional $where clause appended to every SODA request to filter to
   * active/recent records only.  Reduces page count and skips closed permits.
   * Leave undefined to fetch all rows.
   *
   * Examples:
   *   "filing_status='ACTIVE'"
   *   "permit_status='ISSUED' AND issue_date>'2020-01-01T00:00:00'"
   */
  whereClause?: string;
  /** Maps one raw SodaRecord from this dataset to a NormalizedPermitRecord. */
  mapRecord: FieldMapper;
}

/** Normalized contractor record extracted from any city permit dataset. */
interface NormalizedPermitRecord {
  businessName: string;
  /** Lowercased, punctuation-stripped name used for dedup matching. */
  normalizedName: string;
  phone?: string;
  address?: string;
  city: string;
  state: string;
  zipCode?: string;
  /** e.g. 'permits_nyc', 'permits_chicago' */
  dataSource: string;
  /** Resolved trade category, e.g. 'Electrical Contractor'. */
  category: string;
}

/** Per-city import statistics. */
export interface CityPermitStats {
  cityKey: string;
  label: string;
  totalFetched: number;
  inserted: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name normalization — same strategy as stateLicenseSync for cross-source dedup
// ─────────────────────────────────────────────────────────────────────────────

const LEGAL_SUFFIXES =
  /[,.\s]+(llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|limited|lp|llp|pllc|plc|pc|pa|dba)\b\s*$/i;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/\s*&\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Category resolution — map work type / permit type strings to trade categories
// ─────────────────────────────────────────────────────────────────────────────

const WORK_TYPE_MAP: Array<[RegExp, string]> = [
  [/elect/i,                   'Electrical Contractor'],
  [/plumb/i,                   'Plumbing Contractor'],
  [/hvac|heat|cool|mechanic/i, 'HVAC Contractor'],
  [/roof/i,                    'Roofing Contractor'],
  [/concrete|mason|brick/i,    'Masonry Contractor'],
  [/demol/i,                   'Demolition Contractor'],
  [/paint/i,                   'Painting Contractor'],
  [/landscape|grading|site/i,  'Landscaping & Site Work'],
  [/sign/i,                    'Sign Contractor'],
  [/elevator/i,                'Elevator Contractor'],
  [/fire|sprinkler/i,          'Fire Protection Contractor'],
  [/solar|photovolt/i,         'Solar Contractor'],
  [/glass|glazing/i,           'Glass & Glazing Contractor'],
  [/steel|struct/i,            'Structural Contractor'],
  [/alteration|new build|general|construction/i, 'General Contractor'],
];

function resolveCategory(workType?: string): string {
  if (!workType) return 'General Contractor';
  for (const [pattern, category] of WORK_TYPE_MAP) {
    if (pattern.test(workType)) return category;
  }
  return 'General Contractor';
}

// ─────────────────────────────────────────────────────────────────────────────
// Field helper — clean and trim a string value from a SodaRecord
// ─────────────────────────────────────────────────────────────────────────────

function field(raw: SodaRecord, key: string): string {
  return (raw[key] ?? '').toString().trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// City configurations
// ─────────────────────────────────────────────────────────────────────────────

const CITY_CONFIGS: CityConfig[] = [
  // ── NYC DOB Permit Issuance ─────────────────────────────────────────────────
  // Dataset: https://data.cityofnewyork.us/resource/ipu4-2q9a.json
  // Contractor fields: owner_s_business_name, owner_s_phone, filing_status,
  //                    job_type, borough, house__, street_name, zip_code
  {
    cityKey: 'nyc',
    label: 'NYC DOB Permit Issuance',
    domain: 'data.cityofnewyork.us',
    datasetId: 'ipu4-2q9a',
    whereClause: "filing_status='ACTIVE'",
    mapRecord(raw): NormalizedPermitRecord | null {
      const businessName = field(raw, 'owner_s_business_name');
      if (!businessName) return null;

      const houseNum  = field(raw, 'house__');
      const streetName = field(raw, 'street_name');
      const address = [houseNum, streetName].filter(Boolean).join(' ') || undefined;

      // Borough → standardized city name
      const boroughRaw = field(raw, 'borough').toUpperCase();
      const borough = (
        boroughRaw === 'MANHATTAN' ? 'New York' :
        boroughRaw === 'BROOKLYN'  ? 'Brooklyn' :
        boroughRaw === 'QUEENS'    ? 'Queens' :
        boroughRaw === 'BRONX'     ? 'Bronx' :
        boroughRaw === 'STATEN ISLAND' ? 'Staten Island' :
        'New York'
      );

      return {
        businessName,
        normalizedName: normalizeName(businessName),
        phone:    field(raw, 'owner_s_phone') || undefined,
        address,
        city:     borough,
        state:    'NY',
        zipCode:  field(raw, 'zip_code')?.slice(0, 5) || undefined,
        dataSource: 'permits_nyc',
        category: resolveCategory(field(raw, 'job_type')),
      };
    },
  },

  // ── NYC DOB NOW Build ───────────────────────────────────────────────────────
  // Dataset: https://data.cityofnewyork.us/resource/rbx6-tga4.json
  // Contractor fields: applicant_business_name, applicant_phone, work_type,
  //                    house_no, street_name, zip_code, borough
  {
    cityKey: 'nyc',
    label: 'NYC DOB NOW Build',
    domain: 'data.cityofnewyork.us',
    datasetId: 'rbx6-tga4',
    // No standard status field — fetch all rows; dedup handles duplicates
    mapRecord(raw): NormalizedPermitRecord | null {
      const businessName = field(raw, 'applicant_business_name');
      if (!businessName) return null;

      const houseNum   = field(raw, 'house_no');
      const streetName = field(raw, 'street_name');
      const address = [houseNum, streetName].filter(Boolean).join(' ') || undefined;

      const boroughRaw = field(raw, 'borough').toUpperCase();
      const borough = (
        boroughRaw === 'MANHATTAN' ? 'New York' :
        boroughRaw === 'BROOKLYN'  ? 'Brooklyn' :
        boroughRaw === 'QUEENS'    ? 'Queens' :
        boroughRaw === 'BRONX'     ? 'Bronx' :
        boroughRaw === 'STATEN ISLAND' ? 'Staten Island' :
        'New York'
      );

      return {
        businessName,
        normalizedName: normalizeName(businessName),
        phone:    field(raw, 'applicant_phone') || undefined,
        address,
        city:     borough,
        state:    'NY',
        zipCode:  field(raw, 'zip_code')?.slice(0, 5) || undefined,
        dataSource: 'permits_nyc',
        category: resolveCategory(field(raw, 'work_type')),
      };
    },
  },

  // ── Chicago Building Permits ────────────────────────────────────────────────
  // Dataset: https://data.cityofchicago.org/resource/ydr8-5enu.json
  // Contractor fields: contractor_name, contractor_phone, work_description,
  //                    street_number, street_direction, street_name, suffix, zip_code
  {
    cityKey: 'chicago',
    label: 'Chicago Building Permits',
    domain: 'data.cityofchicago.org',
    datasetId: 'ydr8-5enu',
    whereClause: "permit_status='ISSUED'",
    mapRecord(raw): NormalizedPermitRecord | null {
      const businessName = field(raw, 'contractor_name');
      if (!businessName) return null;

      // Chicago stores address as separate components
      const streetNum = field(raw, 'street_number');
      const streetDir = field(raw, 'street_direction');
      const streetName = field(raw, 'street_name');
      const suffix    = field(raw, 'suffix');
      const address = [streetNum, streetDir, streetName, suffix]
        .filter(Boolean).join(' ') || undefined;

      return {
        businessName,
        normalizedName: normalizeName(businessName),
        phone:    field(raw, 'contractor_phone') || undefined,
        address,
        city:     'Chicago',
        state:    'IL',
        zipCode:  field(raw, 'zip_code')?.slice(0, 5) || undefined,
        dataSource: 'permits_chicago',
        category: resolveCategory(field(raw, 'work_description')),
      };
    },
  },

  // ── San Francisco Building Permits ──────────────────────────────────────────
  // Dataset: https://data.sfgov.org/resource/i98e-djp9.json
  // Contractor fields: contractor_s_business_name, permit_type_definition,
  //                    description, street_number, street_name, zipcode
  {
    cityKey: 'sf',
    label: 'SF Building Permits',
    domain: 'data.sfgov.org',
    datasetId: 'i98e-djp9',
    whereClause: "status='issued' OR status='complete'",
    mapRecord(raw): NormalizedPermitRecord | null {
      const businessName = field(raw, 'contractor_s_business_name');
      if (!businessName) return null;

      const streetNum  = field(raw, 'street_number');
      const streetName = field(raw, 'street_name');
      const address = [streetNum, streetName].filter(Boolean).join(' ') || undefined;

      const workType = field(raw, 'permit_type_definition') ||
                       field(raw, 'description');

      return {
        businessName,
        normalizedName: normalizeName(businessName),
        address,
        city:      'San Francisco',
        state:     'CA',
        zipCode:   field(raw, 'zipcode')?.slice(0, 5) || undefined,
        dataSource: 'permits_sf',
        category:  resolveCategory(workType),
      };
    },
  },
];

// Build a lookup map by cityKey (multiple configs can share the same key, e.g. nyc_dob + nyc_now)
const CONFIG_BY_KEY = new Map<string, CityConfig[]>();
for (const cfg of CITY_CONFIGS) {
  const existing = CONFIG_BY_KEY.get(cfg.cityKey) ?? [];
  existing.push(cfg);
  CONFIG_BY_KEY.set(cfg.cityKey, existing);
}

// All unique city keys
const ALL_CITY_KEYS = [...CONFIG_BY_KEY.keys()];

// ─────────────────────────────────────────────────────────────────────────────
// Socrata SODA API fetch — paginated JSON rows
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

/** Fetch one page of JSON rows from a Socrata SODA endpoint. */
function fetchSodaPage(
  domain: string,
  datasetId: string,
  offset: number,
  whereClause?: string,
  appToken?: string,
): Promise<SodaRecord[]> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      '$limit':  String(PAGE_SIZE),
      '$offset': String(offset),
    });
    if (whereClause) params.set('$where', whereClause);

    const path = `/resource/${datasetId}.json?${params.toString()}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'ConstructFlix/1.0 (city-permit-importer)',
    };
    // Socrata app tokens raise the rate limit from 1 req/s to 1000 req/s
    if (appToken) headers['X-App-Token'] = appToken;

    const options = {
      hostname: domain,
      path,
      method: 'GET',
      headers,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${domain}${path}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body) as SodaRecord[]);
        } catch (err) {
          reject(new Error(`JSON parse error from ${domain}: ${(err as Error).message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error(`Request timeout fetching ${domain}/resource/${datasetId}.json offset=${offset}`));
    });
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Database — prepared statements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the dedup index exists before running any imports.
 *
 * The INSERT OR IGNORE strategy relies on a UNIQUE constraint over
 * (normalizedName, address, dataSource) — normalized name + address + source
 * is the natural dedup key for permit records (no license number available).
 *
 * The index is partial: only applies to rows with a non-null normalizedName
 * so it does not conflict with existing records from other data sources that
 * may have a NULL or empty normalizedName.
 */
function ensurePermitDedupeIndex(): void {
  try {
    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_permit_dedup
      ON companies (dataSource, normalizedName, COALESCE(address, ''))
      WHERE dataSource LIKE 'permits_%'
        AND normalizedName IS NOT NULL
        AND normalizedName != ''
    `);
  } catch (err) {
    // Non-fatal — index may already exist with a different definition in which
    // case we fall back to the application-level skip check below.
    console.warn('[importCityPermits] Could not create dedup index (non-fatal):', (err as Error).message);
  }
}

// Lazily-initialized prepared statements (compiled once, reused across all rows)
let _stmts: {
  checkExists: ReturnType<typeof sqlite.prepare>;
  insert:      ReturnType<typeof sqlite.prepare>;
} | null = null;

function getStmts() {
  if (_stmts) return _stmts;
  _stmts = {
    // Check if a record with this normalized name + address + dataSource already exists.
    // This is the application-level fallback if the UNIQUE index cannot be created.
    checkExists: sqlite.prepare(`
      SELECT id FROM companies
      WHERE dataSource    = @dataSource
        AND businessName  = @businessName
        AND COALESCE(address, '') = COALESCE(@address, '')
      LIMIT 1
    `),

    // Insert a new permit-sourced contractor record.
    // Uses INSERT OR IGNORE so that if the unique index is in place,
    // duplicate rows are silently dropped without erroring.
    insert: sqlite.prepare(`
      INSERT OR IGNORE INTO companies (
        id, businessName, category, city, state, zipCode, address, phone,
        verificationStatus, dataSource, lastUpdated
      ) VALUES (
        @id, @businessName, @category, @city, @state, @zipCode, @address, @phone,
        'unverified', @dataSource, @lastUpdated
      )
    `),
  };
  return _stmts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-record upsert
// ─────────────────────────────────────────────────────────────────────────────

type InsertResult = 'inserted' | 'skipped';

function insertPermitRecord(rec: NormalizedPermitRecord, dryRun: boolean): InsertResult {
  const stmts = getStmts();

  // Application-level check: skip if an identical record from the same source exists.
  // This handles the case where INSERT OR IGNORE is not backed by the unique index.
  const existing = stmts.checkExists.get({
    dataSource:   rec.dataSource,
    businessName: rec.businessName,
    address:      rec.address ?? null,
  });
  if (existing) return 'skipped';

  if (dryRun) return 'inserted'; // Dry-run: pretend it was inserted

  const result = stmts.insert.run({
    id:           randomUUID(),
    businessName: rec.businessName,
    category:     rec.category,
    city:         rec.city,
    state:        rec.state,
    zipCode:      rec.zipCode  ?? null,
    address:      rec.address  ?? null,
    phone:        rec.phone    ?? null,
    dataSource:   rec.dataSource,
    lastUpdated:  new Date().toISOString(),
  });

  return result.changes > 0 ? 'inserted' : 'skipped';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-dataset import pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function runDatasetImport(
  cfg: CityConfig,
  dryRun: boolean,
  appToken?: string,
): Promise<{ fetched: number; inserted: number; skipped: number; errors: number }> {
  const tag = `[importCityPermits] ${cfg.label}`;
  let offset  = 0;
  let fetched  = 0;
  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;
  let emptyPage = false;

  console.log(`${tag}: starting — dataset ${cfg.datasetId} on ${cfg.domain}`);
  if (cfg.whereClause) console.log(`${tag}: filter: ${cfg.whereClause}`);

  while (!emptyPage) {
    let rows: SodaRecord[];
    try {
      rows = await fetchSodaPage(cfg.domain, cfg.datasetId, offset, cfg.whereClause, appToken);
    } catch (err) {
      console.error(`${tag}: fetch error at offset ${offset}:`, (err as Error).message);
      errors++;
      // Abort on fetch error — avoid infinite retry loops
      break;
    }

    if (rows.length === 0) {
      emptyPage = true;
      break;
    }

    // Wrap each page in a transaction for performance (same pattern as stateLicenseSync)
    const now = new Date().toISOString();
    const tx = sqlite.transaction((batch: SodaRecord[]) => {
      for (const raw of batch) {
        try {
          const rec = cfg.mapRecord(raw);
          if (!rec) { skipped++; continue; }

          // Skip records with no usable business name after normalization
          if (!rec.normalizedName) { skipped++; continue; }

          const result = insertPermitRecord(rec, dryRun);
          if (result === 'inserted') inserted++;
          else skipped++;
        } catch {
          errors++;
        }
      }
    });
    tx(rows);

    fetched += rows.length;
    offset  += rows.length;

    // Progress every 1000 records
    if (fetched % 1000 === 0 || rows.length < PAGE_SIZE) {
      console.log(
        `${tag}: ${fetched.toLocaleString()} fetched — ` +
        `${inserted.toLocaleString()} inserted, ` +
        `${skipped.toLocaleString()} skipped, ` +
        `${errors} errors`,
      );
    }

    // Last page — fewer rows than requested means no more data
    if (rows.length < PAGE_SIZE) emptyPage = true;
  }

  return { fetched, inserted, skipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main city import runner (exported for programmatic use)
// ─────────────────────────────────────────────────────────────────────────────

export async function runCityPermitImport(
  cityKey: string,
  dryRun = false,
  appToken?: string,
): Promise<CityPermitStats> {
  const start   = Date.now();
  const configs = CONFIG_BY_KEY.get(cityKey.toLowerCase());

  if (!configs || configs.length === 0) {
    throw new Error(`Unknown city key: "${cityKey}". Available: ${ALL_CITY_KEYS.join(', ')}`);
  }

  const aggregated: CityPermitStats = {
    cityKey,
    label:        configs.map(c => c.label).join(' + '),
    totalFetched: 0,
    inserted:     0,
    skipped:      0,
    errors:       0,
    durationMs:   0,
  };

  for (const cfg of configs) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${cfg.label}${dryRun ? ' [DRY RUN]' : ''}`);
    console.log(`${'─'.repeat(60)}`);

    const result = await runDatasetImport(cfg, dryRun, appToken);
    aggregated.totalFetched += result.fetched;
    aggregated.inserted     += result.inserted;
    aggregated.skipped      += result.skipped;
    aggregated.errors       += result.errors;
  }

  aggregated.durationMs = Date.now() - start;
  return aggregated;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function printUsage(): void {
  console.log('\nUsage:');
  console.log('  npx tsx server/scripts/importCityPermits.ts --city <key>  # Import one city');
  console.log('  npx tsx server/scripts/importCityPermits.ts --all          # Import all cities');
  console.log('  npx tsx server/scripts/importCityPermits.ts --list         # Show configured cities');
  console.log('\nFlags:');
  console.log('  --dry-run    Parse and count records without writing to DB');
  console.log('\nAvailable city keys:');
  for (const key of ALL_CITY_KEYS) {
    const cfgs  = CONFIG_BY_KEY.get(key)!;
    const label = cfgs.map(c => c.label).join(' + ');
    console.log(`  ${key.padEnd(10)} ${label}`);
  }
  console.log('');
}

if (args.includes('--list') || args.length === 0) {
  printUsage();
  process.exit(0);
}

const dryRun   = args.includes('--dry-run');
const runAll   = args.includes('--all');
const cityIdx  = args.indexOf('--city');
const cityArg  = cityIdx !== -1 ? args[cityIdx + 1]?.toLowerCase() : undefined;

if (!runAll && !cityArg) {
  console.error('Error: provide --city <key> or --all');
  printUsage();
  process.exit(1);
}

if (cityArg && !CONFIG_BY_KEY.has(cityArg)) {
  console.error(`Error: unknown city "${cityArg}"`);
  printUsage();
  process.exit(1);
}

// Optional Socrata app token from environment — raises rate limit significantly.
// Register for free at https://dev.socrata.com/register
const appToken = process.env.SOCRATA_APP_TOKEN;

// Run migrations before any DB operations
runMigrations();

// Ensure the permit deduplication index exists
ensurePermitDedupeIndex();

const cityKeysToRun = runAll ? ALL_CITY_KEYS : [cityArg!];

if (dryRun) console.log('\n[importCityPermits] DRY RUN — no records will be written to the database\n');

const allStats: CityPermitStats[] = [];

for (const key of cityKeysToRun) {
  try {
    const stats = await runCityPermitImport(key, dryRun, appToken);
    allStats.push(stats);

    const mins = (stats.durationMs / 60_000).toFixed(1);
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${stats.label} — done in ${mins}m`);
    console.log(`  Fetched : ${stats.totalFetched.toLocaleString()} records from API`);
    console.log(`  Inserted: ${stats.inserted.toLocaleString()} new companies`);
    console.log(`  Skipped : ${stats.skipped.toLocaleString()} (duplicates or no business name)`);
    console.log(`  Errors  : ${stats.errors}`);
  } catch (err) {
    console.error(`[importCityPermits] ${key} failed:`, err);
  }
}

// Summary table when running multiple cities
if (allStats.length > 1) {
  const total = allStats.reduce(
    (acc, s) => ({
      totalFetched: acc.totalFetched + s.totalFetched,
      inserted:     acc.inserted     + s.inserted,
      skipped:      acc.skipped      + s.skipped,
      errors:       acc.errors       + s.errors,
    }),
    { totalFetched: 0, inserted: 0, skipped: 0, errors: 0 },
  );

  console.log(`\n${'═'.repeat(60)}`);
  console.log(' Import complete — summary');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Cities processed : ${allStats.length}`);
  console.log(`  Total fetched    : ${total.totalFetched.toLocaleString()} API records`);
  console.log(`  Inserted         : ${total.inserted.toLocaleString()} new company records`);
  console.log(`  Skipped          : ${total.skipped.toLocaleString()} duplicates / no name`);
  console.log(`  Errors           : ${total.errors}`);
  console.log(`\nNext step: npx tsx server/scripts/rebuildFts.ts\n`);
}
