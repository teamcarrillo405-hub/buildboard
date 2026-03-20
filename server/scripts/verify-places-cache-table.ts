import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:./server/constructflix.db' });

async function main() {
  const result = await client.execute(
    "SELECT sql FROM sqlite_master WHERE name = 'google_places_cache'"
  );
  if (result.rows.length > 0) {
    console.log('Table exists:', result.rows[0]);
  } else {
    console.log('Table NOT found');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
