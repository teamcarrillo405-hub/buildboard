#!/usr/bin/env npx tsx
/**
 * enrichStatus.ts — Live monitor for the enrichment swarm
 *
 * Shows per-worker progress, aggregate stats, and DB totals.
 * Auto-refreshes every 3 minutes (or run once with --once).
 *
 * Usage:
 *   npx tsx server/scripts/enrichStatus.ts           # loop every 3 min
 *   npx tsx server/scripts/enrichStatus.ts --once    # single snapshot
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const LOGS_DIR      = './logs';
const DB_PATH       = './server/constructflix.db';
const REFRESH_MS    = 3 * 60 * 1000; // 3 minutes
const TOTAL_WORKERS = 20;

const once = process.argv.includes('--once');

function loadAllProgress() {
  const workers = [];
  for (let i = 0; i < TOTAL_WORKERS; i++) {
    const file = path.join(LOGS_DIR, `enrichWorker_${i}_of_${TOTAL_WORKERS}.json`);
    try {
      const p = JSON.parse(fs.readFileSync(file, 'utf8'));
      workers.push(p);
    } catch {
      workers.push({ workerId: i, processed: 0, found: 0, foundEmail: 0, errors: 0, lastBusiness: '—', lastUpdatedAt: '—' });
    }
  }
  return workers;
}

function getDbStats() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const total       = (db.prepare('SELECT COUNT(*) as n FROM companies').get() as any).n;
    const withWebsite = (db.prepare("SELECT COUNT(*) as n FROM companies WHERE website IS NOT NULL AND website != ''").get() as any).n;
    const withEmail   = (db.prepare("SELECT COUNT(*) as n FROM companies WHERE email IS NOT NULL AND email != ''").get() as any).n;
    const withPhone   = (db.prepare("SELECT COUNT(*) as n FROM companies WHERE phone IS NOT NULL AND phone != ''").get() as any).n;
    const noWebsite   = total - withWebsite;
    db.close();
    return { total, withWebsite, withEmail, withPhone, noWebsite };
  } catch {
    return { total: 0, withWebsite: 0, withEmail: 0, withPhone: 0, noWebsite: 0 };
  }
}

function printStatus() {
  const now     = new Date().toLocaleString();
  const workers = loadAllProgress();
  const db      = getDbStats();

  const totalProcessed = workers.reduce((s, w) => s + (w.processed ?? 0), 0);
  const totalFound     = workers.reduce((s, w) => s + (w.found ?? 0), 0);
  const totalEmails    = workers.reduce((s, w) => s + (w.foundEmail ?? 0), 0);
  const totalErrors    = workers.reduce((s, w) => s + (w.errors ?? 0), 0);

  const hitRate    = totalProcessed > 0 ? (totalFound / totalProcessed * 100).toFixed(1) : '0.0';
  const emailRate  = totalFound > 0     ? (totalEmails / totalFound * 100).toFixed(1)    : '0.0';

  // Estimate completion
  const remaining  = db.noWebsite - totalProcessed;
  const ratePerSec = totalProcessed / Math.max(1, (Date.now() - new Date(workers[0]?.startedAt || Date.now()).getTime()) / 1000);
  const etaHours   = remaining > 0 && ratePerSec > 0 ? (remaining / ratePerSec / 3600).toFixed(1) : '?';

  console.clear();
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  ConstructFlix — Enrichment Swarm Status  [${now}]  ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  DB Total          : ${String(db.total.toLocaleString()).padStart(11)}                              ║`);
  console.log(`║  With Website      : ${String(db.withWebsite.toLocaleString()).padStart(11)}  (${(db.withWebsite/db.total*100).toFixed(1)}%)                    ║`);
  console.log(`║  With Email        : ${String(db.withEmail.toLocaleString()).padStart(11)}  (${(db.withEmail/db.total*100).toFixed(1)}%)                    ║`);
  console.log(`║  With Phone        : ${String(db.withPhone.toLocaleString()).padStart(11)}  (${(db.withPhone/db.total*100).toFixed(1)}%)                    ║`);
  console.log(`║  Still needs enr.  : ${String(db.noWebsite.toLocaleString()).padStart(11)}                              ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log(`║  Workers Active    : ${TOTAL_WORKERS}                                           ║`);
  console.log(`║  Total Processed   : ${String(totalProcessed.toLocaleString()).padStart(11)}                              ║`);
  console.log(`║  Websites Found    : ${String(totalFound.toLocaleString()).padStart(11)}  (${hitRate}% hit rate)             ║`);
  console.log(`║  Emails Found      : ${String(totalEmails.toLocaleString()).padStart(11)}  (${emailRate}% of found sites)    ║`);
  console.log(`║  Errors            : ${String(totalErrors.toLocaleString()).padStart(11)}                              ║`);
  console.log(`║  ETA completion    : ${String(etaHours + 'h').padStart(11)}                              ║`);
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║  W#  Processed   Found  Emails  Errors  Last Business           ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');

  for (const w of workers) {
    const wId    = String(w.workerId ?? '?').padStart(2);
    const proc   = String((w.processed ?? 0).toLocaleString()).padStart(9);
    const found  = String((w.found ?? 0).toLocaleString()).padStart(7);
    const emails = String((w.foundEmail ?? 0).toLocaleString()).padStart(7);
    const errs   = String((w.errors ?? 0).toLocaleString()).padStart(6);
    const last   = (w.lastBusiness ?? '—').slice(0, 24).padEnd(24);
    console.log(`║  ${wId}  ${proc}  ${found}  ${emails}  ${errs}  ${last}  ║`);
  }

  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\n  Refreshes every 3 minutes. Press Ctrl+C to stop monitoring.\n`);
}

// ─── Main loop ────────────────────────────────────────────────────────────────

printStatus();

if (!once) {
  setInterval(printStatus, REFRESH_MS);
}
