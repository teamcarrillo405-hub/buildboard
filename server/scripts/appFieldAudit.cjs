const db = require('better-sqlite3')('./server/constructflix.db');
const total = db.prepare('SELECT COUNT(*) as n FROM companies').get().n;

const fields = [
  ["email",       "SELECT COUNT(*) as n FROM companies WHERE email IS NOT NULL AND email != ''"],
  ["claimed",     "SELECT COUNT(*) as n FROM companies WHERE claimed = 1"],
  ["rating>0",    "SELECT COUNT(*) as n FROM companies WHERE rating > 0 AND reviewCount > 0"],
  ["coords",      "SELECT COUNT(*) as n FROM companies WHERE latitude IS NOT NULL AND longitude IS NOT NULL"],
  ["website",     "SELECT COUNT(*) as n FROM companies WHERE website IS NOT NULL AND website != ''"],
  ["phone",       "SELECT COUNT(*) as n FROM companies WHERE phone IS NOT NULL AND phone != ''"],
  ["imageUrl",    "SELECT COUNT(*) as n FROM companies WHERE imageUrl IS NOT NULL AND imageUrl != ''"],
  ["description", "SELECT COUNT(*) as n FROM companies WHERE description IS NOT NULL AND description != ''"],
];

console.log(`Total: ${total.toLocaleString()}\n`);
fields.forEach(([name, sql]) => {
  const n = db.prepare(sql).get().n;
  console.log(`${name.padEnd(12)}: ${String(n).padStart(9)}  (${(n/total*100).toFixed(1)}%)`);
});
db.close();
