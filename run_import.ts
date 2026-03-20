/**
 * Import runner (TypeScript) — run with ts-node from the project root.
 * Usage: ts-node run_import.ts AZ
 */
import { runStateLicenseSync } from './server/pipelines/stateLicenseSync';
import { STATE_CONFIGS }       from './server/data/stateLicenseConfigs';

const state = process.argv[2];
if (!state) { console.error('Usage: run_import.ts <STATE_CODE>'); process.exit(1); }

const cfg = STATE_CONFIGS[state];
if (!cfg) { console.error(`Unknown state: ${state}`); process.exit(1); }

console.log(`[run_import] Starting ${state}...`);
runStateLicenseSync(cfg)
  .then(s => { console.log(`[${state}_DONE] ${JSON.stringify(s)}`); process.exit(0); })
  .catch((e: Error) => { console.error(`[${state}_ERROR] ${e.message}`); process.exit(1); });
