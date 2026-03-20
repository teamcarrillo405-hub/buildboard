/**
 * Favorites routes — authenticated CRUD for saved companies
 *
 * GET    /api/favorites           — list user's favorite company IDs
 * POST   /api/favorites/:companyId — add a favorite
 * DELETE /api/favorites/:companyId — remove a favorite
 * POST   /api/favorites/sync      — merge localStorage favorites into DB
 */

import { Router } from 'express';
import { sqlite } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Ensure the user_favorites table exists (idempotent)
// ---------------------------------------------------------------------------

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    companyId TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    UNIQUE(userId, companyId)
  )
`);

// ---------------------------------------------------------------------------
// Prepared statements (reused across requests for performance)
// ---------------------------------------------------------------------------

const stmtSelectAll = sqlite.prepare(
  'SELECT companyId FROM user_favorites WHERE userId = ? ORDER BY createdAt DESC',
);

const stmtInsert = sqlite.prepare(
  'INSERT OR IGNORE INTO user_favorites (userId, companyId) VALUES (?, ?)',
);

const stmtDelete = sqlite.prepare(
  'DELETE FROM user_favorites WHERE userId = ? AND companyId = ?',
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/favorites
 * Returns an array of companyId strings for the authenticated user.
 */
router.get('/favorites', requireAuth, (req, res) => {
  const rows = stmtSelectAll.all(req.user!.userId) as Array<{ companyId: string }>;
  const ids = rows.map((r) => r.companyId);
  res.json({ favorites: ids });
});

/**
 * POST /api/favorites/:companyId
 * Add a company to the user's favorites. Silently ignores duplicates.
 */
router.post('/favorites/:companyId', requireAuth, (req, res) => {
  const { companyId } = req.params;
  stmtInsert.run(req.user!.userId, companyId);
  res.status(201).json({ success: true, companyId });
});

/**
 * DELETE /api/favorites/:companyId
 * Remove a company from the user's favorites.
 */
router.delete('/favorites/:companyId', requireAuth, (req, res) => {
  const { companyId } = req.params;
  stmtDelete.run(req.user!.userId, companyId);
  res.json({ success: true, companyId });
});

/**
 * POST /api/favorites/sync
 * Merge a list of localStorage favorite IDs into the server-side store.
 * Used during first login to migrate anonymous favorites.
 *
 * Body: { ids: string[] }
 */
router.post('/favorites/sync', requireAuth, (req, res) => {
  const { ids } = req.body as { ids?: string[] };

  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'Body must contain an "ids" array of company IDs' });
    return;
  }

  const insertMany = sqlite.transaction((companyIds: string[]) => {
    for (const companyId of companyIds) {
      stmtInsert.run(req.user!.userId, companyId);
    }
  });

  insertMany(ids);

  // Return the full merged set
  const rows = stmtSelectAll.all(req.user!.userId) as Array<{ companyId: string }>;
  const merged = rows.map((r) => r.companyId);
  res.json({ favorites: merged, synced: ids.length });
});

export default router;
