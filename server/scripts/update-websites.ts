#!/usr/bin/env npx tsx
/**
 * update-websites.ts -- Manually researched website updates for companies
 * missing website data across 6 trade categories.
 *
 * Usage:
 *   npx tsx server/scripts/update-websites.ts
 *   npx tsx server/scripts/update-websites.ts --dry-run
 */

import Database from 'better-sqlite3';

const DB_PATH = './server/constructflix.db';
const DRY_RUN = process.argv.includes('--dry-run');

// ── Researched websites (domain only, no protocol/www) ──────────────────────

const updates: Array<{ businessName: string; website: string }> = [
  // ── Electrical ──────────────────────────────────────────────────────────────
  { businessName: 'YC Electric',                                      website: 'ycelectric.com' },
  { businessName: '1 Source Electric',                                website: '1sourceelectric.net' },
  { businessName: 'Hewlett Electric',                                 website: 'hewlett-electric.com' },
  { businessName: 'Artisan Electrical & HVAC',                       website: 'artisanca.com' },
  { businessName: 'Connected Technology',                             website: 'connected-technology.com' },
  { businessName: 'Right Way Lighting -Recessed Light Installation', website: 'rightwaylighting.com' },
  { businessName: 'Custom Electric SD',                               website: 'customelectricsd.com' },
  { businessName: 'Grounded Electric',                                website: 'mygroundedelectric.com' },
  // Mikhail Electrical Services -- no dedicated website found
  { businessName: 'Sheets Contracting',                               website: 'sheetscontracting.com' },

  // ── Plumbing ────────────────────────────────────────────────────────────────
  // First Call Plumbing and Sewer Service -- no dedicated website confirmed for Sacramento location
  { businessName: 'DS Plumbing',                                      website: 'dsplumbingorangevale.com' },
  // Pipe Dreams Plumbing -- multiple locations, no single confirmed match
  { businessName: 'LM Plumbing And Drain Cleaning',                  website: 'lmplumbinganddraincleaning.com' },
  { businessName: 'Swish Sewer & Drains',                            website: 'swishsewerdrains.com' },
  { businessName: 'Top Rank Plumbing',                                website: 'toprankplumbing.com' },
  { businessName: 'The Plumbing Pros',                                website: 'theplumbingpros.biz' },
  { businessName: 'Bee Prestigious Plumbing',                        website: 'beeprestigious.com' },
  // SJ Rooter & Plumbing -- no dedicated website found (temporarily closed)
  { businessName: 'ProMax Tankless Water Heaters & Plumbing',        website: 'promaxtankless.com' },

  // ── Roofing ─────────────────────────────────────────────────────────────────
  { businessName: 'Powers Roof Service',                              website: 'powerstileroofrepair.com' },
  { businessName: 'Pacific Coast Roofing Service',                   website: 'pcroofingservice.com' },
  { businessName: 'All Service Roofing',                              website: 'allserviceroofing.net' },
  { businessName: 'Roofnet',                                          website: 'roof.net' },
  { businessName: 'Absolute Contracting Inc.',                       website: 'absolutecontractingca.com' },
  { businessName: 'ELM Roofing Contractors',                         website: 'elmroofingcontractors.com' },
  { businessName: 'Fabulous Roofing',                                 website: 'fabulousroofing.com' },
  { businessName: 'Roofs Roofs & Remodel',                           website: 'fourroofs.com' },
  { businessName: 'Leon Brothers Roofing',                            website: 'leonroofingcompany.com' },
  { businessName: 'Volt Modern Roofing and Solar',                   website: 'voltmodern.com' },

  // ── Masonry / Concrete ──────────────────────────────────────────────────────
  { businessName: 'A&R Concrete & Hardscape',                        website: 'arconcretehardscape.com' },
  { businessName: 'Solo Pavers Expert',                               website: 'solopaversexpert.com' },
  { businessName: 'Next Level Concrete Coatings',                    website: 'nextlevelconcretecoatings.biz' },
  // JM Superior Construction -- no dedicated website found
  { businessName: 'Prime Team Builders',                              website: 'primeteambuilders.com' },
  { businessName: 'Western Concrete Designs',                        website: 'westernconcretedesigns.com' },
  { businessName: 'Ramirez Concrete',                                 website: 'ramirezconcreteca.com' },
  { businessName: 'Concrete Coatings Hawaii',                        website: 'concretecoatingshawaii.com' },
  { businessName: 'Left Coast Pavers',                                website: 'leftcoastpavers.com' },
  { businessName: 'Monroe Masonry',                                   website: 'monroemasonry.com' },

  // ── HVAC ────────────────────────────────────────────────────────────────────
  { businessName: 'High Performance Heating & Air',                  website: 'highperformanceheatingandairconditioning.com' },
  { businessName: 'Bay Services',                                     website: 'thebayservices.com' },
  { businessName: 'Residential Express Heating & Air',               website: 'reshomeservices.com' },
  { businessName: 'Sierra Aire',                                      website: 'sierraaire.com' },
  { businessName: 'Dr Dio Heating & Air Conditioning',               website: 'drdioheatingair.com' },
  { businessName: 'Breathable',                                       website: 'breathable.com' },
  // Right Way Air and Heating -- no California-specific website confirmed
  { businessName: 'Dragon Air Services',                              website: 'dragonairservices.com' },
  { businessName: 'GVK Heating and Air',                              website: 'gvkhvac.com' },
  { businessName: 'NUR HVAC',                                         website: 'nurhvac.com' },

  // ── Painting ────────────────────────────────────────────────────────────────
  // Silva Painting -- multiple companies, no confirmed match for Sacramento listing
  // Handyman Daddy -- no dedicated website found
  { businessName: 'Elfralie Home Improvement & Interior Painting',   website: 'elfralie.com' },
  { businessName: 'Pro Performance Painting',                        website: 'properformancepainting.com' },
  { businessName: 'Straight Edge Painting',                           website: 'straightedgepainting.net' },
  // BZ Pro Wallcovering -- no dedicated website found
  { businessName: 'Transtech Painting',                               website: 'transtechpainting.com' },
  { businessName: 'AC Painting',                                      website: 'ac-painting.com' },
  { businessName: 'Vincent Powell Painting & Decorating',            website: 'vincentpowellpainting.com' },
  { businessName: 'R&D Painting',                                     website: 'rdpaintdecor.com' },
];

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const db = new Database(DB_PATH);

  const updateStmt = db.prepare(`
    UPDATE companies
    SET website = ?, lastUpdated = datetime('now')
    WHERE businessName = ? AND (website IS NULL OR website = '')
  `);

  const checkStmt = db.prepare(`
    SELECT id, businessName, website FROM companies WHERE businessName = ?
  `);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const { businessName, website } of updates) {
    const row = checkStmt.get(businessName) as any;

    if (!row) {
      console.log(`[NOT FOUND]  "${businessName}" -- not in database`);
      notFound++;
      continue;
    }

    if (row.website && row.website.trim() !== '') {
      console.log(`[SKIP]       "${businessName}" -- already has website: ${row.website}`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY-RUN]    "${businessName}" => ${website}`);
      updated++;
      continue;
    }

    const result = updateStmt.run(website, businessName);
    if (result.changes > 0) {
      console.log(`[UPDATED]    "${businessName}" => ${website}`);
      updated++;
    } else {
      console.log(`[NO CHANGE]  "${businessName}" -- update returned 0 changes`);
    }
  }

  db.close();

  console.log('\n--- Summary ---');
  console.log(`Updated:   ${updated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Total:     ${updates.length}`);
  if (DRY_RUN) console.log('(dry-run mode -- no changes written)');
}

main();
