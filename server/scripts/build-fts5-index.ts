/**
 * Standalone script to build or rebuild the FTS5 full-text search index.
 *
 * Usage:
 *   npx tsx server/scripts/build-fts5-index.ts          # Build if missing
 *   npx tsx server/scripts/build-fts5-index.ts --force   # Force rebuild
 */

import { ensureFtsIndex } from '../services/fts5.js';
import { sqlite } from '../db.js';

const force = process.argv.includes('--force');

console.log('=== FTS5 Index Builder ===');
console.log(`Database: ./server/constructflix.db`);
console.log(`Mode: ${force ? 'FORCE REBUILD' : 'build if missing'}`);
console.log('');

const start = Date.now();

try {
  const wasBuilt = ensureFtsIndex({ force });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const count = (sqlite.prepare(`SELECT COUNT(*) as cnt FROM companies_fts`).get() as { cnt: number }).cnt;

  console.log('');
  console.log('=== Complete ===');
  console.log(`Rows indexed: ${count.toLocaleString()}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Action: ${wasBuilt ? 'Index was built' : 'Index already existed (no-op)'}`);
} catch (err) {
  console.error('Failed to build FTS5 index:', err);
  process.exit(1);
} finally {
  sqlite.close();
}
