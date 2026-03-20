import app from '../index.js';
import http from 'http';

const server = http.createServer(app);

server.listen(3099, async () => {
  console.log('Test server on port 3099');

  try {
    // Test 1: enrichment
    const r1 = await fetch('http://localhost:3099/api/companies/state_AK_76775/enrichment');
    console.log('Enrichment status:', r1.status);
    if (r1.headers.get('content-type')?.includes('json')) {
      const d1 = await r1.json();
      console.log('Enrichment response:', JSON.stringify(d1));
    } else {
      const t1 = await r1.text();
      console.log('Enrichment response (text):', t1.substring(0, 200));
    }

    // Test 2: photo proxy without name
    const r2 = await fetch('http://localhost:3099/api/places/photo');
    console.log('Photo (no name) status:', r2.status);
    if (r2.headers.get('content-type')?.includes('json')) {
      const d2 = await r2.json();
      console.log('Photo response:', JSON.stringify(d2));
    } else {
      const t2 = await r2.text();
      console.log('Photo response (text):', t2.substring(0, 200));
    }

    // Test 3: photo proxy with name
    const r3 = await fetch('http://localhost:3099/api/places/photo?name=places/test/photos/test');
    console.log('Photo (with name) status:', r3.status);
    if (r3.headers.get('content-type')?.includes('json')) {
      const d3 = await r3.json();
      console.log('Photo response:', JSON.stringify(d3));
    } else {
      const t3 = await r3.text();
      console.log('Photo response (text):', t3.substring(0, 200));
    }

  } catch (err) {
    console.error('Test error:', err);
  }

  server.close();
  process.exit(0);
});
