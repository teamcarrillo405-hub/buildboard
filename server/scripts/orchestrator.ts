#!/usr/bin/env npx tsx
/**
 * orchestrator.ts — Sequential pipeline runner for ConstructFlix enrichment
 *
 * Runs all three data enrichment pipelines in sequence as child processes:
 *   1. enrichYelpContacts.ts  — fills phone, imageUrl, rating from Yelp API
 *   2. enrichWorker.ts        — discovers company websites via search + DNS
 *   3. contactExtractor.ts    — extracts email/phone from verified websites
 *
 * Each pipeline manages its own progress JSON — safe to kill and resume.
 * This orchestrator reads before/after snapshots to compute per-run deltas,
 * then appends a structured entry to logs/daily_summary.json.
 *
 * Usage:
 *   npm run enrich
 *   npx tsx server/scripts/orchestrator.ts
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const LOGS_DIR     = './logs';
const SUMMARY_FILE = './logs/daily_summary.json';

const YELP_PROGRESS    = './logs/yelp_contact_enrich_progress.json';
const WEB_PROGRESS     = './logs/enrichWorker_0_of_1.json';
const CONTACT_PROGRESS = './logs/contact_extract_progress.json';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function log(msg: string): void {
  console.log(`[orchestrator] ${msg}`);
}

// ─── Ensure logs/ directory exists ───────────────────────────────────────────

fs.mkdirSync(LOGS_DIR, { recursive: true });

// ─── Main ─────────────────────────────────────────────────────────────────────

const startMs = Date.now();

log('═══════════════════════════════════════════════════');
log('  ConstructFlix Data Enrichment Pipeline Starting  ');
log('═══════════════════════════════════════════════════');

// Step 1: Read before-snapshots from each pipeline's progress JSON
const before = {
  yelp:    readJsonSafe(YELP_PROGRESS),
  web:     readJsonSafe(WEB_PROGRESS),
  contact: readJsonSafe(CONTACT_PROGRESS),
};

// Step 2: Run Pipeline 1 — Yelp enrichment
log('═══ Starting: enrichYelpContacts (1/3) ═══');
spawnSync('npx', ['tsx', 'server/scripts/enrichYelpContacts.ts'], {
  stdio: 'inherit',
  shell: false,
});

// Step 3: Run Pipeline 2 — Web discovery
log('═══ Starting: enrichWorker (2/3) ═══');
spawnSync(
  'npx',
  ['tsx', 'server/scripts/enrichWorker.ts', '--worker-id', '0', '--total-workers', '1'],
  { stdio: 'inherit', shell: false },
);

// Step 4: Run Pipeline 3 — Contact extraction
log('═══ Starting: contactExtractor (3/3) ═══');
spawnSync('npx', ['tsx', 'server/scripts/contactExtractor.ts'], {
  stdio: 'inherit',
  shell: false,
});

// Step 5: Read after-snapshots
const after = {
  yelp:    readJsonSafe(YELP_PROGRESS),
  web:     readJsonSafe(WEB_PROGRESS),
  contact: readJsonSafe(CONTACT_PROGRESS),
};

// Step 6: Compute deltas (this run only, not lifetime totals)
const yelpDelta = {
  apiCalls:    (after.yelp.totalApiCalls    ?? 0) - (before.yelp.totalApiCalls    ?? 0),
  phoneFilled: (after.yelp.totalPhoneFilled ?? 0) - (before.yelp.totalPhoneFilled ?? 0),
  imageFilled: (after.yelp.totalImageFilled ?? 0) - (before.yelp.totalImageFilled ?? 0),
};

const webDelta = {
  processed:     (after.web.processed ?? 0) - (before.web.processed ?? 0),
  websitesFound: (after.web.found     ?? 0) - (before.web.found     ?? 0),
};

const contactDelta = {
  processed:    (after.contact.totalSearched   ?? 0) - (before.contact.totalSearched   ?? 0),
  emailsFilled: (after.contact.totalEmailFilled ?? 0) - (before.contact.totalEmailFilled ?? 0),
  phonesFilled: (after.contact.totalPhoneFilled ?? 0) - (before.contact.totalPhoneFilled ?? 0),
};

const totalErrors =
  ((after.yelp.errors    ?? 0) - (before.yelp.errors    ?? 0)) +
  ((after.web.errors     ?? 0) - (before.web.errors     ?? 0)) +
  ((after.contact.errors ?? 0) - (before.contact.errors ?? 0));

// Step 7: Build summary entry
const summary = {
  date:               new Date().toISOString().slice(0, 10),
  yelp:               yelpDelta,
  webDiscovery:       webDelta,
  contactExtraction:  contactDelta,
  duration:           formatDuration(Date.now() - startMs),
  errors:             totalErrors,
};

// Step 8: Append to daily_summary.json
let existing: any[] = [];
try { existing = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')); } catch {}
existing.push(summary);
fs.writeFileSync(SUMMARY_FILE, JSON.stringify(existing, null, 2));

// Step 9: Print readable summary
log('═══ DAILY RUN COMPLETE ═══');
log(`Date     : ${summary.date}`);
log(`Duration : ${summary.duration}`);
log(`Yelp     : apiCalls=${yelpDelta.apiCalls} phoneFilled=${yelpDelta.phoneFilled} imageFilled=${yelpDelta.imageFilled}`);
log(`Web      : processed=${webDelta.processed} websitesFound=${webDelta.websitesFound}`);
log(`Contacts : processed=${contactDelta.processed} emailsFilled=${contactDelta.emailsFilled} phonesFilled=${contactDelta.phonesFilled}`);
log(`Errors   : ${summary.errors}`);
log('Summary written to logs/daily_summary.json');
