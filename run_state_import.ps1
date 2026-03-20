param([string]$State = "AZ")

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\glcar\constructflix"

$code = @"
const { runStateLicenseSync } = require('./server/pipelines/stateLicenseSync');
const { STATE_CONFIGS } = require('./server/data/stateLicenseConfigs');
const cfg = STATE_CONFIGS['$State'];
if (!cfg) { console.error('Unknown state: $State'); process.exit(1); }
runStateLicenseSync(cfg)
  .then(s => { console.log('[' + '$State' + '_DONE] ' + JSON.stringify(s)); process.exit(0); })
  .catch(e => { console.error('[' + '$State' + '_ERROR] ' + e.message); process.exit(1); });
"@

$code | node "C:\Program Files\nodejs\node_modules\ts-node\dist\bin.js" --project tsconfig.json -e (Get-Content -Raw -)
