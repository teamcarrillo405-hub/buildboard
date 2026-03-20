import { describe, it, expect } from 'vitest';
import { createTestDb } from '../setup.js';

describe('Test DB setup', () => {
  it('creates an in-memory DB with ad tables', () => {
    const db = createTestDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name: string}>;
    const names = tables.map(t => t.name);
    expect(names).toContain('companies');
    expect(names).toContain('sponsors');
    expect(names).toContain('ad_slots');
    expect(names).toContain('ad_creatives');
    expect(names).toContain('ad_assignments');
    expect(names).toContain('ad_events');
    db.close();
  });

  it('seeds WCB sponsor from migration 002', () => {
    const db = createTestDb();
    const sponsor = db.prepare("SELECT * FROM sponsors WHERE id = 'sponsor-wcb'").get() as { name: string } | undefined;
    expect(sponsor).toBeDefined();
    expect(sponsor?.name).toBe('West Coast Batteries');
    db.close();
  });
});
