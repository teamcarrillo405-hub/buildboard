import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a fresh in-memory SQLite DB for every test run
export function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Read migration files
  let migration001: string;
  let migration002: string;
  try {
    migration001 = fs.readFileSync(
      path.join(__dirname, '../server/migrations/001_add_real_data_fields.sql'), 'utf-8'
    );
    migration002 = fs.readFileSync(
      path.join(__dirname, '../server/migrations/002_ad_system.sql'), 'utf-8'
    );
  } catch (err) {
    throw new Error(
      `[Test setup] Could not read migration files. Run tests from the project root (C:/Users/glcar/constructflix).\n` +
      `Expected: server/migrations/001_add_real_data_fields.sql and 002_ad_system.sql\n` +
      `Original error: ${err}`
    );
  }

  // Create companies table first (migration 001 alters it via ALTER TABLE)
  // IMPORTANT: Do NOT include dataSource or any column added by migration 001 here
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      businessName TEXT NOT NULL,
      category TEXT,
      state TEXT,
      city TEXT,
      address TEXT,
      zipCode TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      rating REAL DEFAULT 0,
      reviewCount INTEGER DEFAULT 0,
      verificationStatus TEXT DEFAULT 'unverified',
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // Run migrations
  // Safe: each createTestDb() call creates a fresh :memory: DB, so ALTER TABLE
  // statements in migration001 always find a clean slate (no duplicate column errors).
  db.exec(migration001);
  db.exec(migration002);

  return db;
}

// Seed a minimal company fixture for tests that need one
export function seedTestCompany(
  db: InstanceType<typeof Database>,
  overrides: Record<string, unknown> = {}
) {
  const company = {
    id: 'test-company-1',
    businessName: 'Acme Plumbing',
    category: 'Plumbing',
    state: 'CA',
    city: 'Los Angeles',
    rating: 4.5,
    reviewCount: 10,
    verificationStatus: 'verified',
    dataSource: 'manual',
    ...overrides,
  };
  db.prepare(`
    INSERT OR REPLACE INTO companies (id, businessName, category, state, city, rating, reviewCount, verificationStatus, dataSource)
    VALUES (@id, @businessName, @category, @state, @city, @rating, @reviewCount, @verificationStatus, @dataSource)
  `).run(company);
  return company;
}
