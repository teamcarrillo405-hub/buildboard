import { sqlite } from '../db.js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaRecord {
  id: string;
  companyId: string;
  type: 'photo' | 'video';
  r2Key: string;
  url: string;
  filename: string;
  fileSize: number;
  sortOrder: number;
  uploadedBy: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Table migration
// ---------------------------------------------------------------------------

/**
 * Ensure the company_media table exists.
 * Safe to call multiple times — checks for existence before creating.
 */
export function ensureMediaTable(): void {
  const exists = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='company_media'`
  ).get();

  if (!exists) {
    console.log('[Media] Creating company_media table...');
    sqlite.exec(`
      CREATE TABLE company_media (
        id TEXT PRIMARY KEY,
        companyId TEXT NOT NULL,
        type TEXT NOT NULL,
        r2Key TEXT NOT NULL,
        url TEXT NOT NULL,
        filename TEXT,
        fileSize INTEGER,
        sortOrder INTEGER DEFAULT 0,
        uploadedBy INTEGER,
        createdAt TEXT DEFAULT (datetime('now'))
      )
    `);
    sqlite.exec(`CREATE INDEX idx_media_company ON company_media(companyId)`);
    console.log('[Media] Table created successfully');
  } else {
    console.log('[Media] company_media table already exists');
  }
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Insert a new media record after a successful R2 upload.
 */
export function addMedia(
  companyId: string,
  type: 'photo' | 'video',
  r2Key: string,
  url: string,
  filename: string,
  fileSize: number,
  uploadedBy: number | null,
): MediaRecord {
  const id = randomUUID();
  const sortOrder = countMedia(companyId, type);

  sqlite.prepare(`
    INSERT INTO company_media (id, companyId, type, r2Key, url, filename, fileSize, sortOrder, uploadedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, companyId, type, r2Key, url, filename, fileSize, sortOrder, uploadedBy);

  return sqlite.prepare(`SELECT * FROM company_media WHERE id = ?`).get(id) as MediaRecord;
}

/**
 * Return all media for a company, ordered by type then sort position.
 */
export function getMedia(companyId: string): MediaRecord[] {
  return sqlite.prepare(
    `SELECT * FROM company_media WHERE companyId = ? ORDER BY type, sortOrder`
  ).all(companyId) as MediaRecord[];
}

/**
 * Delete a single media record.
 * Returns true if a row was removed, false if not found or wrong company.
 */
export function deleteMedia(mediaId: string, companyId: string): boolean {
  const result = sqlite.prepare(
    `DELETE FROM company_media WHERE id = ? AND companyId = ?`
  ).run(mediaId, companyId);
  return result.changes > 0;
}

/**
 * Count how many media items of a given type exist for a company.
 * Used both for limit enforcement and for computing the next sort order.
 */
export function countMedia(companyId: string, type: 'photo' | 'video'): number {
  const row = sqlite.prepare(
    `SELECT COUNT(*) as cnt FROM company_media WHERE companyId = ? AND type = ?`
  ).get(companyId, type) as { cnt: number };
  return row.cnt;
}
