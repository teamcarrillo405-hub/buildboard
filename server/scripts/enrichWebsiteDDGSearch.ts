#!/usr/bin/env npx tsx
/**
 * enrichWebsiteDDGSearch.ts — Phase 2 website enrichment via DuckDuckGo search
 *
 * Finds companies missing a website, searches DuckDuckGo HTML endpoint by
 * business name + city + state, filters directory results, and HTTP-verifies
 * the first candidate before writing it to the DB.
 *
 * Features:
 *   - Rate limiting: 1 req/sec + random jitter (0–500ms)
 *   - Exponential backoff on 403/429 (30s start, 5min cap)
 *   - Persistent progress — safe to kill and resume
 *   - Live log to logs/enrich_website_ddgSearch.log
 *   - Stops after 5 consecutive failures
 *
 * Usage:
 *   npx tsx server/scripts/enrichWebsiteDDGSearch.ts
 *   npx tsx server/scripts/enrichWebsiteDDGSearch.ts --dry-run
 *   npx tsx server/scripts/enrichWebsiteDDGSearch.ts --max-records=500
 *   npx tsx server/scripts/enrichWebsiteDDGSearch.ts --resume   (always on by default)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import {
  verifyWebsite,
  isDirectoryUrl,
  DIRECTORY_DOMAINS,
} from '../pipelines/domainUtils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const DB_PATH       = './server/constructflix.db';
const LOGS_DIR      = './logs';
const PROGRESS_FILE = path.join(LOGS_DIR, 'enrich_website_ddgSearch_progress.json');
const LOG_FILE      = path.join(LOGS_DIR, 'enrich_website_ddgSearch.log');

const DDG_URL        = 'https://html.duckduckgo.com/html/';
const RATE_LIMIT_MS  = 1_000;   // 1 request per second minimum
const JITTER_MAX_MS  = 500;     // up to +500ms random jitter
const BACKOFF_INIT_MS = 30_000; // 30 seconds initial backoff on 403/429
const BACKOFF_MAX_MS  = 300_000; // 5 minutes maximum backoff
const MAX_CONSECUTIVE_FAILURES = 5;
const SAVE_EVERY     = 50;      // persist progress every N companies

const DRY_RUN    = process.argv.includes('--dry-run');
const MAX_RECORDS = parseInt(
  process.argv.find(a => a.startsWith('--max-records='))?.split('=')[1] ?? '0'
) || Infinity;
// --resume is always on; flag accepted for CLI clarity but has no effect
const _RESUME_FLAG = process.argv.includes('--resume'); // always true

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  businessName: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
}

interface Progress {
  lastRowId: number;
  totalProcessed: number;
  totalSearched: number;
  totalFound: number;
  totalVerified: number;
  errors: number;
  consecutiveFailures: number;
  lastRunAt: string;
  lastBusiness: string;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(tag: string, msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${tag}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ─── Progress persistence ─────────────────────────────────────────────────────

function loadProgress(): Progress {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return {
      lastRowId: 0,
      totalProcessed: 0,
      totalSearched: 0,
      totalFound: 0,
      totalVerified: 0,
      errors: 0,
      consecutiveFailures: 0,
      lastRunAt: new Date().toISOString(),
      lastBusiness: '',
    };
  }
}

function saveProgress(p: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

function jitter(): number {
  return Math.floor(Math.random() * (JITTER_MAX_MS + 1));
}

// ─── DuckDuckGo search ────────────────────────────────────────────────────────

/**
 * Extracts candidate website URLs from DuckDuckGo HTML search results.
 * Result links live in <a class="result__a" href="..."> tags where the href
 * is a DDG redirect containing the real URL in the `uddg=` query parameter.
 * Returns them in result-rank order with directory URLs already filtered out.
 */
function parseDDGResults(html: string): string[] {
  const candidates: string[] = [];

  // Match all result__a anchors — DDG HTML is consistent about this class
  const anchorRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRe.exec(html)) !== null) {
    const rawHref = match[1];

    // Extract the real URL from the uddg= parameter in the redirect href
    let candidateUrl: string;
    try {
      // DDG hrefs are HTML-encoded; decode entities for the param parser
      const decodedHref = rawHref
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      const uddgMatch = /[?&]uddg=([^&]+)/.exec(decodedHref);
      if (!uddgMatch) {
        // Fallback: href might already be the direct URL (no redirect wrapper)
        candidateUrl = decodedHref.startsWith('http') ? decodedHref : '';
      } else {
        candidateUrl = decodeURIComponent(uddgMatch[1]);
      }
    } catch {
      continue;
    }

    if (!candidateUrl || !candidateUrl.startsWith('http')) continue;

    // Filter out directory domains
    if (isDirectoryUrl(candidateUrl)) continue;

    // Additional hostname-level check against DIRECTORY_DOMAINS
    try {
      const { hostname } = new URL(candidateUrl);
      const bare = hostname.replace(/^www\./, '');
      if (DIRECTORY_DOMAINS.has(bare)) continue;
    } catch {
      continue;
    }

    candidates.push(candidateUrl);
  }

  return candidates;
}

/**
 * Performs a DuckDuckGo HTML search for the given query.
 * Returns raw HTML or throws on HTTP error.
 * Throws a RateLimitError on 403/429 so the caller can back off.
 */
class RateLimitError extends Error {
  public readonly status: number;
  constructor(status: number) {
    super(`DDG rate limited: HTTP ${status}`);
    this.status = status;
  }
}

async function ddgSearch(query: string): Promise<string> {
  const body = new URLSearchParams({ q: query });

  const resp = await fetch(DDG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (resp.status === 403 || resp.status === 429) {
    throw new RateLimitError(resp.status);
  }

  if (!resp.ok) {
    throw new Error(`DDG HTTP ${resp.status}`);
  }

  return resp.text();
}

// ─── Per-company enrichment ───────────────────────────────────────────────────

/**
 * Searches DDG for a company's website, verifies the first non-directory
 * result, and returns the verified URL or null.
 */
async function findWebsite(company: Company): Promise<string | null> {
  const city  = company.city  ?? '';
  const state = company.state ?? '';
  const query = `"${company.businessName}" ${city} ${state} contractor`.trim();

  const html = await ddgSearch(query);
  const candidates = parseDDGResults(html);

  if (candidates.length === 0) return null;

  const candidate = candidates[0];
  const { valid, finalUrl } = await verifyWebsite(candidate);

  if (!valid) return null;

  return finalUrl;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const progress = loadProgress();

  const updateStmt = db.prepare(
    'UPDATE companies SET website = ? WHERE id = ?'
  );

  const getRowid = db.prepare<[string], { rowid: number }>(
    'SELECT rowid FROM companies WHERE id = ?'
  );

  log('START', '══════════════════════════════════════════════════════');
  log('START', '  ConstructFlix — Website DDG Search Enrichment');
  log('START', `  Resume from rowid > ${progress.lastRowId}`);
  log('START', `  Lifetime stats: processed=${progress.totalProcessed} ` +
    `searched=${progress.totalSearched} found=${progress.totalFound} ` +
    `verified=${progress.totalVerified}`);
  log('START', `  DRY_RUN: ${DRY_RUN} | MAX_RECORDS: ${MAX_RECORDS === Infinity ? 'all' : MAX_RECORDS}`);
  log('START', '══════════════════════════════════════════════════════');

  let processedThisRun = 0;
  let backoffMs = BACKOFF_INIT_MS;

  // Use a cursor-style batch loop so we never load the full result set into
  // memory and can accurately resume via lastRowId.
  const BATCH_SIZE = 200;

  outer: while (true) {
    if (processedThisRun >= MAX_RECORDS) {
      log('DONE', `Reached --max-records limit (${MAX_RECORDS}). Stopping.`);
      break;
    }

    const batch = db.prepare<[number, number], Company>(`
      SELECT id, businessName, city, state, phone, website
      FROM companies
      WHERE rowid > ?
        AND (website IS NULL OR website = '')
        AND businessName IS NOT NULL
      ORDER BY state, city
      LIMIT ?
    `).all(progress.lastRowId, BATCH_SIZE);

    if (batch.length === 0) {
      log('DONE', 'No more records to enrich — all companies processed.');
      break;
    }

    for (const company of batch) {
      if (processedThisRun >= MAX_RECORDS) {
        log('DONE', `Reached --max-records limit (${MAX_RECORDS}). Stopping.`);
        break outer;
      }

      // Advance lastRowId regardless of outcome so resume skips this record
      const rowInfo = getRowid.get(company.id);
      if (rowInfo) progress.lastRowId = rowInfo.rowid;

      // Skip companies with no usable name
      if (!company.businessName || company.businessName.trim().length < 3) {
        log('SKIP', `id=${company.id} — name too short: "${company.businessName}"`);
        progress.totalProcessed++;
        processedThisRun++;
        continue;
      }

      try {
        progress.totalSearched++;
        log('SEARCH', `"${company.businessName}" | ${company.city ?? ''}, ${company.state ?? ''}`);

        const website = await findWebsite(company);

        if (website) {
          progress.totalFound++;
          progress.totalVerified++;
          log('FOUND', `"${company.businessName}" → ${website}`);

          if (!DRY_RUN) {
            updateStmt.run(website, company.id);
          }
        }

        // Successful request — reset backoff and consecutive failure counter
        backoffMs = BACKOFF_INIT_MS;
        progress.consecutiveFailures = 0;

      } catch (err: unknown) {
        const isRateLimit = err instanceof RateLimitError;
        const message     = err instanceof Error ? err.message : String(err);

        if (isRateLimit) {
          log('BACKOFF', `Rate limited (${(err as RateLimitError).status}) — waiting ${backoffMs / 1000}s`);
          await sleep(backoffMs);
          backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
          // Do NOT advance processed count or increment errors — we'll retry
          // by NOT updating lastRowId beyond this company on re-entry, but
          // since we already updated lastRowId above we just log and continue.
        } else {
          progress.errors++;
          progress.consecutiveFailures++;
          log('FAIL', `"${company.businessName}": ${message} (consecutive=${progress.consecutiveFailures})`);

          if (progress.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            log('FAIL', `${MAX_CONSECUTIVE_FAILURES} consecutive failures — aborting.`);
            saveProgress(progress);
            db.close();
            process.exit(1);
          }
        }
      }

      progress.totalProcessed++;
      progress.lastBusiness = company.businessName;
      processedThisRun++;

      // Periodic progress save
      if (progress.totalProcessed % SAVE_EVERY === 0) {
        saveProgress(progress);
        log('SEARCH',
          `processed=${progress.totalProcessed} searched=${progress.totalSearched} ` +
          `found=${progress.totalFound} verified=${progress.totalVerified} ` +
          `errors=${progress.errors} last="${company.businessName}"`
        );
      }

      // Rate limit delay: 1000ms base + jitter
      await sleep(RATE_LIMIT_MS + jitter());
    }
  }

  progress.lastRunAt = new Date().toISOString();
  saveProgress(progress);
  db.close();

  const runtimeSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  log('DONE', '══════════════════════════════════════════════════════');
  log('DONE', '  WEBSITE DDG SEARCH ENRICHMENT — RUN COMPLETE');
  log('DONE', `  Processed this run : ${processedThisRun}`);
  log('DONE', `  Total processed    : ${progress.totalProcessed}`);
  log('DONE', `  Total searched     : ${progress.totalSearched}`);
  log('DONE', `  Total found        : ${progress.totalFound}`);
  log('DONE', `  Total verified     : ${progress.totalVerified}`);
  log('DONE', `  Errors             : ${progress.errors}`);
  log('DONE', `  Runtime            : ${runtimeSec}s`);
  log('DONE', `  Resume rowid       : ${progress.lastRowId}`);
  log('DONE', '══════════════════════════════════════════════════════');
}

main().catch(err => {
  log('FAIL', `[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
