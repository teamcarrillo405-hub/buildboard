const Database = require('./node_modules/better-sqlite3');
const db = new Database('./server/constructflix.db', { readonly: true });
// Get schema
const cols = db.prepare("PRAGMA table_info(companies)").all();
const colNames = cols.map(c => c.name);
console.log('Columns:', colNames.join(', '));
// Count total
const total = db.prepare("SELECT COUNT(*) as n FROM companies").get();
console.log('\nTotal companies:', total.n.toLocaleString());
// Group by state (could be 'state' not 'stateCode')
const stateCol = colNames.includes('stateCode') ? 'stateCode' : colNames.includes('state') ? 'state' : null;
if (stateCol) {
  const rows = db.prepare("SELECT " + stateCol + " as st, COUNT(*) as cnt FROM companies GROUP BY " + stateCol + " ORDER BY cnt DESC").all();
  console.log('\nBy state:');
  rows.slice(0,30).forEach(r => console.log('  ' + (r.st||'null') + ': ' + r.cnt.toLocaleString()));
}
// By dataSource
if (colNames.includes('dataSource')) {
  const ds = db.prepare("SELECT dataSource, COUNT(*) as cnt FROM companies GROUP BY dataSource").all();
  console.log('\nBy source:'); ds.forEach(r => console.log('  ' + (r.dataSource||'null') + ': ' + r.cnt.toLocaleString()));
}
db.close();
