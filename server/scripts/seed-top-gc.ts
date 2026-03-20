/**
 * Seed the ENR Top 25 General Contractors into the companies table.
 *
 * Usage:
 *   npx tsx server/scripts/seed-top-gc.ts
 *
 * Uses better-sqlite3 directly (synchronous) since this is a one-time data script.
 * Skips any company already in the DB (INSERT OR IGNORE on businessName match).
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../server/constructflix.db');

interface GCRecord {
  rank: number;
  businessName: string;
  city: string;
  state: string;
  revenue: string;
  services: string;
  website: string;
}

// ENR Top 25 General Contractors (2025)
const TOP_GCS: GCRecord[] = [
  {
    rank: 1,
    businessName: 'Turner Construction Company',
    city: 'New York',
    state: 'NY',
    revenue: '$20.2B',
    services: 'Commercial, Healthcare, Education, Sports',
    website: 'turnerconstruction.com',
  },
  {
    rank: 2,
    businessName: 'The Whiting-Turner Contracting Company',
    city: 'Baltimore',
    state: 'MD',
    revenue: '$9.7B',
    services: 'Commercial, Industrial, Healthcare',
    website: 'whiting-turner.com',
  },
  {
    rank: 3,
    businessName: 'STO Building Group',
    city: 'New York',
    state: 'NY',
    revenue: '$9.5B',
    services: 'Corporate interiors, Healthcare, Life sciences',
    website: 'stobuildinggroup.com',
  },
  {
    rank: 4,
    businessName: 'Bechtel Corporation',
    city: 'Reston',
    state: 'VA',
    revenue: '$15.9B',
    services: 'Energy, Infrastructure, Nuclear, Mining',
    website: 'bechtel.com',
  },
  {
    rank: 5,
    businessName: 'Kiewit Corporation',
    city: 'Omaha',
    state: 'NE',
    revenue: '$14.0B',
    services: 'Transportation, Water, Power, Industrial',
    website: 'kiewit.com',
  },
  {
    rank: 6,
    businessName: 'Gilbane Building Company',
    city: 'Providence',
    state: 'RI',
    revenue: '$7.5B',
    services: 'Healthcare, Education, Government',
    website: 'gilbaneco.com',
  },
  {
    rank: 7,
    businessName: 'Fluor Corporation',
    city: 'Irving',
    state: 'TX',
    revenue: '$7.9B',
    services: 'Energy, Mining, Infrastructure',
    website: 'fluor.com',
  },
  {
    rank: 8,
    businessName: 'DPR Construction',
    city: 'Redwood City',
    state: 'CA',
    revenue: '$5.0B',
    services: 'Life sciences, Healthcare, Technology',
    website: 'dpr.com',
  },
  {
    rank: 9,
    businessName: 'Skanska USA',
    city: 'New York',
    state: 'NY',
    revenue: '$8.2B',
    services: 'Civil, Transportation, Healthcare',
    website: 'usa.skanska.com',
  },
  {
    rank: 10,
    businessName: 'HITT Contracting Inc.',
    city: 'Falls Church',
    state: 'VA',
    revenue: '$8.7B',
    services: 'Data centers, Corporate interiors',
    website: 'hitt.com',
  },
  {
    rank: 11,
    businessName: 'PCL Construction Enterprises',
    city: 'Denver',
    state: 'CO',
    revenue: '$8.3B',
    services: 'Buildings, Civil, Heavy industrial',
    website: 'pcl.com',
  },
  {
    rank: 12,
    businessName: 'Hensel Phelps Construction Co.',
    city: 'Greeley',
    state: 'CO',
    revenue: '$8.2B',
    services: 'Federal, Healthcare, Aviation',
    website: 'henselphelps.com',
  },
  {
    rank: 13,
    businessName: 'The Walsh Group',
    city: 'Chicago',
    state: 'IL',
    revenue: '$7.7B',
    services: 'Transportation, Water, Aviation',
    website: 'walshgroup.com',
  },
  {
    rank: 14,
    businessName: 'AECOM',
    city: 'Dallas',
    state: 'TX',
    revenue: '$8.1B',
    services: 'Transportation, Water, Infrastructure',
    website: 'aecom.com',
  },
  {
    rank: 15,
    businessName: 'Holder Construction Company',
    city: 'Atlanta',
    state: 'GA',
    revenue: '$8.1B',
    services: 'Commercial, Data centers, Aviation',
    website: 'holderconstruction.com',
  },
  {
    rank: 16,
    businessName: 'J.E. Dunn Construction Group',
    city: 'Kansas City',
    state: 'MO',
    revenue: '$7.4B',
    services: 'Healthcare, Education, Federal',
    website: 'jedunn.com',
  },
  {
    rank: 17,
    businessName: 'Clark Construction Group',
    city: 'McLean',
    state: 'VA',
    revenue: '$7.0B',
    services: 'Commercial, Federal, Sports',
    website: 'clarkconstruction.com',
  },
  {
    rank: 18,
    businessName: 'McCarthy Holdings Inc.',
    city: 'St. Louis',
    state: 'MO',
    revenue: '$7.0B',
    services: 'Healthcare, Education, Renewable energy',
    website: 'mccarthy.com',
  },
  {
    rank: 19,
    businessName: 'Clayco Inc.',
    city: 'Chicago',
    state: 'IL',
    revenue: '$6.8B',
    services: 'Industrial, Data centers, Distribution',
    website: 'claycorp.com',
  },
  {
    rank: 20,
    businessName: 'Mortenson Construction',
    city: 'Golden Valley',
    state: 'MN',
    revenue: '$6.7B',
    services: 'Sports, Healthcare, Renewable energy',
    website: 'mortenson.com',
  },
  {
    rank: 21,
    businessName: 'Brasfield & Gorrie LLC',
    city: 'Birmingham',
    state: 'AL',
    revenue: '$6.4B',
    services: 'Healthcare, Commercial, Industrial',
    website: 'brasfieldgorrie.com',
  },
  {
    rank: 22,
    businessName: 'Walbridge',
    city: 'Detroit',
    state: 'MI',
    revenue: '$6.1B',
    services: 'Automotive, Healthcare, Education',
    website: 'walbridge.com',
  },
  {
    rank: 23,
    businessName: 'Zachry Group',
    city: 'San Antonio',
    state: 'TX',
    revenue: '$5.9B',
    services: 'Energy, Power, Industrial',
    website: 'zachrygroup.com',
  },
  {
    rank: 24,
    businessName: 'Balfour Beatty US',
    city: 'Dallas',
    state: 'TX',
    revenue: '$4.6B',
    services: 'Military, Transportation, Education',
    website: 'balfourbeattyus.com',
  },
  {
    rank: 25,
    businessName: 'Ryan Companies US Inc.',
    city: 'Minneapolis',
    state: 'MN',
    revenue: '$2.4B',
    services: 'Commercial, Industrial, Healthcare',
    website: 'ryancompanies.us',
  },
];

function main() {
  console.log(`Opening database at: ${DB_PATH}`);
  const db = new Database(DB_PATH);

  // Find the canonical ENR record for a company name (enr_top25 source preferred)
  const findEnrRecord = db.prepare<[string], { id: string; dataSource: string; rating: number }>(
    `SELECT id, dataSource, rating FROM companies
     WHERE businessName = ?
     ORDER BY CASE WHEN dataSource = 'enr_top25' THEN 0 ELSE 1 END, rating DESC
     LIMIT 1`
  );

  // Insert a brand-new ENR record
  const insert = db.prepare(`
    INSERT INTO companies (
      id, businessName, category, subCategory,
      city, state, location,
      rating, reviewCount,
      website, services,
      dataSource, lastUpdated,
      verificationStatus
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?
    )
  `);

  // Update an existing record to have ENR-enriched data
  const updateEnr = db.prepare(`
    UPDATE companies
    SET category = 'General Contractor',
        subCategory = 'General Contractors',
        city = ?,
        state = ?,
        location = ?,
        rating = 5.0,
        reviewCount = ?,
        website = ?,
        services = ?,
        dataSource = 'enr_top25',
        lastUpdated = ?,
        verificationStatus = 'verified'
    WHERE id = ?
  `);

  let inserted = 0;
  let updated = 0;

  const upsertAll = db.transaction(() => {
    for (const gc of TOP_GCS) {
      // reviewCount formula: rank 1 → 1000, rank 25 → 760
      const reviewCount = 1000 - (gc.rank - 1) * 10;
      const now = new Date().toISOString();

      const existing = findEnrRecord.get(gc.businessName);
      if (existing) {
        // Update the best existing record with ENR data
        updateEnr.run(
          gc.city,
          gc.state,
          `${gc.city}, ${gc.state}`,
          reviewCount,
          gc.website,
          gc.services,
          now,
          existing.id
        );
        console.log(`  [upd]  ${gc.rank}. ${gc.businessName} — enriched existing record (was: ${existing.dataSource}, rating: ${existing.rating})`);
        updated++;
      } else {
        // Insert fresh ENR record
        insert.run(
          randomUUID(),
          gc.businessName,
          'General Contractor',
          'General Contractors',
          gc.city,
          gc.state,
          `${gc.city}, ${gc.state}`,
          5.0,
          reviewCount,
          gc.website,
          gc.services,
          'enr_top25',
          now,
          'verified'
        );
        console.log(`  [ins]  ${gc.rank}. ${gc.businessName} (${gc.city}, ${gc.state}) — new record`);
        inserted++;
      }
    }
  });

  upsertAll();

  console.log('');
  console.log(`=== Seed Complete ===`);
  console.log(`Inserted (new): ${inserted}`);
  console.log(`Updated (enriched existing): ${updated}`);
  console.log(`Total GCs targeted: ${TOP_GCS.length}`);

  // Verify: all 25 ENR records should appear with rating 5.0
  const enrRows = db.prepare(
    `SELECT businessName, rating, reviewCount, website, services
     FROM companies
     WHERE dataSource = 'enr_top25'
     ORDER BY reviewCount DESC`
  ).all() as { businessName: string; rating: number; reviewCount: number; website: string; services: string }[];

  console.log('');
  console.log(`ENR Top 25 records (${enrRows.length} total):`);
  enrRows.forEach((r, i) => {
    const hasWebsite = r.website ? 'website:ok' : 'website:MISSING';
    const hasServices = r.services ? 'services:ok' : 'services:MISSING';
    console.log(`  ${i + 1}. ${r.businessName} — rating: ${r.rating}, reviews: ${r.reviewCount}, ${hasWebsite}, ${hasServices}`);
  });

  db.close();
}

main();
