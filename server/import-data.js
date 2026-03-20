#!/usr/bin/env node
/**
 * Import constructflix_complete_database.json into SQLite
 * Streams the JSON to handle the 3GB file without loading it all at once
 */

import Database from 'better-sqlite3';
import { createReadStream } from 'fs';
import { resolve } from 'path';

const DB_PATH = resolve(import.meta.dirname, 'constructflix.db');
const JSON_PATH = resolve(import.meta.dirname, '../../output/constructflix_complete_database.json');

console.log('='.repeat(60));
console.log('IMPORTING DATA INTO SQLITE');
console.log('='.repeat(60));
console.log(`\nSource: ${JSON_PATH}`);
console.log(`Database: ${DB_PATH}\n`);

// Create database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');  // Faster imports

// Create table
db.exec(`
  DROP TABLE IF EXISTS companies;
  CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    businessName TEXT NOT NULL,
    category TEXT DEFAULT 'General Contractor',
    location TEXT,
    state TEXT,
    city TEXT,
    address TEXT,
    zipCode TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    licenseNumber TEXT,
    rating REAL DEFAULT 0,
    reviewCount INTEGER DEFAULT 0,
    hours TEXT,
    services TEXT,
    certifications TEXT,
    emergencyService INTEGER DEFAULT 0,
    freeEstimate INTEGER DEFAULT 0,
    warranty TEXT,
    dataSource TEXT,
    importedAt TEXT
  );
`);

// Read and parse JSON in chunks
// For a 3GB file, we need to stream-parse it
console.log('Reading JSON file (this may take a minute for 3GB)...');

const insert = db.prepare(`
  INSERT OR IGNORE INTO companies VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const insertMany = db.transaction((firms) => {
  for (const firm of firms) {
    insert.run(
      firm.id || `auto_${Math.random().toString(36).slice(2)}`,
      firm.businessName || '',
      firm.category || 'General Contractor',
      firm.location || '',
      firm.state || '',
      firm.city || '',
      firm.address || '',
      firm.zipCode || '',
      firm.phone || '',
      firm.email || '',
      firm.website || '',
      firm.licenseNumber || '',
      firm.rating || 0,
      firm.reviewCount || 0,
      typeof firm.hours === 'object' ? JSON.stringify(firm.hours) : (firm.hours || ''),
      Array.isArray(firm.services) ? JSON.stringify(firm.services) : (firm.services || '[]'),
      Array.isArray(firm.certifications) ? JSON.stringify(firm.certifications) : (firm.certifications || '[]'),
      firm.emergencyService ? 1 : 0,
      firm.freeEstimate ? 1 : 0,
      firm.warranty || '',
      firm.dataSource || '',
      firm.importedAt || new Date().toISOString()
    );
  }
});

// Stream-parse the JSON array
let buffer = '';
let firms = [];
let totalImported = 0;
let depth = 0;
let inString = false;
let escaped = false;
let objectStart = -1;

const stream = createReadStream(JSON_PATH, { encoding: 'utf-8', highWaterMark: 1024 * 1024 });

stream.on('data', (chunk) => {
  for (let i = 0; i < chunk.length; i++) {
    const char = chunk[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (depth === 0) {
        objectStart = buffer.length + i;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        // Extract the complete object
        const objStr = buffer.slice(objectStart) + chunk.slice(0, i + 1);
        try {
          const firm = JSON.parse(objStr);
          firms.push(firm);

          if (firms.length >= 10000) {
            insertMany(firms);
            totalImported += firms.length;
            process.stdout.write(`\r  Imported ${totalImported.toLocaleString()} firms...`);
            firms = [];
          }
        } catch (e) {
          // Skip malformed entries
        }
        buffer = '';
        objectStart = 0;
        continue;
      }
    }
  }

  if (depth > 0) {
    if (objectStart >= 0 && objectStart < buffer.length) {
      buffer = buffer.slice(objectStart) + chunk;
    } else {
      buffer += chunk;
    }
    objectStart = 0;
  } else {
    buffer = '';
    objectStart = -1;
  }
});

stream.on('end', () => {
  if (firms.length > 0) {
    insertMany(firms);
    totalImported += firms.length;
  }

  console.log(`\n\n  Total imported: ${totalImported.toLocaleString()} firms`);

  // Create indexes
  console.log('\nCreating indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_state ON companies(state);
    CREATE INDEX IF NOT EXISTS idx_category ON companies(category);
    CREATE INDEX IF NOT EXISTS idx_city ON companies(city);
    CREATE INDEX IF NOT EXISTS idx_rating ON companies(rating DESC);
    CREATE INDEX IF NOT EXISTS idx_name ON companies(businessName);
    CREATE INDEX IF NOT EXISTS idx_state_category ON companies(state, category);
  `);

  // Stats
  const count = db.prepare('SELECT COUNT(*) as cnt FROM companies').get();
  const states = db.prepare('SELECT COUNT(DISTINCT state) as cnt FROM companies').get();
  const categories = db.prepare('SELECT COUNT(DISTINCT category) as cnt FROM companies').get();

  console.log(`\n${'='.repeat(60)}`);
  console.log('IMPORT COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Firms:      ${count.cnt.toLocaleString()}`);
  console.log(`  States:     ${states.cnt}`);
  console.log(`  Categories: ${categories.cnt}`);

  db.close();
});

stream.on('error', (err) => {
  console.error('Error reading file:', err.message);
  db.close();
  process.exit(1);
});
