// check_enrich.cjs — Shows enrichment swarm progress
// Run from C:\Users\glcar\constructflix
// Usage: node check_enrich.cjs          (single snapshot)
//        node check_enrich.cjs --loop   (refresh every 3 min)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const TOTAL_WORKERS = 20;
const LOGS_DIR = './logs';
const DB_PATH = './server/constructflix.db';
const loop = process.argv.includes('--loop');

function loadProgress() {
  var workers = [];
  for (var i = 0; i < TOTAL_WORKERS; i++) {
    var file = path.join(LOGS_DIR, 'enrichWorker_' + i + '_of_' + TOTAL_WORKERS + '.json');
    try {
      workers.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (e) {
      workers.push({ workerId: i, processed: 0, found: 0, foundEmail: 0, errors: 0, lastBusiness: '--', lastUpdatedAt: '--' });
    }
  }
  return workers;
}

function getDbStats() {
  try {
    var db = new Database(DB_PATH, { readonly: true });
    var r = db.prepare(
      "SELECT COUNT(*) as total, " +
      "SUM(CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END) as withWebsite, " +
      "SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as withEmail, " +
      "SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as withPhone " +
      "FROM companies"
    ).get();
    db.close();
    return r;
  } catch (e) {
    return null;
  }
}

function n(num) { return (num || 0).toLocaleString(); }
function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '0.0%'; }

function printStatus() {
  var workers = loadProgress();
  var db = getDbStats();
  var now = new Date().toLocaleString();

  var totProc  = workers.reduce(function(s, w) { return s + (w.processed  || 0); }, 0);
  var totFound = workers.reduce(function(s, w) { return s + (w.found      || 0); }, 0);
  var totEmail = workers.reduce(function(s, w) { return s + (w.foundEmail || 0); }, 0);
  var totErr   = workers.reduce(function(s, w) { return s + (w.errors     || 0); }, 0);

  console.clear();
  console.log('=================================================================');
  console.log(' ConstructFlix Enrichment Swarm  [' + now + ']');
  console.log('=================================================================');

  if (db) {
    console.log(' DB TOTALS:');
    console.log('   Total records  : ' + n(db.total));
    console.log('   With website   : ' + n(db.withWebsite) + '  (' + pct(db.withWebsite, db.total) + ')');
    console.log('   With email     : ' + n(db.withEmail)   + '  (' + pct(db.withEmail,   db.total) + ')');
    console.log('   With phone     : ' + n(db.withPhone)   + '  (' + pct(db.withPhone,   db.total) + ')');
    console.log('   Still needs    : ' + n(db.total - db.withWebsite));
  }

  console.log('');
  console.log(' SWARM PROGRESS (' + TOTAL_WORKERS + ' workers):');
  console.log('   Total processed : ' + n(totProc));
  console.log('   Websites found  : ' + n(totFound) + '  (' + pct(totFound, totProc) + ' hit rate)');
  console.log('   Emails found    : ' + n(totEmail) + '  (' + pct(totEmail, totFound) + ' of found sites)');
  console.log('   Errors          : ' + n(totErr));
  console.log('');
  console.log(' PER WORKER:');
  console.log('  W#  Processed   Found  Emails  Err  Last Business');
  console.log(' ---  ---------  ------  ------  ---  ----------------------------');

  for (var idx = 0; idx < workers.length; idx++) {
    var w = workers[idx];
    var wid  = String(w.workerId).padStart(3);
    var proc = n(w.processed  || 0).padStart(9);
    var fnd  = n(w.found      || 0).padStart(6);
    var eml  = n(w.foundEmail || 0).padStart(6);
    var err  = String(w.errors || 0).padStart(3);
    var last = (w.lastBusiness || '--').substring(0, 32);
    console.log('  ' + wid + '  ' + proc + '  ' + fnd + '  ' + eml + '  ' + err + '  ' + last);
  }

  console.log('');
  console.log(' Logs: ' + LOGS_DIR + '/enrichWorker_N_of_' + TOTAL_WORKERS + '.log');
  if (loop) { console.log(' Auto-refreshing every 3 min. Ctrl+C to stop.'); }
  console.log('=================================================================');
}

printStatus();

if (loop) {
  setInterval(printStatus, 3 * 60 * 1000);
}
