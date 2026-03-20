import { Router } from 'express';
import { eq, and, like, gte, lte, desc, asc, sql, ne, or } from 'drizzle-orm';
import { db, sqlite } from '../db.js';
import { companies } from '../schema.js';
import { parseRow } from '../helpers/parseRow.js';

const router = Router();

// GET /api/companies - paginated, filtered, sorted
router.get('/companies', async (req, res, next) => {
  try {
    const {
      page = '1', limit = '20', sort = 'relevance',
      category, state, city, location, search,
      minRating, maxRating,
    } = req.query as Record<string, string | undefined>;

    const p = Math.max(1, parseInt(page || '1'));
    const lim = Math.min(100, Math.max(1, parseInt(limit || '20')));
    const offset = (p - 1) * lim;

    const conditions = [];

    if (category) conditions.push(eq(companies.category, category));
    if (state) conditions.push(eq(companies.state, state));
    if (city) conditions.push(eq(companies.city, city));
    if (location) {
      const loc = `%${location}%`;
      conditions.push(
        or(
          like(companies.city, loc),
          like(companies.state, loc),
          like(companies.location, loc),
        )!
      );
    }
    if (search) {
      const s = `%${search}%`;
      conditions.push(
        or(
          like(companies.businessName, s),
          like(companies.category, s),
          like(companies.city, s),
          like(companies.state, s),
        )!
      );
    }
    if (minRating) conditions.push(gte(companies.rating, parseFloat(minRating)));
    if (maxRating) conditions.push(lte(companies.rating, parseFloat(maxRating)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const countResult = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(companies)
      .where(whereClause);
    const total = countResult[0].cnt;
    const totalPages = Math.ceil(total / lim);

    // Determine sort order
    let orderBy;
    switch (sort) {
      case 'rating_desc': orderBy = [desc(companies.rating)]; break;
      case 'rating_asc': orderBy = [asc(companies.rating)]; break;
      case 'reviews_desc': orderBy = [desc(companies.reviewCount)]; break;
      case 'reviews_asc': orderBy = [asc(companies.reviewCount)]; break;
      case 'name_asc': orderBy = [asc(companies.businessName)]; break;
      case 'name_desc': orderBy = [desc(companies.businessName)]; break;
      default: orderBy = [desc(companies.rating), desc(companies.reviewCount)]; break;
    }

    const rows = await db.select()
      .from(companies)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(lim)
      .offset(offset);

    res.json({
      data: rows.map(parseRow),
      total,
      page: p,
      limit: lim,
      totalPages,
      hasNextPage: p < totalPages,
      hasPrevPage: p > 1,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:id
// Use better-sqlite3 directly — Drizzle/libsql times out on 4M+ row table
router.get('/companies/:id', (req, res, next) => {
  try {
    const row = sqlite.prepare('SELECT * FROM companies WHERE id = ? LIMIT 1').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(parseRow(row as Record<string, unknown>));
  } catch (err) {
    next(err);
  }
});

// GET /api/featured
router.get('/featured', async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt((req.query.limit as string) || '10'));
    const rows = await db.select()
      .from(companies)
      .orderBy(desc(companies.rating), desc(companies.reviewCount))
      .limit(limit);
    res.json(rows.map(parseRow));
  } catch (err) {
    next(err);
  }
});

// GET /api/top-rated — enriched companies only, exclude General Contractors (they have their own section)
// "Enriched" = has at least one of: image, website, reviews, active license
// Bad licenses (cancelled/suspended/inactive/expired) are excluded entirely
router.get('/top-rated', (req, res, next) => {
  try {
    const limit = Math.min(200, parseInt((req.query.limit as string) || '10'));
    const rows = sqlite.prepare(
      `SELECT * FROM companies
       WHERE category != 'General Contractor'
         AND licenseStatus NOT IN (
           'cancelled','suspended','inactive','expired',
           'referred to enforcement','contr bond susp','work comp susp','liab ins susp'
         )
         AND (
           (imageUrl IS NOT NULL AND imageUrl != '') OR
           (website IS NOT NULL AND website != '') OR
           reviewCount > 0 OR
           licenseStatus IN ('active','clear','issued')
         )
       ORDER BY
         -- Paid verified first
         CASE WHEN verificationStatus = 'hcc_member' THEN 3
              WHEN verificationStatus = 'verified' AND dataSource NOT LIKE 'license_%' THEN 2
              ELSE 0 END DESC,
         -- Enrichment score
         (CASE WHEN reviewCount > 0 AND imageUrl IS NOT NULL AND imageUrl != '' THEN 3 ELSE 0 END +
          CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END +
          CASE WHEN licenseStatus IN ('active','clear','issued') THEN 1 ELSE 0 END) DESC,
         rating DESC,
         reviewCount DESC
       LIMIT ?`
    ).all(limit);
    res.json(rows.map(parseRow));
  } catch (err) {
    next(err);
  }
});

// GET /api/new
router.get('/new', async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt((req.query.limit as string) || '10'));
    const rows = await db.select()
      .from(companies)
      .orderBy(desc(companies.rating), desc(companies.reviewCount))
      .limit(limit);
    res.json(rows.map(parseRow));
  } catch (err) {
    next(err);
  }
});

// GET /api/similar/:id
// Use better-sqlite3 directly — Drizzle/libsql times out on 4M+ row table
router.get('/similar/:id', (req, res, next) => {
  try {
    const limit = Math.min(20, parseInt((req.query.limit as string) || '6'));
    const target = sqlite.prepare('SELECT * FROM companies WHERE id = ? LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;

    if (!target) return res.json([]);

    const rows = sqlite.prepare(
      `SELECT * FROM companies
       WHERE id != ? AND (category = ? OR city = ?)
       ORDER BY rating DESC LIMIT ?`
    ).all(target.id, target.category, target.city, limit);

    res.json((rows as Record<string, unknown>[]).map(parseRow));
  } catch (err) {
    next(err);
  }
});

// GET /api/companies-by-state - top companies grouped by state
router.get('/companies-by-state', async (req, res, next) => {
  try {
    const { states = '', limit = '10' } = req.query as Record<string, string>;
    const stateList = states.split(',').map(s => s.trim()).filter(Boolean);
    const lim = Math.min(20, Math.max(1, parseInt(limit)));

    if (stateList.length === 0) return res.json({});

    const result: Record<string, unknown[]> = {};
    for (const state of stateList.slice(0, 10)) {
      const rows = await db.select()
        .from(companies)
        .where(eq(companies.state, state))
        .orderBy(desc(companies.rating), desc(companies.reviewCount))
        .limit(lim);
      result[state] = rows.map(parseRow);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/top-companies?category=General Contractor&subCategory=...&limit=25
router.get('/top-companies', (req, res, next) => {
  try {
    const {
      category,
      subCategory,
      limit = '25',
      hasWebsite,
    } = req.query as Record<string, string | undefined>;

    if (!category) {
      return res.status(400).json({ error: 'category parameter is required' });
    }

    const lim = Math.min(100, Math.max(1, parseInt(limit || '25')));
    const webFilter = hasWebsite === 'true' ? " AND website IS NOT NULL AND website != ''" : '';

    // Use better-sqlite3 directly — Drizzle/libsql times out on 4M+ row table
    // ORDER BY: enriched companies first (website→logo loads, reviews→real data),
    // then by rating/reviews. This ensures homepage rails show logos instead of initials.
    const enrichedOrder = `
      CASE WHEN website IS NOT NULL AND website != '' THEN 1 ELSE 0 END DESC,
      CASE WHEN reviewCount > 0 THEN 1 ELSE 0 END DESC,
      rating DESC,
      reviewCount DESC`;

    const sql = subCategory
      ? `SELECT * FROM companies WHERE (category = ? OR subCategory = ?)${webFilter} ORDER BY ${enrichedOrder} LIMIT ?`
      : `SELECT * FROM companies WHERE category = ?${webFilter} ORDER BY ${enrichedOrder} LIMIT ?`;

    const rows = subCategory
      ? sqlite.prepare(sql).all(category, subCategory, lim)
      : sqlite.prepare(sql).all(category, lim);

    res.json({
      companies: rows,
      total: rows.length,
      category,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
