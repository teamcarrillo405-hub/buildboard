import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { isAdmin } from '../middleware/auth.js';
import { sqlite } from '../db.js';

const router = Router();
router.use(isAdmin);

// ── Sponsors ──────────────────────────────────────────────────────────────────

router.get('/admin/sponsors', (_req: Request, res: Response) => {
  const rows = sqlite.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM ad_assignments aa
       WHERE aa.sponsor_id = s.id AND aa.is_active = 1) AS slotCount
    FROM sponsors s ORDER BY s.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/admin/sponsors', (req: Request, res: Response) => {
  const { name, website, accentColor, logoPath } = req.body as {
    name: string; website?: string; accentColor?: string; logoPath?: string;
  };
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = randomUUID();
  sqlite.prepare(
    `INSERT INTO sponsors (id, name, website, accent_color, logo_path, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`
  ).run(id, name, website ?? null, accentColor ?? null, logoPath ?? null);
  res.json({ id });
});

router.patch('/admin/sponsors/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, website, accentColor, logoPath, isActive } = req.body as {
    name?: string; website?: string; accentColor?: string;
    logoPath?: string; isActive?: boolean;
  };
  const existing = sqlite.prepare('SELECT id FROM sponsors WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  if (name !== undefined)        sqlite.prepare('UPDATE sponsors SET name         = ? WHERE id = ?').run(name, id);
  if (website !== undefined)     sqlite.prepare('UPDATE sponsors SET website      = ? WHERE id = ?').run(website, id);
  if (accentColor !== undefined) sqlite.prepare('UPDATE sponsors SET accent_color = ? WHERE id = ?').run(accentColor, id);
  if (logoPath !== undefined)    sqlite.prepare('UPDATE sponsors SET logo_path    = ? WHERE id = ?').run(logoPath, id);
  if (isActive !== undefined)    sqlite.prepare('UPDATE sponsors SET is_active    = ? WHERE id = ?').run(isActive ? 1 : 0, id);

  res.json({ ok: true });
});

// ── Ad Slots ──────────────────────────────────────────────────────────────────

router.get('/admin/ad-slots', (_req: Request, res: Response) => {
  const rows = sqlite.prepare(`
    SELECT sl.*, aa.id AS assignmentId, s.name AS sponsorName, s.id AS sponsorId,
           c.headline, c.id AS creativeId
    FROM ad_slots sl
    LEFT JOIN ad_assignments aa ON aa.slot_id = sl.id AND aa.is_active = 1
    LEFT JOIN sponsors s ON s.id = aa.sponsor_id
    LEFT JOIN ad_creatives c ON c.id = aa.creative_id
    ORDER BY sl.name
  `).all();
  res.json(rows);
});

router.post('/admin/ad-slots/:slotId/assign', (req: Request, res: Response) => {
  const { slotId } = req.params;
  const { sponsorId, creativeId } = req.body as { sponsorId: string; creativeId: string };
  if (!sponsorId || !creativeId) return res.status(400).json({ error: 'sponsorId and creativeId required' });

  const slot = sqlite.prepare('SELECT id FROM ad_slots WHERE id = ?').get(slotId);
  if (!slot) return res.status(404).json({ error: 'slot not found' });

  // Deactivate existing assignment for this slot
  sqlite.prepare('UPDATE ad_assignments SET is_active = 0 WHERE slot_id = ?').run(slotId);

  const id = randomUUID();
  sqlite.prepare(
    `INSERT INTO ad_assignments (id, slot_id, creative_id, sponsor_id, is_active, assigned_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))`
  ).run(id, slotId, creativeId, sponsorId);

  res.json({ id });
});

// ── Ad Creatives ──────────────────────────────────────────────────────────────

router.get('/admin/ad-creatives', (req: Request, res: Response) => {
  const { sponsorId } = req.query as { sponsorId?: string };
  const rows = sponsorId
    ? sqlite.prepare('SELECT * FROM ad_creatives WHERE sponsor_id = ? ORDER BY created_at DESC').all(sponsorId)
    : sqlite.prepare('SELECT * FROM ad_creatives ORDER BY created_at DESC').all();
  res.json(rows);
});

router.post('/admin/ad-creatives', (req: Request, res: Response) => {
  const { sponsorId, eyebrow, headline, body, ctaLabel, ctaUrl, carouselImages } = req.body as {
    sponsorId: string; eyebrow?: string; headline: string; body?: string;
    ctaLabel: string; ctaUrl: string; carouselImages?: unknown[];
  };
  if (!sponsorId || !headline || !ctaLabel || !ctaUrl)
    return res.status(400).json({ error: 'sponsorId, headline, ctaLabel, ctaUrl required' });

  const id = randomUUID();
  sqlite.prepare(
    `INSERT INTO ad_creatives (id, sponsor_id, eyebrow, headline, body, cta_label, cta_url, carousel_images, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
  ).run(id, sponsorId, eyebrow ?? null, headline, body ?? null, ctaLabel, ctaUrl,
        carouselImages ? JSON.stringify(carouselImages) : null);
  res.json({ id });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/admin/analytics', (req: Request, res: Response) => {
  const { range = '7d' } = req.query as { range?: '7d' | '30d' | 'all' };

  const DATE_FILTERS: Record<string, string> = {
    all:  '',
    '30d': "AND ae.occurred_at > datetime('now', '-30 days')",
    '7d':  "AND ae.occurred_at > datetime('now', '-7 days')",
  };
  const safeRange = ['all', '30d', '7d'].includes(range ?? '') ? (range ?? '7d') : '7d';
  const dateFilter = DATE_FILTERS[safeRange];

  const rows = sqlite.prepare(`
    SELECT
      sl.name        AS slotName,
      sl.label       AS slotLabel,
      s.name         AS sponsorName,
      SUM(CASE WHEN ae.event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
      SUM(CASE WHEN ae.event_type = 'click'      THEN 1 ELSE 0 END) AS clicks,
      MAX(CASE WHEN ae.event_type = 'click' THEN ae.occurred_at ELSE NULL END) AS lastClick
    FROM ad_slots sl
    LEFT JOIN ad_assignments aa ON aa.slot_id = sl.id
    LEFT JOIN sponsors s  ON s.id = aa.sponsor_id
    LEFT JOIN ad_events ae ON ae.assignment_id = aa.id ${dateFilter}
    GROUP BY sl.id, sl.name, sl.label, s.name
    ORDER BY sl.name
  `).all() as Array<{ impressions: number; clicks: number; [k: string]: unknown }>;

  const enriched = rows.map(r => ({
    ...r,
    ctr: r.impressions > 0
      ? ((r.clicks / r.impressions) * 100).toFixed(2) + '%'
      : '—',
  }));

  res.json(enriched);
});

export default router;
