#!/usr/bin/env npx tsx
/**
 * yelpSyncCA.ts
 *
 * Re-sync California metros to refresh/expand CA Yelp records.
 * Safe to run at any time — INSERT OR IGNORE + targeted updates prevent duplication.
 *
 * CA coverage: 15 metros × 28 categories = 420 queries (fits in one daily quota).
 *
 * Usage:
 *   npx tsx server/scripts/yelpSyncCA.ts
 */

import 'dotenv/config';
import { runMigrations } from '../db.js';
import { runYelpSync } from '../pipelines/yelpSync.js';
import { CA_METROS, CATEGORY_SWEEP } from '../data/yelpCategoryMap.js';

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) {
  console.error('[yelpSyncCA] ❌  YELP_API_KEY not set — aborting.');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' BuildBoard — California Yelp Re-Sync');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Metros    : ${CA_METROS.length}`);
console.log(`  Categories: ${CATEGORY_SWEEP.length}`);
console.log(`  Queries   : ${CA_METROS.length * CATEGORY_SWEEP.length} (fits in ~1h at 5,000 req/day limit)`);
console.log('═══════════════════════════════════════════════════════════\n');

runMigrations();
await runYelpSync(apiKey, CA_METROS, CATEGORY_SWEEP);

console.log('\n✓ CA re-sync complete.');
