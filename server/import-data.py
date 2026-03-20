#!/usr/bin/env python3
"""Import constructflix JSON into SQLite"""
import json
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'constructflix.db')
JSON_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'output', 'constructflix_complete_database.json')

print("=" * 60)
print("IMPORTING DATA INTO SQLITE")
print("=" * 60)
print(f"\nSource: {JSON_PATH}")
print(f"Database: {DB_PATH}\n")

# Remove old DB
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("PRAGMA journal_mode=WAL")
cur.execute("PRAGMA synchronous=OFF")

cur.execute("""
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
    )
""")

print("Loading JSON (3GB, may take a moment)...")
with open(JSON_PATH, 'r', encoding='utf-8') as f:
    firms = json.load(f)

print(f"Loaded {len(firms):,} firms. Inserting into SQLite...\n")

batch = []
total = 0
for firm in firms:
    services = firm.get('services', [])
    certs = firm.get('certifications', [])
    hours = firm.get('hours', '')

    batch.append((
        firm.get('id', f'auto_{total}'),
        firm.get('businessName', ''),
        firm.get('category', 'General Contractor'),
        firm.get('location', ''),
        firm.get('state', ''),
        firm.get('city', ''),
        firm.get('address', ''),
        firm.get('zipCode', ''),
        firm.get('phone', ''),
        firm.get('email', ''),
        firm.get('website', ''),
        firm.get('licenseNumber', ''),
        firm.get('rating', 0) or 0,
        firm.get('reviewCount', 0) or 0,
        json.dumps(hours) if isinstance(hours, dict) else (hours or ''),
        json.dumps(services) if isinstance(services, list) else (services or '[]'),
        json.dumps(certs) if isinstance(certs, list) else (certs or '[]'),
        1 if firm.get('emergencyService') else 0,
        1 if firm.get('freeEstimate') else 0,
        firm.get('warranty', ''),
        firm.get('dataSource', ''),
        firm.get('importedAt', ''),
    ))

    if len(batch) >= 50000:
        cur.executemany("INSERT OR IGNORE INTO companies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
        conn.commit()
        total += len(batch)
        print(f"  {total:,} / {len(firms):,} imported...")
        batch = []

if batch:
    cur.executemany("INSERT OR IGNORE INTO companies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", batch)
    conn.commit()
    total += len(batch)

print(f"\n  Total inserted: {total:,}")

print("\nCreating indexes...")
cur.execute("CREATE INDEX idx_state ON companies(state)")
cur.execute("CREATE INDEX idx_category ON companies(category)")
cur.execute("CREATE INDEX idx_city ON companies(city)")
cur.execute("CREATE INDEX idx_rating ON companies(rating DESC)")
cur.execute("CREATE INDEX idx_name ON companies(businessName)")
cur.execute("CREATE INDEX idx_state_category ON companies(state, category)")
conn.commit()

count = cur.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
states = cur.execute("SELECT COUNT(DISTINCT state) FROM companies").fetchone()[0]
cats = cur.execute("SELECT COUNT(DISTINCT category) FROM companies").fetchone()[0]

print(f"\n{'=' * 60}")
print("IMPORT COMPLETE")
print(f"{'=' * 60}")
print(f"  Firms:      {count:,}")
print(f"  States:     {states}")
print(f"  Categories: {cats}")
print(f"  DB Size:    {os.path.getsize(DB_PATH) / (1024*1024):.0f} MB")

conn.close()
