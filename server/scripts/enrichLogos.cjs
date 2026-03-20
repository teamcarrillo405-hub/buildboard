/**
 * enrichLogos.cjs
 *
 * Finds company logos/images by scraping og:image meta tags from each
 * company's own website. og:image is what companies set for social sharing —
 * usually their logo or a representative business photo.
 *
 * Fallback: if og:image not found, checks DuckDuckGo's icon service
 * and accepts it only if the response is > 3KB (real logo, not a tiny favicon).
 *
 * Run:  node server/scripts/enrichLogos.cjs
 * Dry:  node server/scripts/enrichLogos.cjs --dry
 *
 * Resumable — progress saved in logs/enrich_logos_progress.json.
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const CONCURRENCY    = 12;
const BATCH_SIZE     = 300;
const DELAY_MS       = 100;
const PAGE_TIMEOUT   = 5000;  // ms to wait for website response
const DDG_MIN_BYTES  = 3000;  // DDG icons under this are tiny favicons — skip

const DRY_RUN   = process.argv.includes('--dry');
const DB_PATH   = path.join(__dirname, '..', 'constructflix.db');
const LOGS_DIR  = path.join(__dirname, '..', '..', 'logs');
const PROG_FILE = path.join(LOGS_DIR, 'enrich_logos_progress.json');
const LOG_FILE  = path.join(LOGS_DIR, 'enrich_logos.log');

fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toISOString().slice(0, 19)}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ── Progress ──────────────────────────────────────────────────────────────────
function loadProgress() {
  if (fs.existsSync(PROG_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROG_FILE, 'utf-8')); } catch {}
  }
  return { checked: 0, foundOg: 0, foundDdg: 0, notFound: 0, errors: 0, startedAt: new Date().toISOString() };
}
function saveProgress(p) {
  p.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(PROG_FILE, JSON.stringify(p, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractDomain(url) {
  try {
    return new URL(url.startsWith('http') ? url : 'https://' + url)
      .hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}

function makeAbsolute(imgUrl, baseUrl) {
  if (!imgUrl) return null;
  imgUrl = imgUrl.trim();
  if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) return imgUrl;
  try {
    return new URL(imgUrl, baseUrl).href;
  } catch { return null; }
}

function isLikelyImage(url) {
  if (!url) return false;
  // Accept URLs with image extensions or from known CDNs
  if (/\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url)) return true;
  // Accept CDN-style URLs (often no extension)
  if (/\/(images?|media|assets|uploads|static|photos?|logo)\//i.test(url)) return true;
  // Accept if URL contains 'logo' or 'image'
  if (/logo|image|photo/i.test(url)) return true;
  return false;
}

// ── og:image scraper ──────────────────────────────────────────────────────────
async function getOgImage(websiteUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT);

  try {
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BuildBoard/1.0; +https://buildboard.hcc.org)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;

    // Read just the first 30KB — enough to get the <head>
    const reader = res.body.getReader();
    let html = '';
    while (html.length < 30_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      if (html.includes('</head>')) break;
    }
    reader.cancel().catch(() => {});

    // Extract og:image
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    if (!ogMatch) return null;
    const imgUrl = makeAbsolute(ogMatch[1], websiteUrl);
    return imgUrl && isLikelyImage(imgUrl) ? imgUrl : null;

  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ── DuckDuckGo icon fallback ──────────────────────────────────────────────────
async function getDdgIcon(domain) {
  const url = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    // Check size — tiny responses are just default favicon placeholders
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > 0 && len < DDG_MIN_BYTES) return null;
    // If no content-length header, consume a bit to estimate
    if (len === 0) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength < DDG_MIN_BYTES) return null;
    }
    return url;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ── Find logo for one company ─────────────────────────────────────────────────
async function findLogo(row) {
  const domain = extractDomain(row.website);
  if (!domain) return { logoUrl: null, source: 'no-domain' };

  // 1. Try og:image from website
  const ogImage = await getOgImage(row.website);
  if (ogImage) return { logoUrl: ogImage, source: 'og' };

  // 2. Try DDG icon (only if it's a real logo, not a tiny favicon)
  const ddgIcon = await getDdgIcon(domain);
  if (ddgIcon) return { logoUrl: ddgIcon, source: 'ddg' };

  return { logoUrl: null, source: 'none' };
}

// ── Concurrency pool ──────────────────────────────────────────────────────────
async function runConcurrent(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Concurrency: ${CONCURRENCY}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  const progress = loadProgress();
  log(`Resuming — checked: ${progress.checked.toLocaleString()}, found og: ${progress.foundOg}, ddg: ${progress.foundDdg}`);

  const rows = db.prepare(`
    SELECT id, businessName, website
    FROM companies
    WHERE (imageUrl IS NULL OR imageUrl = '')
      AND website IS NOT NULL AND website != ''
    ORDER BY id
    LIMIT -1 OFFSET ?
  `).all(progress.checked);

  log(`Remaining to check: ${rows.length.toLocaleString()}`);

  if (rows.length === 0) {
    log('Nothing left to check.');
    db.close(); logStream.end(); return;
  }

  const updateStmt = db.prepare(
    "UPDATE companies SET imageUrl = ?, lastUpdated = datetime('now') WHERE id = ?"
  );

  let batchStart = 0;

  while (batchStart < rows.length) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    const tasks = batch.map(row => async () => {
      try {
        const result = await findLogo(row);
        return { row, ...result };
      } catch {
        return { row, logoUrl: null, source: 'error' };
      }
    });

    const results = await runConcurrent(tasks, CONCURRENCY);

    if (!DRY_RUN) {
      const apply = db.transaction(items => {
        for (const { row, logoUrl } of items) {
          if (logoUrl) updateStmt.run(logoUrl, row.id);
        }
      });
      apply(results);
    }

    let batchFound = 0;
    for (const { logoUrl, source } of results) {
      if (logoUrl) {
        batchFound++;
        if (source === 'og') progress.foundOg++;
        else progress.foundDdg++;
      } else if (source === 'error') {
        progress.errors++;
      } else {
        progress.notFound++;
      }
    }
    progress.checked += batch.length;
    saveProgress(progress);

    const totalFound = progress.foundOg + progress.foundDdg;
    log(
      `Batch ${Math.ceil(batchStart / BATCH_SIZE) + 1}: ` +
      `+${batchFound} logos | Total: ${totalFound.toLocaleString()} found / ${progress.checked.toLocaleString()} checked ` +
      `(og:${progress.foundOg} ddg:${progress.foundDdg})`
    );

    batchStart += BATCH_SIZE;
    if (batchStart < rows.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  const totalImages = db.prepare(
    "SELECT COUNT(*) as n FROM companies WHERE imageUrl IS NOT NULL AND imageUrl != ''"
  ).get().n;

  log('\n=== Logo Enrichment Complete ===');
  log(`Checked:       ${progress.checked.toLocaleString()}`);
  log(`Found og:image ${progress.foundOg.toLocaleString()}`);
  log(`Found DDG icon ${progress.foundDdg.toLocaleString()}`);
  log(`Not found:     ${progress.notFound.toLocaleString()}`);
  log(`Errors:        ${progress.errors.toLocaleString()}`);
  log(`DB total with image: ${totalImages.toLocaleString()}`);

  db.close();
  logStream.end();
}

main().catch(err => { console.error(err); process.exit(1); });
