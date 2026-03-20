// stop_enrich.js — Stops all enrichment workers
// Usage: node stop_enrich.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pidFile = './logs/enrich_pids.json';

let killed = 0;

// Kill from PID file
if (fs.existsSync(pidFile)) {
  const data = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  console.log('Stopping ' + data.pids.length + ' workers from PID file...');
  for (const pid of data.pids) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log('  Stopped PID ' + pid);
      killed++;
    } catch (e) {
      // already dead
    }
  }
}

// Also kill any stray enrichWorker node processes via taskkill (Windows)
try {
  const result = execSync('wmic process where "CommandLine like \'%enrichWorker%\'" get ProcessId /format:list 2>nul', { encoding: 'utf8' });
  const pids = result.match(/\d+/g) || [];
  for (const pid of pids) {
    try {
      process.kill(parseInt(pid), 'SIGTERM');
      console.log('  Stopped stray PID ' + pid);
      killed++;
    } catch {}
  }
} catch {}

console.log('Done — stopped ' + killed + ' processes.');
console.log('Progress is saved. Run: node launch_enrich.js to resume.');
