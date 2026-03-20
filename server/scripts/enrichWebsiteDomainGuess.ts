#!/usr/bin/env npx tsx
/**
 * enrichWebsiteDomainGuess.ts — Phase 1 website enrichment via domain guessing.
 *
 * For every company that has a phone number but no website, generates candidate
 * domain names from the business name and city, probes each candidate with a
 * DNS lookup, and verifies DNS hits with an HTTP HEAD request.  The first URL
 * that passes both checks is written back to the companies table.
 *
 * Algorithm per company:
 *   1. generateCandidateDomains(businessName, city) → string[]
 *   2. DNS-check all candidates in parallel (semaphore: max 50 in-flight)
 *   3. HTTP-verify all DNS hits in parallel (semaphore: max 20 in-flight)
 *   4. First verified URL → UPDATE companies SET website = ? WHERE id = ?
 *   5. No hits → log as "no match", continue
 *
 * Progress is persisted to logs/enrich_website_domainGuess_progress.json —
 * safe to kill and resume at any point.
 *
 * Usage:
 *   npx tsx server/scripts/enrichWebsiteDomainGuess.ts
 *   npx tsx server/scripts/enrichWebsiteDomainGuess.ts --dry-run
 *   npx tsx server/scripts/enrichWebsiteDomainGuess.ts --max-records=1000
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateCandidateDomains,
  checkDomainDNS,
  verifyWebsite,
  verifyBusinessMatch,
} from '../pipelines/domainUtils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const DB_PATH       = './server/constructflix.db';
const LOGS_DIR      = './logs';
const PROGRESS_FILE = path.join(LOGS_DIR, 'enrich_website_domainGuess_progress.json');
const LOG_FILE      = path.join(LOGS_DIR, 'enrich_website_domainGuess.log');

const BATCH_SIZE        = 500;  // companies fetched from DB per iteration
const DNS_CONCURRENCY   = 50;   // max parallel DNS probes across all candidates for one company
const HTTP_CONCURRENCY  = 20;   // max parallel HTTP verifications for one company
const TITLE_CONCURRENCY = 10;   // max parallel title-fetch verifications (heavier than HEAD)
const SAVE_EVERY        = 100;  // persist progress every N companies

const DRY_RUN     = process.argv.includes('--dry-run');
const MAX_RECORDS = parseInt(
  process.argv.find(a => a.startsWith('--max-records='))?.split('=')[1] ?? '0'
) || Infinity;
// Resume is always on — safe to kill and restart
const RESUME = true;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  businessName: string;
  city: string | null;
  state: string | null;
  phone: string;
  website: string | null;
  category: string | null;
}

interface Progress {
  lastRowId: number;
  totalProcessed: number;
  totalFound: number;
  totalDNSHits: number;
  totalVerified: number;
  totalRejected: number;
  errors: number;
  lastRunAt: string;
  lastBusiness: string;
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

// ─── Progress persistence ─────────────────────────────────────────────────────

function loadProgress(): Progress {
  try {
    const saved = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) as Progress;
    // Backfill field added in this version so old progress files keep working.
    if (typeof saved.totalRejected !== 'number') saved.totalRejected = 0;
    return saved;
  } catch {
    return {
      lastRowId: 0,
      totalProcessed: 0,
      totalFound: 0,
      totalDNSHits: 0,
      totalVerified: 0,
      totalRejected: 0,
      errors: 0,
      lastRunAt: new Date().toISOString(),
      lastBusiness: '',
    };
  }
}

function saveProgress(p: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── Semaphore ────────────────────────────────────────────────────────────────
// Simple token-based semaphore — no external dependencies.

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

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ─── Core enrichment ──────────────────────────────────────────────────────────

interface EnrichResult {
  found: boolean;
  url: string | null;
  dnsHits: number;
  verified: number;
  rejected: number;
}

async function enrichCompany(company: Company): Promise<EnrichResult> {
  const candidates = generateCandidateDomains(
    company.businessName,
    company.city ?? undefined,
    company.state ?? undefined,
    company.category ?? undefined,
  );

  if (candidates.length === 0) {
    return { found: false, url: null, dnsHits: 0, verified: 0, rejected: 0 };
  }

  // Step 1 — DNS probe all candidates in parallel, bounded by DNS_CONCURRENCY.
  const dnsSemaphore = new Semaphore(DNS_CONCURRENCY);
  const dnsResults = await Promise.all(
    candidates.map(domain =>
      dnsSemaphore.run(async () => {
        const alive = await checkDomainDNS(domain);
        return { domain, alive };
      })
    )
  );

  const dnsHits = dnsResults.filter(r => r.alive).map(r => r.domain);

  if (dnsHits.length === 0) {
    return { found: false, url: null, dnsHits: 0, verified: 0, rejected: 0 };
  }

  // Step 2 — HTTP verify all DNS-hit domains in parallel, bounded by HTTP_CONCURRENCY.
  const httpSemaphore = new Semaphore(HTTP_CONCURRENCY);
  const verifyResults = await Promise.all(
    dnsHits.map(domain =>
      httpSemaphore.run(async () => {
        const url = `https://${domain}`;
        const result = await verifyWebsite(url);
        return { domain, ...result };
      })
    )
  );

  const verified = verifyResults.filter(r => r.valid);

  if (verified.length === 0) {
    return { found: false, url: null, dnsHits: dnsHits.length, verified: 0, rejected: 0 };
  }

  // Step 3 — Title-check all HTTP-verified URLs, bounded by TITLE_CONCURRENCY.
  // We run all checks concurrently and then pick the first one that passes,
  // preserving the original candidate ordering.
  const titleSemaphore = new Semaphore(TITLE_CONCURRENCY);
  const titleResults = await Promise.all(
    verified.map(r =>
      titleSemaphore.run(async () => {
        const { match, title } = await verifyBusinessMatch(r.finalUrl, company.businessName);
        return { ...r, titleMatch: match, title };
      })
    )
  );

  let rejected = 0;
  let winner: (typeof titleResults)[number] | null = null;

  for (const r of titleResults) {
    if (r.titleMatch) {
      if (winner === null) winner = r;
    } else {
      rejected++;
      log(`[REJECT] "${company.businessName}" — title mismatch: ${r.finalUrl} (title: "${r.title}")`);
    }
  }

  if (winner === null) {
    return { found: false, url: null, dnsHits: dnsHits.length, verified: verified.length, rejected };
  }

  return {
    found: true,
    url: winner.finalUrl,
    dnsHits: dnsHits.length,
    verified: verified.length,
    rejected,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const progress = loadProgress();

  const updateStmt = db.prepare(
    'UPDATE companies SET website = ? WHERE id = ?'
  );

  const rowIdStmt = db.prepare(
    'SELECT rowid FROM companies WHERE id = ?'
  );

  log('══════════════════════════════════════════════════════════');
  log('  ConstructFlix — Website Domain Guess Enrichment (Phase 1)');
  log(`  DB              : ${DB_PATH}`);
  log(`  Resume from rowid > ${progress.lastRowId}  |  RESUME: ${RESUME}`);
  log(`  DNS concurrency : ${DNS_CONCURRENCY}  |  HTTP concurrency: ${HTTP_CONCURRENCY}  |  Title concurrency: ${TITLE_CONCURRENCY}`);
  log(`  Batch size      : ${BATCH_SIZE}  |  Save every: ${SAVE_EVERY}`);
  log(`  MAX_RECORDS     : ${MAX_RECORDS === Infinity ? 'unlimited' : MAX_RECORDS}`);
  log(`  DRY_RUN         : ${DRY_RUN}`);
  log(`  Lifetime stats  : processed=${progress.totalProcessed} found=${progress.totalFound}`);
  log('══════════════════════════════════════════════════════════');

  let totalProcessedThisRun = 0;
  let continueProcessing = true;

  while (continueProcessing) {
    // Respect --max-records limit
    if (totalProcessedThisRun >= MAX_RECORDS) {
      log(`[DONE] --max-records limit reached (${MAX_RECORDS})`);
      break;
    }

    const fetchLimit = MAX_RECORDS === Infinity
      ? BATCH_SIZE
      : Math.min(BATCH_SIZE, MAX_RECORDS - totalProcessedThisRun);

    const batch = db.prepare(`
      SELECT id, businessName, city, state, phone, website, category
      FROM companies
      WHERE phone IS NOT NULL AND phone != ''
        AND (website IS NULL OR website = '')
        AND rowid > ?
      ORDER BY state, city, rowid
      LIMIT ?
    `).all(progress.lastRowId, fetchLimit) as Company[];

    if (batch.length === 0) {
      log('[DONE] No more companies to process — all done!');
      break;
    }

    log(`[START] Fetched ${batch.length} companies (rowid > ${progress.lastRowId})`);

    for (const company of batch) {
      // Re-check max-records in case the batch was larger than remaining budget
      if (totalProcessedThisRun >= MAX_RECORDS) {
        continueProcessing = false;
        break;
      }

      try {
        const result = await enrichCompany(company);

        progress.totalDNSHits  += result.dnsHits;
        progress.totalVerified += result.verified;
        progress.totalRejected += result.rejected;

        if (result.found && result.url) {
          if (!DRY_RUN) {
            updateStmt.run(result.url, company.id);
          }
          progress.totalFound++;
          log(
            `[FOUND] "${company.businessName}" (${company.city ?? ''}, ${company.state ?? ''})` +
            ` → ${result.url}  dns=${result.dnsHits} verified=${result.verified}`
          );
        } else {
          log(
            `[SKIP] "${company.businessName}" (${company.city ?? ''}, ${company.state ?? ''})` +
            ` — no match  dns=${result.dnsHits}`
          );
        }
      } catch (err: unknown) {
        progress.errors++;
        const message = err instanceof Error ? err.message : String(err);
        log(`[FAIL] "${company.businessName}": ${message}`);
      }

      // Advance the resume cursor
      const rowInfo = rowIdStmt.get(company.id) as { rowid: number } | undefined;
      if (rowInfo) progress.lastRowId = rowInfo.rowid;

      progress.totalProcessed++;
      progress.lastBusiness = company.businessName;
      totalProcessedThisRun++;

      // Periodic progress save
      if (progress.totalProcessed % SAVE_EVERY === 0) {
        progress.lastRunAt = new Date().toISOString();
        saveProgress(progress);
        const hitRate = progress.totalProcessed > 0
          ? (progress.totalFound / progress.totalProcessed * 100).toFixed(1)
          : '0.0';
        log(
          `  Processed=${progress.totalProcessed} Found=${progress.totalFound}(${hitRate}%)` +
          ` DNSHits=${progress.totalDNSHits} Verified=${progress.totalVerified}` +
          ` Rejected=${progress.totalRejected} Errors=${progress.errors}`
        );
      }
    }
  }

  // Final progress flush
  progress.lastRunAt = new Date().toISOString();
  saveProgress(progress);
  db.close();

  const runtimeMs = Date.now() - startTime;
  const runtimeSec = (runtimeMs / 1000).toFixed(1);
  const hitRate = progress.totalProcessed > 0
    ? (progress.totalFound / progress.totalProcessed * 100).toFixed(1)
    : '0.0';

  log('══════════════════════════════════════════════════════════');
  log('  WEBSITE DOMAIN GUESS — RUN COMPLETE');
  log(`  Processed this run : ${totalProcessedThisRun.toLocaleString()}`);
  log(`  Lifetime processed : ${progress.totalProcessed.toLocaleString()}`);
  log(`  Found (websites)   : ${progress.totalFound.toLocaleString()}  (${hitRate}% hit rate)`);
  log(`  DNS hits total     : ${progress.totalDNSHits.toLocaleString()}`);
  log(`  HTTP verified      : ${progress.totalVerified.toLocaleString()}`);
  log(`  Title rejected     : ${progress.totalRejected.toLocaleString()}`);
  log(`  Errors             : ${progress.errors}`);
  log(`  Runtime            : ${runtimeSec}s`);
  log(`  Resume rowid       : ${progress.lastRowId}`);
  log('══════════════════════════════════════════════════════════');
}

main().catch(err => {
  log(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
