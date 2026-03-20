#!/usr/bin/env npx tsx
/**
 * CLI script to import Google Maps (Apify) results and enrich existing DB records.
 *
 * Usage:
 *   npx tsx server/scripts/gmapsImport.ts <json-file-or-directory> [--dry-run]
 *
 * The JSON file(s) should contain Apify Google Maps scraper output.
 * Use --dry-run to see what would be matched without writing to DB.
 */

import { loadGmapsResults, runGmapsEnrich } from '../pipelines/gmapsEnrich.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const inputPath = args.find(a => !a.startsWith('--'));

if (!inputPath) {
  console.error('Usage: npx tsx server/scripts/gmapsImport.ts <json-file-or-directory> [--dry-run]');
  process.exit(1);
}

const DB_PATH = './server/constructflix.db';

console.log(`[gmapsImport] Input: ${inputPath}`);
console.log(`[gmapsImport] DB: ${DB_PATH}`);
console.log(`[gmapsImport] Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
console.log('');

const places = loadGmapsResults(inputPath);
const stats = runGmapsEnrich(DB_PATH, places, { dryRun });

console.log('');
console.log('═══════════════════════════════════════════');
console.log('  Google Maps Enrichment Results');
console.log('═══════════════════════════════════════════');
console.log(`  Total places loaded:  ${stats.totalPlaces}`);
console.log(`  Matched & updated:    ${stats.matched}`);
console.log(`    → Phone filled:     ${stats.updatedPhone}`);
console.log(`    → Website filled:   ${stats.updatedWebsite}`);
console.log(`    → Email filled:     ${stats.updatedEmail}`);
console.log(`    → Lat/Lng filled:   ${stats.updatedLatLng}`);
console.log(`  Already had data:     ${stats.duplicateNames}`);
console.log(`  No DB match:          ${stats.skippedNoMatch}`);
console.log(`  Closed businesses:    ${stats.skippedClosed}`);
console.log(`  Outside US:           ${stats.skippedOutsideUS}`);
console.log(`  Errors:               ${stats.errors}`);
console.log(`  Duration:             ${((new Date(stats.finishedAt!).getTime() - new Date(stats.startedAt).getTime()) / 1000).toFixed(1)}s`);
console.log('═══════════════════════════════════════════');
if (dryRun) console.log('  ⚠ DRY RUN — no changes written');
