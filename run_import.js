/**
 * Import runner — called by ts-node from the project root.
 * Usage: node node_modules/ts-node/dist/bin.js run_import.js AZ
 */
const state = process.argv[2];
if (!state) { console.error('Usage: run_import.js <STATE_CODE>'); process.exit(1); }

const { runStateLicenseSync } = require('./server/pipelines/stateLicenseSync');
const { STATE_CONFIGS }       = require('./server/data/stateLicenseConfigs');

const cfg = STATE_CONFIGS[state];
if (!cfg) { console.error(`Unknown state: ${state}`); process.exit(1); }

console.log(`[run_import] Starting ${state}...`);
runStateLicenseSync(cfg)
  .then(s => { console.log(`[${state}_DONE] ${JSON.stringify(s)}`); process.exit(0); })
  .catch(e => { console.error(`[${state}_ERROR] ${e.message}`); process.exit(1); });
