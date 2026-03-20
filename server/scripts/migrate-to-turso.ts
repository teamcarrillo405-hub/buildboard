#!/usr/bin/env tsx
/**
 * One-time migration: copy local SQLite → Turso cloud DB
 * Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx server/scripts/migrate-to-turso.ts
 */
import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'server', 'constructflix.db');
const BATCH_SIZE = 500;

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) { console.error('Set TURSO_DATABASE_URL'); process.exit(1); }

  console.log('Connecting to local SQLite...');
  const localDb = new Database(DB_PATH, { readonly: true });

  console.log('Connecting to Turso...');
  const turso = createClient({ url, authToken });

  // Get all column names from local DB
  const cols = (localDb.pragma('table_info(companies)') as { name: string }[]).map(c => c.name);
  console.log(`Columns: ${cols.join(', ')}`);

  // Create table in Turso if not exists (copy schema)
  const createStmt = localDb.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='companies'`
  ).get() as { sql: string };
  await turso.execute(createStmt.sql);
  console.log('Table ready in Turso');

  // Count rows
  const { total } = localDb.prepare('SELECT count(*) as total FROM companies').get() as { total: number };
  console.log(`Migrating ${total.toLocaleString()} rows in batches of ${BATCH_SIZE}...`);

  const allRows = localDb.prepare('SELECT * FROM companies').all() as Record<string, unknown>[];

  let inserted = 0;
  const placeholders = cols.map(() => '?').join(', ');
  const insertSql = `INSERT OR IGNORE INTO companies (${cols.join(', ')}) VALUES (${placeholders})`;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const statements = batch.map(row => ({
      sql: insertSql,
      args: cols.map(c => (row[c] ?? null) as null | string | number | bigint | ArrayBuffer),
    }));
    await turso.batch(statements, 'write');
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === allRows.length) {
      console.log(`Progress: ${inserted.toLocaleString()}/${total.toLocaleString()} (${Math.round(inserted / total * 100)}%)`);
    }
  }

  // Verify
  const result = await turso.execute('SELECT count(*) as cnt FROM companies');
  console.log(`Done! Turso row count: ${result.rows[0].cnt}`);
  localDb.close();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
