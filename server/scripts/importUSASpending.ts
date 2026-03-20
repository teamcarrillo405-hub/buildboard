#!/usr/bin/env npx tsx
/**
 * importUSASpending.ts
 *
 * Imports construction contractors from USAspending.gov (federal contracts).
 * Uses their free REST API — no API key required.
 *
 * Targets NAICS codes 23xxxx (all construction trades):
 *   236xxx - Building construction
 *   237xxx - Heavy/civil engineering
 *   238xxx - Specialty trade contractors
 *
 * USAspending API docs: https://api.usaspending.gov/docs/
 *
 * Usage:
 *   npx tsx server/scripts/importUSASpending.ts [--dry-run] [--limit 1000]
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1] || '100000') : 100000;

const DB_PATH = './server/constructflix.db';
const API_BASE = 'https://api.usaspending.gov/api/v2';
const PAGE_SIZE = 100; // USAspending max page size
const RATE_LIMIT_MS = 300; // Be polite: 300ms between requests

// Construction NAICS prefixes
const CONSTRUCTION_NAICS_PREFIXES = ['236', '237', '238'];

const STATE_CODES: Record<string, string> = {
  'AL': 'AL', 'AK': 'AK', 'AZ': 'AZ', 'AR': 'AR', 'CA': 'CA',
  'CO': 'CO', 'CT': 'CT', 'DE': 'DE', 'FL': 'FL', 'GA': 'GA',
  'HI': 'HI', 'ID': 'ID', 'IL': 'IL', 'IN': 'IN', 'IA': 'IA',
  'KS': 'KS', 'KY': 'KY', 'LA': 'LA', 'ME': 'ME', 'MD': 'MD',
  'MA': 'MA', 'MI': 'MI', 'MN': 'MN', 'MS': 'MS', 'MO': 'MO',
  'MT': 'MT', 'NE': 'NE', 'NV': 'NV', 'NH': 'NH', 'NJ': 'NJ',
  'NM': 'NM', 'NY': 'NY', 'NC': 'NC', 'ND': 'ND', 'OH': 'OH',
  'OK': 'OK', 'OR': 'OR', 'PA': 'PA', 'RI': 'RI', 'SC': 'SC',
  'SD': 'SD', 'TN': 'TN', 'TX': 'TX', 'UT': 'UT', 'VT': 'VT',
  'VA': 'VA', 'WA': 'WA', 'WV': 'WV', 'WI': 'WI', 'WY': 'WY', 'DC': 'DC',
};

function naicsToCategory(naics: string): string {
  const prefix3 = naics.slice(0, 3);
  const prefix4 = naics.slice(0, 4);
  if (prefix3 === '236') return 'General Contractor';
  if (prefix3 === '237') return 'General Contractor';
  if (prefix4 === '2381') return 'Foundation & Structure';
  if (prefix4 === '2382') return 'HVAC';
  if (prefix4 === '2383') return 'Electrical';
  if (prefix4 === '2384') return 'Masonry Contractors';
  if (prefix4 === '2385') return 'Carpentry';
  if (prefix4 === '2386') return 'Roofing';
  if (prefix4 === '2387') return 'Siding & Insulation';
  if (prefix4 === '2389') return 'General Contractor';
  if (naics === '238210') return 'Electrical';
  if (naics === '238220') return 'Plumbing';
  if (naics === '238290') return 'HVAC';
  if (naics === '238310') return 'Flooring';
  if (naics === '238320') return 'Painting';
  if (naics === '238330') return 'Flooring';
  if (naics === '238340') return 'Tile Installation';
  if (naics === '238350') return 'Carpentry';
  if (naics === '238390') return 'General Contractor';
  return 'General Contractor';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface Recipient {
  recipient_name: string;
  recipient_unique_id: string; // DUNS/UEI
  location: {
    address_line1: string | null;
    city_name: string | null;
    state_code: string | null;
    zip5: string | null;
    country_name: string | null;
  };
}

interface Award {
  recipient: Recipient;
  naics_code: string;
  naics_description: string;
}

async function fetchPage(naicsCode: string, page: number): Promise<{ results: Award[]; hasNext: boolean }> {
  const body = {
    filters: {
      award_type_codes: ['A', 'B', 'C', 'D'], // all contract types
      naics_codes: [naicsCode],
    },
    fields: [
      'Recipient Name',
      'recipient_location_address_line1',
      'recipient_location_city_name',
      'recipient_location_state_code',
      'recipient_location_zip5',
      'NAICS Code',
    ],
    page,
    limit: PAGE_SIZE,
    sort: 'Recipient Name',
    order: 'asc',
  };

  const resp = await fetch(`${API_BASE}/search/spending_by_award/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  const results = (data.results || []).map((r: any) => ({
    recipient: {
      recipient_name: (r['Recipient Name'] || '').replace(/^"|"$/g, '').trim(),
      recipient_unique_id: '',
      location: {
        address_line1: r.recipient_location_address_line1 || null,
        city_name: r.recipient_location_city_name || null,
        state_code: r.recipient_location_state_code || null,
        zip5: r.recipient_location_zip5 || null,
        country_name: null,
      },
    },
    naics_code: r['NAICS Code'] || naicsCode,
    naics_description: '',
  }));

  return {
    results,
    hasNext: data.page_metadata?.hasNext ?? false,
  };
}

// All 6-digit construction NAICS codes
const CONSTRUCTION_NAICS_CODES = [
  '236115', '236116', '236117', '236118', '236210', '236220',
  '237110', '237120', '237130', '237210', '237310', '237990',
  '238110', '238120', '238130', '238140', '238150', '238160',
  '238170', '238190', '238210', '238220', '238290', '238310',
  '238320', '238330', '238340', '238350', '238390', '238910',
  '238990',
];

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO companies (
      id, businessName, category, city, state, zipCode, address,
      dataSource, lastUpdated
    ) VALUES (
      @id, @businessName, @category, @city, @state, @zipCode, @address,
      'sam_gov', @lastUpdated
    )
  `);

  // Track unique recipients to avoid duplicates within this run
  const seen = new Set<string>();

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  const now = new Date().toISOString();

  console.log('════════════════════════════════════════════════');
  console.log('  USAspending.gov Construction Contractor Import');
  console.log('════════════════════════════════════════════════');
  console.log(`  NAICS codes  : ${CONSTRUCTION_NAICS_CODES.length}`);
  console.log(`  Max records  : ${LIMIT.toLocaleString()}`);
  console.log(`  Mode         : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('════════════════════════════════════════════════\n');

  const insertBatch = db.transaction((records: any[]) => {
    for (const r of records) {
      if (DRY_RUN) { totalInserted++; continue; }
      const result = insert.run(r);
      if (result.changes > 0) totalInserted++;
      else totalSkipped++;
    }
  });

  outer:
  for (const naics of CONSTRUCTION_NAICS_CODES) {
    let page = 1;
    let hasNext = true;
    const category = naicsToCategory(naics);

    while (hasNext) {
      try {
        await sleep(RATE_LIMIT_MS);
        const { results, hasNext: more } = await fetchPage(naics, page);
        hasNext = more;

        const batch: any[] = [];
        for (const award of results) {
          const r = award.recipient;
          if (!r.recipient_name || r.recipient_name.trim() === '') continue;
          if (r.location.country_name && r.location.country_name !== 'UNITED STATES') continue;
          if (r.location.state_code && !STATE_CODES[r.location.state_code.toUpperCase()]) continue;

          // Dedup within this run by name+zip
          const key = `${r.recipient_name.toLowerCase().trim()}|${r.location.zip5 || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);

          batch.push({
            id: `sam-${randomUUID()}`,
            businessName: r.recipient_name.trim(),
            category,
            city: r.location.city_name || '',
            state: r.location.state_code?.toUpperCase() || '',
            zipCode: r.location.zip5 || '',
            address: r.location.address_line1 || '',
            lastUpdated: now,
          });
          totalFetched++;
        }

        insertBatch(batch);

        if (totalFetched % 500 === 0) {
          console.log(`[usaspending] NAICS ${naics} p${page} — ${totalFetched.toLocaleString()} fetched, ${totalInserted.toLocaleString()} inserted`);
        }

        page++;
        if (totalFetched >= LIMIT) {
          console.log(`[usaspending] Reached limit of ${LIMIT.toLocaleString()} records.`);
          break outer;
        }
      } catch (err) {
        console.error(`[usaspending] Error NAICS ${naics} p${page}:`, err);
        await sleep(2000);
        hasNext = false; // Skip to next NAICS on error
      }
    }

    console.log(`[usaspending] ✓ NAICS ${naics} (${category}) complete`);
  }

  db.close();

  console.log('\n════════════════════════════════════════════════');
  console.log('  Done!');
  console.log(`  Total fetched  : ${totalFetched.toLocaleString()}`);
  console.log(`  New inserted   : ${totalInserted.toLocaleString()}`);
  console.log(`  Skipped (dupe) : ${totalSkipped.toLocaleString()}`);
  if (DRY_RUN) console.log('  ⚠ DRY RUN — no changes written');
  console.log('════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('[usaspending] Fatal:', err);
  process.exit(1);
});
