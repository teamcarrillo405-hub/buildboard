#!/usr/bin/env npx tsx
/**
 * enrichYelpContacts.ts — Standalone Yelp Fusion API contact enrichment
 *
 * Finds companies missing website/phone, searches Yelp by name+location,
 * and fills phone, website, imageUrl, lat/lng, rating, reviewCount.
 *
 * Two-step per company:
 *   1. /businesses/search  → find match (phone, image, rating)
 *   2. /businesses/{id}    → get website
 *
 * Budget: 5,000 API calls/day → ~2,500 businesses/day
 * Uses Ollama gemma3:4b to validate ambiguous name matches (score 0.5–0.75).
 *
 * Progress is persisted to logs/yelp_contact_enrich_progress.json — safe to
 * kill and resume across days.
 *
 * Usage:
 *   npx tsx server/scripts/enrichYelpContacts.ts
 *   npx tsx server/scripts/enrichYelpContacts.ts --daily-limit 4000
 *   npx tsx server/scripts/enrichYelpContacts.ts --dry-run
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_PATH       = './server/constructflix.db';
const LOGS_DIR      = './logs';
const PROGRESS_FILE = path.join(LOGS_DIR, 'yelp_contact_enrich_progress.json');
const LOG_FILE      = path.join(LOGS_DIR, 'yelp_contact_enrich.log');

const YELP_API_KEY  = process.env.YELP_API_KEY ?? '';
const YELP_BASE     = 'https://api.yelp.com/v3';

const RATE_LIMIT_MS = 650;    // ~1.5 req/sec (well under Yelp's 5/sec)
const BATCH_SIZE    = 500;    // DB query batch

const DRY_RUN       = process.argv.includes('--dry-run');
const DAILY_LIMIT   = parseInt(
  process.argv.find(a => a.startsWith('--daily-limit='))?.split('=')[1] ?? '4800'
);

// ─── Types ───────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  businessName: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string | null;
  website: string | null;
  imageUrl: string | null;  // Added: enables pre-call skip guard (YELP-02)
}

interface Progress {
  lastRowId: number;
  totalSearched: number;
  totalMatched: number;
  totalPhoneFilled: number;
  totalWebsiteFilled: number;
  totalImageFilled: number;
  totalApiCalls: number;
  ollamaValidations: number;
  ollamaRejected: number;
  errors: number;
  lastRunAt: string;
  lastBusiness: string;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ─── Progress persistence ────────────────────────────────────────────────────

function loadProgress(): Progress {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return {
      lastRowId: 0,
      totalSearched: 0,
      totalMatched: 0,
      totalPhoneFilled: 0,
      totalWebsiteFilled: 0,
      totalImageFilled: 0,
      totalApiCalls: 0,
      ollamaValidations: 0,
      ollamaRejected: 0,
      errors: 0,
      lastRunAt: new Date().toISOString(),
      lastBusiness: '',
    };
  }
}

function saveProgress(p: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(llc|inc|corp|ltd|co|company|dba|pllc|llp|pa|pc)\b\.?/gi, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const tokA = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const tokB = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  const intersection = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Yelp API ────────────────────────────────────────────────────────────────

async function yelpSearch(term: string, location: string): Promise<any[]> {
  const params = new URLSearchParams({
    term,
    location,
    limit: '5',
    categories: 'contractors,plumbing,electricians,roofing,handyman,painters,landscaping,hvac',
  });

  const resp = await fetch(`${YELP_BASE}/businesses/search?${params}`, {
    headers: { Authorization: `Bearer ${YELP_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Yelp search ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.businesses ?? [];
}

// NOTE: Yelp API v3 does NOT return business website — `url` is always yelp.com.
// We skip the /businesses/{id} details call entirely and get phone/image/lat/lng
// from the search endpoint alone. This gives us 5,000 businesses/day instead of 2,500.

// ─── Ollama validation for ambiguous matches ─────────────────────────────────

async function ollamaValidateMatch(
  companyName: string, companyCity: string, companyState: string,
  yelpName: string, yelpCity: string, yelpState: string,
): Promise<boolean> {
  try {
    const prompt =
      `Are these the same business?\n` +
      `Record 1: "${companyName}" in ${companyCity}, ${companyState}\n` +
      `Record 2: "${yelpName}" in ${yelpCity || '?'}, ${yelpState || '?'}\n\n` +
      `Answer only YES or NO.`;

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b',
        prompt,
        stream: false,
        options: { temperature: 0, num_predict: 5 },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return true; // If Ollama fails, accept the match
    const data = await res.json() as { response: string };
    return !data.response.toUpperCase().startsWith('NO');
  } catch {
    return true; // Ollama unavailable → accept
  }
}

// ─── Core enrichment ─────────────────────────────────────────────────────────

async function enrichCompany(
  company: Company,
  progress: Progress,
  db: Database.Database,
  updateStmt: Database.Statement,
): Promise<void> {
  const location = [company.city, company.state].filter(Boolean).join(', ');
  if (!location || !company.businessName || company.businessName.length < 3) return;

  // Pre-call skip guard: if both phone and imageUrl are already populated, no Yelp call needed.
  // This fires BEFORE yelpSearch() to avoid consuming an API call (YELP-02).
  if (company.phone && company.imageUrl) return;

  // 1. Search Yelp
  const results = await yelpSearch(company.businessName, location);
  progress.totalApiCalls++;

  if (results.length === 0) return;

  // 2. Find best match by name similarity
  let bestBiz: any = null;
  let bestScore = 0;

  for (const biz of results) {
    const score = nameSimilarity(company.businessName, biz.name);

    // Location validation
    const zipMatch = company.zipCode && biz.location?.zip_code
      ? company.zipCode.slice(0, 5) === biz.location.zip_code.slice(0, 5)
      : false;
    const cityMatch = company.city && biz.location?.city
      ? company.city.toLowerCase() === biz.location.city.toLowerCase()
      : false;

    if (!zipMatch && !cityMatch) continue;

    if (score > bestScore) {
      bestScore = score;
      bestBiz = biz;
    }
  }

  if (!bestBiz) return;

  // 3. Validate ambiguous matches with Ollama (score between 0.5 and 0.75)
  if (bestScore >= 0.5 && bestScore < 0.75) {
    progress.ollamaValidations++;
    const valid = await ollamaValidateMatch(
      company.businessName, company.city, company.state,
      bestBiz.name, bestBiz.location?.city ?? '', bestBiz.location?.state ?? '',
    );
    if (!valid) {
      progress.ollamaRejected++;
      return;
    }
  } else if (bestScore < 0.5) {
    return; // Too low, skip
  }

  // 4. Extract contact data from search result (no details call needed)
  const phone = bestBiz.phone ? bestBiz.phone.replace(/[^0-9+]/g, '') : null;
  const imageUrl = bestBiz.image_url || null;
  const lat = bestBiz.coordinates?.latitude ?? null;
  const lng = bestBiz.coordinates?.longitude ?? null;
  const rating = bestBiz.rating ?? null;
  const reviewCount = bestBiz.review_count ?? null;

  const wouldFillPhone = !company.phone && phone;
  const wouldFillImage = !!imageUrl;

  if (!wouldFillPhone && !wouldFillImage) return;

  // 5. Update DB
  if (!DRY_RUN) {
    updateStmt.run({
      phone: wouldFillPhone ? phone : null,
      imageUrl,
      lat, lng,
      rating, reviewCount,
      updatedAt: new Date().toISOString(),
      id: company.id,
    });
  }

  progress.totalMatched++;
  if (wouldFillPhone) progress.totalPhoneFilled++;
  if (imageUrl) progress.totalImageFilled++;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!YELP_API_KEY) {
    console.error('YELP_API_KEY not set in .env');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const progress = loadProgress();
  let apiCallsThisRun = 0;

  // SIGINT handler — saves progress before exit so kill/Ctrl+C is safe to resume
  process.on('SIGINT', () => {
    log('SIGINT received — saving progress and exiting');
    saveProgress(progress);
    process.exit(0);
  });

  log('══════════════════════════════════════════════════════════');
  log('  ConstructFlix — Yelp Contact Enrichment');
  log(`  Daily API limit : ${DAILY_LIMIT}`);
  log(`  Resume from enrich_rank > ${progress.lastRowId} (priority-ordered)`);
  log(`  Lifetime stats  : searched=${progress.totalSearched} matched=${progress.totalMatched}`);
  log(`  DRY_RUN: ${DRY_RUN}`);
  log('══════════════════════════════════════════════════════════');

  const updateStmt = db.prepare(`
    UPDATE companies SET
      phone     = CASE WHEN (phone IS NULL OR phone = '')     AND @phone IS NOT NULL THEN @phone ELSE phone END,
      imageUrl  = CASE WHEN (imageUrl IS NULL OR imageUrl = '') AND @imageUrl IS NOT NULL THEN @imageUrl ELSE imageUrl END,
      latitude  = CASE WHEN latitude IS NULL  AND @lat IS NOT NULL THEN @lat ELSE latitude END,
      longitude = CASE WHEN longitude IS NULL AND @lng IS NOT NULL THEN @lng ELSE longitude END,
      rating    = CASE WHEN (rating IS NULL OR rating = 0) AND @rating IS NOT NULL THEN @rating ELSE rating END,
      reviewCount = CASE WHEN (reviewCount IS NULL OR reviewCount = 0) AND @reviewCount IS NOT NULL THEN @reviewCount ELSE reviewCount END,
      lastUpdated = @updatedAt
    WHERE id = @id
  `);

  while (apiCallsThisRun < DAILY_LIMIT) {
    // Target license_ records first — real licensed contractors, better Yelp match quality
    // than permit records which include restaurants, retail, and other non-contractors.
    const batch = db.prepare(`
      SELECT id, businessName, city, state, zipCode, phone, website, imageUrl
      FROM companies
      WHERE enrich_rank > ?
        AND ((phone IS NULL OR phone = '') OR (imageUrl IS NULL OR imageUrl = ''))
        AND city IS NOT NULL AND city != ''
        AND businessName IS NOT NULL AND LENGTH(businessName) >= 3
      ORDER BY enrich_rank
      LIMIT ?
    `).all(progress.lastRowId, BATCH_SIZE) as Company[];

    if (batch.length === 0) {
      log('No more records to enrich — all done!');
      break;
    }

    for (const company of batch) {
      if (apiCallsThisRun >= DAILY_LIMIT) {
        log(`Daily API limit reached (${apiCallsThisRun} calls). Stopping.`);
        break;
      }

      try {
        const callsBefore = progress.totalApiCalls;
        await enrichCompany(company, progress, db, updateStmt);
        apiCallsThisRun += (progress.totalApiCalls - callsBefore);

        progress.totalSearched++;
        progress.lastBusiness = company.businessName;
        // Track enrich_rank as cursor (replaces rowid — priority-ordered pagination)
        const rankInfo = db.prepare('SELECT enrich_rank FROM companies WHERE id = ?').get(company.id) as any;
        if (rankInfo) progress.lastRowId = rankInfo.enrich_rank;

        if (progress.totalSearched % 50 === 0) {
          saveProgress(progress);
          const hitRate = progress.totalMatched > 0
            ? (progress.totalMatched / progress.totalSearched * 100).toFixed(1)
            : '0.0';
          log(
            `Searched=${progress.totalSearched} Matched=${progress.totalMatched}(${hitRate}%) ` +
            `Phone=${progress.totalPhoneFilled} Image=${progress.totalImageFilled} Ollama=${progress.ollamaValidations} ` +
            `API=${apiCallsThisRun}/${DAILY_LIMIT} Last="${company.businessName}"`
          );
        }

        await sleep(RATE_LIMIT_MS);
      } catch (err: any) {
        progress.errors++;
        log(`ERROR "${company.businessName}": ${err.message}`);

        // If daily quota exhausted, exit cleanly — enrich_continuous.sh will restart after 1h
        if (err.message.includes('ACCESS_LIMIT_REACHED')) {
          log('Daily API quota exhausted — exiting cleanly. Will resume next run.');
          saveProgress(progress);
          db.close();
          process.exit(0);
        }
        // Transient rate limit — back off briefly and continue
        if (err.message.includes('429') || err.message.includes('TOO_MANY')) {
          log('Rate limited — backing off 60s...');
          await sleep(60_000);
        }
        await sleep(RATE_LIMIT_MS * 2);
      }
    }
  }

  progress.lastRunAt = new Date().toISOString();
  saveProgress(progress);

  db.close();

  log('══════════════════════════════════════════════════════════');
  log('  YELP CONTACT ENRICHMENT — RUN COMPLETE');
  log(`  Searched this run : ${progress.totalSearched}`);
  log(`  Matched           : ${progress.totalMatched}`);
  log(`  Phone filled      : ${progress.totalPhoneFilled}`);
  log(`  Website filled    : ${progress.totalWebsiteFilled}`);
  log(`  Image filled      : ${progress.totalImageFilled}`);
  log(`  API calls used    : ${apiCallsThisRun}`);
  log(`  Ollama checks     : ${progress.ollamaValidations} (rejected: ${progress.ollamaRejected})`);
  log(`  Errors            : ${progress.errors}`);
  log(`  Resume rowid      : ${progress.lastRowId}`);
  log('══════════════════════════════════════════════════════════');
}

main().catch(err => {
  log(`[FATAL] ${err.message}`);
  process.exit(1);
});
