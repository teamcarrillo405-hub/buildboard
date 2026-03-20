#!/usr/bin/env npx tsx
/**
 * contactExtractor.ts — Playwright-based contact extractor for ConstructFlix
 *
 * Navigates verified company websites to extract email + phone from homepage
 * and contact pages, writing results directly to constructflix.db.
 *
 * Usage:
 *   npx tsx server/scripts/contactExtractor.ts
 *   npx tsx server/scripts/contactExtractor.ts --batch-size 50 --delay-ms 2000 --dry-run
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Browser, type BrowserContext } from 'playwright';

// ─── Config ───────────────────────────────────────────────────────────────────

const DB_PATH      = './server/constructflix.db';
const LOGS_DIR     = './logs';
const PROGRESS_FILE = path.join(LOGS_DIR, 'contact_extract_progress.json');
const LOG_FILE      = path.join(LOGS_DIR, 'contact_extract.log');

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (process.argv[i].startsWith('--')) {
    args[process.argv[i].slice(2)] = process.argv[i + 1] ?? 'true';
  }
}

const BATCH_SIZE   = parseInt(args['batch-size']   ?? '100');
const DELAY_MS     = parseInt(args['delay-ms']     ?? '1500');
const PAGE_TIMEOUT = parseInt(args['page-timeout'] ?? '15000');
const DRY_RUN      = process.argv.includes('--dry-run');

const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/about-us'];

// ─── Self-logging (so fd redirect not needed on Windows) ──────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

const origLog   = console.log.bind(console);
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

interface CompanyRow {
  id: string;
  businessName: string;
  website: string;
  phone: string | null;
}

interface ContactProgress {
  lastRowId: number;
  totalSearched: number;
  totalEmailFilled: number;
  totalPhoneFilled: number;
  errors: number;
  lastRunAt: string;
  lastBusiness: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Email Extraction (verbatim from enrichWorker.ts) ─────────────────────────

function extractEmails(html: string): string[] {
  const rx = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}\b/g;
  const raw = html.match(rx) ?? [];
  return [...new Set(raw)].filter(e =>
    !/(example|test|domain|email|noreply|no-reply|sentry|w3|schema|wix)\./.test(e) &&
    e.length < 80 &&
    !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.gif')
  );
}

// ─── Phone Extraction ─────────────────────────────────────────────────────────

function extractPhone(html: string): string | null {
  // Match common US phone formats: (555) 555-5555, 555-555-5555, 555.555.5555, +1-555-555-5555
  const rx = /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
  const matches = html.match(rx) ?? [];
  // Filter out obvious non-phone strings (zip codes, dates, etc.)
  const filtered = matches.filter(m => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 11;
  });
  return filtered[0] ?? null;
}

// ─── Playwright Browser (singleton per process) ───────────────────────────────

let _browser: Browser | null = null;

async function launchBrowser(): Promise<Browser> {
  if (_browser) {
    try {
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

// ─── Core Playwright Scraper ──────────────────────────────────────────────────

async function extractContactsFromPage(
  url: string,
  pageTimeout: number
): Promise<{ emails: string[]; phone: string | null; html: string }> {
  // Normalize URL — some DB records store bare domains without protocol
  const normalizedUrl = url.startsWith('http://') || url.startsWith('https://')
    ? url
    : `https://${url}`;

  const browser = await launchBrowser();
  let context: BrowserContext | null = null;
  let page: any = null;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    });
    page = await context.newPage();
    // Navigate with domcontentloaded (faster than networkidle, catches more pages)
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: pageTimeout });
    const html = await page.content();
    return {
      emails: extractEmails(html),
      phone: extractPhone(html),
      html,
    };
  } catch (err: any) {
    // CONT-03: navigation failures are not thrown — return empty result
    console.error(`[Page] Navigation failed for ${normalizedUrl}: ${err.message}`);
    return { emails: [], phone: null, html: '' };
  } finally {
    try { await page?.close(); } catch {}
    try { await context?.close(); } catch {}
  }
}

// ─── Progress Persistence ─────────────────────────────────────────────────────

function loadProgress(): ContactProgress {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return {
      lastRowId: 0,
      totalSearched: 0,
      totalEmailFilled: 0,
      totalPhoneFilled: 0,
      errors: 0,
      lastRunAt: new Date().toISOString(),
      lastBusiness: '',
    };
  }
}

function saveProgress(p: ContactProgress): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ─── Multi-page Contact Extraction (CONT-02, CONT-03) ────────────────────────

/**
 * Extracts email and phone for a single company.
 * Tries homepage first; if no email found, tries CONTACT_PATHS in order.
 * Never throws — all navigation errors are caught and logged.
 * (CONT-02, CONT-03)
 */
async function extractContactsForCompany(
  baseUrl: string,
  pageTimeout: number,
  existingPhone: string | null
): Promise<{ email: string | null; phone: string | null }> {
  // Step 1: Homepage
  const home = await extractContactsFromPage(baseUrl, pageTimeout);
  let foundEmail: string | null = home.emails[0] ?? null;
  let foundPhone: string | null = existingPhone ? null : (home.phone ?? null);

  // Step 2: Contact page fallback (CONT-02) — only if no email on homepage
  if (!foundEmail) {
    let origin: string;
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      // Malformed URL — skip contact page attempts
      return { email: null, phone: foundPhone };
    }

    for (const contactPath of CONTACT_PATHS) {
      const contactUrl = `${origin}${contactPath}`;
      console.log(`[Fallback] Trying ${contactUrl}`);
      const result = await extractContactsFromPage(contactUrl, pageTimeout);

      if (result.emails.length > 0) {
        foundEmail = result.emails[0];
        // Also pick up phone from contact page if still missing
        if (!foundPhone && result.phone) {
          foundPhone = result.phone;
        }
        break; // First hit wins — no need to try remaining paths
      }

      // Pick up phone even if no email found on this contact page
      if (!foundPhone && result.phone) {
        foundPhone = result.phone;
      }
    }

    if (!foundEmail) {
      console.log(`[Fallback] No email found on homepage or contact pages for ${baseUrl}`);
    }
  }

  return { email: foundEmail, phone: foundPhone };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let progress: ContactProgress;

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  progress = loadProgress();

  console.log('══════════════════════════════════════════════════════════');
  console.log('  ConstructFlix — Contact Extractor (Playwright)');
  console.log(`  Batch size  : ${BATCH_SIZE}`);
  console.log(`  Delay ms    : ${DELAY_MS}`);
  console.log(`  Page timeout: ${PAGE_TIMEOUT}`);
  console.log(`  DRY_RUN     : ${DRY_RUN}`);
  console.log(`  Resume from enrich_rank > ${progress.lastRowId} (priority-ordered)`);
  console.log('══════════════════════════════════════════════════════════');

  // SIGINT handler — save progress before exit (kill-safe)
  process.on('SIGINT', () => {
    console.log('\n[contactExtractor] SIGINT received — saving progress...');
    saveProgress(progress);
    process.exit(0);
  });

  // Two separate prepared statements — email and phone are written independently (CONT-05)
  const emailUpdateStmt = db.prepare(`
    UPDATE companies
    SET email = ?, lastUpdated = datetime('now')
    WHERE id = ? AND (email IS NULL OR email = '')
  `);

  const phoneUpdateStmt = db.prepare(`
    UPDATE companies
    SET phone = ?, lastUpdated = datetime('now')
    WHERE id = ? AND (phone IS NULL OR phone = '')
  `);

  // Cursor-based pagination using lastRowId — same pattern as enrichYelpContacts.ts
  while (true) {
    const batch = db.prepare(`
      SELECT id, businessName, website, phone
      FROM companies
      WHERE website IS NOT NULL AND website != ''
        AND (email IS NULL OR email = '')
        AND enrich_rank > ?
      ORDER BY enrich_rank
      LIMIT ?
    `).all(progress.lastRowId, BATCH_SIZE) as CompanyRow[];

    if (batch.length === 0) {
      console.log(
        `[contactExtractor] Complete! Searched=${progress.totalSearched} ` +
        `EmailFilled=${progress.totalEmailFilled} PhoneFilled=${progress.totalPhoneFilled} ` +
        `Errors=${progress.errors}`
      );
      break;
    }

    for (const company of batch) {
      try {
        const result = await extractContactsForCompany(company.website, PAGE_TIMEOUT, company.phone);
        const emailToWrite = result.email;
        const phoneToWrite = result.phone;

        // Write email only when field is currently null or empty (CONT-04)
        if (emailToWrite && !DRY_RUN) {
          emailUpdateStmt.run(emailToWrite, company.id);
          progress.totalEmailFilled++;
        } else if (emailToWrite && DRY_RUN) {
          console.log(`[DRY-RUN] Would write email="${emailToWrite}" for "${company.businessName}"`);
          progress.totalEmailFilled++;
        }

        // Write phone only when field is currently null or empty (CONT-05)
        const companyPhoneEmpty = !company.phone || company.phone === '';
        if (phoneToWrite && companyPhoneEmpty && !DRY_RUN) {
          phoneUpdateStmt.run(phoneToWrite, company.id);
          progress.totalPhoneFilled++;
        } else if (phoneToWrite && companyPhoneEmpty && DRY_RUN) {
          console.log(`[DRY-RUN] Would write phone="${phoneToWrite}" for "${company.businessName}"`);
          progress.totalPhoneFilled++;
        }

        progress.totalSearched++;
        progress.lastBusiness = company.businessName;

        // Advance cursor using enrich_rank (priority-ordered pagination)
        const rankInfo = db.prepare('SELECT enrich_rank FROM companies WHERE id = ?').get(company.id) as any;
        if (rankInfo) progress.lastRowId = rankInfo.enrich_rank;

        // Log every 25 records
        if (progress.totalSearched % 25 === 0) {
          console.log(
            `[contactExtractor] Searched=${progress.totalSearched} ` +
            `EmailFilled=${progress.totalEmailFilled} PhoneFilled=${progress.totalPhoneFilled} ` +
            `Last="${company.businessName}"`
          );
        }

        await sleep(DELAY_MS);
      } catch (err: any) {
        // Per-company catch — NEVER throw, always continue (CONT-03)
        progress.errors++;
        console.error(`[contactExtractor] ERROR on "${company.businessName}": ${err.message ?? err}`);
        await sleep(DELAY_MS * 2);
      }
    }

    // Save progress after each batch
    saveProgress(progress);
  }

  // Final save before exit
  progress.lastRunAt = new Date().toISOString();
  saveProgress(progress);

  db.close();
  await closeBrowser();
}

main().catch(async err => {
  console.error('Fatal:', err);
  await closeBrowser();
  process.exit(1);
});
