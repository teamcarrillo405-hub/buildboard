import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:./server/constructflix.db' });

async function main() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS google_places_cache (
      companyId TEXT PRIMARY KEY REFERENCES companies(id),
      placeId TEXT NOT NULL,
      matchConfidence REAL,
      createdAt INTEGER NOT NULL,
      lastAccessedAt INTEGER NOT NULL
    )
  `);
  console.log('google_places_cache table created successfully');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create table:', err);
  process.exit(1);
});
