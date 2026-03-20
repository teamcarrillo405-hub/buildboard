/**
 * geocodeFallback.cjs
 *
 * Fills latitude/longitude for companies that are missing coordinates but
 * CAN'T be submitted to the Census batch geocoder (no street address).
 *
 * Strategy:
 *   1. ZIP centroid  — average lat/lng of all already-geocoded companies
 *                      sharing the same zip code.  Accurate to ~1 mile.
 *   2. City centroid — average lat/lng of already-geocoded companies in the
 *                      same city+state pair. Used when no zip is available.
 *
 * Both centroids are derived from the existing DB data — no external API.
 *
 * Run:  node server/scripts/geocodeFallback.cjs
 * Dry:  node server/scripts/geocodeFallback.cjs --dry
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DRY_RUN  = process.argv.includes('--dry');
const DB_PATH  = path.join(__dirname, '..', 'constructflix.db');
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_PATH = path.join(LOGS_DIR, 'geocode_fallback.log');

fs.mkdirSync(LOGS_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
function log(msg) {
  const line = `[${new Date().toISOString().slice(0,19)}] ${msg}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ── Open DB ──────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

// ── Step 1: Build ZIP centroid map ───────────────────────────────────────────
log('Building ZIP centroid map from geocoded companies...');

const zipCentroids = new Map(); // zipCode → {lat, lng}
const zipRows = db.prepare(`
  SELECT zipCode, AVG(latitude) as lat, AVG(longitude) as lng, COUNT(*) as n
  FROM companies
  WHERE latitude  IS NOT NULL AND latitude  != 0
    AND longitude IS NOT NULL AND longitude != 0
    AND zipCode   IS NOT NULL AND zipCode   != ''
  GROUP BY zipCode
  HAVING n >= 1
`).all();

for (const r of zipRows) {
  // Sanity-check: must be plausible US coordinates
  if (r.lat >= 17 && r.lat <= 72 && r.lng >= -180 && r.lng <= -60) {
    zipCentroids.set(r.zipCode.trim(), { lat: r.lat, lng: r.lng });
  }
}
log(`ZIP centroids: ${zipCentroids.size.toLocaleString()} zip codes`);

// ── Step 2: Build City+State centroid map ────────────────────────────────────
log('Building city+state centroid map...');

const cityCentroids = new Map(); // "CITY|ST" → {lat, lng}
const cityRows = db.prepare(`
  SELECT city, state, AVG(latitude) as lat, AVG(longitude) as lng, COUNT(*) as n
  FROM companies
  WHERE latitude  IS NOT NULL AND latitude  != 0
    AND longitude IS NOT NULL AND longitude != 0
    AND city  IS NOT NULL AND city  != ''
    AND state IS NOT NULL AND state != ''
  GROUP BY UPPER(city), UPPER(state)
  HAVING n >= 2
`).all();

for (const r of cityRows) {
  if (r.lat >= 17 && r.lat <= 72 && r.lng >= -180 && r.lng <= -60) {
    const key = `${r.city.trim().toUpperCase()}|${r.state.trim().toUpperCase()}`;
    cityCentroids.set(key, { lat: r.lat, lng: r.lng });
  }
}
log(`City centroids: ${cityCentroids.size.toLocaleString()} city+state pairs`);

// ── Step 3: Find un-geocoded companies ───────────────────────────────────────
log('Loading un-geocoded companies (no full street address)...');

const rows = db.prepare(`
  SELECT id, zipCode, city, state
  FROM companies
  WHERE (latitude IS NULL OR latitude = 0 OR longitude IS NULL OR longitude = 0)
    AND (address IS NULL OR address = '' OR address = city)
`).all();

log(`Un-geocoded (no street address): ${rows.length.toLocaleString()}`);

// ── Step 4: Match and collect updates ────────────────────────────────────────
const updates = [];
let byZip = 0, byCity = 0, noMatch = 0;

for (const row of rows) {
  const zip = row.zipCode?.trim();
  const city = row.city?.trim().toUpperCase();
  const state = row.state?.trim().toUpperCase();

  let coords = null;

  // Try ZIP first (more precise)
  if (zip && zipCentroids.has(zip)) {
    coords = zipCentroids.get(zip);
    byZip++;
  }
  // Fall back to city+state
  else if (city && state) {
    const key = `${city}|${state}`;
    if (cityCentroids.has(key)) {
      coords = cityCentroids.get(key);
      byCity++;
    } else {
      noMatch++;
    }
  } else {
    noMatch++;
  }

  if (coords) {
    updates.push({ id: row.id, lat: coords.lat, lng: coords.lng });
  }
}

log(`\nMatched by ZIP: ${byZip.toLocaleString()}`);
log(`Matched by city+state: ${byCity.toLocaleString()}`);
log(`No match: ${noMatch.toLocaleString()}`);
log(`Total to update: ${updates.length.toLocaleString()}`);

// ── Step 5: Apply ─────────────────────────────────────────────────────────────
if (!DRY_RUN && updates.length > 0) {
  log('\nApplying coordinates...');

  const stmt = db.prepare(`
    UPDATE companies
    SET latitude    = ?,
        longitude   = ?,
        lastUpdated = datetime('now')
    WHERE id = ?
  `);

  const CHUNK = 50_000;
  let done = 0;

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const applyChunk = db.transaction((items) => {
      for (const u of items) stmt.run(u.lat, u.lng, u.id);
    });
    applyChunk(chunk);
    done += chunk.length;
    log(`  ${done.toLocaleString()} / ${updates.length.toLocaleString()} updated...`);
  }

  // Final count
  const after = db.prepare(`
    SELECT COUNT(*) as n FROM companies WHERE latitude IS NOT NULL AND latitude != 0
  `).get().n;

  log(`\nDone! Companies with coordinates: ${after.toLocaleString()}`);
} else if (DRY_RUN) {
  log('\nDry run — no changes written. Remove --dry to apply.');
}

db.close();
logStream.end();
