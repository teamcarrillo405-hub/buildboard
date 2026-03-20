// check_enrich.js — Shows enrichment swarm progress + geocoding + cross-enrich
// Run from C:\Users\glcar\constructflix
// Usage: node check_enrich.js          (single snapshot)
//        node check_enrich.js --loop   (refresh every 3 min)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const LOGS_DIR = './logs';
const DB_PATH = './server/constructflix.db';
const loop = process.argv.includes('--loop');

function detectWorkerCount() {
  // Auto-detect from enrich_pids.json or scan log files
  try {
    const pids = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, 'enrich_pids.json'), 'utf8'));
    return pids.totalWorkers || 50;
  } catch {
    // Scan for highest worker count in log filenames
    try {
      const files = fs.readdirSync(LOGS_DIR).filter(f => f.startsWith('enrichWorker_') && f.endsWith('.json'));
      const counts = files.map(f => {
        const m = f.match(/_of_(\d+)\./);
        return m ? parseInt(m[1]) : 0;
      });
      return Math.max(...counts, 20);
    } catch { return 50; }
  }
}

function loadProgress(totalWorkers) {
  const workers = [];
  for (let i = 0; i < totalWorkers; i++) {
    const file = path.join(LOGS_DIR, 'enrichWorker_' + i + '_of_' + totalWorkers + '.json');
    try {
      workers.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      workers.push({ workerId: i, processed: 0, found: 0, foundEmail: 0, errors: 0, lastBusiness: '--', lastUpdatedAt: '--' });
    }
  }
  return workers;
}

function loadGeoProgress() {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOGS_DIR, 'geocode_progress.json'), 'utf8'));
  } catch { return null; }
}

function loadCrossEnrichSummary() {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOGS_DIR, 'crossEnrich_yelp_summary.json'), 'utf8'));
  } catch { return null; }
}

function getDbStats() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const r = db.prepare(
      'SELECT COUNT(*) as total,' +
      " SUM(CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) as withWebsite," +
      " SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as withEmail," +
      " SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as withPhone," +
      " SUM(CASE WHEN latitude IS NOT NULL AND latitude != '' THEN 1 ELSE 0 END) as withLatLng," +
      " SUM(CASE WHEN imageUrl IS NOT NULL AND imageUrl != '' THEN 1 ELSE 0 END) as withImage" +
      ' FROM companies'
    ).get();
    db.close();
    return r;
  } catch (e) {
    return null;
  }
}

function checkAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function n(num) { return (num || 0).toLocaleString(); }
function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '0.0%'; }

function printStatus() {
  const totalWorkers = detectWorkerCount();
  const workers = loadProgress(totalWorkers);
  const geo = loadGeoProgress();
  const cross = loadCrossEnrichSummary();
  const db = getDbStats();
  const now = new Date().toLocaleString();

  const totProc  = workers.reduce((s, w) => s + (w.processed  || 0), 0);
  const totFound = workers.reduce((s, w) => s + (w.found      || 0), 0);
  const totEmail = workers.reduce((s, w) => s + (w.foundEmail || 0), 0);
  const totErr   = workers.reduce((s, w) => s + (w.errors     || 0), 0);

  // Count alive workers
  let aliveCount = 0;
  let pids = {};
  try {
    pids = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, 'enrich_pids.json'), 'utf8'));
    if (pids.pids) aliveCount = pids.pids.filter(p => checkAlive(p)).length;
  } catch {}

  // ETA calculation based on recent throughput
  let etaStr = '?';
  const activeWorkers = workers.filter(w => w.lastUpdatedAt && w.lastUpdatedAt !== '--' && (w.processed || 0) > 0);
  if (activeWorkers.length > 0 && db) {
    const oldest = activeWorkers.reduce((a, b) => new Date(a.startedAt) < new Date(b.startedAt) ? a : b);
    const elapsedSec = (Date.now() - new Date(oldest.startedAt).getTime()) / 1000;
    if (elapsedSec > 60 && totProc > 100) {
      const ratePerSec = totProc / elapsedSec;
      const remaining = (db.total - db.withWebsite) - totProc;
      const etaHours = remaining / ratePerSec / 3600;
      if (etaHours < 1) etaStr = Math.round(etaHours * 60) + 'm';
      else if (etaHours < 48) etaStr = etaHours.toFixed(1) + 'h';
      else etaStr = (etaHours / 24).toFixed(1) + 'd';
    }
  }

  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  ConstructFlix — Enrichment Command Center  [' + now + ']  ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');

  if (db) {
    console.log('║  DATABASE COVERAGE                                                  ║');
    console.log('║    Total records  : ' + n(db.total).padStart(12) +       '                                   ║');
    console.log('║    With website   : ' + n(db.withWebsite).padStart(12) + '  (' + pct(db.withWebsite, db.total).padEnd(6) + ')                          ║');
    console.log('║    With email     : ' + n(db.withEmail).padStart(12) +   '  (' + pct(db.withEmail,   db.total).padEnd(6) + ')                          ║');
    console.log('║    With phone     : ' + n(db.withPhone).padStart(12) +   '  (' + pct(db.withPhone,   db.total).padEnd(6) + ')                          ║');
    console.log('║    With lat/lng   : ' + n(db.withLatLng).padStart(12) +  '  (' + pct(db.withLatLng,  db.total).padEnd(6) + ')                          ║');
    console.log('║    With image     : ' + n(db.withImage).padStart(12) +   '  (' + pct(db.withImage,   db.total).padEnd(6) + ')                          ║');
    console.log('║    Still needs web: ' + n(db.total - db.withWebsite).padStart(12) + '                                   ║');
  }

  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log('║  WEB SEARCH SWARM (' + totalWorkers + ' workers, ' + aliveCount + ' alive)' + ' '.repeat(Math.max(0, 37 - String(totalWorkers).length - String(aliveCount).length)) + '║');
  console.log('║    Processed      : ' + n(totProc).padStart(12) +  '                                   ║');
  console.log('║    Websites found : ' + n(totFound).padStart(12) + '  (' + pct(totFound, totProc).padEnd(6) + ' hit rate)                   ║');
  console.log('║    Emails found   : ' + n(totEmail).padStart(12) + '  (' + pct(totEmail, totFound).padEnd(6) + ' of found)                   ║');
  console.log('║    Errors         : ' + n(totErr).padStart(12) +   '                                   ║');
  console.log('║    ETA            : ' + etaStr.padStart(12) +      '                                   ║');

  // Geocoding status
  if (geo) {
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log('║  GEOCODING (Census Bureau)                                          ║');
    console.log('║    Submitted      : ' + n(geo.processed).padStart(12) + '                                   ║');
    console.log('║    Matched        : ' + n(geo.matched).padStart(12) +   '  (' + pct(geo.matched, geo.processed).padEnd(6) + ')                          ║');
    console.log('║    Updated DB     : ' + n(geo.updated).padStart(12) +   '                                   ║');
    console.log('║    Errors         : ' + n(geo.errors).padStart(12) +    '                                   ║');
  }

  // Cross-enrichment status
  if (cross) {
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log('║  CROSS-ENRICH (Yelp → license/permits)                              ║');
    console.log('║    Scanned        : ' + n(cross.scanned).padStart(12) +       '                                   ║');
    console.log('║    Matches        : ' + n(cross.matched).padStart(12) +       '                                   ║');
    console.log('║    Phones added   : ' + n(cross.updatedPhone).padStart(12) +  '                                   ║');
    console.log('║    Websites added : ' + n(cross.updatedWebsite).padStart(12) + '                                  ║');
    console.log('║    Images added   : ' + n(cross.updatedImage).padStart(12) +  '                                   ║');
  }

  console.log('╠══════════════════════════════════════════════════════════════════════╣');

  // Per-worker table — compact: show 5 per row
  console.log('║  WORKERS (processed / found / emails)                                ║');
  let row = '║  ';
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    const id = String(w.workerId != null ? w.workerId : i).padStart(2);
    const p = String(w.processed || 0).padStart(5);
    const f = String(w.found || 0).padStart(3);
    const alive = pids.pids && pids.pids[i] ? (checkAlive(pids.pids[i]) ? '●' : '○') : '?';
    row += alive + 'W' + id + ':' + p + '/' + f + '  ';
    if ((i + 1) % 5 === 0) {
      console.log(row.padEnd(71) + '║');
      row = '║  ';
    }
  }
  if (row.trim() !== '║') {
    console.log(row.padEnd(71) + '║');
  }

  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Monitor: node check_enrich.js --loop');
  console.log('  Logs:    ' + LOGS_DIR + '/enrichWorker_N_of_' + totalWorkers + '.log');
  if (loop) console.log('  Auto-refreshing every 3 minutes. Ctrl+C to stop.');
  console.log('');
}

printStatus();

if (loop) {
  setInterval(printStatus, 3 * 60 * 1000);
}
