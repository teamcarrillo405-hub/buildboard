import { runStateLicenseSync } from './server/pipelines/stateLicenseSync';
import { STATE_CONFIGS } from './server/data/stateLicenseConfigs';

runStateLicenseSync(STATE_CONFIGS['MN'])
  .then((s: any) => { console.log('MN_DONE:', JSON.stringify(s)); process.exit(0); })
  .catch((e: any) => { console.error('MN_ERROR:', e.message); process.exit(1); });
