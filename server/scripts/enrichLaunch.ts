#!/usr/bin/env npx tsx
/**
 * enrichLaunch.ts — Launches N enrichment workers in parallel
 *
 * Each worker gets its own log file and progress JSON.
 * Workers are staggered by 500ms to avoid thundering-herd on startup.
 *
 * Usage:
 *   npx tsx server/scripts/enrichLaunch.ts [--workers 20] [--delay-ms 2000]
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const args: Record<string, string> = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (process.argv[i].startsWith('--')) {
    args[process.argv[i].slice(2)] = process.argv[i + 1] ?? 'true';
  }
}

const TOTAL_WORKERS = parseInt(args['workers']   ?? '20');
const DELAY_MS      = parseInt(args['delay-ms']  ?? '2000');
const LOGS_DIR      = './logs';

fs.mkdirSync(LOGS_DIR, { recursive: true });

console.log('═══════════════════════════════════════════════════════════════');
console.log(' ConstructFlix — Web Enrichment Swarm Launcher');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Workers     : ${TOTAL_WORKERS}`);
console.log(`  Delay/req   : ${DELAY_MS}ms per worker`);
console.log(`  Search      : DuckDuckGo HTML + Bing HTML`);
console.log(`  Validation  : Ollama gemma3:4b`);
console.log(`  Logs dir    : ${LOGS_DIR}/enrichWorker_N_of_${TOTAL_WORKERS}.log`);
console.log('═══════════════════════════════════════════════════════════════\n');

const pids: number[] = [];

for (let workerId = 0; workerId < TOTAL_WORKERS; workerId++) {
  const logFile  = path.join(LOGS_DIR, `enrichWorker_${workerId}_of_${TOTAL_WORKERS}.log`);
  const outFd    = fs.openSync(logFile, 'a');

  const proc = spawn(
    process.execPath,  // use the current node binary
    [
      '--import', 'tsx',
      'server/scripts/enrichWorker.ts',
      '--worker-id',     String(workerId),
      '--total-workers', String(TOTAL_WORKERS),
      '--delay-ms',      String(DELAY_MS),
    ],
    {
      detached: true,
      stdio: ['ignore', outFd, outFd],
      cwd: process.cwd(),
      env: { ...process.env },
      shell: true,
    }
  );

  proc.unref();
  pids.push(proc.pid ?? 0);

  console.log(`  ✓ Worker ${String(workerId).padStart(2, '0')} launched  PID=${proc.pid}  → ${logFile}`);

  // Stagger starts to avoid thundering herd
  await new Promise(r => setTimeout(r, 500));
}

// Write PID file so we can kill all workers if needed
const pidFile = path.join(LOGS_DIR, 'enrich_pids.json');
fs.writeFileSync(pidFile, JSON.stringify({ pids, totalWorkers: TOTAL_WORKERS, startedAt: new Date().toISOString() }, null, 2));

console.log(`\n  PID file saved → ${pidFile}`);
console.log(`\n  Monitor:  npx tsx server/scripts/enrichStatus.ts`);
console.log(`  Stop all: node -e "require('fs').readFileSync('${pidFile}').toString() |> JSON.parse |> r => r.pids.forEach(p => { try { process.kill(p) } catch {} })"`);
console.log('\n  All workers running in background.\n');
