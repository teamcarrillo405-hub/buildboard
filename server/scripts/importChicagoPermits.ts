#!/usr/bin/env npx tsx
/**
 * importChicagoPermits.ts
 *
 * Imports construction contractor data from Chicago Open Data portal.
 * Dataset: Building Permits (2006-present)
 * URL: https://data.cityofchicago.org/resource/ydr8-5enu.json
 *
 * Contractor fields: contact_1_name/type, contact_2_name/type, etc.
 * Contact types include: CONTRACTOR, GENERAL CONTRACTOR, OWNER, etc.
 *
 * Usage:
 *   npx tsx server/scripts/importChicagoPermits.ts [--dry-run] [--limit 50000]
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MAX_RECORDS = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 ? parseInt(args[idx + 1] || '999999') : 999999;
})();

const DB_PATH = './server/constructflix.db';
const DATASET_URL = 'https://data.cityofchicago.org/resource/ydr8-5enu.json';
const PAGE_SIZE = 1000;
const RATE_LIMIT_MS = 150;

// Contact types that represent contractors (not owners)
const CONTRACTOR_TYPES = new Set([
  'CONTRACTOR', 'GENERAL CONTRACTOR', 'ELECTRICAL CONTRACTOR',
  'PLUMBING CONTRACTOR', 'HVAC CONTRACTOR', 'MASONRY CONTRACTOR',
  'ROOFING CONTRACTOR', 'CONCRETE CONTRACTOR', 'EXCAVATION CONTRACTOR',
  'WRECKING CONTRACTOR', 'FIRE PROTECTION CONTRACTOR', 'SIGN CONTRACTOR',
]);

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ChicagoPermit {
  contact_1_type?: string;
  contact_1_name?: string;
  contact_1_city?: string;
  contact_1_state?: string;
  contact_1_zipcode?: string;
  contact_2_type?: string;
  contact_2_name?: string;
  contact_2_city?: string;
  contact_2_state?: string;
  contact_2_zipcode?: string;
  street_number?: string;
  street_direction?: string;
  street_name?: string;
  latitude?: string;
  longitude?: string;
}

async function fetchPage(offset: number): Promise<ChicagoPermit[]> {
  const params = new URLSearchParams({
    '$limit': String(PAGE_SIZE),
    '$offset': String(offset),
    '$where': 'contact_1_name IS NOT NULL',
    '$select': 'contact_1_type,contact_1_name,contact_1_city,contact_1_state,contact_1_zipcode,contact_2_type,contact_2_name,contact_2_city,contact_2_state,contact_2_zipcode,street_number,street_direction,street_name,latitude,longitude',
  });

  const resp = await fetch(`${DATASET_URL}?${params}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().then(t => t.slice(0, 200))}`);
  return resp.json() as Promise<ChicagoPermit[]>;
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO companies (
      id, businessName, city, state, zipCode, address,
      latitude, longitude, dataSource, lastUpdated
    ) VALUES (
      @id, @businessName, @city, @state, @zipCode, @address,
      @latitude, @longitude, 'permits_chicago', @lastUpdated
    )
  `);

  const seen = new Set<string>();
  let totalPermits = 0, inserted = 0, skipped = 0;
  const now = new Date().toISOString();

  console.log('════════════════════════════════════════════════');
  console.log('  Chicago Building Permits Contractor Import');
  console.log('════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('════════════════════════════════════════════════\n');

  const insertBatch = db.transaction((records: any[]) => {
    for (const r of records) {
      if (DRY_RUN) { inserted++; continue; }
      const res = insert.run(r);
      if (res.changes > 0) inserted++;
      else skipped++;
    }
  });

  const addContact = (batch: any[], name: string, contactCity: string, contactState: string,
                      contactZip: string, permitAddr: string, lat: number | null, lng: number | null) => {
    if (!name || name.trim().length < 3) return;
    const cleanName = name.trim();
    const cleanZip = (contactZip || '').replace(/[^0-9]/g, '').slice(0, 5);
    const key = `${cleanName.toLowerCase()}|${cleanZip}`;
    if (!seen.has(key)) {
      seen.add(key);
      batch.push({
        id: `chi-${randomUUID()}`,
        businessName: cleanName,
        city: contactCity?.trim() || 'Chicago',
        state: (contactState?.trim() || 'IL').toUpperCase(),
        zipCode: cleanZip,
        address: permitAddr,
        latitude: lat, longitude: lng,
        lastUpdated: now,
      });
    }
  };

  let offset = 0;
  let hasMore = true;

  while (hasMore && totalPermits < MAX_RECORDS) {
    try {
      await sleep(RATE_LIMIT_MS);
      const page = await fetchPage(offset);
      if (page.length === 0) { hasMore = false; break; }

      const batch: any[] = [];

      for (const p of page) {
        totalPermits++;
        const addr = `${p.street_number || ''} ${p.street_direction || ''} ${p.street_name || ''}`.trim().replace(/\s+/g, ' ');
        const lat = p.latitude ? parseFloat(p.latitude) : null;
        const lng = p.longitude ? parseFloat(p.longitude) : null;

        // Helper: accept any type containing CONTRACTOR or MASON (not OWNER)
        const isContractorType = (t?: string) => {
          if (!t) return true;   // null type → include
          const up = t.toUpperCase();
          if (up.includes('OWNER') || up === 'ARCHITECT' || up.includes('ENGINEER')
            || up.includes('EXPEDIT') || up === 'APPLICANT' || up === 'TENANT'
            || up.includes('SELF CERT')) return false;
          return up.includes('CONTRACTOR') || up.includes('MASON') || up.includes('SIGN');
        };

        // Add contact 1 if it's a contractor type
        if (p.contact_1_name && isContractorType(p.contact_1_type)) {
          addContact(batch, p.contact_1_name, p.contact_1_city || 'Chicago',
            p.contact_1_state || 'IL', p.contact_1_zipcode || '', addr, lat, lng);
        }

        // Add contact 2 if present and contractor type
        if (p.contact_2_name && isContractorType(p.contact_2_type)) {
          addContact(batch, p.contact_2_name, p.contact_2_city || 'Chicago',
            p.contact_2_state || 'IL', p.contact_2_zipcode || '', addr, lat, lng);
        }
      }

      insertBatch(batch);
      offset += PAGE_SIZE;

      if (offset % 10000 === 0) {
        console.log(`[chicago] ${totalPermits.toLocaleString()} permits, ${seen.size.toLocaleString()} unique contractors, ${inserted.toLocaleString()} inserted`);
      }
    } catch (err) {
      console.error(`[chicago] Error at offset ${offset}:`, err);
      await sleep(3000);
      offset += PAGE_SIZE;
    }
  }

  db.close();

  console.log('\n════════════════════════════════════════════════');
  console.log('  Chicago Import Complete');
  console.log(`  Permits processed  : ${totalPermits.toLocaleString()}`);
  console.log(`  Unique contractors : ${seen.size.toLocaleString()}`);
  console.log(`  Inserted           : ${inserted.toLocaleString()}`);
  console.log(`  Skipped (dupe)     : ${skipped.toLocaleString()}`);
  if (DRY_RUN) console.log('  ⚠ DRY RUN — no changes written');
  console.log('════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('[chicago] Fatal:', err);
  process.exit(1);
});
