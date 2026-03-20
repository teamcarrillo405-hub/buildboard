#!/usr/bin/env npx tsx
/**
 * importPhillyPermits.ts
 *
 * Imports construction contractor data from Philadelphia's Licenses & Inspections
 * permits database via the Carto SQL API.
 *
 * Table: li_permits (626,942 records, 466,923 with contractor + zip)
 * API:   https://phl.carto.com/api/v2/sql?q=...
 *
 * Fields extracted:
 *   contractorname, contractoraddress1, contractorcity, contractorstate, contractorzip
 *
 * Usage:
 *   npx tsx server/scripts/importPhillyPermits.ts [--dry-run] [--table permits]
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const tableArg = args.find(a => a === '--table');
const TABLE = tableArg ? args[args.indexOf('--table') + 1] : 'li_permits';

const DB_PATH = './server/constructflix.db';
const CARTO_BASE = 'https://phl.carto.com/api/v2/sql';
const PAGE_SIZE = 5000;
const RATE_LIMIT_MS = 200;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(table: string, offset: number): Promise<Record<string, string>[]> {
  const q = `SELECT contractorname, contractoraddress1, contractorcity, contractorstate, contractorzip FROM ${table} WHERE contractorname IS NOT NULL AND contractorzip IS NOT NULL ORDER BY cartodb_id LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
  const url = `${CARTO_BASE}?q=${encodeURIComponent(q)}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as { rows?: Record<string, string>[] };
  return data.rows || [];
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO companies (
      id, businessName, city, state, zipCode, address,
      dataSource, lastUpdated
    ) VALUES (
      @id, @businessName, @city, @state, @zipCode, @address,
      @dataSource, @lastUpdated
    )
  `);

  const seen = new Set<string>();
  let totalFetched = 0, inserted = 0, skipped = 0;
  const now = new Date().toISOString();

  console.log('════════════════════════════════════════════════');
  console.log('  Philadelphia Permit Contractor Import');
  console.log('════════════════════════════════════════════════');
  console.log(`  Table: ${TABLE}`);
  console.log(`  Mode:  ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
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

  while (hasMore) {
    try {
      await sleep(RATE_LIMIT_MS);
      const page = await fetchPage(TABLE, offset);
      if (page.length === 0) { hasMore = false; break; }

      const batch: any[] = [];

      for (const record of page) {
        totalFetched++;

        const name = (record.contractorname || '').trim();
        if (!name || name.length < 2) continue;

        const zip = (record.contractorzip || '').replace(/\D/g, '').slice(0, 5);
        if (!zip) continue;

        const key = `${name.toLowerCase()}|${zip}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const city = (record.contractorcity || 'Philadelphia').trim();
        const state = (record.contractorstate || 'PA').trim().toUpperCase().slice(0, 2);
        const address = (record.contractoraddress1 || '').trim().split('\n')[0]; // first line only

        batch.push({
          id: `philly-${randomUUID()}`,
          businessName: name,
          city,
          state,
          zipCode: zip,
          address,
          dataSource: `permits_philly_${TABLE}`,
          lastUpdated: now,
        });
      }

      insertBatch(batch);
      offset += page.length;

      if (offset % 10000 === 0 || page.length < PAGE_SIZE) {
        console.log(`[philly_${TABLE}] ${totalFetched.toLocaleString()} fetched, ${inserted.toLocaleString()} unique inserted`);
      }

      if (page.length < PAGE_SIZE) hasMore = false;

    } catch (err: any) {
      console.error(`Error at offset ${offset}:`, err.message);
      await sleep(2000);
      // continue on error
    }
  }

  db.close();

  console.log('\n════════════════════════════════════════════════');
  console.log('  Import Complete');
  console.log(`  Total fetched  : ${totalFetched.toLocaleString()}`);
  console.log(`  Total inserted : ${inserted.toLocaleString()}`);
  console.log(`  Total skipped  : ${skipped.toLocaleString()}`);
  console.log('════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
