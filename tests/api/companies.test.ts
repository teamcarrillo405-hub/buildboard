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
  seedTestCompany(db, { id: 'co-3', businessName: 'Roofing Kings', category: 'Roofing', state: 'CA', city: 'San Diego', rating: 5.0 });

  app = express();
  app.use(express.json());

  // GET /api/companies — list with filters
  app.get('/api/companies', (req, res) => {
    const { category, state, limit = '20', offset = '0' } = req.query as Record<string, string>;
    let query = 'SELECT * FROM companies WHERE 1=1';
    const params: string[] = [];
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (state) { query += ' AND state = ?'; params.push(state); }
    query += ` LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    const companies = db.prepare(query).all(...params);
    res.json({ companies, total: companies.length });
  });

  // GET /api/companies/:id
  app.get('/api/companies/:id', (req, res) => {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
    if (!company) return res.status(404).json({ error: 'not found' });
    res.json(company);
  });
});

describe('GET /api/companies', () => {
  it('returns all companies when no filter applied', async () => {
    const res = await request(app).get('/api/companies');
    expect(res.status).toBe(200);
    expect(res.body.companies).toHaveLength(3);
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/companies?category=Plumbing');
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].businessName).toBe('Acme Plumbing');
  });

  it('filters by state', async () => {
    const res = await request(app).get('/api/companies?state=CA');
    expect(res.body.companies).toHaveLength(2);
  });

  it('respects limit parameter', async () => {
    const res = await request(app).get('/api/companies?limit=1');
    expect(res.body.companies).toHaveLength(1);
  });

  it('returns empty array for no matches', async () => {
    const res = await request(app).get('/api/companies?category=NonExistent');
    expect(res.body.companies).toHaveLength(0);
  });
});

describe('GET /api/companies/:id', () => {
  it('returns a company by ID', async () => {
    const res = await request(app).get('/api/companies/co-1');
    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe('Acme Plumbing');
    expect(res.body.category).toBe('Plumbing');
  });

  it('returns 404 for unknown ID', async () => {
    const res = await request(app).get('/api/companies/does-not-exist');
    expect(res.status).toBe(404);
  });
});
