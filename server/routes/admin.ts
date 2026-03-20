/**
 * Admin routes — verification management + data sync for BuildBoard.
 *
 * All endpoints require the isAdmin middleware (authenticated + email in ADMIN_EMAILS).
 *
 * Endpoints:
 *   GET  /api/admin/companies                 — search companies with verification status filter
 *   PUT  /api/admin/companies/:id/verification — set verification status
 *   GET  /api/admin/stats                      — verification + data source counts
 *   POST /api/admin/sync-yelp                  — trigger Yelp Fusion API ingestion (background)
 *   GET  /api/admin/sync-status                — poll current sync progress
 *   POST /api/admin/sync-cslb                  — trigger CSLB CSV enrichment
 */

import { Router } from 'express';
import Stripe from 'stripe';
import { isAdmin } from '../middleware/auth.js';
import { sqlite } from '../db.js';
import { parseRow } from '../helpers/parseRow.js';
import {
  setVerificationStatus,
  getVerificationStats,
  isValidStatus,
} from '../services/verification.js';
import { runYelpSync, getSyncStatus } from '../pipelines/yelpSync.js';
import { runYelpEnrich, getEnrichStatus } from '../pipelines/yelpEnrich.js';
import { runCslbEnrichment } from '../pipelines/cslbSync.js';
import { STATE_CONFIGS } from '../data/stateLicenseConfigs.js';
import { runStateLicenseSync } from '../pipelines/stateLicenseSync.js';
import { runFirecrawlSync } from '../pipelines/firecrawlSync.js';
import { ensureFtsIndex } from '../services/fts5.js';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('REPLACE')
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const VERIFICATION_FEE_CENTS = parseInt(process.env.STRIPE_VERIFICATION_PRICE || '15000');

// ---------------------------------------------------------------------------
// POST /api/claims — save claim form data and create Stripe Checkout session
// ---------------------------------------------------------------------------
router.post('/claims', async (req, res, next) => {
  try {
    const {
      companyId, claimerName, claimerEmail, claimerPhone, claimerTitle,
      ownershipType, yearAcquired, employeeCount, licenseNumber,
      message, documentsProvided,
    } = req.body as Record<string, string | undefined>;

    if (!companyId || !claimerName || !claimerEmail) {
      return res.status(400).json({ error: 'companyId, claimerName, and claimerEmail are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claimerEmail)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Look up the company for name reference in Stripe metadata
    const company = sqlite.prepare('SELECT businessName FROM companies WHERE id = ? LIMIT 1').get(companyId) as { businessName: string } | undefined;

    const result = sqlite.prepare(`
      INSERT INTO claim_requests (
        companyId, claimerName, claimerEmail, claimerPhone, claimerTitle,
        ownershipType, yearAcquired, employeeCount, licenseNumber,
        message, documentsProvided, status, paymentStatus, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'unpaid', ?)
    `).run(
      companyId, claimerName, claimerEmail, claimerPhone ?? null, claimerTitle ?? null,
      ownershipType ?? null, yearAcquired ?? null, employeeCount ?? null, licenseNumber ?? null,
      message ?? null, documentsProvided ?? null, new Date().toISOString()
    );

    const claimId = result.lastInsertRowid as number;

    // If Stripe is configured, create a hosted Checkout session
    if (stripe) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: VERIFICATION_FEE_CENTS,
            product_data: {
              name: 'HCC Business Verification',
              description: `Verification for ${company?.businessName ?? companyId}. Includes manual review, document verification, and HCC Verified badge. Estimated 2–3 weeks.`,
            },
          },
          quantity: 1,
        }],
        metadata: {
          claimId: String(claimId),
          companyId,
          claimerEmail,
          businessName: company?.businessName ?? '',
        },
        customer_email: claimerEmail,
        success_url: `${FRONTEND_URL}/claim/${companyId}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/claim/${companyId}?cancelled=1`,
      });

      // Save session ID to the claim row
      sqlite.prepare('UPDATE claim_requests SET stripeSessionId = ? WHERE id = ?').run(session.id, claimId);

      return res.json({ success: true, checkoutUrl: session.url, claimId });
    }

    // Stripe not configured — return success without payment (dev/test mode)
    res.json({ success: true, claimId, checkoutUrl: null, message: 'Claim saved. Stripe not configured — payment skipped.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/stripe — handle Stripe payment events
// ---------------------------------------------------------------------------
router.post('/webhooks/stripe', (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(200).json({ received: true });
  }

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err);
    return res.status(400).send('Webhook signature failed');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const claimId = session.metadata?.claimId;
    if (claimId) {
      sqlite.prepare(`
        UPDATE claim_requests
        SET paymentStatus = 'paid', paymentIntentId = ?, paidAt = ?, status = 'under_review'
        WHERE id = ?
      `).run(session.payment_intent as string, new Date().toISOString(), parseInt(claimId));
      console.log(`[Stripe] Payment confirmed for claim #${claimId}`);
    }
  }

  res.json({ received: true });
});

// All admin routes require admin auth
router.use('/admin', isAdmin);

// ---------------------------------------------------------------------------
// GET /api/admin/companies — search + filter companies for admin management
// ---------------------------------------------------------------------------
router.get('/admin/companies', (req, res, next) => {
  try {
    const {
      q = '',
      status,
      limit = '20',
      offset = '0',
    } = req.query as Record<string, string>;

    const lim = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const off = Math.max(0, parseInt(offset) || 0);

    const conditions: string[] = [];
    const params: Record<string, string | number> = {};

    // Text search (LIKE — admin doesn't need FTS5 speed for small result sets)
    if (q.trim()) {
      conditions.push(`(c.businessName LIKE @search OR c.city LIKE @search OR c.category LIKE @search)`);
      params.search = `%${q.trim()}%`;
    }

    // Verification status filter
    if (status && isValidStatus(status)) {
      conditions.push(`COALESCE(c.verificationStatus, 'unverified') = @status`);
      params.status = status;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    params.limit = lim;
    params.offset = off;

    const rows = sqlite.prepare(`
      SELECT c.*
      FROM companies c
      ${whereClause}
      ORDER BY c.rating DESC, c.reviewCount DESC
      LIMIT @limit OFFSET @offset
    `).all(params) as Record<string, unknown>[];

    // Get total count
    const countParams = Object.fromEntries(
      Object.entries(params).filter(([k]) => k !== 'limit' && k !== 'offset')
    );
    const countRow = sqlite.prepare(`
      SELECT COUNT(*) as cnt
      FROM companies c
      ${whereClause}
    `).get(countParams) as { cnt: number };

    res.json({
      companies: rows.map(r => parseRow(r as any)),
      totalResults: countRow.cnt,
      limit: lim,
      offset: off,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/admin/companies/:id/verification — update verification status
// ---------------------------------------------------------------------------
router.put('/admin/companies/:id/verification', (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };

    if (!status || !isValidStatus(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: unverified, verified, hcc_member`,
      });
    }

    const updated = setVerificationStatus(id, status);

    if (!updated) {
      return res.status(404).json({ error: 'Company not found' });
    }

    console.log(`[Admin] ${req.user!.email} set company ${id} to ${status}`);

    res.json({ success: true, companyId: id, status });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/stats — verification + data source counts
// ---------------------------------------------------------------------------
router.get('/admin/stats', (_req, res, next) => {
  try {
    const stats = getVerificationStats();
    const total = stats.unverified + stats.verified + stats.hcc_member;

    // Data source breakdown
    const sourceCounts = sqlite.prepare(`
      SELECT COALESCE(dataSource, 'manual') as source, COUNT(*) as cnt
      FROM companies
      GROUP BY source
    `).all() as { source: string; cnt: number }[];

    const sources: Record<string, number> = {};
    for (const row of sourceCounts) sources[row.source] = row.cnt;

    res.json({
      ...stats,
      total,
      dataSources: sources,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/sync-yelp — trigger Yelp Fusion ingestion in background
// ---------------------------------------------------------------------------
router.post('/admin/sync-yelp', (req, res, next) => {
  try {
    const apiKey = process.env.YELP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'YELP_API_KEY not configured in environment' });
    }

    const existing = getSyncStatus();
    if (existing?.status === 'running') {
      return res.status(409).json({ error: 'Sync already in progress', sync: existing });
    }

    // Optional: allow partial sweeps via query params for testing
    const { metros, categories } = (req.body ?? {}) as {
      metros?: string[];
      categories?: string[];
    };

    // Run in background — don't await
    runYelpSync(apiKey, metros, categories).catch(err => {
      console.error('[admin] Yelp sync background error:', err);
    });

    res.json({ status: 'started', message: 'Yelp sync started in background. Poll /api/admin/sync-status for progress.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/sync-status — poll current sync progress
// ---------------------------------------------------------------------------
router.get('/admin/sync-status', (_req, res, next) => {
  try {
    const status = getSyncStatus();
    if (!status) {
      return res.json({ status: 'idle', message: 'No sync has been run in this server session.' });
    }
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/enrich-yelp — trigger Yelp match-and-enrich in background
// ---------------------------------------------------------------------------
router.post('/admin/enrich-yelp', (req, res, next) => {
  try {
    const apiKey = process.env.YELP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'YELP_API_KEY not configured in environment' });
    }

    const existing = getEnrichStatus();
    if (existing?.status === 'running') {
      return res.status(409).json({ error: 'Enrich already in progress', enrich: existing });
    }

    // Run in background — don't await
    runYelpEnrich(apiKey).catch(err => {
      console.error('[admin] Yelp enrich background error:', err);
    });

    res.json({ status: 'started', message: 'Yelp enrich started in background. Poll /api/admin/enrich-status for progress.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/enrich-status — poll current enrich progress
// ---------------------------------------------------------------------------
router.get('/admin/enrich-status', (_req, res, next) => {
  try {
    const status = getEnrichStatus();
    if (!status) {
      return res.json({ status: 'idle', message: 'No enrich has been run in this server session.' });
    }
    res.json(status);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/sync-cslb — trigger CSLB CSV enrichment
// ---------------------------------------------------------------------------
router.post('/admin/sync-cslb', async (req, res, next) => {
  try {
    const { csvPath } = req.body as { csvPath?: string };
    const defaultPath = './server/data/cslb_active.csv';
    const filePath = csvPath || defaultPath;

    const stats = await runCslbEnrichment(filePath);
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/purge-seed-data — delete synthetic seed records
// Removes all companies where yelpId IS NULL AND dataSource = 'manual'.
// Safe to run after a Yelp sync has populated real records.
// ---------------------------------------------------------------------------
router.post('/admin/purge-seed-data', (req, res, next) => {
  try {
    // Count first so we can report how many will be removed
    const { count: before } = sqlite.prepare(
      `SELECT COUNT(*) as count FROM companies WHERE yelpId IS NULL AND dataSource = 'manual'`
    ).get() as { count: number };

    const result = sqlite.prepare(
      `DELETE FROM companies WHERE yelpId IS NULL AND dataSource = 'manual'`
    ).run();

    const { count: after } = sqlite.prepare(
      `SELECT COUNT(*) as count FROM companies`
    ).get() as { count: number };

    console.log(`[admin] Purged ${result.changes} seed records. ${after} companies remain.`);

    res.json({
      success: true,
      deleted: result.changes,
      seedRecordsBefore: before,
      totalRemaining: after,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// FTS5 index rebuild — in-memory status tracking
// ---------------------------------------------------------------------------

interface FtsRebuildStatus {
  status: 'idle' | 'running' | 'complete' | 'error';
  rowsIndexed?: number;
  elapsedSeconds?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}
let ftsRebuildStatus: FtsRebuildStatus = { status: 'idle' };

// ---------------------------------------------------------------------------
// POST /api/admin/rebuild-fts — drop and rebuild the FTS5 search index
// Responds immediately; tracks progress via GET /api/admin/fts-status.
// ---------------------------------------------------------------------------
router.post('/admin/rebuild-fts', (_req, res, next) => {
  try {
    if (ftsRebuildStatus.status === 'running') {
      return res.status(409).json({
        error: 'FTS rebuild already in progress',
        startedAt: ftsRebuildStatus.startedAt,
      });
    }

    ftsRebuildStatus = { status: 'running', startedAt: new Date().toISOString() };
    res.json({
      status: 'started',
      message: 'FTS5 index rebuild started. Poll /api/admin/fts-status for completion.',
    });

    // Schedule blocking rebuild AFTER response is flushed to the client.
    // setImmediate yields to the event loop so the HTTP response buffer is
    // drained before the synchronous sqlite.exec() blocks the thread.
    setImmediate(() => {
      try {
        const start = Date.now();
        ensureFtsIndex({ force: true });
        const elapsed = (Date.now() - start) / 1000;
        const { count } = sqlite
          .prepare(`SELECT COUNT(*) as count FROM companies_fts`)
          .get() as { count: number };
        ftsRebuildStatus = {
          status: 'complete',
          rowsIndexed: count,
          elapsedSeconds: Math.round(elapsed * 10) / 10,
          startedAt: ftsRebuildStatus.startedAt,
          finishedAt: new Date().toISOString(),
        };
        console.log(`[admin] FTS rebuild complete: ${count.toLocaleString()} rows in ${elapsed.toFixed(1)}s`);
      } catch (err) {
        ftsRebuildStatus = {
          status: 'error',
          error: String(err),
          startedAt: ftsRebuildStatus.startedAt,
          finishedAt: new Date().toISOString(),
        };
        console.error('[admin] FTS rebuild error:', err);
      }
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/fts-status — poll FTS rebuild progress
// ---------------------------------------------------------------------------
router.get('/admin/fts-status', (_req, res, next) => {
  try {
    // Include the current indexed row count for context
    let currentCount: number | undefined;
    try {
      const row = sqlite
        .prepare(`SELECT COUNT(*) as count FROM companies_fts`)
        .get() as { count: number } | undefined;
      currentCount = row?.count;
    } catch { /* table may not exist yet */ }

    res.json({ ...ftsRebuildStatus, currentCount });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/data-quality — summary of data sources in DB
// ---------------------------------------------------------------------------
router.get('/admin/data-quality', (_req, res, next) => {
  try {
    const bySource = sqlite.prepare(`
      SELECT dataSource, COUNT(*) as count,
        ROUND(AVG(rating), 2) as avgRating,
        SUM(CASE WHEN imageUrl IS NOT NULL THEN 1 ELSE 0 END) as withPhoto,
        SUM(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) as withCoords
      FROM companies
      GROUP BY dataSource
    `).all() as { dataSource: string; count: number; avgRating: number; withPhoto: number; withCoords: number }[];

    const yelpCount = sqlite.prepare(
      `SELECT COUNT(*) as count FROM companies WHERE yelpId IS NOT NULL`
    ).get() as { count: number };

    const total = sqlite.prepare(
      `SELECT COUNT(*) as count FROM companies`
    ).get() as { count: number };

    res.json({ bySource, yelpCount: yelpCount.count, total: total.count });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/claims — list all claim requests (admin only)
// ---------------------------------------------------------------------------
router.get('/admin/claims', (req, res, next) => {
  try {
    const claims = sqlite.prepare(`
      SELECT cr.*, c.businessName, c.category, c.city, c.state
      FROM claim_requests cr
      LEFT JOIN companies c ON c.id = cr.companyId
      ORDER BY cr.createdAt DESC
      LIMIT 100
    `).all();
    res.json({ claims });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/state-license-sources — list configured state agencies
// ---------------------------------------------------------------------------
router.get('/admin/state-license-sources', (_req, res, next) => {
  try {
    const sources = Object.entries(STATE_CONFIGS).map(([code, cfg]) => ({
      stateCode: code,
      stateName: cfg.stateName,
      agency: cfg.agency,
      agencyUrl: cfg.agencyUrl,
      format: cfg.format,
      estimatedRecords: cfg.estimatedRecords,
      requiresFirecrawl: cfg.format === 'firecrawl',
    }));
    res.json({ sources });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/admin/sync-state-license — import a state's license database
// Body: { stateCode: 'TX' | 'WA' | 'OR' | 'AZ' | 'NC' | 'FL' }
// ---------------------------------------------------------------------------

// Track running state syncs (in-memory, per server session)
const runningStateSyncs = new Set<string>();

router.post('/admin/sync-state-license', async (req, res, next) => {
  try {
    const { stateCode } = (req.body ?? {}) as { stateCode?: string };
    if (!stateCode) {
      return res.status(400).json({ error: 'stateCode is required' });
    }
    const upper = stateCode.toUpperCase();
    const config = STATE_CONFIGS[upper];
    if (!config) {
      return res.status(400).json({
        error: `Unknown stateCode: ${upper}`,
        available: Object.keys(STATE_CONFIGS),
      });
    }
    if (runningStateSyncs.has(upper)) {
      return res.status(409).json({ error: `Sync for ${upper} is already running` });
    }
    if (config.format === 'firecrawl' && !process.env.FIRECRAWL_API_KEY) {
      return res.status(500).json({ error: 'FIRECRAWL_API_KEY not set — required for FireCrawl states' });
    }

    runningStateSyncs.add(upper);
    res.json({ status: 'started', stateCode: upper, message: `${config.stateName} (${config.agency}) sync started in background.` });

    // Run in background
    const run = config.format === 'firecrawl'
      ? runFirecrawlSync(config)
      : runStateLicenseSync(config);

    run
      .then(stats => console.log(`[admin] State sync ${upper} complete:`, stats))
      .catch(err => console.error(`[admin] State sync ${upper} error:`, err))
      .finally(() => runningStateSyncs.delete(upper));

  } catch (err) { next(err); }
});

export default router;
