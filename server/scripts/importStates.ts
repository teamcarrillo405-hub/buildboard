#!/usr/bin/env npx tsx
/**
 * importStates.ts — Run state license imports for one or more state codes
 *
 * Usage:
 *   npx tsx server/scripts/importStates.ts NYC
 *   npx tsx server/scripts/importStates.ts NYC NYS
 */

import { STATE_CONFIGS } from '../data/stateLicenseConfigs.js';
import { runStateLicenseSync } from '../pipelines/stateLicenseSync.js';

async function main() {
  const keys = process.argv.slice(2);
  if (keys.length === 0) {
    console.error('Usage: npx tsx server/scripts/importStates.ts <STATE_CODE> [...]');
    process.exit(1);
  }

  for (const key of keys) {
    const cfg = STATE_CONFIGS[key];
    if (!cfg) {
      console.error(`Unknown config: ${key}`);
      console.error('Available:', Object.keys(STATE_CONFIGS).join(', '));
      process.exit(1);
    }
    console.log(`\nImporting ${key} (${cfg.stateName} — ${cfg.agency})...`);
    const stats = await runStateLicenseSync(cfg);
    console.log('Done:', JSON.stringify(stats, null, 2));
  }
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
