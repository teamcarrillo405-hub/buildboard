import { Router } from 'express';
import { desc, sql, ne } from 'drizzle-orm';
import { db } from '../db.js';
import { companies } from '../schema.js';

const router = Router();

// GET /api/categories
router.get('/categories', async (req, res, next) => {
  try {
    const rows = await db.select({
      name: companies.category,
      companyCount: sql<number>`COUNT(*)`,
      avgRating: sql<number>`ROUND(AVG(${companies.rating}), 1)`,
    })
      .from(companies)
      .groupBy(companies.category)
      .orderBy(desc(sql`COUNT(*)`));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/states
router.get('/states', async (req, res, next) => {
  try {
    const rows = await db.select({
      code: companies.state,
      name: companies.state,
      companyCount: sql<number>`COUNT(*)`,
    })
      .from(companies)
      .where(ne(companies.state, ''))
      .groupBy(companies.state)
      .orderBy(desc(sql`COUNT(*)`));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/stats
router.get('/stats', async (req, res, next) => {
  try {
    const totalResult = await db.select({ cnt: sql<number>`COUNT(*)` }).from(companies);
    const categoriesResult = await db.select({ cnt: sql<number>`COUNT(DISTINCT ${companies.category})` }).from(companies);
    const statesResult = await db.select({ cnt: sql<number>`COUNT(DISTINCT ${companies.state})` })
      .from(companies)
      .where(ne(companies.state, ''));
    const avgRatingResult = await db.select({ avg: sql<number>`ROUND(AVG(${companies.rating}), 1)` }).from(companies);
    const totalReviewsResult = await db.select({ total: sql<number>`SUM(${companies.reviewCount})` }).from(companies);

    res.json({
      totalCompanies: totalResult[0].cnt,
      totalCategories: categoriesResult[0].cnt,
      totalStates: statesResult[0].cnt,
      averageRating: avgRatingResult[0].avg,
      totalReviews: totalReviewsResult[0].total,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
