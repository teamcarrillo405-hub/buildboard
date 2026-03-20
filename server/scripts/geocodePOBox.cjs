'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'constructflix.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Build zip centroids from already-geocoded companies
const zipCentroids = new Map();
db.prepare(`
  SELECT zipCode, AVG(latitude) as lat, AVG(longitude) as lng
  FROM companies
  WHERE latitude IS NOT NULL AND latitude != 0
    AND longitude IS NOT NULL AND longitude != 0
    AND zipCode IS NOT NULL AND zipCode != ''
  GROUP BY zipCode
`).all().forEach(r => {
  if (r.lat >= 17 && r.lat <= 72 && r.lng >= -180 && r.lng <= -60)
    zipCentroids.set(r.zipCode.trim(), { lat: r.lat, lng: r.lng });
});

const cityCentroids = new Map();
db.prepare(`
  SELECT city, state, AVG(latitude) as lat, AVG(longitude) as lng
  FROM companies
  WHERE latitude IS NOT NULL AND latitude != 0
    AND longitude IS NOT NULL AND longitude != 0
    AND city IS NOT NULL AND city != ''
    AND state IS NOT NULL AND state != ''
  GROUP BY UPPER(city), UPPER(state)
  HAVING COUNT(*) >= 2
`).all().forEach(r => {
  if (r.lat >= 17 && r.lat <= 72 && r.lng >= -180 && r.lng <= -60)
    cityCentroids.set(r.city.trim().toUpperCase() + '|' + r.state.trim().toUpperCase(), { lat: r.lat, lng: r.lng });
});

console.log('ZIP centroids:', zipCentroids.size.toLocaleString());
console.log('City centroids:', cityCentroids.size.toLocaleString());

// PO Box addresses the fallback script missed
const rows = db.prepare(`
  SELECT id, zipCode, city, state FROM companies
  WHERE (latitude IS NULL OR latitude = 0 OR longitude IS NULL OR longitude = 0)
    AND address LIKE 'PO BOX%'
`).all();

console.log('PO Box companies missing coords:', rows.length.toLocaleString());

const updates = [];
for (const row of rows) {
  const zip = row.zipCode && row.zipCode.trim();
  const city = row.city && row.city.trim().toUpperCase();
  const state = row.state && row.state.trim().toUpperCase();
  const coords = (zip && zipCentroids.get(zip))
    || (city && state && cityCentroids.get(city + '|' + state))
    || null;
  if (coords) updates.push({ id: row.id, lat: coords.lat, lng: coords.lng });
}

console.log('Matchable:', updates.length.toLocaleString());

const stmt = db.prepare('UPDATE companies SET latitude=?, longitude=? WHERE id=?');
const apply = db.transaction(items => { for (const u of items) stmt.run(u.lat, u.lng, u.id); });
apply(updates);

const after = db.prepare('SELECT COUNT(*) as n FROM companies WHERE latitude IS NOT NULL AND latitude != 0').get().n;
console.log('Done. Total with coords now:', after.toLocaleString());
db.close();
