import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { createTestDb, seedTestCompany } from '../setup.js';

let db: InstanceType<typeof Database>;
let app: express.Express;

beforeEach(() => {
  db = createTestDb();
  seedTestCompany(db, { id: 'co-1', category: 'Plumbing', state: 'CA', rating: 4.5 });
  seedTestCompany(db, { id: 'co-2', category: 'Plumbing', state: 'TX', rating: 3.0 });
  seedTestCompany(db, { id: 'co-3', category: 'Electrical', state: 'CA', rating: 5.0 });

  app = express();
  app.use(express.json());

  app.get('/api/categories', (_req, res) => {
    const rows = db.prepare(`
      SELECT category, COUNT(*) as count, AVG(rating) as avgRating
      FROM companies GROUP BY category ORDER BY count DESC
    `).all();
    res.json(rows);
  });

  app.get('/api/states', (_req, res) => {
    const rows = db.prepare(`
      SELECT state, COUNT(*) as count FROM companies GROUP BY state ORDER BY count DESC
    `).all();
    res.json(rows);
  });

  app.get('/api/stats', (_req, res) => {
    const total = (db.prepare('SELECT COUNT(*) as n FROM companies').get() as { n: number }).n;
    const categories = (db.prepare('SELECT COUNT(DISTINCT category) as n FROM companies').get() as { n: number }).n;
    const states = (db.prepare('SELECT COUNT(DISTINCT state) as n FROM companies').get() as { n: number }).n;
    res.json({ totalCompanies: total, totalCategories: categories, totalStates: states });
  });
});

describe('GET /api/categories', () => {
  it('returns categories with counts', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const plumbing = res.body.find((c: { category: string }) => c.category === 'Plumbing');
    expect(plumbing.count).toBe(2);
  });
});

describe('GET /api/states', () => {
  it('returns states with company counts', async () => {
    const res = await request(app).get('/api/states');
    const ca = res.body.find((s: { state: string }) => s.state === 'CA');
    expect(ca.count).toBe(2);
  });
});

describe('GET /api/stats', () => {
  it('returns global company/category/state counts', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.body.totalCompanies).toBe(3);
    expect(res.body.totalCategories).toBe(2);
    expect(res.body.totalStates).toBe(2);
  });
});
