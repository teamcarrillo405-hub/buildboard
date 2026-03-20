/**
 * importStateData.ts — CLI runner for state license imports.
 *
 * Usage:
 *   npx tsx server/scripts/importStateData.ts TX         # Single state CSV
 *   npx tsx server/scripts/importStateData.ts AZ         # FireCrawl discover mode
 *   npx tsx server/scripts/importStateData.ts FL         # FireCrawl paginate mode
 *   npx tsx server/scripts/importStateData.ts ALL        # All CSV states
 *   npx tsx server/scripts/importStateData.ts --list     # Show configured states
 *
 * After importing, run:
 *   npx tsx server/scripts/rebuildFts.ts
 * to refresh the full-text search index.
 */

import 'dotenv/config';
import { runMigrations } from '../db.js';
import { STATE_CONFIGS } from '../data/stateLicenseConfigs.js';
import { runStateLicenseSync, type StateSyncStats } from '../pipelines/stateLicenseSync.js';
import { runFirecrawlSync } from '../pipelines/firecrawlSync.js';

// ─────────────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--list') || args.length === 0) {
  console.log('\nConfigured states:\n');
  for (const [code, cfg] of Object.entries(STATE_CONFIGS)) {
    const mode = cfg.format === 'firecrawl' ? '🌐 FireCrawl' : '📥 CSV';
    console.log(`  ${code.padEnd(4)} ${cfg.stateName.padEnd(20)} ${cfg.agency.padEnd(12)} ${mode}  ~${cfg.estimatedRecords.toLocaleString()} records`);
  }
  console.log('\nUsage: npx tsx server/scripts/importStateData.ts <STATE_CODE|ALL>\n');
  process.exit(0);
}

const target = args[0].toUpperCase();

runMigrations();

let statesToRun: string[];
if (target === 'ALL') {
  // Only run CSV states automatically; FireCrawl states require explicit invocation
  statesToRun = Object.entries(STATE_CONFIGS)
    .filter(([, cfg]) => cfg.format === 'csv')
    .map(([code]) => code);
  console.log(`\nRunning CSV import for ${statesToRun.length} states: ${statesToRun.join(', ')}\n`);
} else {
  if (!STATE_CONFIGS[target]) {
    console.error(`Unknown state: ${target}`);
    console.error(`Available: ${Object.keys(STATE_CONFIGS).join(', ')}`);
    process.exit(1);
  }
  statesToRun = [target];
}

const allStats: StateSyncStats[] = [];

for (const stateCode of statesToRun) {
  const config = STATE_CONFIGS[stateCode];
  console.log(`\n${'─'.repeat(60)}`);

  try {
    const stats = config.format === 'firecrawl'
      ? await runFirecrawlSync(config)
      : await runStateLicenseSync(config);
    allStats.push(stats);
  } catch (err) {
    console.error(`[importStateData] ${stateCode} failed:`, err);
  }
}

// Summary
if (allStats.length > 1) {
  const total = allStats.reduce((acc, s) => ({
    inserted: acc.inserted + s.inserted,
    enrichedYelp: acc.enrichedYelp + s.enrichedYelp,
    enrichedLicense: acc.enrichedLicense + s.enrichedLicense,
    errors: acc.errors + s.errors,
  }), { inserted: 0, enrichedYelp: 0, enrichedLicense: 0, errors: 0 });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(' Import complete — summary');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  States processed : ${allStats.length}`);
  console.log(`  Inserted         : ${total.inserted.toLocaleString()} new records`);
  console.log(`  Enriched (Yelp)  : ${total.enrichedYelp.toLocaleString()} Yelp records updated`);
  console.log(`  Enriched (lic)   : ${total.enrichedLicense.toLocaleString()} license records updated`);
  console.log(`  Errors           : ${total.errors}`);
  console.log(`\nNext step: npx tsx server/scripts/rebuildFts.ts\n`);
}
