const Database = require('better-sqlite3');
const db = new Database('server/constructflix.db', { readonly: true });
const total = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;

const fields = ['phone','website','email','imageUrl','rating','reviewCount','yelpId','yelpUrl','address','city','state','zipCode','latitude','longitude','hours','services','specialties'];
console.log('TOTAL RECORDS:', total);
console.log('');

for (const f of fields) {
  const r = db.prepare('SELECT COUNT(*) as filled FROM companies WHERE ' + f + ' IS NOT NULL AND ' + f + " != ''").get();
  const pct = (r.filled / total * 100).toFixed(1);
  const missing = total - r.filled;
  console.log(f + ': ' + r.filled + ' filled (' + pct + '%) | ' + missing + ' MISSING');
}

console.log('\n=== BY SOURCE GROUP ===\n');

const sources = db.prepare('SELECT dataSource, COUNT(*) as cnt FROM companies GROUP BY dataSource ORDER BY cnt DESC').all();
const groups = { license: [], permits: [], yelp: [], other: [] };
sources.forEach(function(s) {
  if (s.dataSource.startsWith('license_') || s.dataSource.startsWith('contractors_')) groups.license.push(s);
  else if (s.dataSource.startsWith('permits_')) groups.permits.push(s);
  else if (s.dataSource === 'yelp') groups.yelp.push(s);
  else groups.other.push(s);
});

const keyFields = ['phone','website','email','imageUrl','rating','reviewCount','address','city','latitude','longitude'];

for (const [group, srcs] of Object.entries(groups)) {
  if (!srcs.length) continue;
  const dsNames = srcs.map(function(s) { return "'" + s.dataSource + "'"; }).join(',');
  const groupTotal = srcs.reduce(function(a, b) { return a + b.cnt; }, 0);
  console.log(group.toUpperCase() + ' (' + groupTotal + ' records):');
  for (const f of keyFields) {
    const r = db.prepare('SELECT COUNT(*) as filled FROM companies WHERE dataSource IN (' + dsNames + ') AND ' + f + ' IS NOT NULL AND ' + f + " != ''").get();
    const pct = (r.filled / groupTotal * 100).toFixed(1);
    console.log('  ' + f + ': ' + r.filled + ' (' + pct + '%)');
  }
  console.log('');
}

db.close();
