process.chdir('C:/Users/glcar/constructflix');
const {runStateLicenseSync}=require('./server/pipelines/stateLicenseSync');
const {STATE_CONFIGS}=require('./server/data/stateLicenseConfigs');
runStateLicenseSync(STATE_CONFIGS['MN']).then(s=>{console.log('MN_DONE:',JSON.stringify(s));process.exit(0)}).catch(e=>{console.error('MN_ERROR:',e.message);process.exit(1)});
