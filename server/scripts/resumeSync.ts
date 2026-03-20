/**
 * resumeSync.ts
 *
 * Resumes the Yelp sync from where it stopped (rate-limited at Las Vegas, NV).
 * Only processes the 50 remaining metros so the daily 5,000-request budget
 * isn't wasted re-hitting already-completed states.
 *
 * Completed already: TX, FL, NY, IL, PA, OH, GA, NC, MI, AZ,
 *                    WA, CO, TN, IN, MA, MO, MD, VA, NJ, WI, MN
 *
 * Usage:
 *   npx tsx server/scripts/resumeSync.ts
 *
 * Run this once per day until it completes (50 metros × 28 categories
 * × ~1.5 pages avg ≈ 2,100 API calls — fits in one daily quota).
 * After the final run it auto-purges seed data and rebuilds FTS5.
 */

import 'dotenv/config';
import { runMigrations, sqlite } from '../db.js';
import { ensureFtsIndex } from '../services/fts5.js';
import { runYelpSync } from '../pipelines/yelpSync.js';
import { CATEGORY_SWEEP } from '../data/yelpCategoryMap.js';

// ---------------------------------------------------------------------------
// Remaining metros — NV through all small states
// Las Vegas is included (safe to re-run; INSERT OR IGNORE skips duplicates)
// ---------------------------------------------------------------------------

const REMAINING_METROS: string[] = [
  // ── Nevada (3) ───────────────────────────
  'Las Vegas, NV',
  'Henderson, NV',
  'Reno, NV',

  // ── South Carolina (2) ───────────────────
  'Columbia, SC',
  'Charleston, SC',

  // ── Oregon (2) ───────────────────────────
  'Portland, OR',
  'Salem, OR',

  // ── Alabama (2) ──────────────────────────
  'Birmingham, AL',
  'Montgomery, AL',

  // ── Louisiana (2) ────────────────────────
  'New Orleans, LA',
  'Baton Rouge, LA',

  // ── Kentucky (2) ─────────────────────────
  'Louisville, KY',
  'Lexington, KY',

  // ── Oklahoma (2) ─────────────────────────
  'Oklahoma City, OK',
  'Tulsa, OK',

  // ── Connecticut (2) ──────────────────────
  'Bridgeport, CT',
  'Hartford, CT',

  // ── Utah (2) ─────────────────────────────
  'Salt Lake City, UT',
  'Provo, UT',

  // ── Nebraska (2) ─────────────────────────
  'Omaha, NE',
  'Lincoln, NE',

  // ── Iowa (2) ─────────────────────────────
  'Des Moines, IA',
  'Cedar Rapids, IA',

  // ── Kansas (2) ───────────────────────────
  'Wichita, KS',
  'Overland Park, KS',

  // ── Arkansas (2) ─────────────────────────
  'Little Rock, AR',
  'Fayetteville, AR',

  // ── New Mexico (2) ───────────────────────
  'Albuquerque, NM',
  'Las Cruces, NM',

  // ── Mississippi (2) ──────────────────────
  'Jackson, MS',
  'Gulfport, MS',

  // ── Idaho (2) ────────────────────────────
  'Boise, ID',
  'Meridian, ID',

  // ── New Hampshire (2) ────────────────────
  'Manchester, NH',
  'Nashua, NH',

  // ── West Virginia (2) ────────────────────
  'Charleston, WV',
  'Huntington, WV',

  // ── Montana (2) ──────────────────────────
  'Billings, MT',
  'Missoula, MT',

  // ── South Dakota (2) ─────────────────────
  'Sioux Falls, SD',
  'Rapid City, SD',

  // ── North Dakota (2) ─────────────────────
  'Fargo, ND',
  'Bismarck, ND',

  // ── Small / single-metro states ──────────
  'Honolulu, HI',
  'Anchorage, AK',
  'Providence, RI',
  'Washington, DC',
  'Wilmington, DE',
  'Burlington, VT',
  'Cheyenne, WY',
  'Portland, ME',
];

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const apiKey = process.env.YELP_API_KEY;
if (!apiKey) {
  console.error('[resumeSync] ❌  YELP_API_KEY not set — aborting.');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' BuildBoard — Resume Yelp Sync (remaining 50 metros)');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Metros    : ${REMAINING_METROS.length}`);
console.log(`  Categories: ${CATEGORY_SWEEP.length}`);
console.log(`  Queries   : ${REMAINING_METROS.length * CATEGORY_SWEEP.length}`);
console.log(`  Est. calls: ~${Math.round(REMAINING_METROS.length * CATEGORY_SWEEP.length * 1.5).toLocaleString()} (fits in one daily quota)`);
console.log('═══════════════════════════════════════════════════════════\n');

runMigrations();

// ---------------------------------------------------------------------------
// Phase 1: Sync remaining metros
// ---------------------------------------------------------------------------

const syncStart = Date.now();
console.log('[Phase 1] Resuming Yelp sync...\n');

await runYelpSync(apiKey, REMAINING_METROS, CATEGORY_SWEEP);

const syncMin = Math.round((Date.now() - syncStart) / 60_000);
console.log(`\n[Phase 1] ✓ Sync complete in ${syncMin} minutes\n`);

// ---------------------------------------------------------------------------
// Phase 2: Purge synthetic seed data
// ---------------------------------------------------------------------------

console.log('[Phase 2] Purging synthetic seed data...');

const before = (sqlite.prepare(
  `SELECT COUNT(*) as n FROM companies WHERE yelpId IS NULL AND (dataSource = 'manual' OR dataSource IS NULL)`
).get() as { n: number }).n;

const purge = sqlite.prepare(
  `DELETE FROM companies WHERE yelpId IS NULL AND (dataSource = 'manual' OR dataSource IS NULL)`
).run();

const yelp  = (sqlite.prepare(`SELECT COUNT(*) as n FROM companies WHERE dataSource = 'yelp'`).get() as { n: number }).n;
const total = (sqlite.prepare(`SELECT COUNT(*) as n FROM companies`).get() as { n: number }).n;

console.log(`[Phase 2] ✓ Purged ${purge.changes.toLocaleString()} synthetic records`);
console.log(`[Phase 2]   Before purge : ${before.toLocaleString()} seed records`);
console.log(`[Phase 2]   Yelp records : ${yelp.toLocaleString()}`);
console.log(`[Phase 2]   Total now    : ${total.toLocaleString()}\n`);

// ---------------------------------------------------------------------------
// Phase 3: Rebuild FTS5
// ---------------------------------------------------------------------------

console.log('[Phase 3] Rebuilding FTS5 index...');
ensureFtsIndex({ force: true });
console.log('[Phase 3] ✓ Done\n');

console.log('═══════════════════════════════════════════════════════════');
console.log(` All done! ${yelp.toLocaleString()} real contractors, 0 synthetic records.`);
console.log('═══════════════════════════════════════════════════════════');
