import { createClient } from '@libsql/client';

async function main() {
  // Get a valid company ID
  const client = createClient({ url: 'file:./server/constructflix.db' });
  const result = await client.execute('SELECT id FROM companies LIMIT 1');
  const companyId = result.rows[0].id as string;
  console.log('Test company ID:', companyId);

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 1: Enrichment endpoint (should return enriched: false without API key)
  console.log('\n--- Test 1: Enrichment endpoint ---');
  try {
    const resp1 = await fetch(`http://localhost:3001/api/companies/${companyId}/enrichment`);
    console.log('Status:', resp1.status);
    const data1 = await resp1.json();
    console.log('Response:', JSON.stringify(data1));
    console.log('PASS:', data1.enriched === false && data1.placeId === null ? 'YES' : 'NO');
  } catch (err) {
    console.log('FAIL:', err);
  }

  // Test 2: Photo proxy without name (should return 400)
  console.log('\n--- Test 2: Photo proxy without name ---');
  try {
    const resp2 = await fetch('http://localhost:3001/api/places/photo');
    console.log('Status:', resp2.status);
    const data2 = await resp2.json();
    console.log('Response:', JSON.stringify(data2));
    console.log('PASS:', resp2.status === 400 ? 'YES' : 'NO');
  } catch (err) {
    console.log('FAIL:', err);
  }

  // Test 3: Photo proxy with name but no API key (should return 503)
  console.log('\n--- Test 3: Photo proxy with name, no API key ---');
  try {
    const resp3 = await fetch('http://localhost:3001/api/places/photo?name=places/test/photos/test');
    console.log('Status:', resp3.status);
    const data3 = await resp3.json();
    console.log('Response:', JSON.stringify(data3));
    console.log('PASS:', resp3.status === 503 ? 'YES' : 'NO');
  } catch (err) {
    console.log('FAIL:', err);
  }

  // Test 4: Enrichment with invalid company ID (should return 404)
  console.log('\n--- Test 4: Enrichment with invalid ID ---');
  try {
    const resp4 = await fetch('http://localhost:3001/api/companies/nonexistent-id/enrichment');
    console.log('Status:', resp4.status);
    console.log('PASS:', resp4.status === 404 ? 'YES' : 'NO');
  } catch (err) {
    console.log('FAIL:', err);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
