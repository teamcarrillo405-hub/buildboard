#!/usr/bin/env npx tsx
/**
 * importNYCPermits.ts
 *
 * Imports construction contractor data from NYC Department of Buildings
 * Open Data portal via the Socrata SODA API.
 *
 * Dataset: DOB Permit Issuance
 * URL: https://data.cityofnewyork.us/resource/ipu4-2q9a.json
 * Records: 882,000+ permits with contractor/permittee details
 *
 * Extracts both:
 *   - Permittee (the licensed contractor doing the work)
 *   - Owner (the business who owns the property)
 *
 * Usage:
 *   npx tsx server/scripts/importNYCPermits.ts [--dry-run] [--limit 10000]
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit'));
const MAX_RECORDS = limitArg ? parseInt(args[args.indexOf('--limit') + 1] || '999999') : 999999;

const DB_PATH = './server/constructflix.db';
const DATASET_URL = 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json';
const PAGE_SIZE = 1000;
const RATE_LIMIT_MS = 100;

const BOROUGH_TO_CITY: Record<string, string> = {
  'MANHATTAN': 'New York',
  'BROOKLYN': 'Brooklyn',
  'QUEENS': 'Queens',
  'BRONX': 'Bronx',
  'STATEN ISLAND': 'Staten Island',
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, '').replace(/^1(\d{10})$/, '$1');
}

interface PermitRecord {
  permittee_s_business_name?: string;
  permittee_s_phone__?: string;
  permittee_s_license__?: string;
  permittee_s_license_type?: string;
  owner_s_business_name?: string;
  owner_s_phone__?: string;
  owner_s_business_type?: string;
  house__?: string;
  street_name?: string;
  zip_code?: string;
  borough?: string;
  permit_type?: string;
  job_type?: string;
  permit_status?: string;
  gis_latitude?: string;
  gis_longitude?: string;
}

async function fetchPage(offset: number): Promise<PermitRecord[]> {
  // Filter: only active/issued permits for real construction work
  const params = new URLSearchParams({
    '$limit': String(PAGE_SIZE),
    '$offset': String(offset),
    '$where': "permit_status='ISSUED' AND zip_code IS NOT NULL AND (permittee_s_business_name IS NOT NULL OR owner_s_business_name IS NOT NULL)",
    '$select': 'permittee_s_business_name,permittee_s_phone__,permittee_s_license__,permittee_s_license_type,owner_s_business_name,owner_s_phone__,owner_s_business_type,house__,street_name,zip_code,borough,permit_type,gis_latitude,gis_longitude',
  });

  const resp = await fetch(`${DATASET_URL}?${params}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text().then(t => t.slice(0, 200))}`);
  return resp.json() as Promise<PermitRecord[]>;
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO companies (
      id, businessName, city, state, zipCode, address,
      phone, licenseNumber, latitude, longitude,
      dataSource, lastUpdated
    ) VALUES (
      @id, @businessName, @city, @state, @zipCode, @address,
      @phone, @licenseNumber, @latitude, @longitude,
      'permits_nyc', @lastUpdated
    )
  `);

  // Dedup within this run
  const seen = new Set<string>();
  let totalFetched = 0, inserted = 0, skipped = 0;
  const now = new Date().toISOString();

  console.log('════════════════════════════════════════════════');
  console.log('  NYC DOB Permit Contractor Import');
  console.log('════════════════════════════════════════════════');
  console.log(`  Dataset: DOB Permit Issuance`);
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

  let offset = 0;
  let hasMore = true;

  while (hasMore && totalFetched < MAX_RECORDS) {
    try {
      await sleep(RATE_LIMIT_MS);
      const page = await fetchPage(offset);
      if (page.length === 0) { hasMore = false; break; }

      const batch: any[] = [];

      for (const record of page) {
        totalFetched++;

        // Extract permittee contractor (primary)
        const permName = record.permittee_s_business_name?.trim();
        const permPhone = record.permittee_s_phone__?.trim();
        const permLicense = record.permittee_s_license__?.trim();
        const city = BOROUGH_TO_CITY[record.borough?.toUpperCase() || ''] || 'New York';
        const zip = record.zip_code?.trim() || '';
        const addr = `${record.house__?.trim() || ''} ${record.street_name?.trim() || ''}`.trim();
        const lat = record.gis_latitude ? parseFloat(record.gis_latitude) : null;
        const lng = record.gis_longitude ? parseFloat(record.gis_longitude) : null;

        if (permName && permName.length > 2) {
          const key = `${permName.toLowerCase()}|${zip}`;
          if (!seen.has(key)) {
            seen.add(key);
            batch.push({
              id: `nyc-perm-${randomUUID()}`,
              businessName: permName,
              city, state: 'NY', zipCode: zip,
              address: addr,
              phone: permPhone ? normalizePhone(permPhone) : null,
              licenseNumber: permLicense || null,
              latitude: lat, longitude: lng,
              lastUpdated: now,
            });
          }
        }

        // Extract owner business (secondary — commercial property owners who are businesses)
        const ownerName = record.owner_s_business_name?.trim();
        const ownerPhone = record.owner_s_phone__?.trim();
        const ownerType = record.owner_s_business_type?.trim();

        // Only include if they're a corporation/LLC (not individual homeowners)
        if (ownerName && ownerName.length > 2 && ownerType && ownerType !== 'INDIVIDUAL') {
          const key = `${ownerName.toLowerCase()}|${zip}`;
          if (!seen.has(key)) {
            seen.add(key);
            batch.push({
              id: `nyc-own-${randomUUID()}`,
              businessName: ownerName,
              city, state: 'NY', zipCode: zip,
              address: addr,
              phone: ownerPhone ? normalizePhone(ownerPhone) : null,
              licenseNumber: null, latitude: lat, longitude: lng,
              lastUpdated: now,
            });
          }
        }
      }

      insertBatch(batch);
      offset += PAGE_SIZE;

      if (offset % 10000 === 0) {
        console.log(`[nyc] ${totalFetched.toLocaleString()} permits processed, ${inserted.toLocaleString()} contractors inserted`);
      }
    } catch (err) {
      console.error(`[nyc] Error at offset ${offset}:`, err);
      await sleep(3000);
      // Try next page
      offset += PAGE_SIZE;
    }
  }

  db.close();

  console.log('\n════════════════════════════════════════════════');
  console.log('  NYC Import Complete');
  console.log(`  Permits processed : ${totalFetched.toLocaleString()}`);
  console.log(`  Unique contractors: ${seen.size.toLocaleString()}`);
  console.log(`  Inserted          : ${inserted.toLocaleString()}`);
  console.log(`  Skipped (dupe)    : ${skipped.toLocaleString()}`);
  if (DRY_RUN) console.log('  ⚠ DRY RUN — no changes written');
  console.log('════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('[nyc] Fatal:', err);
  process.exit(1);
});
