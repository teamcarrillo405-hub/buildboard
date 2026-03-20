/**
 * stateLicenseSync.ts — Generic state contractor license importer.
 *
 * Downloads a state agency's bulk CSV and upserts records into the companies
 * table using a two-pass strategy:
 *
 *   Pass 1 — ENRICH:  Find existing Yelp/other records matching this license.
 *                     Merge license fields (number, status, expiry, bond) in.
 *   Pass 2 — IMPORT:  For records with no existing match, insert as new
 *                     companies with dataSource = 'license_{stateCode}'.
 *
 * This means the DB gains both:
 *   - Richer Yelp records (now have verified license data attached), AND
 *   - New records for licensed contractors who have no Yelp presence.
 *
 * Usage:
 *   import { runStateLicenseSync } from './stateLicenseSync.js';
 *   await runStateLicenseSync(STATE_CONFIGS.TX);
 *
 * Or via CLI:
 *   npx tsx server/scripts/importStateData.ts TX
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import readline from 'readline';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { sqlite } from '../db.js';
import { type StateConfig, type ColumnKey, resolveCategory } from '../data/stateLicenseConfigs.js';

// ─────────────────────────────────────────────────────────────────────────────
// Name normalization — determines merge quality between data sources
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a business name for fuzzy matching across data sources.
 *
 * This is the most important function in the pipeline — the quality of
 * your cross-source deduplication (Yelp ↔ state license records) depends
 * entirely on how well this normalization works.
 *
 * TODO: Implement your normalization strategy below.
 *
 * Trade-offs to consider:
 *   - Aggressive (lowercase + strip all suffixes + remove punctuation):
 *       Higher recall (finds more matches), but risks false positives.
 *       "ABC Electric" and "ABC Electric Supply" would both normalize to "abc electric"
 *
 *   - Conservative (only lowercase + collapse whitespace):
 *       Lower recall, but virtually no false positives.
 *
 * Recommended approach: strip common legal suffixes (LLC, Inc, Corp, Co,
 * Ltd, LP, LLP, PLLC, PC, PA, DBA), remove punctuation except spaces,
 * collapse multiple spaces, and lowercase. That covers ~80% of mismatches.
 *
 * Examples:
 *   "ABC PLUMBING LLC"        → "abc plumbing"
 *   "Smith & Sons, Inc."      → "smith sons inc"   ← strip punctuation but keep words
 *   "D&R Electric Co"         → "dr electric"      ← tricky: strip & or keep?
 */
export function normalizeName(name: string): string {
  // Strip trailing legal entity suffixes — these vary across data sources.
  // e.g. Yelp: "ABC Plumbing LLC"  vs. TDLR: "ABC PLUMBING"
  const LEGAL_SUFFIXES =
    /[,.\s]+(llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|limited|lp|llp|pllc|plc|pc|pa|dba)\b\s*$/i;

  return name
    .toLowerCase()
    .trim()
    .replace(LEGAL_SUFFIXES, '')      // "ABC Plumbing LLC"    → "abc plumbing"
    .replace(/\s*&\s*/g, ' ')        // "D&R Electric"         → "d r electric"
    .replace(/[^a-z0-9\s]/g, ' ')   // commas, periods, apostrophes → space
    .replace(/\s+/g, ' ')           // collapse multiple spaces
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Establish a session with the given URL and return the Set-Cookie header
 * values as a single Cookie request-header string.
 *
 * Required for agencies like CSLB (California) that gate CSV downloads behind
 * an ASP.NET anti-CSRF token (__AntiXsrfTokenCSLB) that is set by a GET to
 * the data portal page before the download endpoint will accept requests.
 *
 * Strategy: HTTP GET the sessionUrl, collect every Set-Cookie header from the
 * response, and return them joined as a "name=value; name=value" string ready
 * for use in a Cookie request header.
 */
function fetchSessionCookies(sessionUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const get = sessionUrl.startsWith('https') ? https.get : http.get;
    const reqOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    };
    const req = get(sessionUrl, reqOptions, (res) => {
      // Consume and discard the response body
      res.resume();
      // Collect all Set-Cookie headers
      const setCookieRaw = res.headers['set-cookie'];
      if (!setCookieRaw || setCookieRaw.length === 0) {
        resolve('');
        return;
      }
      // Each Set-Cookie entry looks like: "name=value; Path=/; HttpOnly"
      // We only want the "name=value" part for the Cookie request header.
      const cookiePairs = setCookieRaw
        .map(sc => sc.split(';')[0].trim())
        .filter(Boolean);
      resolve(cookiePairs.join('; '));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`timeout fetching session from ${sessionUrl}`)); });
  });
}

/**
 * Download a remote URL to a temp file, resolving with the local path.
 *
 * Strategy:
 *   1. Try Node.js HTTPS (fast, no subprocess overhead).
 *   2. On 4xx (CDN/Cloudflare block), fall back to curl subprocess.
 *      curl uses the OS TLS stack (Schannel on Windows) which has a different
 *      JA3 fingerprint than Node.js, bypassing government CDN bot-detection.
 */
function downloadToTemp(
  url: string,
  extraHeaders?: Record<string, string>,
  _redirectDepth = 0,
): Promise<string> {
  // Use UUID (not Date.now()) to avoid filename collisions when multiple
  // state imports run in parallel — same millisecond = same path = corrupted data
  const tmpPath = path.join(process.cwd(), '.firecrawl', `state_license_${randomUUID()}.csv`);
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

  return new Promise((resolve, reject) => {
    if (_redirectDepth > 5) { reject(new Error('Too many redirects')); return; }

    const file = fs.createWriteStream(tmpPath);
    const reqOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain,application/octet-stream,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
    };

    const get = url.startsWith('https') ? https.get : http.get;
    get(url, reqOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlinkSync(tmpPath);
        downloadToTemp(res.headers.location as string, extraHeaders, _redirectDepth + 1)
          .then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        file.close(); fs.unlinkSync(tmpPath);
        // CDN/bot protection — fall back to curl which has native OS TLS fingerprint
        console.log(`[stateLicenseSync] Node HTTPS got ${res.statusCode} — retrying with curl...`);
        downloadWithCurl(url, extraHeaders).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(tmpPath)));
    }).on('error', (err) => {
      try { file.close(); fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      // Network error — also try curl
      console.log(`[stateLicenseSync] Node HTTPS error (${err.message}) — retrying with curl...`);
      downloadWithCurl(url, extraHeaders).then(resolve).catch(reject);
    });
  });
}

/** curl-based download for CDN-protected URLs that block Node.js TLS fingerprint. */
function downloadWithCurl(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const tmpPath = path.join(process.cwd(), '.firecrawl', `state_license_${randomUUID()}.csv`);
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });

  const args = [
    '-L',                 // Follow redirects
    '--max-time', '300',  // 5 minute timeout
    '--compressed',       // Accept gzip/brotli
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    '-H', 'Accept: text/csv,text/plain,application/octet-stream,*/*',
    '-H', 'Accept-Language: en-US,en;q=0.9',
  ];

  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      args.push('-H', `${k}: ${v}`);
    }
  }
  args.push('-o', tmpPath, '--', url);

  return new Promise((resolve, reject) => {
    try {
      execFileSync('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const size = fs.statSync(tmpPath).size;
      if (size < 100) {
        fs.unlinkSync(tmpPath);
        reject(new Error(`curl returned tiny file (${size} bytes) for ${url}`));
        return;
      }
      resolve(tmpPath);
    } catch (err: unknown) {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      reject(new Error(`curl failed for ${url}: ${(err as Error).message}`));
    }
  });
}

/**
 * Scrape an HTML listing page to discover a CSV download URL.
 *
 * Fetches `discoveryUrl` as plain text, applies `discoveryPattern` (a regex
 * with one capture group for the filename/path), then constructs the full URL
 * from the origin of `discoveryUrl`.
 *
 * Why this approach: AZ ROC (and similar agencies) publish weekly snapshot
 * CSVs with dates in the filename. Rather than probing dated URLs (which hits
 * CDN anti-leech rules and returns 403 for Range/HEAD requests), we simply
 * fetch the human-readable listing page that already links to the current file.
 */
async function scrapeForUrl(
  discoveryUrl: string,
  discoveryPattern: string,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const html = await new Promise<string>((resolve, reject) => {
    const reqOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        ...extraHeaders,
      },
    };
    const mod = discoveryUrl.startsWith('https') ? https : http;
    let body = '';
    const req = mod.get(discoveryUrl, reqOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy();
        scrapeForUrl(res.headers.location as string, discoveryPattern, extraHeaders)
          .then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching discovery page ${discoveryUrl}`));
        return;
      }
      res.setEncoding('utf-8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout scraping ' + discoveryUrl)); });
  });

  const re = new RegExp(discoveryPattern);
  const m = re.exec(html);
  if (!m) {
    throw new Error(`Pattern /${discoveryPattern}/ not found in ${discoveryUrl}`);
  }
  // m[1] is the captured path/filename; m[0] is the full match
  const captured = m[1] ?? m[0];

  // Build full URL: if captured starts with http it's already absolute.
  // Otherwise prefix with the origin of discoveryUrl.
  if (captured.startsWith('http')) return captured;
  const origin = new URL(discoveryUrl).origin;
  return `${origin}/${captured.replace(/^\//, '')}`;
}

/**
 * Detect column positions from a CSV header line.
 * Returns a map of ColumnKey → column index.
 *
 * Uses parseCsvLine() — not a naive split — so quoted headers that contain
 * commas (e.g. TX TDLR's "BUSINESS CITY, STATE ZIP") are handled correctly.
 */
function detectColumns(
  headerLine: string,
  config: StateConfig,
  delimiter = ',',
): Partial<Record<ColumnKey, number>> {
  // Strip UTF-8 BOM (\uFEFF) — Windows/Socrata CSV exports often prepend this
  // to the first byte of the file, making the first header field invisible-
  // ly different from its candidate string (e.g. '\uFEFFBusinessName' ≠ 'BusinessName').
  const cleanedHeader = headerLine.replace(/^\uFEFF/, '');

  // Use proper CSV parser so quoted headers with commas are a single token
  const headers = parseCsvLine(cleanedHeader, delimiter).map(h => h.toUpperCase());

  const colMap: Partial<Record<ColumnKey, number>> = {};

  for (const [field, candidates] of Object.entries(config.columns) as [ColumnKey, string[]][]) {
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

/** Parse a single CSV line respecting quoted fields. */
function parseCsvLine(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === delimiter && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalized record type (common across all states)
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedLicenseRecord {
  licenseNumber: string;
  businessName: string;
  normalizedName: string;
  dba?: string;
  address?: string;
  city: string;
  stateCode: string;
  zipCode?: string;
  county?: string;
  phone?: string;
  email?: string;
  website?: string;
  licenseType?: string;
  licenseClass?: string;
  status: string;        // 'active' | 'expired' | 'suspended' | 'cancelled'
  issueDate?: string;
  expireDate?: string;
  bondAmount?: number;
  insuranceVerified?: boolean;
  resolvedCategory: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV → NormalizedLicenseRecord
// ─────────────────────────────────────────────────────────────────────────────

function normalizeStatus(raw: string): string {
  const s = raw.toUpperCase().trim();
  if (s.startsWith('ACT') || s === 'A' || s === 'VALID') return 'active';
  if (s.startsWith('EXP') || s === 'E') return 'expired';
  if (s.startsWith('SUS') || s === 'S') return 'suspended';
  if (s.startsWith('CAN') || s === 'C' || s === 'REVOKED') return 'cancelled';
  if (s.startsWith('INACT') || s === 'I') return 'inactive';
  return s.toLowerCase() || 'unknown';
}

function normalizeDate(raw: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  // MM/DD/YYYY → YYYY-MM-DD
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // YYYY-MM-DD (already ISO) — also handles YYYY-MM-DDT00:00:00.000 (SODA API)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // 8-digit compact: distinguish YYYYMMDD vs MMDDYYYY (TX TDLR MMDDCCYY)
  if (/^\d{8}$/.test(s)) {
    const firstFour = parseInt(s.slice(0, 4), 10);
    if (firstFour >= 1900 && firstFour <= 2100) {
      // YYYYMMDD
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    } else {
      // MMDDYYYY (TX TDLR format)
      return `${s.slice(4, 8)}-${s.slice(0, 2)}-${s.slice(2, 4)}`;
    }
  }
  return s || undefined;
}

function extractRecord(
  cols: string[],
  colMap: Partial<Record<ColumnKey, number>>,
  config: StateConfig,
): NormalizedLicenseRecord | null {
  const get = (key: ColumnKey): string => {
    const idx = colMap[key];
    return idx !== undefined ? (cols[idx] ?? '').trim() : '';
  };

  let licenseNumber = get('licenseNumber');
  // Business name: prefer entityname/businessName, fall back to firstName+lastName for individual licensees (CO DORA)
  let businessName = get('businessName') || get('dba');
  if (!businessName) {
    const first = get('firstName');
    const last = get('lastName');
    if (first || last) businessName = [first, last].filter(Boolean).join(' ');
  }
  if (!businessName) return null;

  // Auto-generate a license number from name+zip when no license column exists
  // (e.g. NJ business registrations). Creates a stable, deterministic ID.
  if (!licenseNumber) {
    const zip = get('zipCode') || get('city') || '';
    licenseNumber = `${config.stateCode}-${normalizeName(businessName).replace(/\s+/g, '-').slice(0, 40)}-${zip.slice(0, 5)}`;
  }

  // Skip if licenseTypeFilter is configured and this type isn't in it.
  // Uses substring matching (includes) so "A/C" catches both "A/C Technician"
  // and "A/C Contractor", and "ELECTR" catches Apprentice/Journeyman/Master/etc.
  const rawType = get('licenseType');
  if (config.licenseTypeFilter?.length) {
    const upper = rawType.toUpperCase();
    const match = config.licenseTypeFilter.some(f => upper.includes(f.toUpperCase()));
    if (!match) return null;
  }

  // Resolve city / state / zip — may come from separate columns OR from
  // a combined "BUSINESS CITY, STATE ZIP" field (TX TDLR format: "Austin, TX 78701")
  let city    = get('city');
  let zipCode = get('zipCode')?.slice(0, 5) || undefined;
  let stateFld = get('state');

  const combinedCsz = get('cityStateZip');
  if (combinedCsz) {
    // TX TDLR format: "BULVERDE TX 78163-3132" (no comma, space-separated)
    // Also handles comma variant: "Austin, TX 78701"
    const m = combinedCsz.match(/^(.*?),?\s+([A-Z]{2})\s+(\d{5})/);
    if (m) {
      city     = m[1].trim();
      stateFld = m[2];
      zipCode  = m[3];           // Take first 5 digits only
    } else {
      // Fallback: use the whole thing as city
      city = combinedCsz;
    }
  }

  // Normalize status — TX TDLR has no status column so all exported records are active
  const rawStatus = get('status');
  const status = rawStatus ? normalizeStatus(rawStatus) : 'active';

  return {
    licenseNumber,
    businessName,
    normalizedName: normalizeName(businessName),
    dba: get('dba') || undefined,
    address: get('address') || undefined,
    city,
    stateCode: stateFld || config.stateCode,
    zipCode,
    county: get('county') || undefined,
    phone: get('phone') || undefined,
    email: get('email') || undefined,
    website: get('website') || undefined,
    licenseType: rawType || undefined,
    licenseClass: get('licenseClass') || undefined,
    status,
    issueDate: normalizeDate(get('issueDate')),
    expireDate: normalizeDate(get('expireDate')),
    bondAmount: parseFloat(get('bondAmount')) || undefined,
    insuranceVerified: get('workersComp').toUpperCase() === 'N' ? true : undefined,
    resolvedCategory: resolveCategory(rawType, config),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Database upsert — prepared statements (created once, reused across all rows)
// ─────────────────────────────────────────────────────────────────────────────

const dataSourceId = (stateCode: string) => `license_${stateCode.toLowerCase()}`;

type UpsertResult = 'enriched_yelp' | 'enriched_license' | 'inserted' | 'skipped';

/**
 * Lazily-initialized prepared statements.
 * `better-sqlite3` db.prepare() compiles SQL into a Statement object on every
 * call — it is NOT automatically cached. Calling it inside a 393K-row loop
 * creates 1.57M Statement objects and dominates runtime.
 * We prepare once here and reuse across all records.
 */
let _stmts: {
  updateByLicense: ReturnType<typeof sqlite.prepare>;
  checkExists:     ReturnType<typeof sqlite.prepare>;
  insert:          ReturnType<typeof sqlite.prepare>;
} | null = null;

function getStmts() {
  if (_stmts) return _stmts;
  _stmts = {
    // Pass 1: enrich existing record that already has this licenseNumber
    updateByLicense: sqlite.prepare(`
      UPDATE companies SET
        licenseNumber      = @licenseNumber,
        licenseStatus      = @licenseStatus,
        licenseType        = @licenseType,
        licenseExpiry      = @licenseExpiry,
        bondAmount         = @bondAmount,
        insuranceVerified  = @insuranceVerified,
        verificationStatus = COALESCE(
          CASE WHEN @verificationStatus = 'verified' THEN 'verified' END,
          verificationStatus
        ),
        lastUpdated = @lastUpdated
      WHERE licenseNumber = @licenseNumber
        AND licenseNumber IS NOT NULL
        AND licenseNumber != ''
    `),

    // Pass 2a: skip if this license was already inserted in a prior run
    checkExists: sqlite.prepare(`
      SELECT id FROM companies
      WHERE licenseNumber = @licenseNumber
        AND state = @stateCode
      LIMIT 1
    `),

    // Pass 2b: insert new government-verified record
    insert: sqlite.prepare(`
      INSERT INTO companies (
        id, businessName, category, city, state, zipCode, address, phone,
        licenseNumber, licenseStatus, licenseType, licenseExpiry,
        bondAmount, insuranceVerified, verificationStatus,
        dataSource, lastUpdated
      ) VALUES (
        @id, @businessName, @category, @city, @state, @zipCode, @address, @phone,
        @licenseNumber, @licenseStatus, @licenseType, @licenseExpiry,
        @bondAmount, @insuranceVerified, @verificationStatus,
        @dataSource, @lastUpdated
      )
    `),
  };
  return _stmts;
}

function upsertRecord(
  rec: NormalizedLicenseRecord,
  stateCode: string,
  now: string,  // Pre-computed ISO timestamp (shared across the batch)
): UpsertResult {
  const stmts = getStmts();
  const licenseFields = {
    licenseNumber:     rec.licenseNumber,
    licenseStatus:     rec.status,
    licenseType:       rec.licenseType ?? null,
    licenseExpiry:     rec.expireDate ?? null,
    bondAmount:        rec.bondAmount ?? null,
    insuranceVerified: rec.insuranceVerified ? 1 : 0,
    verificationStatus: rec.status === 'active' ? 'verified' : null,
    lastUpdated: now,
  };

  // ── Pass 1: Enrich existing record matched by license number ─────────────────
  // Uses idx_companies_license_number — O(log N) per query.
  const byLicense = stmts.updateByLicense.run(licenseFields);
  if (byLicense.changes > 0) return 'enriched_license';

  // Pass 1b (byName fuzzy match) is intentionally skipped here:
  //   - It requires a function-based expression (LOWER/REPLACE) that no index can serve
  //   - On 3.5M rows this becomes O(N) = 3.5M comparisons per record × 393K records
  //   - It's also unreliable (high false-positive rate for common company names)
  //   → Run a dedicated enrichment script offline after all license data is loaded.

  // ── Pass 2: No match found — INSERT as new government-verified record ────────
  const existing = stmts.checkExists.get({ licenseNumber: rec.licenseNumber, stateCode });
  if (existing) return 'skipped';

  stmts.insert.run({
    id:                randomUUID(),
    businessName:      rec.businessName,
    category:          rec.resolvedCategory,
    city:              rec.city,
    state:             rec.stateCode,
    zipCode:           rec.zipCode ?? null,
    address:           rec.address ?? null,
    phone:             rec.phone ?? null,
    licenseNumber:     rec.licenseNumber,
    licenseStatus:     rec.status,
    licenseType:       rec.licenseType ?? null,
    licenseExpiry:     rec.expireDate ?? null,
    bondAmount:        rec.bondAmount ?? null,
    insuranceVerified: rec.insuranceVerified ? 1 : 0,
    verificationStatus: rec.status === 'active' ? 'verified' : 'unverified',
    dataSource:        dataSourceId(stateCode),
    lastUpdated:       now,
  });

  return 'inserted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────────

export interface StateSyncStats {
  state: string;
  totalParsed: number;
  inserted: number;
  enrichedYelp: number;
  enrichedLicense: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export async function runStateLicenseSync(config: StateConfig): Promise<StateSyncStats> {
  const start = Date.now();
  const stats: StateSyncStats = {
    state: config.stateCode,
    totalParsed: 0,
    inserted: 0,
    enrichedYelp: 0,
    enrichedLicense: 0,
    skipped: 0,
    errors: 0,
    durationMs: 0,
  };

  if (config.format === 'firecrawl') {
    console.warn(`[stateLicenseSync] ${config.stateCode}: FireCrawl mode — use firecrawlSync.ts instead.`);
    stats.durationMs = Date.now() - start;
    return stats;
  }

  // Resolve the actual download URL:
  //   1. discoveryUrl  → scrape listing page and regex-extract CSV link
  //   2. datedUrlTemplate → walk back through dates (legacy, unused for now)
  //   3. downloadUrl   → use directly
  let resolvedUrl = config.downloadUrl;
  if (config.discoveryUrl && config.discoveryPattern) {
    try {
      console.log(`[stateLicenseSync] ${config.stateCode} (${config.agency}): discovering download URL from ${config.discoveryUrl}...`);
      resolvedUrl = await scrapeForUrl(config.discoveryUrl, config.discoveryPattern, config.httpHeaders);
      console.log(`[stateLicenseSync] ${config.stateCode}: discovered URL: ${resolvedUrl}`);
    } catch (err) {
      console.error(`[stateLicenseSync] ${config.stateCode}: URL discovery failed:`, err);
      stats.errors++;
      stats.durationMs = Date.now() - start;
      return stats;
    }
  }

  // If the agency requires a session cookie before the download will be served
  // (e.g. CSLB's ASP.NET anti-CSRF token), GET the sessionUrl first and attach
  // the resulting cookies to the download request.
  let downloadHeaders = config.httpHeaders;
  if (config.sessionUrl) {
    try {
      console.log(`[stateLicenseSync] ${config.stateCode}: establishing session via ${config.sessionUrl}...`);
      const cookieStr = await fetchSessionCookies(config.sessionUrl);
      if (cookieStr) {
        console.log(`[stateLicenseSync] ${config.stateCode}: session cookies obtained (${cookieStr.split(';').length} cookies)`);
        downloadHeaders = { ...downloadHeaders, 'Cookie': cookieStr };
      } else {
        console.warn(`[stateLicenseSync] ${config.stateCode}: session GET returned no cookies — attempting download anyway`);
      }
    } catch (err) {
      console.error(`[stateLicenseSync] ${config.stateCode}: session setup failed:`, err);
      stats.errors++;
      stats.durationMs = Date.now() - start;
      return stats;
    }
  }

  console.log(`[stateLicenseSync] ${config.stateCode} (${config.agency}): downloading...`);
  console.log(`  URL: ${resolvedUrl}`);
  console.log(`  Est. records: ${config.estimatedRecords.toLocaleString()}`);

  // Download CSV (and any additionalUrls)
  let tmpPath: string;
  try {
    tmpPath = await downloadToTemp(resolvedUrl, downloadHeaders);
    const sizeMB = (fs.statSync(tmpPath).size / 1_048_576).toFixed(1);
    console.log(`[stateLicenseSync] ${config.stateCode}: downloaded ${sizeMB} MB → ${tmpPath}`);

    // Append additional URL files (skip their header rows)
    if (config.additionalUrls?.length) {
      for (const extraUrl of config.additionalUrls) {
        try {
          const extraPath = await downloadToTemp(extraUrl, downloadHeaders);
          const extraSize = (fs.statSync(extraPath).size / 1_048_576).toFixed(1);
          console.log(`[stateLicenseSync] ${config.stateCode}: downloaded extra ${extraSize} MB → ${extraPath}`);
          // Read extra file, skip header (first line), append to main file
          const extraContent = fs.readFileSync(extraPath, config.encoding ?? 'utf-8');
          const lines = extraContent.split(/\r?\n/);
          // Skip first line (header), append rest
          const body = lines.slice(1).join('\n');
          fs.appendFileSync(tmpPath, '\n' + body);
          fs.unlinkSync(extraPath);
        } catch (err) {
          console.warn(`[stateLicenseSync] ${config.stateCode}: extra URL failed: ${extraUrl}`, err);
        }
      }
      const totalSize = (fs.statSync(tmpPath).size / 1_048_576).toFixed(1);
      console.log(`[stateLicenseSync] ${config.stateCode}: combined file ${totalSize} MB (${1 + config.additionalUrls.length} files)`);
    }
  } catch (err) {
    console.error(`[stateLicenseSync] ${config.stateCode}: download failed:`, err);
    stats.errors++;
    stats.durationMs = Date.now() - start;
    return stats;
  }

  // Stream parse and upsert
  const delimiter = config.delimiter ?? ',';
  const rl = readline.createInterface({
    input: fs.createReadStream(tmpPath, config.encoding ?? 'utf-8'),
    crlfDelay: Infinity,
  });

  let colMap: Partial<Record<ColumnKey, number>> | null = null;
  let lineNum = 0;
  const skipRows = config.skipRows ?? 0;

  // Wrap all upserts in a transaction per 1000 rows for performance
  const BATCH = 1000;
  const batch: NormalizedLicenseRecord[] = [];

  function flushBatch() {
    const now = new Date().toISOString();  // One timestamp per batch (not per row)
    const tx = sqlite.transaction((recs: NormalizedLicenseRecord[]) => {
      for (const rec of recs) {
        const result = upsertRecord(rec, config.stateCode, now);
        if (result === 'inserted') stats.inserted++;
        else if (result === 'enriched_yelp') stats.enrichedYelp++;
        else if (result === 'enriched_license') stats.enrichedLicense++;
        else stats.skipped++;
      }
    });
    tx(batch);
    batch.length = 0;
  }

  // If the file has no header row, use the synthetic headerOverride for column detection
  // before entering the line loop, so every file line is treated as data.
  if (config.headerOverride && !colMap) {
    colMap = detectColumns(config.headerOverride, config, delimiter);
    const detected = Object.keys(colMap).join(', ');
    console.log(`[stateLicenseSync] ${config.stateCode}: columns detected (headerOverride) → ${detected}`);
    if (colMap.businessName === undefined && colMap.firstName === undefined && colMap.lastName === undefined) {
      console.error(`[stateLicenseSync] ${config.stateCode}: required column (businessName or firstName/lastName) not found in headerOverride`);
      stats.errors++;
      stats.durationMs = Date.now() - start;
      return stats;
    }
    if (colMap.licenseNumber === undefined) {
      console.log(`[stateLicenseSync] ${config.stateCode}: no licenseNumber column — will auto-generate from name+zip`);
    }
  }

  for await (const line of rl) {
    lineNum++;

    // Skip leading rows before the header
    if (lineNum <= skipRows) continue;

    // Header row detection (skip if headerOverride already set colMap)
    if (lineNum === skipRows + 1 && !config.headerOverride) {
      colMap = detectColumns(line, config, delimiter);
      const detected = Object.keys(colMap).join(', ');
      console.log(`[stateLicenseSync] ${config.stateCode}: columns detected → ${detected}`);
      // Use explicit undefined check — index 0 is falsy but valid!
      // Accept firstName+lastName as alternative to businessName (VT, CO individual licensees)
      if (colMap.businessName === undefined && colMap.firstName === undefined && colMap.lastName === undefined) {
        console.error(`[stateLicenseSync] ${config.stateCode}: required column (businessName or firstName/lastName) not found. Header: ${line.slice(0, 200)}`);
        stats.errors++;
        break;
      }
      if (colMap.licenseNumber === undefined) {
        console.log(`[stateLicenseSync] ${config.stateCode}: no licenseNumber column — will auto-generate from name+zip`);
      }
      continue;
    }

    if (!colMap || !line.trim()) continue;

    try {
      const cols = parseCsvLine(line, delimiter);
      const rec = extractRecord(cols, colMap, config);
      if (!rec) { stats.skipped++; continue; }

      stats.totalParsed++;
      batch.push(rec);
      if (batch.length >= BATCH) flushBatch();

      if (stats.totalParsed % 10_000 === 0) {
        console.log(`[stateLicenseSync] ${config.stateCode}: ${stats.totalParsed.toLocaleString()} parsed — ${stats.inserted} inserted, ${stats.enrichedYelp + stats.enrichedLicense} enriched`);
      }
    } catch {
      stats.errors++;
    }
  }

  if (batch.length > 0) flushBatch();

  // Clean up temp file
  try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

  stats.durationMs = Date.now() - start;
  const mins = (stats.durationMs / 60_000).toFixed(1);
  console.log(`[stateLicenseSync] ${config.stateCode}: done in ${mins}m`);
  console.log(`  Parsed  : ${stats.totalParsed.toLocaleString()}`);
  console.log(`  Inserted: ${stats.inserted.toLocaleString()} (new gov-verified records)`);
  console.log(`  Enriched: ${(stats.enrichedYelp + stats.enrichedLicense).toLocaleString()} (${stats.enrichedYelp} Yelp + ${stats.enrichedLicense} license matches)`);
  console.log(`  Skipped : ${stats.skipped.toLocaleString()}`);
  console.log(`  Errors  : ${stats.errors}`);

  return stats;
}
