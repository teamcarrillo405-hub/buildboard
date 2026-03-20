#!/usr/bin/env npx tsx
/**
 * importBBBApify.ts
 *
 * Imports BBB (Better Business Bureau) contractor data using the Apify
 * BBB scrapers. Run this after your Apify monthly limit resets.
 *
 * Uses: apify/canadesk/bulk-bbb or apify/piotrv1001/bbb-advanced-scraper
 *
 * Results are saved to server/data/bbb/ as JSON files, then matched
 * against the DB using the gmapsEnrich matching logic.
 *
 * Usage:
 *   # Step 1: Download from Apify (requires valid Apify API token)
 *   npx tsx server/scripts/importBBBApify.ts --download --dataset <datasetId>
 *
 *   # Step 2: Import a downloaded JSON file into the DB
 *   npx tsx server/scripts/importBBBApify.ts --import server/data/bbb/dataset.json
 *
 *   # Dry run to see match stats without writing
 *   npx tsx server/scripts/importBBBApify.ts --import server/data/bbb/dataset.json --dry-run
 *
 * Recommended Apify runs for BBB:
 *   Actor: canadesk/bulk-bbb
 *   Input: { "category": "building-contractors", "state": "FL", "maxResults": 5000 }
 *
 *   Actor: piotrv1001/bbb-advanced-scraper
 *   Input: { "searchTerms": ["general contractor","plumber","electrician","roofer"],
 *             "location": "United States", "maxItems": 50000 }
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const MODE = args.includes('--download') ? 'download' : args.includes('--import') ? 'import' : null;
const DRY_RUN = args.includes('--dry-run');
const importFile = args.find((a, i) => args[i - 1] === '--import');
const datasetId = args.find((a, i) => args[i - 1] === '--dataset');

const DB_PATH = './server/constructflix.db';
const OUT_DIR = 'server/data/bbb';

if (!MODE) {
  console.error('Usage:');
  console.error('  npx tsx server/scripts/importBBBApify.ts --download --dataset <id>');
  console.error('  npx tsx server/scripts/importBBBApify.ts --import <file.json> [--dry-run]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Download mode: fetch Apify dataset
// ---------------------------------------------------------------------------

if (MODE === 'download') {
  if (!datasetId) { console.error('--dataset <id> required'); process.exit(1); }
  const token = process.env.APIFY_API_TOKEN;
  if (!token) { console.error('APIFY_API_TOKEN not set in .env'); process.exit(1); }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${datasetId}.json`);
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true&token=${token}`;

  console.log(`Downloading dataset ${datasetId}...`);
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`Failed: ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }
  const items = await resp.json() as any[];
  fs.writeFileSync(outFile, JSON.stringify(items, null, 2));
  console.log(`Saved ${items.length} items to ${outFile}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Import mode: match BBB records to DB
// ---------------------------------------------------------------------------

if (!importFile || !fs.existsSync(importFile)) {
  console.error(`File not found: ${importFile}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(importFile, 'utf-8'));
const items: any[] = Array.isArray(raw) ? raw : raw.items || raw.data || [];
console.log(`Loaded ${items.length} BBB records from ${importFile}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const LEGAL_SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc|pc|pa)\b\.?/gi;
function normalizeName(name: string): string {
  return name.toLowerCase().replace(LEGAL_SUFFIXES, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  return inter / new Set([...ta, ...tb]).size;
}

const STATE_ABBREV: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

function toStateCode(s: string): string {
  if (!s) return '';
  const u = s.trim().toUpperCase();
  if (u.length === 2) return u;
  return STATE_ABBREV[s.trim().toLowerCase()] || u;
}

const findByZip = db.prepare('SELECT id, businessName, phone, website, email FROM companies WHERE zipCode = ?');
const findByCity = db.prepare('SELECT id, businessName, phone, website, email FROM companies WHERE LOWER(city) = ? AND UPPER(state) = ?');
const updateStmt = db.prepare(`
  UPDATE companies SET
    phone   = CASE WHEN (phone IS NULL OR phone = '') THEN ? ELSE phone END,
    website = CASE WHEN (website IS NULL OR website = '') THEN ? ELSE website END,
    email   = CASE WHEN (email IS NULL OR email = '') THEN ? ELSE email END,
    lastUpdated = ?
  WHERE id = ?
`);

// Also track new BBB-only records (not in DB) for optional insert
const insertNew = db.prepare(`
  INSERT OR IGNORE INTO companies (id, businessName, city, state, zipCode, address, phone, website, email, dataSource, lastUpdated)
  VALUES (@id, @businessName, @city, @state, @zipCode, @address, @phone, @website, @email, 'bbb', @lastUpdated)
`);

let matched = 0, noMatch = 0, updatedPhone = 0, updatedWebsite = 0, updatedEmail = 0, newInserted = 0;
const now = new Date().toISOString();

const runAll = db.transaction(() => {
  for (const item of items) {
    // BBB record fields (different scrapers use different field names)
    const name = item.businessName || item.name || item.title || '';
    const phone = item.phone || item.phoneNumber || '';
    const website = item.website || item.websiteUrl || item.url || '';
    const email = item.email || '';
    const addr = item.address || item.streetAddress || '';
    const city = (item.city || item.cityName || '').toLowerCase();
    const stateRaw = item.state || item.stateCode || '';
    const zip = item.zipCode || item.postalCode || item.zip || '';
    const state = toStateCode(stateRaw);

    if (!name || !state) { noMatch++; continue; }

    const hasData = phone || website || email;
    if (!hasData) { noMatch++; continue; }

    // Find candidates in DB
    let candidates: any[] = zip ? findByZip.all(zip) as any[] : [];
    if (!candidates.length && city && state) {
      candidates = findByCity.all(city, state) as any[];
    }

    if (!candidates.length) {
      // No match — optionally insert as new record
      if (!DRY_RUN) {
        insertNew.run({ id: `bbb-${randomUUID()}`, businessName: name, city: item.city || '', state, zipCode: zip, address: addr, phone: phone || null, website: website || null, email: email || null, lastUpdated: now });
        newInserted++;
      }
      noMatch++;
      continue;
    }

    // Find best name match
    let best: any = null, bestScore = 0;
    for (const c of candidates) {
      const score = nameSimilarity(name, c.businessName);
      if (score >= 0.65 && score > bestScore) { bestScore = score; best = c; }
    }

    if (!best) { noMatch++; continue; }

    const willUpdatePhone = (!best.phone) && phone;
    const willUpdateWebsite = (!best.website) && website;
    const willUpdateEmail = (!best.email) && email;

    if (!willUpdatePhone && !willUpdateWebsite && !willUpdateEmail) { matched++; continue; }

    if (!DRY_RUN) {
      updateStmt.run(phone || null, website || null, email || null, now, best.id);
    }
    matched++;
    if (willUpdatePhone) updatedPhone++;
    if (willUpdateWebsite) updatedWebsite++;
    if (willUpdateEmail) updatedEmail++;
  }
});

runAll();
db.close();

console.log('\n════════════════════════════════════════');
console.log('  BBB Import Results');
console.log('════════════════════════════════════════');
console.log(`  Total BBB records  : ${items.length}`);
console.log(`  Matched existing   : ${matched}`);
console.log(`    → Phone filled   : ${updatedPhone}`);
console.log(`    → Website filled : ${updatedWebsite}`);
console.log(`    → Email filled   : ${updatedEmail}`);
console.log(`  No DB match        : ${noMatch}`);
console.log(`  New records added  : ${newInserted}`);
if (DRY_RUN) console.log('  ⚠ DRY RUN — no changes written');
console.log('════════════════════════════════════════');
