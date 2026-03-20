#!/usr/bin/env npx tsx
/**
 * enrichFromSICBatch.ts — Resumable, crash-safe version of enrichFromSIC.
 *
 * Runs in 3 phases, each resumable from a checkpoint:
 *   Phase 1 (parse)   — Parse all 4 CSVs, match against DB, save work queues to disk.
 *   Phase 2 (enrich)  — Verify URLs + update existing DB records. Batches of 500.
 *   Phase 3 (import)  — Verify URLs + insert new records. Batches of 500.
 *
 * Progress is saved every 5 minutes (and after every batch).
 * Safe to kill and re-run at any time — resumes from last checkpoint.
 *
 * Files written to ./logs/:
 *   enrich_sic_progress.json       — phase + offsets (checkpoint)
 *   enrich_sic_queue_enrich.json   — enrichment work queue (created in phase 1)
 *   enrich_sic_queue_import.json   — import work queue (created in phase 1)
 *   enrich_sic_batch.log           — full log
 *
 * Usage:
 *   npx tsx server/scripts/enrichFromSICBatch.ts
 *   npx tsx server/scripts/enrichFromSICBatch.ts --reset   (start over)
 *   npx tsx server/scripts/enrichFromSICBatch.ts --dry-run
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { verifyWebsite, isDirectoryUrl } from '../pipelines/domainUtils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const DB_PATH        = './server/constructflix.db';
const LOGS_DIR       = './logs';
const PROGRESS_FILE  = path.join(LOGS_DIR, 'enrich_sic_progress.json');
const QUEUE_ENRICH   = path.join(LOGS_DIR, 'enrich_sic_queue_enrich.json');
const QUEUE_IMPORT   = path.join(LOGS_DIR, 'enrich_sic_queue_import.json');
const LOG_FILE       = path.join(LOGS_DIR, 'enrich_sic_batch.log');

const BATCH_SIZE         = 500;              // records per DB write transaction
const VERIFY_CONCURRENCY = 15;              // parallel HTTP checks
const SAVE_EVERY_MS      = 5 * 60 * 1000;  // checkpoint every 5 minutes

const DRY_RUN = process.argv.includes('--dry-run');
const RESET   = process.argv.includes('--reset');

// ─── Source file definitions ──────────────────────────────────────────────────

type SourceType = 'sic' | 'crm';

interface Source {
  label: string;
  path: string;
  type: SourceType;
}

const SOURCES: Source[] = [
  { label: 'SIC_1521',               path: './data/csv_lists/SIC_Code_1521.csv',          type: 'sic' },
  { label: 'Hispanic_Owners',         path: './data/csv_lists/hispanic_owners.csv',        type: 'crm' },
  { label: 'Construction_Presidents', path: './data/csv_lists/construction_president.csv', type: 'crm' },
  { label: 'CEOs',                    path: './data/csv_lists/ceo.csv',                    type: 'crm' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnifiedCompany {
  companyName: string;
  city: string;
  state: string;
  zip: string;
  phoneDigits: string;
  website: string;
  employeeCount: number;
  foundedYear: number;
  sources: string[];
}

/** Serializable enrichment task */
interface EnrichTask {
  dbId: string;
  websiteRaw: string;
  matchType: 'phone' | 'name';
  label: string;
}

/** Serializable import task */
interface ImportTask {
  companyName: string;
  city: string;
  state: string;
  zip: string;
  phoneDigits: string;
  websiteRaw: string;
  employeeCount: number;
  foundedYear: number;
  sources: string[];
}

type Phase = 'parse' | 'enrich' | 'import' | 'done';

interface Progress {
  phase: Phase;
  enrichOffset: number;
  importOffset: number;
  enrichedCount: number;
  importedCount: number;
  importSkipped: number;
  startedAt: string;
  lastSavedAt: string;
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

// ─── Progress helpers ─────────────────────────────────────────────────────────

function loadProgress(): Progress | null {
  if (!fs.existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) as Progress;
  } catch {
    return null;
  }
}

function saveProgress(p: Progress): void {
  p.lastSavedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function loadQueue<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T[];
}

// ─── Semaphore ────────────────────────────────────────────────────────────────

class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];
  constructor(n: number) { this.slots = n; }
  acquire(): Promise<void> {
    if (this.slots > 0) { this.slots--; return Promise.resolve(); }
    return new Promise(r => this.queue.push(r));
  }
  release(): void {
    const next = this.queue.shift();
    if (next) next(); else this.slots++;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\/+$/, '');
  return s;
}

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  if (d.length === 10) return d;
  return '';
}

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

function ensureHttps(url: string): string {
  const s = url.trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return `https://${s}`;
}

function mergeInto(a: UnifiedCompany, b: UnifiedCompany): void {
  if (!a.city && b.city)               a.city = b.city;
  if (!a.zip && b.zip)                 a.zip = b.zip;
  if (!a.phoneDigits && b.phoneDigits) a.phoneDigits = b.phoneDigits;
  if (!a.website && b.website)         a.website = b.website;
  if (!a.employeeCount && b.employeeCount) a.employeeCount = b.employeeCount;
  if (!a.foundedYear && b.foundedYear) a.foundedYear = b.foundedYear;
  for (const s of b.sources) if (!a.sources.includes(s)) a.sources.push(s);
}

function parseHeadquarters(hq: string): { city: string; state: string } {
  const parts = hq.split(',').map(p => p.trim()).filter(Boolean);
  const filtered = parts.filter(p => p.toLowerCase() !== 'united states');
  if (filtered.length === 0) return { city: '', state: '' };
  if (filtered.length === 1) return { city: filtered[0], state: '' };
  return { city: filtered[filtered.length - 2], state: filtered[filtered.length - 1] };
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

function parseHeaders(line: string): Map<string, number> {
  const map = new Map<string, number>();
  parseCSVLine(line).forEach((f, i) => map.set(f.trim(), i));
  return map;
}

function col(fields: string[], headers: Map<string, number>, name: string): string {
  const idx = headers.get(name);
  return idx !== undefined ? (fields[idx] ?? '').trim() : '';
}

// ─── Phase 1: Parse all CSVs + match against DB ───────────────────────────────

function parseSIC(filePath: string, label: string): UnifiedCompany[] {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const headers = parseHeaders(lines[0]);
  const records: UnifiedCompany[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = parseCSVLine(lines[i]);
    const companyName = col(f, headers, 'Company Name');
    const state       = col(f, headers, 'State');
    if (!companyName || !state) { skipped++; continue; }
    records.push({
      companyName,
      city: col(f, headers, 'City'),
      state,
      zip: col(f, headers, 'Zip'),
      phoneDigits: normalizePhone(col(f, headers, 'Phone')),
      website: col(f, headers, 'Website'),
      employeeCount: 0,
      foundedYear: 0,
      sources: [label],
    });
  }
  log(`[PARSE] ${label}: ${records.length.toLocaleString()} records (${skipped} skipped)`);
  return records;
}

function parseCRM(filePath: string, label: string): UnifiedCompany[] {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const headers = parseHeaders(lines[0]);
  const records: UnifiedCompany[] = [];
  let skippedNonUS = 0, skippedNonConst = 0, skippedNoName = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const f = parseCSVLine(lines[i]);
    const hq       = col(f, headers, 'Company Headquarters');
    const industry = col(f, headers, 'Company Industry');
    if (!hq.includes('United States')) { skippedNonUS++; continue; }
    if (industry.toLowerCase() !== 'construction') { skippedNonConst++; continue; }
    const companyName = col(f, headers, 'Company Name');
    if (!companyName) { skippedNoName++; continue; }
    let website = col(f, headers, 'Company Website') || col(f, headers, 'Company Domain');
    const { city, state } = parseHeadquarters(hq);
    if (!state) { skippedNoName++; continue; }
    records.push({
      companyName, city, state, zip: '',
      phoneDigits: '',
      website,
      employeeCount: parseInt(col(f, headers, 'Company Employee Count'), 10) || 0,
      foundedYear:   parseInt(col(f, headers, 'Company Founded'), 10) || 0,
      sources: [label],
    });
  }
  log(`[PARSE] ${label}: ${records.length.toLocaleString()} records (nonUS=${skippedNonUS}, nonConst=${skippedNonConst}, noName=${skippedNoName})`);
  return records;
}

function buildUnifiedMap(): Map<string, UnifiedCompany> {
  const domainMap    = new Map<string, UnifiedCompany>();
  const nameStateMap = new Map<string, UnifiedCompany>();

  function add(record: UnifiedCompany): void {
    const domain  = record.website ? normalizeDomain(record.website) : '';
    const nameKey = normalizeCompanyName(record.companyName) + '|' + record.state.toUpperCase();
    let existing: UnifiedCompany | undefined;
    if (domain) {
      existing = domainMap.get(domain);
      if (existing) { mergeInto(existing, record); if (!nameStateMap.has(nameKey)) nameStateMap.set(nameKey, existing); return; }
    }
    existing = nameStateMap.get(nameKey);
    if (existing) { mergeInto(existing, record); if (domain && !domainMap.has(domain)) domainMap.set(domain, existing); return; }
    if (domain) domainMap.set(domain, record);
    nameStateMap.set(nameKey, record);
  }

  for (const src of SOURCES) {
    if (!fs.existsSync(src.path)) { log(`[PARSE] SKIP ${src.label} — not found`); continue; }
    const records = src.type === 'sic' ? parseSIC(src.path, src.label) : parseCRM(src.path, src.label);
    for (const r of records) add(r);
  }

  log(`[PARSE] Unified map: ${nameStateMap.size.toLocaleString()} unique companies`);
  return nameStateMap;
}

function runParsePhase(): { toEnrich: EnrichTask[]; toImport: ImportTask[] } {
  log('[PHASE 1] Parsing CSVs...');
  const unifiedMap = buildUnifiedMap();
  const allRecords = Array.from(unifiedMap.values());

  log('[PHASE 1] Building DB lookup indexes...');
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');

  const phoneIndex    = new Map<string, string[]>();
  const nameStateIndex = new Map<string, string[]>();
  const websiteById   = new Map<string, string | null>();

  const rows = db.prepare('SELECT id, businessName, state, phone, website FROM companies').all() as Array<{
    id: string; businessName: string; state: string | null; phone: string | null; website: string | null;
  }>;

  for (const row of rows) {
    if (row.phone) {
      const d = normalizePhone(row.phone);
      if (d.length === 10) {
        const arr = phoneIndex.get(d) ?? [];
        arr.push(row.id);
        phoneIndex.set(d, arr);
      }
    }
    if (row.businessName && row.state) {
      const key = normalizeCompanyName(row.businessName) + '|' + row.state.toUpperCase();
      const arr = nameStateIndex.get(key) ?? [];
      arr.push(row.id);
      nameStateIndex.set(key, arr);
    }
    websiteById.set(row.id, row.website);
  }
  db.close();

  log(`[PHASE 1] Phone index: ${phoneIndex.size.toLocaleString()}, Name index: ${nameStateIndex.size.toLocaleString()}`);
  log('[PHASE 1] Matching...');

  const toEnrich: EnrichTask[] = [];
  const toImport: ImportTask[] = [];
  const enrichedDbIds = new Set<string>();

  for (const record of allRecords) {
    const nameKey = normalizeCompanyName(record.companyName) + '|' + record.state.toUpperCase();
    let matchedIds: string[] | undefined;
    let matchType: 'phone' | 'name' | undefined;

    if (record.phoneDigits.length === 10) {
      const ids = phoneIndex.get(record.phoneDigits);
      if (ids?.length) { matchedIds = ids; matchType = 'phone'; }
    }
    if (!matchedIds) {
      const ids = nameStateIndex.get(nameKey);
      if (ids?.length) { matchedIds = ids; matchType = 'name'; }
    }

    if (matchedIds && matchType && record.website) {
      for (const dbId of matchedIds) {
        if (!websiteById.get(dbId) && !enrichedDbIds.has(dbId)) {
          enrichedDbIds.add(dbId);
          toEnrich.push({ dbId, websiteRaw: record.website, matchType, label: record.sources[0] ?? 'unknown' });
        }
      }
    } else if (!matchedIds && record.companyName && record.state) {
      toImport.push({
        companyName: record.companyName,
        city: record.city,
        state: record.state,
        zip: record.zip,
        phoneDigits: record.phoneDigits,
        websiteRaw: record.website,
        employeeCount: record.employeeCount,
        foundedYear: record.foundedYear,
        sources: record.sources,
      });
    }
  }

  log(`[PHASE 1] Enrich queue: ${toEnrich.length.toLocaleString()} | Import queue: ${toImport.length.toLocaleString()}`);
  log('[PHASE 1] Saving work queues to disk...');
  fs.writeFileSync(QUEUE_ENRICH, JSON.stringify(toEnrich));
  fs.writeFileSync(QUEUE_IMPORT, JSON.stringify(toImport));
  log('[PHASE 1] Queues saved. Phase 1 complete.');

  return { toEnrich, toImport };
}

// ─── URL verification ─────────────────────────────────────────────────────────

async function verifyUrl(url: string, sem: Semaphore): Promise<string> {
  await sem.acquire();
  try {
    if (isDirectoryUrl(url)) return '';
    const result = await verifyWebsite(url);
    return result.valid ? result.finalUrl : '';
  } catch {
    return '';
  } finally {
    sem.release();
  }
}

/** Verify a batch of raw URL strings, return map raw→verified (or '') */
async function verifyBatch(rawUrls: string[], sem: Semaphore): Promise<Map<string, string>> {
  const unique = Array.from(new Set(rawUrls.map(ensureHttps).filter(Boolean)));
  const results = await Promise.all(unique.map(u => verifyUrl(u, sem).then(v => ({ u, v }))));
  const map = new Map<string, string>();
  for (const { u, v } of results) map.set(u, v);
  return map;
}

// ─── Phase 2: Enrich existing records ────────────────────────────────────────

async function runEnrichPhase(progress: Progress): Promise<void> {
  log(`[PHASE 2] Loading enrich queue from disk...`);
  const queue = loadQueue<EnrichTask>(QUEUE_ENRICH);
  log(`[PHASE 2] ${queue.length.toLocaleString()} tasks, resuming at offset ${progress.enrichOffset.toLocaleString()}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const updateWebsite = db.prepare(
    `UPDATE companies SET website = @website, lastUpdated = @lastUpdated WHERE id = @id`
  );

  const sem = new Semaphore(VERIFY_CONCURRENCY);
  let lastSave = Date.now();

  for (let i = progress.enrichOffset; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    const rawUrls = batch.map(t => t.websiteRaw);

    log(`[PHASE 2] Verifying batch ${i}–${Math.min(i + BATCH_SIZE, queue.length)} of ${queue.length}...`);
    const verMap = await verifyBatch(rawUrls, sem);

    const now = new Date().toISOString();
    const insertBatch = db.transaction(() => {
      for (const task of batch) {
        const url = verMap.get(ensureHttps(task.websiteRaw)) ?? '';
        if (!url) continue;
        if (!DRY_RUN) updateWebsite.run({ website: url, lastUpdated: now, id: task.dbId });
        progress.enrichedCount++;
      }
    });
    insertBatch();

    progress.enrichOffset = i + batch.length;

    // Save progress every 5 minutes or every batch
    if (Date.now() - lastSave >= SAVE_EVERY_MS || progress.enrichOffset >= queue.length) {
      saveProgress(progress);
      log(`[PHASE 2] Checkpoint saved — enriched ${progress.enrichedCount.toLocaleString()} so far`);
      lastSave = Date.now();
    }
  }

  db.close();
  progress.phase = 'import';
  progress.importOffset = 0;
  saveProgress(progress);
  log(`[PHASE 2] Complete. Total enriched: ${progress.enrichedCount.toLocaleString()}`);
}

// ─── Phase 3: Import new records ─────────────────────────────────────────────

async function runImportPhase(progress: Progress): Promise<void> {
  log(`[PHASE 3] Loading import queue from disk...`);
  const queue = loadQueue<ImportTask>(QUEUE_IMPORT);
  log(`[PHASE 3] ${queue.length.toLocaleString()} tasks, resuming at offset ${progress.importOffset.toLocaleString()}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const insertCompany = db.prepare(`
    INSERT INTO companies
      (id, businessName, category, city, state, zipCode, phone,
       website, yearsInBusiness, dataSource, lastUpdated)
    VALUES
      (@id, @businessName, @category, @city, @state, @zipCode, @phone,
       @website, @yearsInBusiness, @dataSource, @lastUpdated)
  `);

  const sem = new Semaphore(VERIFY_CONCURRENCY);
  const currentYear = new Date().getFullYear();
  let lastSave = Date.now();

  for (let i = progress.importOffset; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    const rawUrls = batch.map(t => t.websiteRaw).filter(Boolean);

    log(`[PHASE 3] Verifying batch ${i}–${Math.min(i + BATCH_SIZE, queue.length)} of ${queue.length}...`);
    const verMap = rawUrls.length > 0 ? await verifyBatch(rawUrls, sem) : new Map<string, string>();

    const now = new Date().toISOString();
    const insertBatch = db.transaction(() => {
      for (const task of batch) {
        const verifiedUrl = task.websiteRaw
          ? (verMap.get(ensureHttps(task.websiteRaw)) ?? '')
          : '';
        const phone = task.phoneDigits ? formatPhone(task.phoneDigits) : null;
        const yearsInBiz = task.foundedYear > 1800 && task.foundedYear <= currentYear
          ? currentYear - task.foundedYear : null;
        if (!DRY_RUN) {
          try {
            insertCompany.run({
              id: crypto.randomUUID(),
              businessName: task.companyName,
              category: 'General Contractor',
              city: task.city || null,
              state: task.state,
              zipCode: task.zip || null,
              phone,
              website: verifiedUrl || null,
              yearsInBusiness: yearsInBiz,
              dataSource: 'CSV-Import',
              lastUpdated: now,
            });
            progress.importedCount++;
          } catch {
            progress.importSkipped++;
          }
        } else {
          progress.importedCount++;
        }
      }
    });
    insertBatch();

    progress.importOffset = i + batch.length;

    if (Date.now() - lastSave >= SAVE_EVERY_MS || progress.importOffset >= queue.length) {
      saveProgress(progress);
      log(`[PHASE 3] Checkpoint saved — imported ${progress.importedCount.toLocaleString()}, skipped ${progress.importSkipped.toLocaleString()}`);
      lastSave = Date.now();
    }
  }

  db.close();
  progress.phase = 'done';
  saveProgress(progress);
  log(`[PHASE 3] Complete. Total imported: ${progress.importedCount.toLocaleString()}, skipped: ${progress.importSkipped.toLocaleString()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const startTime = Date.now();

  if (RESET && fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
    log('[RESET] Progress file deleted — starting from scratch');
  }

  log('══════════════════════════════════════════════════════════');
  log('  ConstructFlix — CSV Enrichment (Resumable Batch Mode)');
  log(`  DRY_RUN: ${DRY_RUN}`);
  log('══════════════════════════════════════════════════════════');

  let progress = loadProgress();

  if (!progress) {
    progress = {
      phase: 'parse',
      enrichOffset: 0,
      importOffset: 0,
      enrichedCount: 0,
      importedCount: 0,
      importSkipped: 0,
      startedAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
    };
    log('[START] No checkpoint found — starting from Phase 1');
  } else {
    log(`[RESUME] Resuming from phase="${progress.phase}" enrichOffset=${progress.enrichOffset} importOffset=${progress.importOffset}`);
  }

  if (progress.phase === 'parse') {
    runParsePhase();
    progress.phase = 'enrich';
    saveProgress(progress);
  }

  if (progress.phase === 'enrich') {
    await runEnrichPhase(progress);
  }

  if (progress.phase === 'import') {
    await runImportPhase(progress);
  }

  if (progress.phase === 'done') {
    log('[DONE] All phases complete!');
    log(`  Enriched : ${progress.enrichedCount.toLocaleString()} existing records`);
    log(`  Imported : ${progress.importedCount.toLocaleString()} new records`);
    log(`  Skipped  : ${progress.importSkipped.toLocaleString()} import errors`);
    log(`  Runtime  : ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    log('══════════════════════════════════════════════════════════');
  }
}

run().catch(err => {
  log(`[FATAL] ${(err as Error).message}`);
  process.exit(1);
});
