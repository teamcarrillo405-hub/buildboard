#!/usr/bin/env npx tsx
/**
 * enrichFromSIC.ts — Unified CSV enrichment for all 4 marketing lists.
 *
 * Processes:
 *   1. SIC_Code_1521.csv          (type='sic')
 *   2. hispanic_owners-*.csv      (type='crm')
 *   3. construction_president-*.csv (type='crm')
 *   4. ceo-*.csv                  (type='crm')
 *
 * Algorithm:
 *   Step 1 — Parse all 4 files into a unified company map keyed by normalized domain.
 *            Deduplicate across files (first non-empty value per field wins).
 *   Step 2 — Build DB lookup indexes: phone → id[], normalizedName+state → id[].
 *   Step 3 — Match unified records against existing DB companies and enrich
 *            website (verified live only). Never writes email.
 *   Step 4 — Import unmatched companies as new records (website verified only).
 *
 * CLI flags:
 *   --dry-run      Do not write anything to the DB
 *   --skip-verify  Skip website HTTP verification (for speed testing)
 *
 * Usage:
 *   npx tsx server/scripts/enrichFromSIC.ts
 *   npx tsx server/scripts/enrichFromSIC.ts --dry-run
 *   npx tsx server/scripts/enrichFromSIC.ts --dry-run --skip-verify
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { verifyWebsite, isDirectoryUrl } from '../pipelines/domainUtils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const DB_PATH  = './server/constructflix.db';
const LOGS_DIR = './logs';
const LOG_FILE = path.join(LOGS_DIR, 'enrich_csv_unified.log');

const VERIFY_CONCURRENCY = 20;   // max parallel HTTP verifications
const INSERT_BATCH_SIZE  = 500;  // rows per transaction when importing new records

const DRY_RUN     = process.argv.includes('--dry-run');
const SKIP_VERIFY = process.argv.includes('--skip-verify');

// ─── Source file definitions ──────────────────────────────────────────────────

type SourceType = 'sic' | 'crm';

interface Source {
  label: string;
  path: string;
  type: SourceType;
}

const SOURCES: Source[] = [
  {
    label: 'SIC_1521',
    path: './data/csv_lists/SIC_Code_1521.csv',
    type: 'sic',
  },
  {
    label: 'Hispanic_Owners',
    path: './data/csv_lists/hispanic_owners.csv',
    type: 'crm',
  },
  {
    label: 'Construction_Presidents',
    path: './data/csv_lists/construction_president.csv',
    type: 'crm',
  },
  {
    label: 'CEOs',
    path: './data/csv_lists/ceo.csv',
    type: 'crm',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Unified company record after parsing all CSV sources. */
interface UnifiedCompany {
  companyName: string;
  city: string;
  state: string;
  zip: string;
  /** Digits-only, 10 chars (US). Empty string if unavailable. */
  phoneDigits: string;
  /** Raw website string from CSV, may or may not include protocol. */
  website: string;
  /** Employee count as integer, 0 if unknown. */
  employeeCount: number;
  /** Calendar year the company was founded, 0 if unknown. */
  foundedYear: number;
  /** Which source files contributed to this record. */
  sources: string[];
}

interface DbCompany {
  id: string;
  businessName: string;
  state: string | null;
  phone: string | null;
  website: string | null;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ─── Semaphore ────────────────────────────────────────────────────────────────

class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];

  constructor(concurrency: number) {
    this.slots = concurrency;
  }

  acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--;
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.slots++;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip protocol, www, trailing slash for use as a dedup key. */
function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\/+$/, '');
  return s;
}

/** Return 10-digit US phone string, empty string if not parseable. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return '';
}

/** Format 10-digit string as (xxx) xxx-xxxx. */
function formatPhone(digits: string): string {
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|corp|co|ltd|company|services|group|enterprises|associates)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/** Merge b's non-empty fields into a (a wins for existing non-empty values). */
function mergeInto(a: UnifiedCompany, b: UnifiedCompany): void {
  if (!a.city && b.city)                    a.city = b.city;
  if (!a.zip && b.zip)                      a.zip = b.zip;
  if (!a.phoneDigits && b.phoneDigits)      a.phoneDigits = b.phoneDigits;
  if (!a.website && b.website)              a.website = b.website;
  if (!a.employeeCount && b.employeeCount)  a.employeeCount = b.employeeCount;
  if (!a.foundedYear && b.foundedYear)      a.foundedYear = b.foundedYear;
  for (const s of b.sources) {
    if (!a.sources.includes(s)) a.sources.push(s);
  }
}

/** Parse city and state from a CRM "Company Headquarters" field.
 *  Examples:
 *    "1221 2nd Ave N, Kent, United States"
 *    "Houston, TX, United States"
 *    "Los Angeles, CA, United States"
 */
function parseHeadquarters(hq: string): { city: string; state: string } {
  // Split on comma, trim each part, filter empty
  const parts = hq.split(',').map(p => p.trim()).filter(Boolean);
  // Remove "United States" from the tail
  const filtered = parts.filter(p => p.toLowerCase() !== 'united states');
  if (filtered.length === 0) return { city: '', state: '' };
  if (filtered.length === 1) return { city: filtered[0], state: '' };

  // Last token is typically state abbreviation or full state name
  const state = filtered[filtered.length - 1];
  // Second-to-last is city (might be just the city, or preceded by a street address)
  const city = filtered[filtered.length - 2];

  // If what we think is "city" looks like a street number or very long address, skip it
  // (e.g., "1221 2nd Ave N" — this means the real city is at filtered.length-2 with a street before it)
  // We'll use it regardless; street-as-city is still better than nothing for matching purposes.
  return { city, state };
}

/** Ensure a website URL has a protocol prefix. */
function ensureHttps(url: string): string {
  const s = url.trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return `https://${s}`;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  fields.push(field.trim());
  return fields;
}

function parseHeaders(headerLine: string): Map<string, number> {
  const fields = parseCSVLine(headerLine);
  const map = new Map<string, number>();
  fields.forEach((f, i) => map.set(f.trim(), i));
  return map;
}

function col(fields: string[], headers: Map<string, number>, name: string): string {
  const idx = headers.get(name);
  return idx !== undefined ? (fields[idx] ?? '').trim() : '';
}

// ─── SIC Parser ───────────────────────────────────────────────────────────────
// Columns: Company Name, Address, City, State, Zip, County, Phone,
//          Contact First, Contact Last, Title, Direct Phone, Email, Website,
//          Employee Range, Annual Sales, SIC Code, Industry

function parseSICFile(filePath: string, label: string): {
  records: UnifiedCompany[];
  skipped: number;
} {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headers = parseHeaders(lines[0]);
  const records: UnifiedCompany[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const f = parseCSVLine(line);
    const companyName = col(f, headers, 'Company Name');
    const city        = col(f, headers, 'City');
    const state       = col(f, headers, 'State');
    const zip         = col(f, headers, 'Zip');
    const rawPhone    = col(f, headers, 'Phone');
    const website     = col(f, headers, 'Website');
    // NOTE: Email column intentionally not read — contains executive emails.

    if (!companyName || !state) { skipped++; continue; }

    records.push({
      companyName,
      city,
      state,
      zip,
      phoneDigits: normalizePhone(rawPhone),
      website,
      employeeCount: 0,
      foundedYear: 0,
      sources: [label],
    });
  }

  return { records, skipped };
}

// ─── CRM Parser ───────────────────────────────────────────────────────────────
// Relevant columns: Company Name, Company Domain, Company Website,
//   Company Employee Count, Company Founded, Company Headquarters,
//   Company Industry
// Filter: Company Headquarters contains "United States"
//         Company Industry = "Construction"

function parseCRMFile(filePath: string, label: string): {
  records: UnifiedCompany[];
  skipped: number;
  skippedNonUS: number;
  skippedNonConstruction: number;
} {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headers = parseHeaders(lines[0]);
  const records: UnifiedCompany[] = [];
  let skipped = 0;
  let skippedNonUS = 0;
  let skippedNonConstruction = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const f = parseCSVLine(line);
    const hq       = col(f, headers, 'Company Headquarters');
    const industry = col(f, headers, 'Company Industry');

    // Filter to US-based Construction companies only
    if (!hq.includes('United States')) { skippedNonUS++; continue; }
    if (industry.toLowerCase() !== 'construction') { skippedNonConstruction++; continue; }

    const companyName = col(f, headers, 'Company Name');
    // NOTE: 'Email' column intentionally not read — contains executive personal emails.

    if (!companyName) { skipped++; continue; }

    // Website: prefer Company Website, fallback to Company Domain
    let website = col(f, headers, 'Company Website');
    if (!website) {
      const domain = col(f, headers, 'Company Domain');
      if (domain) website = domain;
    }

    const rawEmployeeCount = col(f, headers, 'Company Employee Count');
    const employeeCount = parseInt(rawEmployeeCount, 10) || 0;

    const rawFounded = col(f, headers, 'Company Founded');
    const foundedYear = parseInt(rawFounded, 10) || 0;

    const { city, state } = parseHeadquarters(hq);
    if (!state) { skipped++; continue; }

    records.push({
      companyName,
      city,
      state,
      zip: '',
      phoneDigits: '',  // CRM files do not have phone numbers
      website,
      employeeCount,
      foundedYear,
      sources: [label],
    });
  }

  return { records, skipped, skippedNonUS, skippedNonConstruction };
}

// ─── Step 1: Parse all files and build unified map ────────────────────────────

interface ParseSummary {
  label: string;
  total: number;
  skipped: number;
  skippedNonUS?: number;
  skippedNonConstruction?: number;
}

function buildUnifiedMap(summaries: ParseSummary[]): Map<string, UnifiedCompany> {
  // Keyed by normalized domain when available, else by normalizedName|state
  const domainMap   = new Map<string, UnifiedCompany>();
  const nameStateMap = new Map<string, UnifiedCompany>();

  function add(record: UnifiedCompany): void {
    const domain = record.website ? normalizeDomain(record.website) : '';
    const nameKey = normalizeCompanyName(record.companyName) + '|' + record.state.toUpperCase();

    // Try to find an existing entry to merge into
    let existing: UnifiedCompany | undefined;

    if (domain) {
      existing = domainMap.get(domain);
      if (existing) {
        mergeInto(existing, record);
        // Also ensure the nameStateMap points to it
        if (!nameStateMap.has(nameKey)) nameStateMap.set(nameKey, existing);
        return;
      }
    }

    existing = nameStateMap.get(nameKey);
    if (existing) {
      mergeInto(existing, record);
      // If we now have a domain, index it
      if (domain && !domainMap.has(domain)) domainMap.set(domain, existing);
      return;
    }

    // Brand new record
    if (domain) domainMap.set(domain, record);
    nameStateMap.set(nameKey, record);
  }

  for (const source of SOURCES) {
    if (!fs.existsSync(source.path)) {
      log(`[PARSE] SKIP ${source.label} — file not found: ${source.path}`);
      summaries.push({ label: source.label, total: 0, skipped: 0 });
      continue;
    }

    log(`[PARSE] Reading ${source.label}...`);

    if (source.type === 'sic') {
      const { records, skipped } = parseSICFile(source.path, source.label);
      for (const r of records) add(r);
      summaries.push({ label: source.label, total: records.length, skipped });
      log(`[PARSE] ${source.label}: ${records.length.toLocaleString()} parsed, ${skipped.toLocaleString()} skipped`);
    } else {
      const { records, skipped, skippedNonUS, skippedNonConstruction } =
        parseCRMFile(source.path, source.label);
      for (const r of records) add(r);
      summaries.push({
        label: source.label, total: records.length, skipped,
        skippedNonUS, skippedNonConstruction,
      });
      log(
        `[PARSE] ${source.label}: ${records.length.toLocaleString()} parsed, ` +
        `${skipped.toLocaleString()} skipped (no name/state), ` +
        `${skippedNonUS?.toLocaleString()} non-US, ` +
        `${skippedNonConstruction?.toLocaleString()} non-Construction`,
      );
    }
  }

  log(
    `[PARSE] Unified map: ${domainMap.size.toLocaleString()} by domain + ` +
    `${nameStateMap.size.toLocaleString()} by name+state ` +
    `(deduped across all sources)`,
  );

  // Return the full unique set via nameStateMap (it holds every record)
  return nameStateMap;
}

// ─── Step 2: Build DB lookup indexes ─────────────────────────────────────────

function buildDbIndexes(db: Database.Database): {
  phoneIndex: Map<string, string[]>;
  nameStateIndex: Map<string, string[]>;
} {
  log('[MATCH] Building DB lookup indexes...');

  const phoneIndex    = new Map<string, string[]>();
  const nameStateIndex = new Map<string, string[]>();

  const rows = db.prepare(
    'SELECT id, businessName, state, phone FROM companies'
  ).all() as Array<{ id: string; businessName: string; state: string | null; phone: string | null }>;

  for (const row of rows) {
    // Phone index
    if (row.phone) {
      const digits = normalizePhone(row.phone);
      if (digits.length === 10) {
        const existing = phoneIndex.get(digits) ?? [];
        existing.push(row.id);
        phoneIndex.set(digits, existing);
      }
    }

    // Name+state index
    if (row.businessName && row.state) {
      const key = normalizeCompanyName(row.businessName) + '|' + row.state.toUpperCase();
      const existing = nameStateIndex.get(key) ?? [];
      existing.push(row.id);
      nameStateIndex.set(key, existing);
    }
  }

  log(`[MATCH] Phone index: ${phoneIndex.size.toLocaleString()} entries`);
  log(`[MATCH] Name+state index: ${nameStateIndex.size.toLocaleString()} entries`);

  return { phoneIndex, nameStateIndex };
}

// ─── Website verification with semaphore ──────────────────────────────────────

interface VerifyResult {
  url: string;
  valid: boolean;
  finalUrl: string;
}

async function verifyWithSemaphore(
  sem: Semaphore,
  url: string,
): Promise<VerifyResult> {
  await sem.acquire();
  try {
    if (isDirectoryUrl(url)) {
      return { url, valid: false, finalUrl: url };
    }
    const result = await verifyWebsite(url);
    return { url, valid: result.valid, finalUrl: result.finalUrl };
  } finally {
    sem.release();
  }
}

async function verifyBatch(
  urls: string[],
  sem: Semaphore,
): Promise<Map<string, VerifyResult>> {
  const results = await Promise.all(urls.map(u => verifyWithSemaphore(sem, u)));
  const map = new Map<string, VerifyResult>();
  for (const r of results) map.set(r.url, r);
  return map;
}

// ─── Step 3 + 4: Match, enrich, import ───────────────────────────────────────

async function run(): Promise<void> {
  const startTime = Date.now();

  log('══════════════════════════════════════════════════════════');
  log('  ConstructFlix — Unified CSV Enrichment');
  log(`  Sources   : ${SOURCES.map(s => s.label).join(', ')}`);
  log(`  DRY_RUN   : ${DRY_RUN}`);
  log(`  SKIP_VERIFY: ${SKIP_VERIFY}`);
  log('══════════════════════════════════════════════════════════');

  // ── Step 1: Parse ──────────────────────────────────────────────────────────
  const parseSummaries: ParseSummary[] = [];
  const unifiedMap = buildUnifiedMap(parseSummaries);
  const allRecords = [...unifiedMap.values()];

  log(`[PARSE] Total unified companies: ${allRecords.length.toLocaleString()}`);

  // ── Step 2: DB indexes ─────────────────────────────────────────────────────
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const { phoneIndex, nameStateIndex } = buildDbIndexes(db);

  // Load current website map so we know which DB records already have one
  const websiteByIdRaw = db.prepare(
    'SELECT id, website FROM companies'
  ).all() as Array<{ id: string; website: string | null }>;
  const websiteById = new Map<string, string | null>(
    websiteByIdRaw.map(r => [r.id, r.website])
  );

  // ── Prepare statements ─────────────────────────────────────────────────────
  const updateWebsite = db.prepare(
    `UPDATE companies SET website = @website, lastUpdated = @lastUpdated WHERE id = @id`
  );

  const insertCompany = db.prepare(`
    INSERT INTO companies
      (id, businessName, category, city, state, zipCode, phone,
       website, yearsInBusiness, dataSource, lastUpdated)
    VALUES
      (@id, @businessName, @category, @city, @state, @zipCode, @phone,
       @website, @yearsInBusiness, @dataSource, @lastUpdated)
  `);

  // ── Step 3 + 4 processing ──────────────────────────────────────────────────

  // Separate matched from unmatched
  interface MatchedEnrich {
    dbId: string;
    websiteRaw: string;
    matchType: 'phone' | 'name';
    label: string;
  }

  interface NewImport {
    record: UnifiedCompany;
    websiteRaw: string;
  }

  const toEnrich: MatchedEnrich[] = [];
  const toImport: NewImport[] = [];

  // Per-source counters (indexed by source label)
  const srcMatchPhone = new Map<string, number>();
  const srcMatchName  = new Map<string, number>();
  const srcNew        = new Map<string, number>();
  for (const s of SOURCES) {
    srcMatchPhone.set(s.label, 0);
    srcMatchName.set(s.label, 0);
    srcNew.set(s.label, 0);
  }

  log('[MATCH] Matching unified records against DB...');

  for (const record of allRecords) {
    const nameKey = normalizeCompanyName(record.companyName) + '|' + record.state.toUpperCase();
    let matchedIds: string[] | undefined;
    let matchType: 'phone' | 'name' | undefined;

    // Strategy 1: Phone match
    if (record.phoneDigits.length === 10) {
      const ids = phoneIndex.get(record.phoneDigits);
      if (ids && ids.length > 0) {
        matchedIds = ids;
        matchType = 'phone';
      }
    }

    // Strategy 2: Name+state fallback
    if (!matchedIds) {
      const ids = nameStateIndex.get(nameKey);
      if (ids && ids.length > 0) {
        matchedIds = ids;
        matchType = 'name';
      }
    }

    const primaryLabel = record.sources[0] ?? 'unknown';

    if (matchedIds && matchType) {
      // Update counter for the primary source
      if (matchType === 'phone') {
        srcMatchPhone.set(primaryLabel, (srcMatchPhone.get(primaryLabel) ?? 0) + 1);
      } else {
        srcMatchName.set(primaryLabel, (srcMatchName.get(primaryLabel) ?? 0) + 1);
      }

      // Enrich each matched DB record that is missing a website
      if (record.website) {
        for (const dbId of matchedIds) {
          const currentWebsite = websiteById.get(dbId);
          if (!currentWebsite) {
            toEnrich.push({
              dbId,
              websiteRaw: record.website,
              matchType,
              label: primaryLabel,
            });
          }
        }
      }
    } else {
      // Unmatched — candidate for import
      if (record.companyName && record.state) {
        srcNew.set(primaryLabel, (srcNew.get(primaryLabel) ?? 0) + 1);
        toImport.push({
          record,
          websiteRaw: record.website,
        });
      }
    }
  }

  log(
    `[MATCH] Matches: ${(toEnrich.length).toLocaleString()} enrichment targets | ` +
    `${toImport.length.toLocaleString()} new records`
  );

  // ── Website verification ───────────────────────────────────────────────────

  const sem = new Semaphore(VERIFY_CONCURRENCY);
  let websitesVerified = 0;
  let websitesFailed = 0;

  // Collect unique URLs to verify (avoid re-verifying the same URL twice)
  const enrichUrls  = [...new Set(toEnrich.map(e => ensureHttps(e.websiteRaw)).filter(Boolean))];
  const importUrls  = [...new Set(toImport.map(t => ensureHttps(t.websiteRaw)).filter(Boolean))];
  const allUrls     = [...new Set([...enrichUrls, ...importUrls])];

  let verifyResultMap = new Map<string, VerifyResult>();

  if (!SKIP_VERIFY && allUrls.length > 0) {
    log(`[VERIFY] Verifying ${allUrls.length.toLocaleString()} unique URLs (concurrency=${VERIFY_CONCURRENCY})...`);
    verifyResultMap = await verifyBatch(allUrls, sem);
    for (const r of verifyResultMap.values()) {
      if (r.valid) websitesVerified++;
      else websitesFailed++;
    }
    log(`[VERIFY] Verified: ${websitesVerified.toLocaleString()} live | Failed: ${websitesFailed.toLocaleString()} dead/unreachable`);
  } else if (SKIP_VERIFY) {
    log('[VERIFY] Skipped (--skip-verify flag)');
    // Mark all as valid so they pass through
    for (const url of allUrls) {
      verifyResultMap.set(url, { url, valid: true, finalUrl: url });
    }
    websitesVerified = allUrls.length;
  }

  function resolveWebsite(raw: string): string {
    if (!raw) return '';
    const url = ensureHttps(raw);
    if (!url) return '';
    if (SKIP_VERIFY) return url;
    const result = verifyResultMap.get(url);
    return result?.valid ? result.finalUrl : '';
  }

  // ── Step 3: Enrich existing records ───────────────────────────────────────
  log('[MATCH] Enriching matched DB records...');

  let enrichedCount = 0;
  const now = new Date().toISOString();

  // Deduplicate: if multiple CSV records matched the same DB id, only enrich once
  const enrichedDbIds = new Set<string>();

  const enrichMany = db.transaction(() => {
    for (const e of toEnrich) {
      if (enrichedDbIds.has(e.dbId)) continue;
      const verifiedUrl = resolveWebsite(e.websiteRaw);
      if (!verifiedUrl) {
        log(`[SKIP] ${e.dbId} — website failed verification: ${e.websiteRaw}`);
        continue;
      }
      enrichedDbIds.add(e.dbId);
      if (!DRY_RUN) {
        updateWebsite.run({ website: verifiedUrl, lastUpdated: now, id: e.dbId });
      }
      enrichedCount++;
      log(`[MATCH] Enriched ${e.dbId} via ${e.matchType}: ${verifiedUrl}`);
    }
  });

  enrichMany();
  log(`[MATCH] Enriched ${enrichedCount.toLocaleString()} existing records with verified websites`);

  // ── Step 4: Import new records ─────────────────────────────────────────────
  log(`[IMPORT] Importing ${toImport.length.toLocaleString()} new companies...`);

  let importedCount = 0;
  let importSkipped = 0;
  const currentYear = new Date().getFullYear();

  // Process in batches
  for (let batchStart = 0; batchStart < toImport.length; batchStart += INSERT_BATCH_SIZE) {
    const batch = toImport.slice(batchStart, batchStart + INSERT_BATCH_SIZE);

    const insertMany = db.transaction(() => {
      for (const { record, websiteRaw } of batch) {
        const verifiedUrl = resolveWebsite(websiteRaw);
        // Still import even without a website if we have name + state
        const phone       = record.phoneDigits ? formatPhone(record.phoneDigits) : null;
        const yearsInBiz  = record.foundedYear > 1800 && record.foundedYear <= currentYear
          ? currentYear - record.foundedYear
          : null;

        if (!DRY_RUN) {
          try {
            insertCompany.run({
              id: crypto.randomUUID(),
              businessName: record.companyName,
              category: 'General Contractor',
              city: record.city || null,
              state: record.state,
              zipCode: record.zip || null,
              phone,
              website: verifiedUrl || null,
              yearsInBusiness: yearsInBiz,
              dataSource: 'CSV-Import',
              lastUpdated: now,
            });
            importedCount++;
          } catch (err: unknown) {
            importSkipped++;
            const msg = err instanceof Error ? err.message : String(err);
            log(`[SKIP] Insert failed for "${record.companyName}" (${record.state}): ${msg}`);
          }
        } else {
          importedCount++;
        }
      }
    });

    insertMany();

    if (batchStart % (INSERT_BATCH_SIZE * 10) === 0 && batchStart > 0) {
      log(`[IMPORT] Progress: ${importedCount.toLocaleString()} / ${toImport.length.toLocaleString()}`);
    }
  }

  db.close();

  // ── Summary ────────────────────────────────────────────────────────────────

  const runtimeSec = ((Date.now() - startTime) / 1000).toFixed(1);

  log('══════════════════════════════════════════════════════════');
  log('  CSV UNIFIED ENRICHMENT — COMPLETE');
  log('');
  log('  Per-source breakdown:');
  for (const s of parseSummaries) {
    const phone = srcMatchPhone.get(s.label) ?? 0;
    const name  = srcMatchName.get(s.label) ?? 0;
    const newR  = srcNew.get(s.label) ?? 0;
    log(`    ${s.label}`);
    log(`      Parsed         : ${s.total.toLocaleString()}`);
    log(`      Skipped        : ${s.skipped.toLocaleString()}`);
    if (s.skippedNonUS !== undefined)
      log(`      Non-US (skip)  : ${s.skippedNonUS.toLocaleString()}`);
    if (s.skippedNonConstruction !== undefined)
      log(`      Non-Construction: ${s.skippedNonConstruction.toLocaleString()}`);
    log(`      Matched phone  : ${phone.toLocaleString()}`);
    log(`      Matched name   : ${name.toLocaleString()}`);
    log(`      New candidates : ${newR.toLocaleString()}`);
  }
  log('');
  log('  Grand totals:');
  const totalPhone = [...srcMatchPhone.values()].reduce((a, b) => a + b, 0);
  const totalName  = [...srcMatchName.values()].reduce((a, b) => a + b, 0);
  log(`  Matched by phone   : ${totalPhone.toLocaleString()}`);
  log(`  Matched by name    : ${totalName.toLocaleString()}`);
  log(`  Total matched      : ${(totalPhone + totalName).toLocaleString()}`);
  log(`  Websites verified  : ${websitesVerified.toLocaleString()}`);
  log(`  Websites failed    : ${websitesFailed.toLocaleString()}`);
  log(`  Records enriched   : ${enrichedCount.toLocaleString()}`);
  log(`  New records imported: ${importedCount.toLocaleString()}`);
  log(`  Import skipped (err): ${importSkipped.toLocaleString()}`);
  log(`  Runtime            : ${runtimeSec}s`);
  log(`  DRY_RUN            : ${DRY_RUN}`);
  log(`  SKIP_VERIFY        : ${SKIP_VERIFY}`);
  log('══════════════════════════════════════════════════════════');
}

run().catch(err => {
  log(`[FATAL] ${(err as Error).message}`);
  process.exit(1);
});
