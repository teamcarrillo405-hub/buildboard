/**
 * CA CSLB (Contractors State License Board) license enrichment pipeline.
 *
 * Downloads / parses the CSLB bulk CSV and enriches companies in our DB
 * with real license status, type, expiry date, bond amount, and insurance data.
 *
 * Data source: https://www.cslb.ca.gov/Resources/Licensee-Download/
 *   → Download "All Active and Inactive Licenses" CSV (~350K rows)
 *   → Place at server/data/cslb_active.csv before running
 *
 * Match strategy (in priority order):
 *   1. Exact licenseNumber match (most reliable — ~60-70% of Yelp CA contractors)
 *   2. businessName exact + zipCode match (fuzzy fallback — ~20% additional)
 *
 * Usage: POST /api/admin/sync-cslb  (or provide csvPath in body)
 */

import fs from 'fs';
import readline from 'readline';
import { sqlite } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CslbRecord {
  licenseNumber: string;
  businessName: string;
  zipCode: string;
  licenseType: string;      // e.g. "B - General Building Contractor"
  status: string;           // e.g. "ACTIVE", "EXPIRED", "SUSPENDED"
  issueDate: string;        // MM/DD/YYYY
  expireDate: string;       // MM/DD/YYYY
  bondAmount: number;       // numeric USD
  hasWorkersComp: boolean;  // true = has workers comp insurance
}

export interface EnrichStats {
  totalCslbRecords: number;
  matchedByLicense: number;
  matchedByName: number;
  updated: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// CSLB CSV Parser
// ---------------------------------------------------------------------------

// Known CSLB CSV column positions (may vary by download date — detect from header)
const KNOWN_HEADERS: Record<string, string[]> = {
  licenseNumber:  ['LICENSE_NUMBER', 'LIC_NUM', 'LICENSE NUMBER'],
  businessName:   ['BUSINESS_NAME', 'BUS_NAME', 'FIRM_NAME', 'BUSINESS NAME'],
  zipCode:        ['ZIP', 'ZIP_CODE', 'MAILING_ZIP'],
  licenseType:    ['LICENSE_TYPE', 'CLASSIFICATION', 'LIC_TYPE'],
  status:         ['STATUS', 'LIC_STATUS', 'LICENSE_STATUS'],
  issueDate:      ['ISSUE_DATE', 'ORIGINAL_ISSUE_DATE'],
  expireDate:     ['EXPIRE_DATE', 'EXPIRATION_DATE'],
  bondAmount:     ['BOND_AMT', 'BOND_AMOUNT'],
  workersComp:    ['WORKERS_COMP_INSURANCE_WAIVER', 'WC_WAIVER', 'WORKERS_COMP'],
};

function detectColumns(headerLine: string): Record<string, number> | null {
  const headers = headerLine.split(',').map(h => h.replace(/"/g, '').trim().toUpperCase());
  const colMap: Record<string, number> = {};

  for (const [field, candidates] of Object.entries(KNOWN_HEADERS)) {
    for (const candidate of candidates) {
      const idx = headers.indexOf(candidate);
      if (idx !== -1) {
        colMap[field] = idx;
        break;
      }
    }
  }

  // licenseNumber and businessName are required
  if (colMap.licenseNumber === undefined || colMap.businessName === undefined) {
    return null;
  }
  return colMap;
}

function parseStatus(raw: string): string {
  const s = raw.toUpperCase().trim();
  if (s === 'ACTIVE' || s.startsWith('ACT')) return 'active';
  if (s === 'EXPIRED' || s.startsWith('EXP')) return 'expired';
  if (s === 'SUSPENDED' || s.startsWith('SUS')) return 'suspended';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  return s.toLowerCase();
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Convert MM/DD/YYYY to YYYY-MM-DD
  const parts = raw.trim().split('/');
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return raw.trim() || null;
}

/**
 * Stream-parse a CSLB CSV file and return all records.
 * Uses readline to avoid loading the entire ~40MB file into memory.
 */
export async function loadCslbData(csvPath: string): Promise<CslbRecord[]> {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSLB CSV not found at: ${csvPath}. Download from https://www.cslb.ca.gov/Resources/Licensee-Download/`);
  }

  const records: CslbRecord[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, 'utf-8'),
    crlfDelay: Infinity,
  });

  let colMap: Record<string, number> | null = null;
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) {
      colMap = detectColumns(line);
      if (!colMap) throw new Error(`Cannot detect required columns in CSLB CSV header: ${line.slice(0, 200)}`);
      continue;
    }

    if (!colMap || !line.trim()) continue;

    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());

    const licenseNumber = cols[colMap.licenseNumber] ?? '';
    const businessName = cols[colMap.businessName] ?? '';
    if (!licenseNumber || !businessName) continue;

    records.push({
      licenseNumber,
      businessName: businessName.toUpperCase(),
      zipCode: cols[colMap.zipCode ?? -1] ?? '',
      licenseType: cols[colMap.licenseType ?? -1] ?? '',
      status: parseStatus(cols[colMap.status ?? -1] ?? ''),
      issueDate: parseDate(cols[colMap.issueDate ?? -1] ?? '') ?? '',
      expireDate: parseDate(cols[colMap.expireDate ?? -1] ?? '') ?? '',
      bondAmount: parseFloat(cols[colMap.bondAmount ?? -1] ?? '0') || 0,
      // WORKERS_COMP_INSURANCE_WAIVER = 'N' means they HAVE workers comp (no waiver)
      hasWorkersComp: (cols[colMap.workersComp ?? -1] ?? '').toUpperCase() === 'N',
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Database enrichment
// ---------------------------------------------------------------------------

// Lazy-initialized prepared statements — deferred to first use so that the
// migration adding licenseStatus/licenseType/etc. columns runs before prepare().
let _updateByLicenseStmt: ReturnType<typeof sqlite.prepare> | null = null;
function getUpdateByLicenseStmt() {
  if (!_updateByLicenseStmt) {
    _updateByLicenseStmt = sqlite.prepare(`
      UPDATE companies SET
        licenseStatus    = @licenseStatus,
        licenseType      = @licenseType,
        licenseExpiry    = @licenseExpiry,
        bondAmount       = @bondAmount,
        insuranceVerified = @insuranceVerified,
        verificationStatus = CASE WHEN @licenseStatus = 'active' THEN 'verified' ELSE verificationStatus END,
        lastUpdated      = @lastUpdated
      WHERE licenseNumber = @licenseNumber
        AND licenseNumber IS NOT NULL
        AND licenseNumber != ''
    `);
  }
  return _updateByLicenseStmt;
}

let _updateByNameStmt: ReturnType<typeof sqlite.prepare> | null = null;
function getUpdateByNameStmt() {
  if (!_updateByNameStmt) {
    _updateByNameStmt = sqlite.prepare(`
      UPDATE companies SET
        licenseStatus    = @licenseStatus,
        licenseType      = @licenseType,
        licenseExpiry    = @licenseExpiry,
        bondAmount       = @bondAmount,
        insuranceVerified = @insuranceVerified,
        verificationStatus = CASE WHEN @licenseStatus = 'active' THEN 'verified' ELSE verificationStatus END,
        lastUpdated      = @lastUpdated
      WHERE UPPER(businessName) = @businessName
        AND zipCode LIKE @zipPattern
        AND (licenseStatus IS NULL OR licenseStatus = '')
    `);
  }
  return _updateByNameStmt;
}

/**
 * Enrich companies in the DB from loaded CSLB records.
 */
export function enrichFromCslb(records: CslbRecord[]): EnrichStats {
  const stats: EnrichStats = {
    totalCslbRecords: records.length,
    matchedByLicense: 0,
    matchedByName: 0,
    updated: 0,
    errors: 0,
  };

  const now = new Date().toISOString();

  const batchEnrich = sqlite.transaction((recs: CslbRecord[]) => {
    for (const rec of recs) {
      try {
        const enrichData = {
          licenseStatus: rec.status,
          licenseType: rec.licenseType || null,
          licenseExpiry: rec.expireDate || null,
          bondAmount: rec.bondAmount || null,
          insuranceVerified: rec.hasWorkersComp ? 1 : 0,
          lastUpdated: now,
        };

        // Strategy 1: exact license number match
        const r1 = getUpdateByLicenseStmt().run({ ...enrichData, licenseNumber: rec.licenseNumber });
        if (r1.changes > 0) {
          stats.matchedByLicense++;
          stats.updated += r1.changes;
          continue;
        }

        // Strategy 2: business name + zip prefix match
        const zipPrefix = rec.zipCode.slice(0, 5);
        if (zipPrefix.length === 5) {
          const r2 = getUpdateByNameStmt().run({
            ...enrichData,
            businessName: rec.businessName,
            zipPattern: `${zipPrefix}%`,
          });
          if (r2.changes > 0) {
            stats.matchedByName++;
            stats.updated += r2.changes;
          }
        }
      } catch {
        stats.errors++;
      }
    }
  });

  batchEnrich(records);
  return stats;
}

/**
 * Load and apply CSLB enrichment from a CSV file.
 * Used by the admin route POST /api/admin/sync-cslb.
 */
export async function runCslbEnrichment(csvPath: string): Promise<EnrichStats> {
  console.log(`[cslbSync] Loading CSLB data from ${csvPath}...`);
  const records = await loadCslbData(csvPath);
  console.log(`[cslbSync] Loaded ${records.length.toLocaleString()} CSLB records. Enriching DB...`);
  const stats = enrichFromCslb(records);
  console.log(`[cslbSync] Done: ${stats.matchedByLicense} by license#, ${stats.matchedByName} by name, ${stats.updated} total updated`);
  return stats;
}
