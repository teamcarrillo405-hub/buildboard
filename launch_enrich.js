// launch_enrich.js — Launches 20 enrichment workers in background
// Run from C:\Users\glcar\constructflix
// Usage: node launch_enrich.js

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const TOTAL_WORKERS = 20;
const DELAY_MS = 2000;
const LOGS_DIR = './logs';

fs.mkdirSync(LOGS_DIR, { recursive: true });

console.log('================================================================');
console.log(' ConstructFlix Enrichment Swarm Launcher');
console.log('================================================================');
console.log('  Workers   : ' + TOTAL_WORKERS);
console.log('  Delay/req : ' + DELAY_MS + 'ms per worker');
console.log('  Search    : DuckDuckGo HTML + Bing HTML');
console.log('  Validate  : Ollama gemma3:4b (local)');
console.log('================================================================');
console.log('');

const pids = [];

function launchWorker(workerId) {
  return new Promise(resolve => {
    const logFile = path.join(LOGS_DIR, 'enrichWorker_' + workerId + '_of_' + TOTAL_WORKERS + '.log');
    const outFd = fs.openSync(logFile, 'a');

    const proc = spawn('npx', [
      'tsx', 'server/scripts/enrichWorker.ts',
      '--worker-id',     String(workerId),
      '--total-workers', String(TOTAL_WORKERS),
      '--delay-ms',      String(DELAY_MS),
    ], {
      detached: true,
      stdio: ['ignore', outFd, outFd],
      cwd: __dirname,
      env: Object.assign({}, process.env),
    });

    proc.unref();
    pids.push(proc.pid || 0);
    console.log('  Worker ' + String(workerId).padStart(2, '0') + '  PID=' + proc.pid + '  -> ' + logFile);
    setTimeout(resolve, 600); // stagger 600ms between each worker start
  });
}

async function main() {
  for (let i = 0; i < TOTAL_WORKERS; i++) {
    await launchWorker(i);
  }

  const pidData = JSON.stringify({ pids, totalWorkers: TOTAL_WORKERS, startedAt: new Date().toISOString() }, null, 2);
  fs.writeFileSync(path.join(LOGS_DIR, 'enrich_pids.json'), pidData);

  console.log('');
  console.log('  PID file saved -> logs/enrich_pids.json');
  console.log('  Monitor: node check_enrich.js');
  console.log('  Stop:    node stop_enrich.js');
  console.log('');
  console.log('  All ' + TOTAL_WORKERS + ' workers running in background!');
}

main().catch(console.error);
