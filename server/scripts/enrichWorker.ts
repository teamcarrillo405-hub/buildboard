#!/usr/bin/env npx tsx
/**
 * enrichWorker.ts — Web-enrichment worker for ConstructFlix
 *
 * Finds website + email for businesses using:
 *   1. DuckDuckGo HTML search (primary, free)
 *   2. Bing HTML search (fallback, free)
 *   3. Website scraping for email addresses
 *   4. Ollama (gemma3:4b) to validate ambiguous matches
 *
 * Each worker owns its slice of the DB via: rowid % TOTAL_WORKERS = WORKER_ID
 *
 * Usage:
 *   npx tsx server/scripts/enrichWorker.ts --worker-id 0 --total-workers 20
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import {
  generateCandidateDomains,
  checkDomainDNS,
  verifyWebsite,
  verifyBusinessMatch,
  isDirectoryUrl,
} from '../pipelines/domainUtils.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const DB_PATH   = './server/constructflix.db';
const LOGS_DIR  = './logs';

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (process.argv[i].startsWith('--')) {
    args[process.argv[i].slice(2)] = process.argv[i + 1] ?? 'true';
  }
}

const WORKER_ID     = parseInt(args['worker-id']     ?? '0');
const TOTAL_WORKERS = parseInt(args['total-workers'] ?? '1');
const DELAY_MS      = parseInt(args['delay-ms']      ?? '2000');
const BATCH_SIZE    = parseInt(args['batch-size']    ?? '200');

// ─── Self-logging (so fd redirect not needed on Windows) ──────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });
const LOG_FILE = path.join(LOGS_DIR, `enrichWorker_${WORKER_ID}_of_${TOTAL_WORKERS}.log`);
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Override console.log to write both to stream AND stdout
const origLog = console.log.bind(console);
const origError = console.error.bind(console);
console.log = (...args2: any[]) => {
  const line = args2.join(' ');
  logStream.write(line + '\n');
  origLog(...args2);
};
console.error = (...args2: any[]) => {
  const line = args2.join(' ');
  logStream.write('[ERR] ' + line + '\n');
  origError(...args2);
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  businessName: string;
  city: string;
  state: string;
  zipCode: string;
  category: string;
}

interface EnrichResult {
  website: string | null;
  email:   string | null;
  source:  string;
}

interface WorkerProgress {
  workerId:         number;
  totalWorkers:     number;
  processed:        number;
  found:            number;
  foundDomainGuess: number;
  foundEmail:       number;
  errors:           number;
  startedAt:        string;
  lastUpdatedAt:    string;
  lastBusiness:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Random delay between min-max ms to mimic human behavior */
function humanDelay(minMs = 1500, maxMs = 4000): Promise<void> {
  return sleep(minMs + Math.random() * (maxMs - minMs));
}

const SKIP_DOMAINS = /facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|yelp\.com|yellowpages\.com|bbb\.org|houzz\.com|angi\.com|homeadvisor\.com|thumbtack\.com|porch\.com|google\.com|bing\.com|duckduckgo\.com|wikipedia\.org|maps\.apple\.com|reddit\.com|zhihu\.com|baidu\.com|360\.cn|stackexchange\.com|stackoverflow\.com|imdb\.com|sketchfab\.com|tinkercad\.com|pinterest\.com|youtube\.com|tiktok\.com|amazon\.com|ebay\.com|walmart\.com|etsy\.com|craigslist\.org|indeed\.com|glassdoor\.com|zillow\.com|realtor\.com|nextdoor\.com/i;

function extractEmails(html: string): string[] {
  const rx = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}\b/g;
  const raw = html.match(rx) ?? [];
  return [...new Set(raw)].filter(e =>
    !/(example|test|domain|email|noreply|no-reply|sentry|w3|schema|wix)\./.test(e) &&
    e.length < 80 &&
    !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif')
  );
}

function extractUrlsFromHtml(html: string): string[] {
  const results: string[] = [];

  // DuckDuckGo uddg= redirect links
  for (const m of html.matchAll(/uddg=([^&"'\s]+)/g)) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (decoded.startsWith('http')) results.push(decoded.split('?')[0]);
    } catch {}
  }

  // DuckDuckGo result__url spans
  for (const m of html.matchAll(/class="result__url"[^>]*>\s*(https?:\/\/[^\s<"]+)/g)) {
    results.push(m[1].trim().split('?')[0]);
  }

  // Bing cite tags and href
  for (const m of html.matchAll(/<cite[^>]*>(https?:\/\/[^<\s]+)<\/cite>/g)) {
    results.push(m[1].split('?')[0]);
  }
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)" h="ID/g)) {
    results.push(m[1].split('?')[0]);
  }

  // Google search result links
  for (const m of html.matchAll(/href="(https?:\/\/(?!www\.google)[^"]+)"/g)) {
    const u = m[1].split('?')[0];
    if (u.startsWith('http')) results.push(u);
  }

  return [...new Set(results)].filter(u => u.startsWith('http') && !SKIP_DOMAINS.test(u));
}

// ─── Playwright Browser (shared per worker) ──────────────────────────────────

let _browser: Browser | null = null;

async function launchBrowser(): Promise<Browser> {
  if (_browser) {
    try {
      // Check if browser is still connected
      if (_browser.isConnected()) return _browser;
    } catch {}
    try { await _browser.close(); } catch {}
  }
  console.log('[Browser] Launching Chromium...');
  _browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  console.log('[Browser] Chromium launched OK');
  return _browser;
}

async function closeBrowser(): Promise<void> {
  try { await _browser?.close(); } catch {}
  _browser = null;
}

/** Decode Bing /ck/a redirect URL — real URL is base64 in the &u= param */
function decodeBingRedirect(bingUrl: string): string | null {
  try {
    const uMatch = bingUrl.match(/[?&]u=a1([^&]+)/);
    if (!uMatch) return null;
    const decoded = Buffer.from(uMatch[1], 'base64').toString('utf8');
    if (decoded.startsWith('http')) return decoded;
    return null;
  } catch {
    return null;
  }
}

/** Extract result URLs from rendered page using DOM selectors */
async function extractResultUrls(page: any, engine: 'bing' | 'google' | 'ddg'): Promise<string[]> {
  try {
    let rawUrls: string[];
    if (engine === 'bing') {
      // Bing: get all links from result containers — they're bing.com/ck/a redirects
      rawUrls = await page.$$eval('.b_algo h2 a, li.b_algo a[href*="bing.com/ck"]', (links: any[]) =>
        links.map((a: any) => a.href).filter((h: string) => h.startsWith('http'))
      );
      // Decode the actual destination URLs from Bing redirects
      return rawUrls
        .map(u => decodeBingRedirect(u))
        .filter((u): u is string => u !== null);
    } else if (engine === 'google') {
      // Google: try both search result containers
      rawUrls = await page.$$eval('div#search a[href^="http"]:not([href*="google"]), div.g a[href^="http"]:not([href*="google"])', (links: any[]) =>
        links.map((a: any) => a.href).filter((h: string) => h.startsWith('http'))
      );
      return rawUrls;
    } else {
      // DDG HTML version
      rawUrls = await page.$$eval('.result__a, a.result__url', (links: any[]) =>
        links.map((a: any) => a.href).filter((h: string) => h.startsWith('http'))
      );
      return rawUrls;
    }
  } catch {
    const html = await page.content();
    return extractUrlsFromHtml(html);
  }
}

/** Search via Playwright headless browser */
async function browserSearch(searchUrl: string, engine: 'bing' | 'google' | 'ddg'): Promise<string[]> {
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (err: any) {
    console.error(`[Browser] Launch failed: ${err.message}`);
    return [];
  }
  let context: BrowserContext | null = null;
  let page: any = null;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    });
    page = await context.newPage();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanDelay(800, 2000);
    const urls = await extractResultUrls(page, engine);
    const cleaned = [...new Set(urls.map((u: string) => u.split('?')[0]))]
      .filter((u: string) => !SKIP_DOMAINS.test(u))
      .slice(0, 6);
    return cleaned;
  } catch (err: any) {
    console.error(`[Browser] Search error: ${err.message}`);
    return [];
  } finally {
    try { await page?.close(); } catch {}
    try { await context?.close(); } catch {}
  }
}

// ─── Search Engines (via Playwright) ──────────────────────────────────────────

async function searchBing(query: string): Promise<string[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=US&setlang=en-US`;
  return browserSearch(url, 'bing');
}

async function searchGoogle(query: string): Promise<string[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
  return browserSearch(url, 'google');
}

async function searchDDG(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  return browserSearch(url, 'ddg');
}

// ─── Website Fetch (still uses fetch — no bot detection on business sites) ───

async function fetchSite(url: string): Promise<{ text: string; emails: string[] }> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { text: '', emails: [] };
    const html = await res.text();
    const emails = extractEmails(html);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 800);
    return { text, emails };
  } catch {
    return { text: '', emails: [] };
  }
}

// Also try /contact page for emails
async function fetchContactEmails(baseUrl: string): Promise<string[]> {
  try {
    const u = new URL(baseUrl);
    const contactUrl = `${u.protocol}//${u.hostname}/contact`;
    const res = await fetch(contactUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return extractEmails(html);
  } catch {
    return [];
  }
}

// ─── Ollama Validation ────────────────────────────────────────────────────────

async function validateWithOllama(
  businessName: string, city: string, state: string,
  websiteUrl: string, pageText: string
): Promise<boolean> {
  try {
    const prompt =
      `Does this website belong to a business named "${businessName}" in ${city}, ${state}?\n` +
      `URL: ${websiteUrl}\n` +
      `Page text: "${pageText.slice(0, 400)}"\n\n` +
      `Answer only YES or NO.`;

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma3:4b', prompt, stream: false, options: { temperature: 0, num_predict: 5 } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return true;
    const data = await res.json() as { response: string };
    return !data.response.toUpperCase().startsWith('NO');
  } catch {
    return true; // If Ollama is unavailable, don't discard the result
  }
}

// ─── Core Enrichment Logic ────────────────────────────────────────────────────

/** Clean business name for search — strip special chars, LLC, Inc etc */
function cleanName(name: string): string {
  return name
    .replace(/[^\w\s&'-]/g, '')  // strip $, #, etc
    .replace(/\b(LLC|INC|CORP|LTD|CO|DBA)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function enrichBusiness(company: Company): Promise<EnrichResult> {
  const { businessName, city, state, category } = company;
  const cleanedName = cleanName(businessName);
  const nameWords = cleanedName.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  if (!cleanedName || cleanedName.length < 3) {
    return { website: null, email: null, source: 'skipped-short-name' };
  }

  const baseQuery = `"${cleanedName}" ${city} ${state}`;

  // ── STEP 1: Domain guessing (fast, no browser) ───────────────────────────
  const domainCandidates = generateCandidateDomains(businessName, city, state, category);

  for (const domain of domainCandidates) {
    const candidateUrl = `https://${domain}`;

    // Skip known directory/aggregator sites
    if (isDirectoryUrl(candidateUrl)) continue;

    // DNS check — fast OS resolver, 3s timeout
    const hasDns = await checkDomainDNS(domain);
    if (!hasDns) continue;

    // HTTP check — HEAD request, follows redirects, detects parked domains
    const { valid, finalUrl } = await verifyWebsite(candidateUrl);
    if (!valid) continue;

    // Title match — >=50% of name tokens must appear in <title>
    const { match } = await verifyBusinessMatch(finalUrl, businessName);
    if (!match) continue;

    // SUCCESS — return the post-redirect URL, no search engine needed
    return { website: finalUrl, email: null, source: 'domain-guess' };
  }

  // ── STEP 2: Search engine fallback (existing logic, unchanged) ────────────
  let candidates: string[] = [];

  // Bing first (confirmed working), Google fallback, DDG last resort
  candidates = await searchBing(baseQuery);

  if (candidates.length === 0) {
    await humanDelay(2000, 4000);
    candidates = await searchGoogle(baseQuery);
  }

  // DDG is IP-blocked — skip to avoid 15s timeouts per record

  candidates = [...new Set(candidates)].filter(u => !SKIP_DOMAINS.test(u)).slice(0, 5);

  for (const url of candidates) {
    const { text, emails } = await fetchSite(url);
    if (!text) continue;

    const lText = text.toLowerCase();
    const lUrl  = url.toLowerCase();

    // Quick relevance check
    const nameHit = nameWords.some(w => lText.includes(w) || lUrl.includes(w));
    const geoHit  = lText.includes(city.toLowerCase()) || lText.includes(state.toLowerCase());

    if (!nameHit && !geoHit) continue;

    // Use Ollama to validate if content is long enough to be meaningful
    const isValid = text.length > 100
      ? await validateWithOllama(businessName, city, state, url, text)
      : (nameHit && geoHit); // simple heuristic if page is too short

    if (!isValid) continue;

    // Try to find email — homepage first, then /contact
    let email = emails[0] ?? null;
    if (!email) {
      const contactEmails = await fetchContactEmails(url);
      email = contactEmails[0] ?? null;
    }

    return { website: url, email, source: 'web-search' };
  }

  // ── STEP 3: Nothing found ─────────────────────────────────────────────────
  return { website: null, email: null, source: 'none' };
}

// ─── Progress Persistence ─────────────────────────────────────────────────────

const progressFile = path.join(LOGS_DIR, `enrichWorker_${WORKER_ID}_of_${TOTAL_WORKERS}.json`);

function loadProgress(): WorkerProgress {
  try {
    return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  } catch {
    return {
      workerId: WORKER_ID, totalWorkers: TOTAL_WORKERS,
      processed: 0, found: 0, foundDomainGuess: 0, foundEmail: 0, errors: 0,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      lastBusiness: '',
    };
  }
}

function saveProgress(p: WorkerProgress) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(progressFile, JSON.stringify(p, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const progress = loadProgress();
  const logLine = (msg: string) => {
    const line = `[${new Date().toISOString()}] [W${WORKER_ID}/${TOTAL_WORKERS}] ${msg}`;
    console.log(line);
  };

  logLine(`Starting — assigned slice: enrich_rank % ${TOTAL_WORKERS} = ${WORKER_ID} (priority order)`);
  logLine(`Already processed: ${progress.processed}, found: ${progress.found}, emails: ${progress.foundEmail}`);

  const updateStmt = db.prepare(`
    UPDATE companies
    SET website = ?, email = ?, lastUpdated = datetime('now')
    WHERE id = ? AND (website IS NULL OR website = '')
  `);

  let offset = progress.processed;

  while (true) {
    const batch = db.prepare(`
      SELECT id, businessName, city, state, zipCode, category
      FROM companies
      WHERE (website IS NULL OR website = '')
        AND (enrich_rank % ?) = ?
      ORDER BY enrich_rank
      LIMIT ? OFFSET ?
    `).all(TOTAL_WORKERS, WORKER_ID, BATCH_SIZE, offset) as Company[];

    if (batch.length === 0) {
      logLine(`✅ Complete! Processed=${progress.processed} Found=${progress.found} Emails=${progress.foundEmail}`);
      break;
    }

    for (const company of batch) {
      try {
        const result = await enrichBusiness(company);

        if (result.website) {
          updateStmt.run(result.website, result.email ?? null, company.id);
          progress.found++;
          if (result.source === 'domain-guess') progress.foundDomainGuess++;
          if (result.email) progress.foundEmail++;
        }

        progress.processed++;
        progress.lastBusiness    = company.businessName;
        progress.lastUpdatedAt   = new Date().toISOString();

        if (progress.processed % 25 === 0) {
          saveProgress(progress);
          const pct = (progress.found / progress.processed * 100).toFixed(1);
          const searchFound = progress.found - progress.foundDomainGuess;
          logLine(`Processed=${progress.processed} Found=${progress.found}(${pct}%) DomainGuess=${progress.foundDomainGuess} Search=${searchFound} Emails=${progress.foundEmail} Last="${company.businessName}"`);
        }

        await sleep(DELAY_MS);
      } catch (err: any) {
        progress.errors++;
        logLine(`ERROR on "${company.businessName}": ${err.message ?? err}`);
        await sleep(DELAY_MS * 2);
      }
    }

    offset += batch.length;
    saveProgress(progress);
  }

  saveProgress(progress);
  db.close();
  await closeBrowser();
}

main().catch(async err => {
  console.error(`[Worker ${WORKER_ID}] Fatal:`, err);
  await closeBrowser();
  process.exit(1);
});
