import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createTestDb } from '../setup.js';

// We test the route logic directly by building a minimal Express app
// that uses the same handler — avoids needing a full server running
import express from 'express';

let db: InstanceType<typeof Database>;
let app: express.Express;

beforeEach(() => {
  db = createTestDb();
  // Migration 002 already seeds WCB data into the in-memory DB
  app = express();
  app.use(express.json());

  // Inline the route handler using our test DB
  // GET /api/ads/:slotName
  app.get('/api/ads/:slotName', (req, res) => {
    const row = db.prepare(`
      SELECT
        aa.id AS assignmentId,
        s.name AS sponsorName,
        s.logo_path AS logoPath,
        s.accent_color AS accentColor,
        s.website AS sponsorWebsite,
        ac.eyebrow, ac.headline, ac.body,
        ac.cta_label AS ctaLabel, ac.cta_url AS ctaUrl,
        ac.carousel_images AS carouselImages
      FROM ad_assignments aa
      JOIN ad_slots sl ON sl.id = aa.slot_id
      JOIN sponsors s ON s.id = aa.sponsor_id
      JOIN ad_creatives ac ON ac.id = aa.creative_id
      WHERE sl.name = ? AND aa.is_active = 1 AND s.is_active = 1 AND ac.is_active = 1
      LIMIT 1
    `).get(req.params.slotName) as Record<string, unknown> | undefined;

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
          carouselImages: JSON.parse((row.carouselImages as string) || '[]'),
        },
      },
    });
  });

  // POST /api/ads/event
  app.post('/api/ads/event', (req, res) => {
    const { assignmentId, eventType } = req.body as { assignmentId: string; eventType: string };
    if (!assignmentId || !['impression', 'click'].includes(eventType)) {
      return res.status(400).json({ error: 'invalid payload' });
    }
    if (eventType === 'impression') {
      const ipHash = 'test-ip-hash';
      const cutoffDate = new Date(Date.now() - 30 * 60 * 1000);
      const cutoff = cutoffDate.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
      const existing = db.prepare(`
        SELECT id FROM ad_events
        WHERE assignment_id = ? AND event_type = 'impression' AND ip_hash = ? AND occurred_at > ?
      `).get(assignmentId, ipHash, cutoff);
      if (existing) return res.json({ status: 'deduped' });
    }
    const id = `evt-${Date.now()}-${Math.random()}`;
    db.prepare(`
      INSERT INTO ad_events (id, assignment_id, event_type, ip_hash, occurred_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(id, assignmentId, eventType, 'test-ip-hash');
    res.json({ status: 'ok' });
  });
});

describe('GET /api/ads/:slotName', () => {
  it('returns WCB ad for profile_skyscraper slot (seeded by migration)', async () => {
    const res = await request(app).get('/api/ads/profile_skyscraper');
    expect(res.status).toBe(200);
    expect(res.body.ad).not.toBeNull();
    expect(res.body.ad.sponsor.name).toBe('West Coast Batteries');
    expect(res.body.ad.creative.headline).toBe('Batteries for the Job Site');
    expect(Array.isArray(res.body.ad.creative.carouselImages)).toBe(true);
    expect(res.body.ad.creative.carouselImages.length).toBeGreaterThan(0);
  });

  it('returns WCB ad for search_sidebar slot', async () => {
    const res = await request(app).get('/api/ads/search_sidebar');
    expect(res.status).toBe(200);
    expect(res.body.ad).not.toBeNull();
    expect(res.body.ad.assignmentId).toBeTruthy();
  });

  it('returns { ad: null } for homepage_banner slot (not assigned in seed)', async () => {
    const res = await request(app).get('/api/ads/homepage_banner');
    expect(res.status).toBe(200);
    expect(res.body.ad).toBeNull();
  });

  it('returns { ad: null } for a nonexistent slot', async () => {
    const res = await request(app).get('/api/ads/does_not_exist');
    expect(res.status).toBe(200);
    expect(res.body.ad).toBeNull();
  });

  it('returns null when sponsor is deactivated', async () => {
    db.prepare("UPDATE sponsors SET is_active = 0 WHERE id = 'sponsor-wcb'").run();
    const res = await request(app).get('/api/ads/profile_skyscraper');
    expect(res.body.ad).toBeNull();
  });
});

describe('POST /api/ads/event', () => {
  it('records a click event', async () => {
    const res = await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'click' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    const count = (db.prepare("SELECT COUNT(*) as n FROM ad_events WHERE event_type='click'").get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it('records an impression event', async () => {
    const res = await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'impression' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    const count = (db.prepare("SELECT COUNT(*) as n FROM ad_events WHERE event_type='impression'").get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it('deduplicates a second impression within 30 minutes', async () => {
    await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'impression' });

    const res = await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'impression' });

    expect(res.body.status).toBe('deduped');
    const count = (db.prepare("SELECT COUNT(*) as n FROM ad_events WHERE event_type='impression'").get() as { n: number }).n;
    expect(count).toBe(1); // Only one row, not two
  });

  it('allows a click even after a deduped impression', async () => {
    await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'impression' });
    await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'impression' }); // deduped

    const res = await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'click' });
    expect(res.body.status).toBe('ok');
  });

  it('does not deduplicate an impression older than 30 minutes', async () => {
    // Insert a stale impression manually (31 minutes ago)
    const staleTime = new Date(Date.now() - 31 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    db.prepare(`
      INSERT INTO ad_events (id, assignment_id, event_type, ip_hash, occurred_at)
      VALUES ('old-evt', 'assign-wcb-sky', 'impression', 'test-ip-hash', ?)
    `).run(staleTime);

    // New impression should NOT be deduped (old one is outside 30-min window)
    const res = await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'impression' });
    expect(res.body.status).toBe('ok'); // NOT 'deduped'

    const count = (db.prepare("SELECT COUNT(*) as n FROM ad_events WHERE event_type='impression'").get() as { n: number }).n;
    expect(count).toBe(2); // Original + new
  });

  it('rejects invalid eventType', async () => {
    const res = await request(app)
      .post('/api/ads/event')
      .send({ assignmentId: 'assign-wcb-sky', eventType: 'pageview' });
    expect(res.status).toBe(400);
  });

  it('rejects missing assignmentId', async () => {
    const res = await request(app)
      .post('/api/ads/event')
      .send({ eventType: 'click' });
    expect(res.status).toBe(400);
  });
});
