#!/usr/bin/env npx tsx
/**
 * Download an Apify dataset to a local JSON file.
 *
 * Usage:
 *   npx tsx server/scripts/downloadApifyDataset.ts <datasetId> [outputFile]
 *
 * If outputFile is omitted, saves to server/data/gmaps/<datasetId>.json
 */

import fs from 'fs';
import path from 'path';

const [datasetId, outputArg] = process.argv.slice(2);

if (!datasetId) {
  console.error('Usage: npx tsx server/scripts/downloadApifyDataset.ts <datasetId> [outputFile]');
  process.exit(1);
}

const outDir = 'server/data/gmaps';
fs.mkdirSync(outDir, { recursive: true });
const outputFile = outputArg || path.join(outDir, `${datasetId}.json`);

async function download() {
  // Apify public dataset API (no auth needed for datasets created by MCP runs)
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true`;
  console.log(`[download] Fetching dataset ${datasetId}...`);

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`[download] Failed: ${resp.status} ${resp.statusText}`);
    const body = await resp.text();
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  const data = await resp.json();
  const items = Array.isArray(data) ? data : [];
  fs.writeFileSync(outputFile, JSON.stringify(items, null, 2));
  console.log(`[download] Saved ${items.length} items to ${outputFile}`);
}

download().catch(err => {
  console.error('[download] Error:', err);
  process.exit(1);
});
