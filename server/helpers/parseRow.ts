import type { Company } from '../schema.js';

export function tryParseJSON(str: string | null | undefined, fallback: unknown): unknown {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

export function parseRow(row: Company | null) {
  if (!row) return null;
  return {
    ...row,
    services: tryParseJSON(row.services as string | null, []),
    certifications: tryParseJSON(row.certifications as string | null, []),
    hours: tryParseJSON(row.hours as string | null, row.hours),
    specialties: tryParseJSON((row as Record<string, unknown>).specialties as string | null, []),
    emergencyService: !!row.emergencyService,
    freeEstimate: !!row.freeEstimate,
    insuranceVerified: !!(row as Record<string, unknown>).insuranceVerified,
    backgroundCheck: !!(row as Record<string, unknown>).backgroundCheck,
    verificationStatus: row.verificationStatus || 'unverified',
    // Pass-through real-data fields (null if not yet ingested)
    latitude: (row as Record<string, unknown>).latitude as number | null ?? null,
    longitude: (row as Record<string, unknown>).longitude as number | null ?? null,
    yelpId: (row as Record<string, unknown>).yelpId as string | null ?? null,
    yelpUrl: (row as Record<string, unknown>).yelpUrl as string | null ?? null,
    imageUrl: (row as Record<string, unknown>).imageUrl as string | null ?? null,
    priceRange: (row as Record<string, unknown>).priceRange as string | null ?? null,
    subCategory: (row as Record<string, unknown>).subCategory as string | null ?? null,
    yearsInBusiness: (row as Record<string, unknown>).yearsInBusiness as number | null ?? null,
    licenseStatus: (row as Record<string, unknown>).licenseStatus as string | null ?? null,
    licenseType: (row as Record<string, unknown>).licenseType as string | null ?? null,
    licenseExpiry: (row as Record<string, unknown>).licenseExpiry as string | null ?? null,
    bondAmount: (row as Record<string, unknown>).bondAmount as number | null ?? null,
    responseTime: (row as Record<string, unknown>).responseTime as string | null ?? null,
    dataSource: (row as Record<string, unknown>).dataSource as string ?? 'manual',
    lastUpdated: (row as Record<string, unknown>).lastUpdated as string | null ?? null,
  };
}
