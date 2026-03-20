// launch_enrich.cjs — Launches 50 enrichment workers + watchdog in background
// CommonJS (.cjs) for reliability in a "type":"module" project.
// Run from C:\Users\glcar\constructflix
// Usage: node launch_enrich.cjs

'use strict';

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');

// ── Config ───────────────────────────────────────────────────────────────────

const TOTAL_WORKERS = 10;
const DELAY_MS      = 2000;
const STAGGER_MS    = 2000;   // pause between each worker launch — each spawns a Chromium instance
const LOGS_DIR      = path.resolve(__dirname, 'logs');

// ── Full executable paths — reliable even when PATH is incomplete in spawned
//    processes on Windows. Same strategy as the original launch_enrich.cjs.
const NODE_EXE       = 'C:\\Program Files\\nodejs\\node.exe';
const TSX_CLI        = 'C:\\Users\\glcar\\AppData\\Local\\npm-cache\\_npx\\fd45a72a545557e9\\node_modules\\tsx\\dist\\cli.mjs';
const WORKER_SCRIPT  = path.resolve(__dirname, 'server', 'scripts', 'enrichWorker.ts');
const WATCHDOG_SCRIPT = path.resolve(__dirname, 'server', 'scripts', 'enrichWatchdog.cjs');

const PID_FILE      = path.join(LOGS_DIR, 'enrich_pids.json');
const WATCHDOG_LOG  = path.join(LOGS_DIR, 'watchdog.log');

// ── Setup ────────────────────────────────────────────────────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });

console.log('================================================================');
console.log(' ConstructFlix Enrichment Swarm Launcher');
console.log('================================================================');
console.log('  Workers   : ' + TOTAL_WORKERS);
console.log('  Delay/req : ' + DELAY_MS + 'ms per worker');
console.log('  Stagger   : ' + STAGGER_MS + 'ms between launches');
console.log('  Search    : DuckDuckGo HTML + Bing HTML');
console.log('  Validate  : Ollama gemma3:4b (local)');
console.log('================================================================');
console.log('');

// ── Step 1: Clear stale progress files from previous runs with a different
//            totalWorkers count to avoid slice-ownership conflicts.
// Progress files are named: enrichWorker_N_of_TOTAL.json
// ─────────────────────────────────────────────────────────────────────────────

console.log('Checking for stale progress files...');

var staleCleared = 0;
try {
  var logEntries = fs.readdirSync(LOGS_DIR);
  for (var e = 0; e < logEntries.length; e++) {
    var entry = logEntries[e];
    // Match e.g. enrichWorker_3_of_20.json  (but NOT enrichWorker_3_of_50.json)
    var m = entry.match(/^enrichWorker_(\d+)_of_(\d+)\.json$/);
    if (m && parseInt(m[2]) !== TOTAL_WORKERS) {
      var stalePath = path.join(LOGS_DIR, entry);
      fs.unlinkSync(stalePath);
      staleCleared++;
    }
  }
} catch (err) {
  console.error('  WARN: Could not scan logs dir for stale files: ' + err.message);
}

if (staleCleared > 0) {
  console.log('  Cleared ' + staleCleared + ' stale progress file(s) from previous total-workers count.');
} else {
  console.log('  No stale progress files found.');
}
console.log('');

// ── Step 2: Spawn workers ────────────────────────────────────────────────────

var pids = [];

function launchWorker(workerId) {
  return new Promise(function(resolve) {
    var workerLogFile = path.join(LOGS_DIR, 'enrichWorker_' + workerId + '_of_' + TOTAL_WORKERS + '.log');

    var outFd, errFd;
    try {
      outFd = fs.openSync(workerLogFile, 'a');
      errFd = fs.openSync(workerLogFile, 'a');
    } catch (err) {
      console.error('  ERROR: Cannot open log file for worker ' + workerId + ': ' + err.message);
      pids.push(0);
      return setTimeout(resolve, STAGGER_MS);
    }

    var proc = spawn(NODE_EXE, [
      TSX_CLI,
      WORKER_SCRIPT,
      '--worker-id',     String(workerId),
      '--total-workers', String(TOTAL_WORKERS),
      '--delay-ms',      String(DELAY_MS),
    ], {
      detached: true,
      stdio:    ['ignore', outFd, errFd],
      cwd:      __dirname,
      env:      Object.assign({}, process.env),
    });

    proc.unref();

    // Close parent-side file descriptors — child keeps its own copies
    try { fs.closeSync(outFd); } catch (_) {}
    try { fs.closeSync(errFd); } catch (_) {}

    var pid = proc.pid || 0;
    pids.push(pid);

    console.log(
      '  Worker ' + String(workerId).padStart(2, '0') +
      '/' + (TOTAL_WORKERS - 1) +
      '  PID=' + String(pid).padEnd(7) +
      '  -> ' + path.basename(workerLogFile)
    );

    setTimeout(resolve, STAGGER_MS);
  });
}

// ── Step 3: Spawn watchdog ───────────────────────────────────────────────────

function launchWatchdog() {
  var outFd, errFd;
  try {
    outFd = fs.openSync(WATCHDOG_LOG, 'a');
    errFd = fs.openSync(WATCHDOG_LOG, 'a');
  } catch (err) {
    console.error('  ERROR: Cannot open watchdog log: ' + err.message);
    return 0;
  }

  var proc = spawn(NODE_EXE, [
    WATCHDOG_SCRIPT,
  ], {
    detached: true,
    stdio:    ['ignore', outFd, errFd],
    cwd:      __dirname,
    env:      Object.assign({}, process.env),
  });

  proc.unref();

  try { fs.closeSync(outFd); } catch (_) {}
  try { fs.closeSync(errFd); } catch (_) {}

  return proc.pid || 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Launch all workers with stagger
  for (var i = 0; i < TOTAL_WORKERS; i++) {
    await launchWorker(i);
  }

  // Save PID file before starting watchdog so watchdog can read it immediately
  var pidData = {
    pids:         pids,
    totalWorkers: TOTAL_WORKERS,
    startedAt:    new Date().toISOString(),
  };
  fs.writeFileSync(PID_FILE, JSON.stringify(pidData, null, 2));
  console.log('');
  console.log('  PID file saved -> logs/enrich_pids.json');

  // Launch watchdog
  console.log('');
  console.log('Launching watchdog...');
  var watchdogPid = launchWatchdog();
  console.log('  Watchdog  PID=' + watchdogPid + '  -> logs/watchdog.log');

  // Summary
  var activePids = pids.filter(function(p) { return p > 0; });
  console.log('');
  console.log('================================================================');
  console.log(' Launch Summary');
  console.log('================================================================');
  console.log('  Workers launched : ' + activePids.length + '/' + TOTAL_WORKERS);
  console.log('  Worker PIDs      : ' + activePids.join(', '));
  console.log('  Watchdog PID     : ' + watchdogPid);
  console.log('');
  console.log('  All processes are detached and running in background.');
  console.log('  Monitor : node check_enrich.cjs');
  console.log('  Stop    : node stop_enrich.cjs');
  console.log('  Watchdog: tail -f logs/watchdog.log');
  console.log('================================================================');
}

main().catch(function(err) {
  console.error('FATAL:', err);
  process.exit(1);
});
