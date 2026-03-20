const Database = require('better-sqlite3');
const db = new Database('./server/constructflix.db');

const categories = [
  'General Contractor',
  'Electrical',
  'Plumbing',
  'Roofing',
  'Masonry Contractors',
  'HVAC',
  'Painting'
];

for (const cat of categories) {
  console.log('='.repeat(80));
  console.log('CATEGORY: ' + cat);
  console.log('='.repeat(80));

  console.log('\n--- TOP 5 (homepage) ---');
  const top5 = db.prepare(
    'SELECT businessName, website, rating, reviewCount FROM companies WHERE category = ? ORDER BY rating DESC, reviewCount DESC LIMIT 5'
  ).all(cat);
  for (const r of top5) {
    const hasWeb = (r.website && r.website.trim() !== '') ? 'YES' : 'MISSING';
    console.log('  ' + r.rating + ' | ' + r.reviewCount + ' reviews | ' + hasWeb + ' | ' + r.businessName + (hasWeb === 'YES' ? ' | ' + r.website : ''));
  }

  console.log('\n--- TOP 10 WITH WEBSITES (replacement pool) ---');
  const withWeb = db.prepare(
    "SELECT businessName, website, rating, reviewCount FROM companies WHERE category = ? AND website IS NOT NULL AND website != '' ORDER BY rating DESC, reviewCount DESC LIMIT 10"
  ).all(cat);
  for (const r of withWeb) {
    console.log('  ' + r.rating + ' | ' + r.reviewCount + ' reviews | ' + r.businessName + ' | ' + r.website);
  }
  console.log('');
}

db.close();
