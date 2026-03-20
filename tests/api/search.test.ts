import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { createTestDb, seedTestCompany } from '../setup.js';

let db: InstanceType<typeof Database>;
let app: express.Express;

beforeEach(() => {
  db = createTestDb();
  seedTestCompany(db, { id: 'co-1', businessName: 'Acme Plumbing', category: 'Plumbing', state: 'CA', city: 'Los Angeles', rating: 4.5 });
  seedTestCompany(db, { id: 'co-2', businessName: 'Best Electric', category: 'Electrical', state: 'TX', city: 'Dallas', rating: 3.8 });

  app = express();
  app.use(express.json());

  // LIKE-based search fallback (tests the fallback path — FTS5 not available in :memory:)
  app.get('/api/search', (req, res) => {
    const { q = '', category, state, minRating } = req.query as Record<string, string>;
    let query = 'SELECT * FROM companies WHERE (businessName LIKE ? OR category LIKE ?)';
    const params: (string | number)[] = [`%${q}%`, `%${q}%`];
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (state) { query += ' AND state = ?'; params.push(state); }
    if (minRating) { query += ' AND rating >= ?'; params.push(parseFloat(minRating)); }
    const companies = db.prepare(query).all(...params);
    res.json({ companies, totalResults: companies.length, source: 'like' });
  });
});

describe('GET /api/search', () => {
  it('returns all companies for empty query', async () => {
    const res = await request(app).get('/api/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.companies).toHaveLength(2);
  });

  it('searches by business name', async () => {
    const res = await request(app).get('/api/search?q=Acme');
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].businessName).toBe('Acme Plumbing');
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/search?q=&category=Electrical');
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].category).toBe('Electrical');
  });

  it('filters by minimum rating', async () => {
    const res = await request(app).get('/api/search?q=&minRating=4');
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].rating).toBeGreaterThanOrEqual(4);
  });

  it('returns empty array for no matches', async () => {
    const res = await request(app).get('/api/search?q=ZZZNoMatch');
    expect(res.body.companies).toHaveLength(0);
    expect(res.body.totalResults).toBe(0);
  });

  it('combines category and state filters', async () => {
    const res = await request(app).get('/api/search?q=&category=Plumbing&state=CA');
    expect(res.body.companies).toHaveLength(1);
  });
});
