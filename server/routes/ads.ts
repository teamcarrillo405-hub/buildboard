import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { sqlite } from '../db.js';

const router = Router();

// GET /api/ads/:slotName
// Returns the active sponsor + creative for a slot, or { ad: null } if unassigned.
router.get('/:slotName', (_req: Request, res: Response) => {
  const { slotName } = _req.params;
  try {
    const row = sqlite.prepare(`
      SELECT
        aa.id        AS assignmentId,
        s.name       AS sponsorName,
        s.logo_path  AS logoPath,
        s.accent_color AS accentColor,
        s.website    AS sponsorWebsite,
        c.eyebrow, c.headline, c.body,
        c.cta_label  AS ctaLabel,
        c.cta_url    AS ctaUrl,
        c.carousel_images AS carouselImages
      FROM ad_assignments aa
      JOIN ad_slots      sl ON sl.id = aa.slot_id
      JOIN sponsors      s  ON s.id  = aa.sponsor_id
      JOIN ad_creatives  c  ON c.id  = aa.creative_id
      WHERE sl.name      = ?
        AND aa.is_active = 1
        AND s.is_active  = 1
        AND c.is_active  = 1
      LIMIT 1
    `).get(slotName) as Record<string, string> | undefined;

    if (!row) return res.json({ ad: null });

    res.json({
      ad: {
        assignmentId: row.assignmentId,
        sponsor: {
          name: row.sponsorName,
          logoPath: row.logoPath,
          accentColor: row.accentColor,
          website: row.sponsorWebsite,
        },
        creative: {
          eyebrow: row.eyebrow,
          headline: row.headline,
          body: row.body,
          ctaLabel: row.ctaLabel,
          ctaUrl: row.ctaUrl,
          carouselImages: JSON.parse(row.carouselImages || '[]'),
        },
      },
    });
  } catch {
    res.json({ ad: null });
  }
});

// POST /api/ads/event
// Body: { assignmentId: string, eventType: "impression" | "click" }
// Deduplicates impressions: one per assignmentId + IP hash per 30 minutes.
router.post('/event', (req: Request, res: Response) => {
  const { assignmentId, eventType } = req.body as {
    assignmentId: string;
    eventType: 'impression' | 'click';
  };

  if (!assignmentId || !['impression', 'click'].includes(eventType)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const rawIp = req.ip || req.socket.remoteAddress || 'unknown';
  const ipHash = createHash('sha256')
    .update(rawIp + (process.env.IP_HASH_SALT || ''))
    .digest('hex')
    .slice(0, 16);

  try {
    // Dedup: skip impression if same assignment+IP within last 30 min
    if (eventType === 'impression') {
      const recent = sqlite.prepare(`
        SELECT id FROM ad_events
        WHERE assignment_id = ? AND event_type = 'impression' AND ip_hash = ?
          AND occurred_at > datetime('now', '-30 minutes')
        LIMIT 1
      `).get(assignmentId, ipHash);
      if (recent) return res.json({ status: 'deduped' });
    }

    const id = randomUUID();
    sqlite.prepare(`
      INSERT INTO ad_events (id, assignment_id, event_type, ip_hash, occurred_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(id, assignmentId, eventType, ipHash);

    res.json({ status: 'ok' });
  } catch {
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
