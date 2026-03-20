/**
 * cleanBadWebsites.cjs
 * Removes obviously wrong website URLs from the companies table.
 *
 * Two-pass approach:
 *   1. Blocklist: domains that are never a contractor's own website
 *   2. Token match: meaningful words from company name must appear in the domain
 *
 * Run:  node server/scripts/cleanBadWebsites.cjs
 * Dry:  node server/scripts/cleanBadWebsites.cjs --dry
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry');
const DB_PATH = path.join(__dirname, '..', 'constructflix.db');

// ── Blocklist ─────────────────────────────────────────────────────────────────
// Domains that are NEVER a contractor's own website
const BLOCKED_DOMAINS = new Set([
  // Email / cloud storage
  'gmail.com','yahoo.com','aol.com','hotmail.com','outlook.com',
  'icloud.com','me.com','mail.com','protonmail.com','ymail.com',
  'live.com','msn.com','gmx.com','zoho.com',

  // Tech giants / generic platforms
  'google.com','bing.com','apple.com','microsoft.com','amazon.com',
  'ebay.com','walmart.com','target.com','craigslist.org','etsy.com',

  // Social / review sites
  'facebook.com','instagram.com','twitter.com','x.com','linkedin.com',
  'tiktok.com','youtube.com','snapchat.com','pinterest.com',
  'yelp.com','bbb.org','yellowpages.com','angieslist.com','angi.com',
  'homeadvisor.com','thumbtack.com','nextdoor.com','houzz.com',
  'porch.com','cozywise.com','fixr.com','buildzoom.com',
  'bark.com','tasker.com','taskrabbit.com',
  'mapquest.com','maps.google.com','map.google.com',

  // News / reference
  'wikipedia.org','wikimedia.org','ap.org','npr.org','cnn.com',
  'foxnews.com','nytimes.com','washingtonpost.com','usatoday.com',

  // Large utilities / brands that show up as false positives
  'socalgas.com','sdge.com','pge.com','sce.com','eversource.com',
  'nationalgrid.com','dominion.com','duke-energy.com','coned.com',
  'att.com','verizon.com','comcast.com','tmobile.com','spectrum.com',
  'xfinity.com',

  // Home improvement big-box
  'homedepot.com','lowes.com','menards.com','acehardware.com',

  // Obvious junk / placeholder domains
  'jjj.com','aaa.com','zzz.com','example.com','test.com','placeholder.com',

  // Foreign mega-retailers that appear as false positives
  'americanas.com.br','amazon.co.uk','amazon.de',
]);

// ── Stop words ────────────────────────────────────────────────────────────────
// Strip these before extracting match tokens (too generic to be in a domain)
const STOP_WORDS = new Set([
  'llc','inc','co','corp','ltd','dba','and','the','of','for','in','at','by',
]);

// ── Foreign TLD patterns (not US-based contractors) ───────────────────────────
const FOREIGN_TLDS = ['.br','.ru','.cn','.kr','.jp','.de','.fr','.mx','.ar','.au','.in','.pk'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function tokenize(name) {
  return name
    .toLowerCase()
    .split(/[\s\-&,./()_]+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length >= 4 && !STOP_WORDS.has(t));
}

function isBadWebsite(businessName, website) {
  if (!website || !website.trim()) return false;

  const domain = extractDomain(website);
  if (!domain) return true; // unparseable URL

  // 1. Blocklist check
  if (BLOCKED_DOMAINS.has(domain)) return true;

  // 2. Foreign TLD check
  if (FOREIGN_TLDS.some(tld => domain.endsWith(tld))) return true;

  // 3. Token overlap check
  const tokens = tokenize(businessName);
  if (tokens.length === 0) return false; // all short/generic words — can't judge, keep it

  // Strip dots from domain to match compound tokens: "rightawayrooterplumbing.com" → "rightawayrooterplumbingcom"
  const domainFlat = domain.replace(/\./g, '');

  const hasMatch = tokens.some(token => domainFlat.includes(token));
  return !hasMatch;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);

console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE — will update DB'}`);
console.log('Loading companies with websites...');

const rows = db.prepare(
  "SELECT id, businessName, website FROM companies WHERE website IS NOT NULL AND website != ''"
).all();

console.log(`Checking ${rows.length.toLocaleString()} records...`);

const toNull = [];
const reasons = { blocklist: 0, foreignTld: 0, tokenMismatch: 0 };

for (const row of rows) {
  const domain = extractDomain(row.website);
  if (!domain) { toNull.push(row.id); reasons.blocklist++; continue; }

  if (BLOCKED_DOMAINS.has(domain)) { toNull.push(row.id); reasons.blocklist++; continue; }
  if (FOREIGN_TLDS.some(tld => domain.endsWith(tld))) { toNull.push(row.id); reasons.foreignTld++; continue; }

  const tokens = tokenize(row.businessName);
  if (tokens.length > 0) {
    const domainFlat = domain.replace(/\./g, '');
    if (!tokens.some(t => domainFlat.includes(t))) {
      toNull.push(row.id);
      reasons.tokenMismatch++;
    }
  }
}

console.log(`\nFound ${toNull.length.toLocaleString()} bad websites to remove:`);
console.log(`  Blocklist/unparseable: ${reasons.blocklist.toLocaleString()}`);
console.log(`  Foreign TLD: ${reasons.foreignTld.toLocaleString()}`);
console.log(`  Token mismatch: ${reasons.tokenMismatch.toLocaleString()}`);

// Show sample of token-mismatched ones for review
const sampleMismatch = rows.filter(r => {
  const domain = extractDomain(r.website);
  if (!domain || BLOCKED_DOMAINS.has(domain)) return false;
  if (FOREIGN_TLDS.some(tld => domain.endsWith(tld))) return false;
  const tokens = tokenize(r.businessName);
  if (tokens.length === 0) return false;
  return !tokens.some(t => domain.replace(/\./g,'').includes(t));
}).slice(0, 15);

if (sampleMismatch.length) {
  console.log('\nSample token mismatches:');
  sampleMismatch.forEach(r =>
    console.log(`  ${r.businessName.padEnd(40)} → ${r.website}`)
  );
}

if (!DRY_RUN && toNull.length > 0) {
  console.log('\nApplying updates...');
  const update = db.prepare("UPDATE companies SET website = NULL WHERE id = ?");
  const applyAll = db.transaction((ids) => {
    for (const id of ids) update.run(id);
  });
  applyAll(toNull);
  console.log(`Done. Nulled ${toNull.length.toLocaleString()} bad website entries.`);

  // Verify
  const remaining = db.prepare("SELECT COUNT(*) as n FROM companies WHERE website IS NOT NULL AND website != ''").get().n;
  console.log(`Websites remaining in DB: ${remaining.toLocaleString()}`);
} else if (DRY_RUN) {
  console.log('\nDry run complete — no changes made. Remove --dry to apply.');
}

db.close();
