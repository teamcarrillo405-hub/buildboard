/**
 * fullSyncAndPurge.ts
 *
 * One-shot script: sweep all 49 non-CA US states via the Yelp Fusion API,
 * then automatically purge synthetic seed data when the sync completes.
 *
 * Usage:
 *   npx tsx server/scripts/fullSyncAndPurge.ts
 *
 * ⚠ Runtime estimate: ~1.5 days at Yelp free-tier (5,000 requests/day).
 *   Keep the process running. Upserts are idempotent — safe to re-run if
 *   interrupted. Already-inserted records will be refreshed, not duplicated.
 *
 * Phases:
 *   1. Yelp sync  — fetches 119 metros × 37 categories for all 49 non-CA states
 *   2. Seed purge — deletes synthetic records (yelpId IS NULL AND dataSource='manual')
 *   3. FTS rebuild — rebuilds the full-text search index over real data only
 */

import 'dotenv/config';
import { runMigrations, sqlite } from '../db.js';
import { ensureFtsIndex } from '../services/fts5.js';
import { runYelpSync } from '../pipelines/yelpSync.js';
import { ALL_US_METROS, CATEGORY_SWEEP } from '../data/yelpCategoryMap.js';

// ---------------------------------------------------------------------------
// Startup checks
// ---------------------------------------------------------------------------

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) {
  console.error('[fullSync] ❌  YELP_API_KEY is not set in .env — aborting.');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' BuildBoard — Full US Yelp Sync + Seed Purge');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Metros   : ${ALL_US_METROS.length}`);
console.log(`  Categories: ${CATEGORY_SWEEP.length}`);
console.log(`  Base queries: ${ALL_US_METROS.length * CATEGORY_SWEEP.length}`);
console.log(`  Est. API calls: ~${Math.round(ALL_US_METROS.length * CATEGORY_SWEEP.length * 1.5).toLocaleString()}`);
console.log(`  Est. runtime: ~1.5 days at Yelp free-tier (5,000 req/day)`);
console.log('═══════════════════════════════════════════════════════════\n');

// ---------------------------------------------------------------------------
// Phase 0: Ensure DB is up to date
// ---------------------------------------------------------------------------

console.log('[Phase 0] Running migrations...');
runMigrations();
console.log('[Phase 0] ✓ Migrations complete\n');

// ---------------------------------------------------------------------------
// Phase 1: Yelp sync — all non-CA states
// ---------------------------------------------------------------------------

const syncStart = Date.now();
console.log('[Phase 1] Starting Yelp sync for all 49 non-CA states...');
console.log('[Phase 1] Progress is logged every 10 queries. First results in ~5 minutes.\n');

await runYelpSync(apiKey, ALL_US_METROS, CATEGORY_SWEEP);

const syncMs = Date.now() - syncStart;
const syncMin = Math.round(syncMs / 60_000);
console.log(`\n[Phase 1] ✓ Yelp sync complete in ${syncMin} minutes\n`);

// ---------------------------------------------------------------------------
// Phase 2: Purge synthetic seed data
// ---------------------------------------------------------------------------

console.log('[Phase 2] Purging synthetic seed data...');

const beforeCount = (sqlite.prepare(
  `SELECT COUNT(*) as n FROM companies WHERE yelpId IS NULL AND (dataSource = 'manual' OR dataSource IS NULL)`
).get() as { n: number }).n;

const purgeResult = sqlite.prepare(
  `DELETE FROM companies WHERE yelpId IS NULL AND (dataSource = 'manual' OR dataSource IS NULL)`
).run();

const afterCount = (sqlite.prepare(`SELECT COUNT(*) as n FROM companies`).get() as { n: number }).n;
const yelpCount  = (sqlite.prepare(`SELECT COUNT(*) as n FROM companies WHERE dataSource = 'yelp'`).get() as { n: number }).n;

console.log(`[Phase 2] ✓ Purged ${purgeResult.changes.toLocaleString()} synthetic records`);
console.log(`[Phase 2]   Seed records before purge : ${beforeCount.toLocaleString()}`);
console.log(`[Phase 2]   Real (Yelp) records kept  : ${yelpCount.toLocaleString()}`);
console.log(`[Phase 2]   Total records remaining   : ${afterCount.toLocaleString()}\n`);

// ---------------------------------------------------------------------------
// Phase 3: Rebuild FTS5 index over real data only
// ---------------------------------------------------------------------------

console.log('[Phase 3] Rebuilding FTS5 full-text search index...');
ensureFtsIndex({ force: true });
console.log('[Phase 3] ✓ FTS5 rebuild complete\n');

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log('═══════════════════════════════════════════════════════════');
console.log(' All phases complete!');
console.log(`  Real contractors in DB : ${yelpCount.toLocaleString()}`);
console.log(`  Synthetic records      : 0 (purged)`);
console.log('  Search index           : rebuilt');
console.log('═══════════════════════════════════════════════════════════');
