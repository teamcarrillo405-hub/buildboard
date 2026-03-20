// enrichWatchdog.cjs — Monitors enrichment workers and restarts dead ones
// CommonJS (.cjs) for reliability in a "type":"module" project.
// Usage: node server/scripts/enrichWatchdog.cjs
// Normally launched by launch_enrich.cjs as a detached background process.

'use strict';

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT_DIR   = path.resolve(__dirname, '..', '..');   // constructflix/
const LOGS_DIR   = path.join(ROOT_DIR, 'logs');
const PID_FILE   = path.join(LOGS_DIR, 'enrich_pids.json');
const WATCHDOG_LOG = path.join(LOGS_DIR, 'watchdog.log');

// ── Spawn constants — same full-path strategy as launch_enrich.cjs ────────────

const NODE_EXE = 'C:\\Program Files\\nodejs\\node.exe';
const TSX_CLI  = 'C:\\Users\\glcar\\AppData\\Local\\npm-cache\\_npx\\fd45a72a545557e9\\node_modules\\tsx\\dist\\cli.mjs';

const WORKER_SCRIPT = path.join(ROOT_DIR, 'server', 'scripts', 'enrichWorker.ts');
const DELAY_MS      = 2000;

// ── Check intervals ──────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS     = 60  * 1000;   // check every 60 s
const HEARTBEAT_INTERVAL_MS = 5   * 60 * 1000;  // heartbeat every 5 min

// ── Logging ──────────────────────────────────────────────────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });

const logStream = fs.createWriteStream(WATCHDOG_LOG, { flags: 'a' });

function ts() {
  return new Date().toISOString();
}

function log(msg) {
  const line = '[' + ts() + '] ' + msg;
  logStream.write(line + '\n');
  process.stdout.write(line + '\n');
}

// ── PID file helpers ─────────────────────────────────────────────────────────

function readPidFile() {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    log('WARN: Could not read PID file: ' + e.message);
    return null;
  }
}

function writePidFile(data) {
  try {
    fs.writeFileSync(PID_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    log('ERROR: Could not write PID file: ' + e.message);
  }
}

// ── Process liveness check ───────────────────────────────────────────────────

function isAlive(pid) {
  if (!pid || pid === 0) return false;
  try {
    process.kill(pid, 0);   // signal 0 = check existence, no actual signal sent
    return true;
  } catch (e) {
    return false;
  }
}

// ── Worker respawn ───────────────────────────────────────────────────────────

function respawnWorker(workerId, totalWorkers) {
  var workerLogFile = path.join(
    LOGS_DIR,
    'enrichWorker_' + workerId + '_of_' + totalWorkers + '.log'
  );

  var outFd, errFd;
  try {
    outFd = fs.openSync(workerLogFile, 'a');
    errFd = fs.openSync(workerLogFile, 'a');
  } catch (e) {
    log('ERROR: Cannot open log file for worker ' + workerId + ': ' + e.message);
    return 0;
  }

  var proc = spawn(NODE_EXE, [
    TSX_CLI,
    WORKER_SCRIPT,
    '--worker-id',     String(workerId),
    '--total-workers', String(totalWorkers),
    '--delay-ms',      String(DELAY_MS),
  ], {
    detached: true,
    stdio:    ['ignore', outFd, errFd],
    cwd:      ROOT_DIR,
    env:      Object.assign({}, process.env),
  });

  proc.unref();

  // Close the fds in the parent after spawn — the child has its own copy
  try { fs.closeSync(outFd); } catch (_) {}
  try { fs.closeSync(errFd); } catch (_) {}

  var newPid = proc.pid || 0;
  log('RESPAWN worker-id=' + workerId + ' totalWorkers=' + totalWorkers +
      ' newPID=' + newPid + ' log=' + workerLogFile);
  return newPid;
}

// ── Main check loop ──────────────────────────────────────────────────────────

function runCheck() {
  var data = readPidFile();
  if (!data) {
    log('WARN: PID file missing or unreadable — skipping check cycle');
    return;
  }

  var pids         = data.pids         || [];
  var totalWorkers = data.totalWorkers || pids.length;
  var changed      = false;
  var aliveCount   = 0;

  for (var i = 0; i < pids.length; i++) {
    var pid = pids[i];
    if (isAlive(pid)) {
      aliveCount++;
    } else {
      log('DEAD worker-id=' + i + ' PID=' + pid + ' — respawning...');
      var newPid = respawnWorker(i, totalWorkers);
      if (newPid > 0) {
        pids[i] = newPid;
        changed  = true;
        aliveCount++;
      } else {
        log('ERROR: Failed to respawn worker-id=' + i);
      }
    }
  }

  if (changed) {
    data.pids = pids;
    writePidFile(data);
    log('PID file updated after respawn(s)');
  }

  // Log the check result at DEBUG level
  log('CHECK complete: ' + aliveCount + '/' + totalWorkers + ' workers alive');
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

function runHeartbeat() {
  var data = readPidFile();
  if (!data) {
    log('HEARTBEAT: PID file unreadable');
    return;
  }

  var pids         = data.pids || [];
  var totalWorkers = data.totalWorkers || pids.length;
  var alive = pids.filter(function(pid) { return isAlive(pid); }).length;

  log('HEARTBEAT Watchdog alive: ' + alive + '/' + totalWorkers + ' workers running');
}

// ── Startup ──────────────────────────────────────────────────────────────────

log('Watchdog starting. PID=' + process.pid +
    ' checkInterval=' + (CHECK_INTERVAL_MS / 1000) + 's' +
    ' heartbeatInterval=' + (HEARTBEAT_INTERVAL_MS / 60000) + 'min');

// Immediate first check so we know state on launch
runCheck();
runHeartbeat();

var checkTimer     = setInterval(runCheck,      CHECK_INTERVAL_MS);
var heartbeatTimer = setInterval(runHeartbeat,  HEARTBEAT_INTERVAL_MS);

// ── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  log('Watchdog received ' + signal + ' — shutting down gracefully');
  clearInterval(checkTimer);
  clearInterval(heartbeatTimer);
  logStream.end(function() {
    process.exit(0);
  });
}

process.on('SIGINT',  function() { shutdown('SIGINT');  });
process.on('SIGTERM', function() { shutdown('SIGTERM'); });

// Keep this process alive even when spawned detached
process.stdin.resume();
