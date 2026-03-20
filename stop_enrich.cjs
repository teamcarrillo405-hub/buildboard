// stop_enrich.cjs — Stops all enrichment workers
// Usage: node stop_enrich.cjs

const fs = require('fs');
const { execSync } = require('child_process');

const pidFile = './logs/enrich_pids.json';
var killed = 0;

if (fs.existsSync(pidFile)) {
  var data = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  console.log('Stopping ' + data.pids.length + ' workers from PID file...');
  for (var i = 0; i < data.pids.length; i++) {
    var pid = data.pids[i];
    try {
      process.kill(pid, 'SIGTERM');
      console.log('  Stopped PID ' + pid);
      killed++;
    } catch (e) { /* already dead */ }
  }
}

// Also kill any stray enrichWorker processes on Windows
try {
  var result = execSync('wmic process where "CommandLine like \'%enrichWorker%\'" get ProcessId /format:list', { encoding: 'utf8', timeout: 5000 });
  var pids = result.match(/\d+/g) || [];
  for (var j = 0; j < pids.length; j++) {
    var p = parseInt(pids[j]);
    if (p > 4) {
      try {
        process.kill(p, 'SIGTERM');
        console.log('  Stopped stray PID ' + p);
        killed++;
      } catch (e) {}
    }
  }
} catch (e) {}

console.log('Done. Stopped ' + killed + ' processes.');
console.log('Progress saved. Run: node launch_enrich.cjs to resume.');
