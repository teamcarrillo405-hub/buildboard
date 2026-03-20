const db = require('better-sqlite3')('./server/constructflix.db');

const rows = db.prepare(`
  SELECT
    state,
    COUNT(*) as total,
    SUM(CASE WHEN dataSource LIKE 'license_%' THEN 1 ELSE 0 END) as license_cnt,
    SUM(CASE WHEN dataSource LIKE 'permit%' THEN 1 ELSE 0 END) as permit_cnt,
    SUM(CASE WHEN dataSource = 'yelp' THEN 1 ELSE 0 END) as yelp_cnt
  FROM companies
  WHERE state IS NOT NULL AND state != '' AND LENGTH(state) = 2
  GROUP BY state
  HAVING total > 5000
  ORDER BY total DESC
  LIMIT 35
`).all();

const configured = new Set(['TX','WA','OR','AZ','IL','MN','FL','CA','CT','CO','NJ','VA','IA','NY','DE','AR','VT','DC','NC','LA','OH']);

console.log('State | Total    | License  | % | Permit   | Yelp    | Config?');
console.log('------|----------|----------|---|----------|---------|-------');
rows.forEach(r => {
  const pct = (r.license_cnt/r.total*100).toFixed(0);
  const cfg = configured.has(r.state) ? 'YES' : '--- MISSING';
  console.log(`${r.state.padEnd(5)} | ${String(r.total).padStart(8)} | ${String(r.license_cnt).padStart(8)} | ${pct.padStart(2)}% | ${String(r.permit_cnt).padStart(8)} | ${String(r.yelp_cnt).padStart(7)} | ${cfg}`);
});
db.close();
