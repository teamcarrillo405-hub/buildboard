/**
 * firecrawlSync.ts — FireCrawl-powered scraper for state license databases
 * that don't publish bulk CSV downloads.
 *
 * Handles two sub-modes:
 *
 *   'discover' — FireCrawl scrapes the agency's posting/download page to find
 *                the current CSV URL, then hands off to stateLicenseSync.
 *                Used for: AZ (ROC publishes dated CSV files at changing URLs)
 *
 *   'paginate' — FireCrawl paginates through the agency's web search UI,
 *                extracting structured data from each results page using an
 *                LLM extraction schema.
 *                Used for: FL (DBPR), NC (NCLBGC), CO (DORA)
 *
 * FireCrawl API key: process.env.FIRECRAWL_API_KEY
 *
 * Usage:
 *   import { runFirecrawlSync } from './firecrawlSync.js';
 *   await runFirecrawlSync(STATE_CONFIGS.AZ);
 *   await runFirecrawlSync(STATE_CONFIGS.FL, { maxPages: 500 });
 */

import { randomUUID } from 'crypto';
import { sqlite } from '../db.js';
import { type StateConfig, resolveCategory } from '../data/stateLicenseConfigs.js';
import { normalizeName, type StateSyncStats } from './stateLicenseSync.js';
import { runStateLicenseSync } from './stateLicenseSync.js';

// ─────────────────────────────────────────────────────────────────────────────
// FireCrawl client helpers
// ─────────────────────────────────────────────────────────────────────────────

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1';

async function firecrawlScrape(url: string, apiKey: string): Promise<string> {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  });
  if (!res.ok) throw new Error(`FireCrawl scrape error ${res.status}: ${await res.text()}`);
  const json = await res.json() as { success: boolean; data: { markdown: string } };
  return json.data?.markdown ?? '';
}

interface ExtractResult {
  data: ContractorListing[];
}

interface ContractorListing {
  licenseNumber?: string;
  businessName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  licenseType?: string;
  status?: string;
  expireDate?: string;
}

async function firecrawlExtract(
  url: string,
  prompt: string,
  schema: object,
  apiKey: string,
): Promise<ContractorListing[]> {
  const res = await fetch(`${FIRECRAWL_BASE}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      urls: [url],
      prompt,
      schema,
      enableWebSearch: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error('FIRECRAWL_RATE_LIMIT');
    throw new Error(`FireCrawl extract error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json() as ExtractResult;
  return json.data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 1: Discover CSV URL from agency posting page (AZ ROC pattern)
// ─────────────────────────────────────────────────────────────────────────────

const CSV_URL_PATTERN = /https?:\/\/[^\s"')]+\.csv/gi;

async function discoverAndDownloadCsv(
  config: StateConfig,
  apiKey: string,
): Promise<StateSyncStats> {
  console.log(`[firecrawlSync] ${config.stateCode}: discovering CSV URL from ${config.downloadUrl}`);

  const markdown = await firecrawlScrape(config.downloadUrl, apiKey);
  const csvUrls = [...markdown.matchAll(CSV_URL_PATTERN)].map(m => m[0]);

  if (csvUrls.length === 0) {
    console.error(`[firecrawlSync] ${config.stateCode}: no CSV links found on posting page`);
    return buildEmptyStats(config.stateCode, 'No CSV links found on posting page');
  }

  // Prefer URLs with "active" in the name over "new" or "disciplinary"
  const activeUrl = csvUrls.find(u => /active/i.test(u))
    ?? csvUrls.find(u => /current|all/i.test(u))
    ?? csvUrls[0];

  console.log(`[firecrawlSync] ${config.stateCode}: found CSV → ${activeUrl}`);

  // Override the download URL and hand off to the CSV pipeline
  const csvConfig: StateConfig = { ...config, downloadUrl: activeUrl, format: 'csv' };
  return runStateLicenseSync(csvConfig);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 2: Paginated LLM extraction (FL, NC, CO pattern)
// ─────────────────────────────────────────────────────────────────────────────

// JSON Schema describing what to extract from each search results page
const CONTRACTOR_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    contractors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          licenseNumber: { type: 'string', description: 'License or registration number' },
          businessName:  { type: 'string', description: 'Business or company name' },
          address:       { type: 'string', description: 'Street address' },
          city:          { type: 'string', description: 'City' },
          state:         { type: 'string', description: 'State abbreviation' },
          zipCode:       { type: 'string', description: 'ZIP code' },
          phone:         { type: 'string', description: 'Phone number' },
          licenseType:   { type: 'string', description: 'License type or classification' },
          status:        { type: 'string', description: 'License status (active/expired/etc)' },
          expireDate:    { type: 'string', description: 'Expiration date' },
        },
        required: ['licenseNumber', 'businessName'],
      },
    },
    nextPageUrl: {
      type: 'string',
      description: 'URL of the next page of results, if one exists',
    },
  },
  required: ['contractors'],
};

function buildExtractPrompt(config: StateConfig): string {
  return [
    `Extract all contractor license records visible on this page from ${config.agency} (${config.stateName}).`,
    'For each contractor, extract: license number, business name, address, city, state, zip, phone, license type/classification, license status, and expiration date.',
    'Also identify the URL of the next page of results if pagination is present.',
    'Return structured data only — do not include any commentary.',
  ].join(' ');
}

function upsertExtractedRecord(
  raw: ContractorListing,
  config: StateConfig,
): 'inserted' | 'enriched' | 'skipped' {
  if (!raw.licenseNumber || !raw.businessName) return 'skipped';

  const now = new Date().toISOString();
  const normalizedName = normalizeName(raw.businessName);
  const category = resolveCategory(raw.licenseType ?? '', config);
  const status = (raw.status ?? 'unknown').toLowerCase().includes('active') ? 'active' : 'inactive';

  // Enrich existing record if license number already known
  const enrich = sqlite.prepare(`
    UPDATE companies SET
      licenseStatus = @status,
      licenseType   = @licenseType,
      licenseExpiry = @expireDate,
      verificationStatus = CASE WHEN @status = 'active' THEN 'verified' ELSE verificationStatus END,
      lastUpdated   = @now
    WHERE licenseNumber = @licenseNumber
  `).run({
    licenseNumber: raw.licenseNumber,
    status,
    licenseType: raw.licenseType ?? null,
    expireDate: raw.expireDate ?? null,
    now,
  });

  if (enrich.changes > 0) return 'enriched';

  // Check for name+zip match
  if (normalizedName && raw.zipCode) {
    const nameMatch = sqlite.prepare(`
      UPDATE companies SET
        licenseNumber = @licenseNumber,
        licenseStatus = @status,
        licenseType   = @licenseType,
        licenseExpiry = @expireDate,
        verificationStatus = CASE WHEN @status = 'active' THEN 'verified' ELSE verificationStatus END,
        lastUpdated   = @now
      WHERE LOWER(businessName) LIKE @fuzzyName
        AND zipCode LIKE @zip
        AND (licenseNumber IS NULL OR licenseNumber = '')
    `).run({
      licenseNumber: raw.licenseNumber,
      status,
      licenseType: raw.licenseType ?? null,
      expireDate: raw.expireDate ?? null,
      now,
      fuzzyName: `%${normalizedName}%`,
      zip: `${(raw.zipCode ?? '').slice(0, 5)}%`,
    });

    if (nameMatch.changes > 0) return 'enriched';
  }

  // Check for pre-existing license record to avoid duplicates
  const existing = sqlite.prepare(`
    SELECT id FROM companies WHERE licenseNumber = @n AND state = @s LIMIT 1
  `).get({ n: raw.licenseNumber, s: config.stateCode });

  if (existing) return 'skipped';

  // Insert new government-verified record
  sqlite.prepare(`
    INSERT INTO companies (
      id, businessName, category, city, state, zipCode, address, phone,
      licenseNumber, licenseStatus, licenseType, licenseExpiry,
      verificationStatus, dataSource, lastUpdated
    ) VALUES (
      @id, @businessName, @category, @city, @state, @zipCode, @address, @phone,
      @licenseNumber, @status, @licenseType, @expireDate,
      @verificationStatus, @dataSource, @now
    )
  `).run({
    id:                randomUUID(),
    businessName:      raw.businessName,
    category,
    city:              raw.city ?? '',
    state:             raw.state ?? config.stateCode,
    zipCode:           raw.zipCode?.slice(0, 5) ?? null,
    address:           raw.address ?? null,
    phone:             raw.phone ?? null,
    licenseNumber:     raw.licenseNumber,
    status,
    licenseType:       raw.licenseType ?? null,
    expireDate:        raw.expireDate ?? null,
    verificationStatus: status === 'active' ? 'verified' : 'unverified',
    dataSource:        `license_${config.stateCode.toLowerCase()}`,
    now,
  });

  return 'inserted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function buildEmptyStats(stateCode: string, error?: string): StateSyncStats {
  return {
    state: stateCode,
    totalParsed: 0,
    inserted: 0,
    enrichedYelp: 0,
    enrichedLicense: 0,
    skipped: 0,
    errors: error ? 1 : 0,
    durationMs: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

interface FirecrawlSyncOptions {
  maxPages?: number;   // Safety limit for paginated scrape (default: 200)
  delayMs?: number;    // Delay between pages (default: 1500ms)
}

export async function runFirecrawlSync(
  config: StateConfig,
  options: FirecrawlSyncOptions = {},
): Promise<StateSyncStats> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not set in .env');

  const { maxPages = 200, delayMs = 1500 } = options;
  const start = Date.now();

  // AZ: discover CSV URL first, then CSV import
  if (config.stateCode === 'AZ') {
    return discoverAndDownloadCsv(config, apiKey);
  }

  // FL, NC, CO: paginated LLM extraction
  const stats: StateSyncStats = buildEmptyStats(config.stateCode);
  const prompt = buildExtractPrompt(config);
  let currentUrl: string | undefined = config.downloadUrl;
  let pageNum = 0;

  console.log(`[firecrawlSync] ${config.stateCode} (${config.agency}): starting paginated extraction`);
  console.log(`  Seed URL: ${currentUrl}`);
  console.log(`  Max pages: ${maxPages}`);

  while (currentUrl && pageNum < maxPages) {
    pageNum++;
    console.log(`[firecrawlSync] ${config.stateCode}: page ${pageNum} — ${currentUrl}`);

    try {
      const extracted = await firecrawlExtract(currentUrl, prompt, CONTRACTOR_EXTRACTION_SCHEMA, apiKey);

      // The extract API returns an array; we expect an object with contractors[]
      const listings: ContractorListing[] = Array.isArray(extracted)
        ? (extracted as unknown as Array<{ contractors?: ContractorListing[] }>).flatMap(r => r.contractors ?? [])
        : [];

      if (listings.length === 0) {
        console.log(`[firecrawlSync] ${config.stateCode}: no records on page ${pageNum}, stopping`);
        break;
      }

      // Upsert in a transaction
      const tx = sqlite.transaction((items: ContractorListing[]) => {
        for (const item of items) {
          const result = upsertExtractedRecord(item, config);
          stats.totalParsed++;
          if (result === 'inserted') stats.inserted++;
          else if (result === 'enriched') stats.enrichedYelp++;
          else stats.skipped++;
        }
      });
      tx(listings);

      console.log(`[firecrawlSync] ${config.stateCode}: page ${pageNum} → ${listings.length} records (+${stats.inserted} total inserted)`);

      // Find next page URL from first extraction result
      const firstResult = Array.isArray(extracted)
        ? extracted[0] as unknown as { nextPageUrl?: string }
        : null;
      currentUrl = firstResult?.nextPageUrl ?? undefined;

      if (!currentUrl) {
        console.log(`[firecrawlSync] ${config.stateCode}: no next page — complete`);
        break;
      }

      await new Promise(r => setTimeout(r, delayMs));
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'FIRECRAWL_RATE_LIMIT') {
        console.warn(`[firecrawlSync] ${config.stateCode}: rate limited on page ${pageNum}, stopping`);
        break;
      }
      console.error(`[firecrawlSync] ${config.stateCode}: error on page ${pageNum}:`, err);
      stats.errors++;
      break;
    }
  }

  stats.durationMs = Date.now() - start;
  const mins = (stats.durationMs / 60_000).toFixed(1);
  console.log(`[firecrawlSync] ${config.stateCode}: done in ${mins}m — ${stats.inserted} inserted, ${stats.enrichedYelp} enriched, ${stats.errors} errors`);
  return stats;
}
