import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import companiesRouter from './routes/companies.js';
import searchRouter from './routes/search.js';
import categoriesRouter from './routes/categories.js';
import enrichmentRouter from './routes/enrichment.js';
import imagesRouter from './routes/images.js';
import aiSearchRouter from './routes/ai-search.js';
import authRouter from './routes/auth.js';
import favoritesRouter from './routes/favorites.js';
import adminRouter from './routes/admin.js';
import adsRouter from './routes/ads.js';
import adminAdsRouter from './routes/adminAds.js';
import { errorHandler } from './middleware/errorHandler.js';
import { optionalAuth } from './middleware/auth.js';
import { isAIAvailable } from './services/gemini-search.js';
import { ensureFtsIndex, isFtsReady } from './services/fts5.js';
import { ensureVerificationColumn } from './services/verification.js';
import { ensureMediaTable } from './services/media.js';
import { runMigrations, sqlite } from './db.js';
import profileRouter from './routes/profile.js';

const app = express();
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
// Stripe webhooks require raw body — must be registered BEFORE express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());

// Attach user from JWT cookie to req.user on every request (non-blocking)
app.use(optionalAuth);

// Mount all routers at /api since they handle different sub-paths
app.use('/api', companiesRouter);
app.use('/api', searchRouter);
app.use('/api', categoriesRouter);
app.use('/api', enrichmentRouter);
app.use('/api', imagesRouter);
app.use('/api', aiSearchRouter);
app.use('/api', authRouter);
app.use('/api', favoritesRouter);
app.use('/api', adminRouter);
app.use('/api/ads', adsRouter);
app.use('/api', adminAdsRouter);
app.use('/api', profileRouter);

// Sitemap for SEO — static categories + states
app.get('/sitemap.xml', (_req, res) => {
  const base = process.env.SITE_URL || 'https://buildboard.hcc.org';
  const categories = ['Plumbing','Electrical','Roofing','HVAC','Painting','Landscaping',
    'General Contractor','Masonry Contractors','Flooring','Drywall','Carpentry',
    'Tile Installation','Waterproofing','Fencing','Insulation','Windows','Gutters'];
  const states = ['CA','TX','FL','NY','PA','IL','OH','GA','NC','MI'];

  const urls = [
    `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${base}/search</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
    ...categories.map(c => `<url><loc>${base}/search?category=${encodeURIComponent(c)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
    ...states.map(s => `<url><loc>${base}/search?state=${s}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`),
  ];

  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
});

// Error handler (must be before static serving)
app.use(errorHandler);

// In production, serve the built React frontend from dist/
// The API routes above take priority; this catches everything else.
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Run schema migrations synchronously before anything else starts
try {
  runMigrations();
} catch (err) {
  console.error('[Startup] Migration error (non-fatal):', err);
}

// Initialize FTS5 index in background (non-blocking -- server serves LIKE results until ready)
// Force rebuild if the index exists but was built with the old column set (pre-subCategory/specialties).
setTimeout(() => {
  try {
    // Detect whether the existing FTS table includes the new columns
    let needsRebuild = false;
    try {
      const tableInfo = sqlite.prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='companies_fts'`
      ).get() as { sql: string } | undefined;
      if (tableInfo && !tableInfo.sql.includes('subCategory')) {
        console.log('[FTS5] Schema changed (subCategory/specialties added) — forcing index rebuild');
        needsRebuild = true;
      }
    } catch { /* if check fails, proceed normally */ }

    const wasBuilt = ensureFtsIndex(needsRebuild ? { force: true } : undefined);
    if (wasBuilt) {
      console.log('[FTS5] Index initialization complete -- FTS5 search now active');
    } else {
      console.log('[FTS5] Index already available -- FTS5 search active');
    }
  } catch (err) {
    console.error('[FTS5] Index initialization failed -- falling back to LIKE search:', err);
  }
}, 0);

// Ensure verificationStatus column exists (non-blocking)
setTimeout(() => {
  try {
    ensureVerificationColumn();
  } catch (err) {
    console.error('[Verification] Column migration failed:', err);
  }
}, 0);

// Ensure company_media table exists (non-blocking)
setTimeout(() => {
  try {
    ensureMediaTable();
  } catch (err) {
    console.error('[Media] Table migration failed:', err);
  }
}, 0);

// Only listen when running directly (not as Vercel serverless function)
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`\nBuildBoard API running on http://localhost:${PORT}`);
    console.log(`FTS5 search: ${isFtsReady() ? 'ready' : 'initializing (LIKE fallback active)'}`);
    console.log(`AI search: ${isAIAvailable() ? 'available' : 'degraded (no API key -- using fallback parser)'}`);
    console.log(`Auth: ${process.env.WA_CLIENT_ID ? 'Wild Apricot SSO enabled' : 'disabled (no WA_CLIENT_ID)'}`);
    console.log(`Admin: ${process.env.ADMIN_EMAILS ? 'enabled' : 'disabled (no ADMIN_EMAILS)'}`);

  });
}

export default app;
