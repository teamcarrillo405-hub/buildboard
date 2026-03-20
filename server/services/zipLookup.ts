/**
 * ZIP Code lookup service — fully offline, zero HTTP.
 *
 * Uses the `zipcodes` npm package which ships a bundled JSON of all ~42K
 * US ZIP codes with lat/lng.  All functions are synchronous and instant;
 * no external API is needed.
 *
 * Key exports:
 *   lookupZip(zip)                  → ZipInfo | null
 *   findZipsWithinRadius(zip, mi)   → string[]   (uses built-in radius query)
 *   haversine(lat1, lng1, lat2, lng2) → miles
 *   boundingBox(lat, lng, mi)       → bounding box for pre-filtering
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// CJS interop — `zipcodes` ships CommonJS with a bundled JSON database.
interface ZipcodesEntry {
  zip: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
}

interface ZipcodesLib {
  lookup: (zip: string) => ZipcodesEntry | undefined;
  /** Returns ZIP strings within radiusMiles of the given ZIP. */
  radius: (zip: string, radiusMiles: number) => string[];
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const zipData: ZipcodesLib = require('zipcodes');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZipInfo {
  zip: string;
  city: string;
  state: string; // 2-letter abbreviation, e.g. "OR"
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up coordinates for a 5-digit US ZIP code.
 * Returns null if the ZIP is unknown.
 * Synchronous — uses bundled local data, no HTTP.
 */
export function lookupZip(zip: string): ZipInfo | null {
  const cleaned = zip.trim();
  if (!/^\d{5}$/.test(cleaned)) return null;
  const entry = zipData.lookup(cleaned);
  if (!entry) return null;
  return {
    zip: cleaned,
    city: entry.city,
    state: entry.state,
    lat: entry.latitude,
    lng: entry.longitude,
  };
}

/**
 * Return all US ZIP codes whose center falls within `radiusMiles` of
 * the given center ZIP.
 * Synchronous — uses the `zipcodes` package's built-in radius query.
 */
export function findZipsWithinRadius(
  centerZip: string,
  radiusMiles: number,
): string[] {
  return zipData.radius(centerZip, radiusMiles) ?? [];
}

/**
 * No-op kept for API compatibility — disk cache is no longer used since
 * all ZIP data is bundled locally.
 */
export function saveZipCache(): void {
  // intentional no-op
}

// ---------------------------------------------------------------------------
// Haversine distance (kept for potential direct use)
// ---------------------------------------------------------------------------

/**
 * Return the great-circle distance in miles between two WGS-84 points.
 */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Given a center point and a radius in miles, return an approximate bounding
 * box.  Useful to pre-filter rows before calling haversine() on each.
 */
export function boundingBox(
  lat: number,
  lng: number,
  radiusMiles: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusMiles / 69.0;
  const lngDelta = radiusMiles / (69.0 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}
