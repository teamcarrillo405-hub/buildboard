import 'dotenv/config';
import fs from 'fs';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./server/constructflix.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

// Raw better-sqlite3 instance for FTS5 operations (Drizzle doesn't support virtual tables)
export const sqlite = new Database('./server/constructflix.db');

// ---------------------------------------------------------------------------
// Schema migration runner
// ---------------------------------------------------------------------------

/**
 * Run pending migrations against the local SQLite DB.
 * Currently handles migration 001 (real-data columns for Yelp/CSLB ingestion).
 * Idempotent: checks for column existence before altering.
 */
export function runMigrations(): void {
  try {
    const cols = sqlite.pragma('table_info(companies)') as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));

    if (!colNames.has('latitude')) {
      const migPath = new URL('./migrations/001_add_real_data_fields.sql', import.meta.url).pathname;
      // On Windows, pathname starts with /C:/... — strip leading slash
      const normalizedPath = migPath.replace(/^\/([A-Za-z]:)/, '$1');
      const sql = fs.readFileSync(normalizedPath, 'utf-8');
      sqlite.exec(sql);
      console.log('[Migration] 001: Added real-data columns (latitude, yelpId, imageUrl, licenseStatus, ...)');
    }
  } catch (err) {
    console.error('[Migration] Failed to run migrations:', err);
  }

  // Ensure UNIQUE index on yelpId — required for ON CONFLICT(yelpId) upsert in yelpSync
  try {
    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_yelp_id
      ON companies(yelpId)
      WHERE yelpId IS NOT NULL
    `);
  } catch (err) {
    console.error('[Migration] Failed to create yelpId unique index:', err);
  }

  // Ensure claim_requests table exists (with full verification flow columns)
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS claim_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId TEXT NOT NULL,
        claimerName TEXT NOT NULL,
        claimerEmail TEXT NOT NULL,
        claimerPhone TEXT,
        claimerTitle TEXT,
        ownershipType TEXT,
        yearAcquired TEXT,
        employeeCount TEXT,
        licenseNumber TEXT,
        message TEXT,
        documentsProvided TEXT,
        status TEXT DEFAULT 'pending_payment',
        paymentStatus TEXT DEFAULT 'unpaid',
        stripeSessionId TEXT,
        paymentIntentId TEXT,
        paidAt TEXT,
        createdAt TEXT NOT NULL
      )
    `);
  } catch (err) {
    console.error('[Migration] Failed to create claim_requests table:', err);
  }

  // Add new columns to existing claim_requests table if upgrading from old schema
  try {
    const claimCols = sqlite.pragma('table_info(claim_requests)') as { name: string }[];
    const claimColNames = new Set(claimCols.map(c => c.name));
    const newClaimCols = [
      ['claimerTitle', 'TEXT'],
      ['ownershipType', 'TEXT'],
      ['yearAcquired', 'TEXT'],
      ['employeeCount', 'TEXT'],
      ['documentsProvided', 'TEXT'],
      ['paymentStatus', "TEXT DEFAULT 'unpaid'"],
      ['stripeSessionId', 'TEXT'],
      ['paymentIntentId', 'TEXT'],
      ['paidAt', 'TEXT'],
    ];
    for (const [col, type] of newClaimCols) {
      if (!claimColNames.has(col)) {
        sqlite.exec(`ALTER TABLE claim_requests ADD COLUMN ${col} ${type}`);
      }
    }
  } catch (err) {
    console.error('[Migration] Failed to add new claim_requests columns:', err);
  }

  // Migration 002: Ad system
  try {
    const adTable = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sponsors'"
    ).get();
    if (!adTable) {
      const migPath = new URL('./migrations/002_ad_system.sql', import.meta.url).pathname;
      const normalizedPath = migPath.replace(/^\/([A-Za-z]:)/, '$1');
      const sql = fs.readFileSync(normalizedPath, 'utf-8');
      sqlite.exec(sql);
      console.log('[Migration] 002: Created ad system tables + seeded WCB sponsor, creative, and 2 slot assignments');
    }
  } catch (err) {
    console.error('[Migration] 002 failed:', err);
  }
}
