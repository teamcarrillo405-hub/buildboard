import { sqlite } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VerificationStatus = 'unverified' | 'verified' | 'hcc_member';

const VALID_STATUSES: ReadonlySet<string> = new Set<VerificationStatus>([
  'unverified',
  'verified',
  'hcc_member',
]);

export function isValidStatus(value: string): value is VerificationStatus {
  return VALID_STATUSES.has(value);
}

// ---------------------------------------------------------------------------
// Column Migration
// ---------------------------------------------------------------------------

/**
 * Ensure the `verificationStatus` column exists on the companies table.
 * Uses `pragma table_info` to check -- safe to call multiple times.
 */
export function ensureVerificationColumn(): void {
  const columns = sqlite.pragma('table_info(companies)') as { name: string }[];
  const hasColumn = columns.some((col) => col.name === 'verificationStatus');

  if (hasColumn) {
    console.log('[Verification] verificationStatus column already exists');
    return;
  }

  console.log('[Verification] Adding verificationStatus column to companies table...');
  sqlite.exec(
    `ALTER TABLE companies ADD COLUMN verificationStatus TEXT DEFAULT 'unverified'`
  );
  console.log('[Verification] Column added successfully');
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

/**
 * Set the verification status for a single company.
 * Returns true if the row was updated, false if not found.
 */
export function setVerificationStatus(
  companyId: string,
  status: VerificationStatus,
): boolean {
  const result = sqlite
    .prepare('UPDATE companies SET verificationStatus = ? WHERE id = ?')
    .run(status, companyId);
  return result.changes > 0;
}

/**
 * Get the verification status for a single company.
 * Returns 'unverified' if the company is not found or has no status.
 */
export function getVerificationStatus(companyId: string): VerificationStatus {
  const row = sqlite
    .prepare('SELECT verificationStatus FROM companies WHERE id = ?')
    .get(companyId) as { verificationStatus: string | null } | undefined;

  if (!row || !row.verificationStatus) return 'unverified';
  return row.verificationStatus as VerificationStatus;
}

/**
 * Get all company IDs that have a verified or hcc_member status.
 */
export function getVerifiedCompanyIds(): string[] {
  const rows = sqlite
    .prepare(
      `SELECT id FROM companies WHERE verificationStatus IN ('verified', 'hcc_member')`
    )
    .all() as { id: string }[];

  return rows.map((r) => r.id);
}

/**
 * Batch-update verification status for multiple companies.
 * Returns the number of rows actually updated.
 */
export function bulkSetStatus(
  ids: string[],
  status: VerificationStatus,
): number {
  if (ids.length === 0) return 0;

  const update = sqlite.prepare(
    'UPDATE companies SET verificationStatus = ? WHERE id = ?'
  );

  const tx = sqlite.transaction((items: string[]) => {
    let changed = 0;
    for (const id of items) {
      const result = update.run(status, id);
      changed += result.changes;
    }
    return changed;
  });

  return tx(ids);
}

/**
 * Get counts by verification status for admin dashboard.
 */
export function getVerificationStats(): Record<VerificationStatus, number> {
  const rows = sqlite
    .prepare(`
      SELECT
        COALESCE(verificationStatus, 'unverified') as status,
        COUNT(*) as count
      FROM companies
      GROUP BY COALESCE(verificationStatus, 'unverified')
    `)
    .all() as Array<{ status: string; count: number }>;

  const stats: Record<VerificationStatus, number> = {
    unverified: 0,
    verified: 0,
    hcc_member: 0,
  };

  for (const row of rows) {
    if (VALID_STATUSES.has(row.status)) {
      stats[row.status as VerificationStatus] = row.count;
    } else {
      stats.unverified += row.count;
    }
  }

  return stats;
}
