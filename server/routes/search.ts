import { Router } from 'express';
import { like, desc, eq, and, gte, sql, or } from 'drizzle-orm';
import { db } from '../db.js';
import { sqlite } from '../db.js';
import { companies } from '../schema.js';
import { parseRow } from '../helpers/parseRow.js';
import { parseChat, STATE_CODE_TO_NAME } from '../helpers/parseChat.js';
import { ftsSearch, isFtsReady, sanitizeFtsQuery, type SearchFilters } from '../services/fts5.js';
import { matchCategory } from '../helpers/categoryMatcher.js';
import { lookupZip, findZipsWithinRadius } from '../services/zipLookup.js';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: resolve nearby ZIP codes within a radius of a center ZIP.
//
// Uses the bundled `zipcodes` package — fully offline, synchronous, instant.
// No HTTP calls, no DB candidate scanning, no Haversine loops.
// ---------------------------------------------------------------------------

interface SearchArea {
  label: string;
  radiusMiles: number;
  centerLat: number;
  centerLng: number;
}

function resolveNearbyZips(
  zip: string,
  radiusMiles: number,
): { nearbyZips: string[]; searchArea: SearchArea } | null {
  const center = lookupZip(zip);
  if (!center) return null;

  // findZipsWithinRadius uses the bundled zipcodes package — no HTTP, instant.
  const nearbyZips = findZipsWithinRadius(zip, radiusMiles);

  const searchArea: SearchArea = {
    label: `${center.city}, ${center.state} ${center.zip}`,
    radiusMiles,
    centerLat: center.lat,
    centerLng: center.lng,
  };

  return { nearbyZips, searchArea };
}

// GET /api/search -- FTS5 full-text search with structured filters
router.get('/search', async (req, res, next) => {
  try {
    const {
      q = '',
      limit = '20',
      offset = '0',
      sort,
      category,
      state,
      city,
      minRating,
      zip,
      radius = '20',
      loc,
      licenseOnly,
      realOnly,
    } = req.query as Record<string, string>;

    // Determine effective location: explicit zip wins, then loc if it looks
    // like a ZIP, otherwise treat loc as a city/state hint.
    const effectiveZip = zip || (loc && /^\d{5}$/.test(loc.trim()) ? loc.trim() : undefined);
    const radiusMiles = Math.min(200, Math.max(1, parseFloat(radius) || 20));

    // Resolve ZIP radius before the empty-query guard so that a ZIP-only
    // search (no q/category/state/city) still works.
    let nearbyZips: string[] | undefined;
    let searchArea: SearchArea | undefined;

    if (effectiveZip) {
      // resolveNearbyZips is synchronous — uses bundled ZIP data, no HTTP
      const resolved = resolveNearbyZips(effectiveZip, radiusMiles);
      if (resolved) {
        nearbyZips = resolved.nearbyZips;
        searchArea = resolved.searchArea;
        console.log(`[search] ZIP ${effectiveZip} within ${radiusMiles}mi → ${nearbyZips.length} matching ZIPs`);
      }
    }

    // If a non-ZIP loc was provided and we don't have an explicit state/city,
    // treat it as a city hint.
    const effectiveCity = city || (!effectiveZip && loc ? loc.trim() : undefined);

    if (!q.trim() && !category && !state && !effectiveCity && !nearbyZips) {
      return res.json({ companies: [], totalResults: 0, searchTime: 0, suggestions: [], source: 'none' });
    }

    const lim = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const off = Math.max(0, parseInt(offset) || 0);

    // Try FTS5 search first (fast path)
    if (isFtsReady()) {
      // Resolve category using fuzzy matcher
      const resolvedCategory = category ? matchCategory(category) : undefined;

      const filters: SearchFilters = {
        query: q.trim() || undefined,
        category: resolvedCategory || undefined,
        state: state || undefined,
        city: effectiveCity || undefined,
        minRating: minRating ? parseFloat(minRating) : undefined,
        licenseOnly: licenseOnly === 'true' || undefined,
        realOnly: realOnly === 'true' || undefined,
        nearbyZips,
        searchLat: searchArea?.centerLat,
        searchLng: searchArea?.centerLng,
        radiusMiles: searchArea?.radiusMiles,
      };

      const result = ftsSearch(filters, lim, off);

      // Attach exact distanceMi to each result when coordinates are available
      const { haversine } = await import('../services/zipLookup.js');
      const companiesWithDistance = result.companies.map(company => {
        const c = company as Record<string, unknown>;
        const lat = c.latitude as number | null;
        const lng = c.longitude as number | null;
        if (lat && lng && searchArea) {
          const distanceMi = Math.round(haversine(searchArea.centerLat, searchArea.centerLng, lat, lng) * 10) / 10;
          return { ...c, distanceMi };
        }
        return c;
      });

      // Sort by distance when sort=distance and location was provided
      if (sort === 'distance' && searchArea) {
        companiesWithDistance.sort((a, b) => {
          const dA = (a as Record<string, unknown>).distanceMi as number | undefined;
          const dB = (b as Record<string, unknown>).distanceMi as number | undefined;
          if (dA == null && dB == null) return 0;
          if (dA == null) return 1;
          if (dB == null) return -1;
          return dA - dB;
        });
      }

      const suggestions = [...new Set(
        companiesWithDistance.slice(0, 5).map(r => (r as Record<string, unknown>).businessName as string)
      )];

      return res.json({
        companies: companiesWithDistance,
        suggestions,
        totalResults: result.totalResults,
        searchTime: result.searchTime,
        source: result.source,
        ...(searchArea ? { searchArea } : {}),
      });
    }

    // Fallback: LIKE-based search (slow path -- used when FTS5 index is not yet built)
    console.warn('[search] FTS5 index not ready, falling back to LIKE search');
    const searchTerm = `%${q}%`;
    const start = performance.now();

    const rows = await db.select()
      .from(companies)
      .where(
        or(
          like(companies.businessName, searchTerm),
          like(companies.category, searchTerm),
          like(companies.city, searchTerm),
          like(companies.state, searchTerm),
        )
      )
      .orderBy(desc(companies.rating), desc(companies.reviewCount))
      .limit(lim);

    const countResult = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(companies)
      .where(
        or(
          like(companies.businessName, searchTerm),
          like(companies.category, searchTerm),
          like(companies.city, searchTerm),
          like(companies.state, searchTerm),
        )
      );
    const total = countResult[0].cnt;
    const searchTime = Math.round(performance.now() - start);

    const suggestions = [...new Set(rows.slice(0, 5).map(r => r.businessName))];

    res.json({
      companies: rows.map(parseRow),
      suggestions,
      totalResults: total,
      searchTime,
      source: 'like' as const,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/autocomplete?q=elec&limit=8
// Fast typeahead suggestions using FTS5 prefix queries.
// Returns business names and category suggestions.
// ---------------------------------------------------------------------------
router.get('/autocomplete', (req, res) => {
  const { q = '', limit = '8' } = req.query as Record<string, string>;
  const trimmed = q.trim();

  if (trimmed.length < 2) {
    return res.json({ suggestions: [] });
  }

  const lim = Math.min(20, Math.max(1, parseInt(limit) || 8));

  try {
    // Sanitize and build prefix query
    const safe = sanitizeFtsQuery(trimmed);
    if (!safe) return res.json({ suggestions: [] });

    // Use last token as prefix term for responsiveness
    const tokens = safe.split(' ');
    const lastToken = tokens[tokens.length - 1]; // already ends with *
    const prefixQuery = lastToken;

    let businessRows: { businessName: string; city: string; state: string; id: string }[] = [];
    if (isFtsReady()) {
      businessRows = sqlite.prepare(`
        SELECT c.id, c.businessName, c.city, c.state
        FROM companies_fts
        JOIN companies c ON c.rowid = companies_fts.rowid
        WHERE companies_fts MATCH @q
        ORDER BY rank
        LIMIT @lim
      `).all({ q: prefixQuery, lim }) as typeof businessRows;
    }

    // Category suggestions: match category names by prefix
    const catRows = sqlite.prepare(`
      SELECT DISTINCT category
      FROM companies
      WHERE UPPER(category) LIKE @pat
      LIMIT 4
    `).all({ pat: `${trimmed.toUpperCase()}%` }) as { category: string }[];

    const suggestions = [
      ...catRows.map(r => ({ label: r.category, type: 'category' as const })),
      ...businessRows.map(r => ({
        label: r.businessName,
        type: 'business' as const,
        city: r.city,
        state: r.state,
        id: r.id,
      })),
    ].slice(0, lim);

    res.json({ suggestions });
  } catch {
    res.json({ suggestions: [] });
  }
});

// GET /api/chat -- Rule-based chat search (unchanged, Plan 02 will enhance)
router.get('/chat', async (req, res, _next) => {
  const { message = '' } = req.query as Record<string, string>;
  if (!message.trim()) return res.json({ text: "Hi! I'm the BuildBoard Assistant. Ask me to find contractors, compare companies, or get stats about our directory.", companies: [] });

  const parsed = parseChat(message);

  // Build WHERE conditions
  const conditions = [];

  if (parsed.category) conditions.push(eq(companies.category, parsed.category));
  if (parsed.state) conditions.push(eq(companies.state, parsed.state));
  if (parsed.city) conditions.push(sql`LOWER(${companies.city}) = LOWER(${parsed.city})`);
  if (parsed.minRating) conditions.push(gte(companies.rating, parsed.minRating));
  if (parsed.emergency) conditions.push(sql`${companies.emergencyService} = 1`);
  if (parsed.freeEstimate) conditions.push(sql`${companies.freeEstimate} = 1`);
  if (parsed.warranty) conditions.push(sql`${companies.warranty} IS NOT NULL AND ${companies.warranty} != ''`);

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  try {
    // Stats intent
    if (parsed.intent === 'stats') {
      const countResult = await db.select({
        cnt: sql<number>`COUNT(*)`,
        avgRating: sql<number>`ROUND(AVG(${companies.rating}), 1)`,
      })
        .from(companies)
        .where(whereClause);

      const cnt = countResult[0].cnt;
      const avg = countResult[0].avgRating;

      const descParts: string[] = [];
      if (parsed.category) descParts.push(parsed.category.toLowerCase());
      if (parsed.city) descParts.push(`in ${parsed.city}`);
      if (parsed.state) descParts.push(`in ${STATE_CODE_TO_NAME[parsed.state] || parsed.state}`);

      const text = cnt === 0
        ? `I couldn't find any ${descParts.join(' ') || 'companies'} matching that description.`
        : `There are **${cnt.toLocaleString()} ${descParts.join(' ') || 'companies'}** in our directory with an average rating of **${avg} stars**.`;

      return res.json({ text, companies: [] });
    }

    // Find / Compare / Recommend
    const rows = await db.select()
      .from(companies)
      .where(whereClause)
      .orderBy(desc(companies.rating), desc(companies.reviewCount))
      .limit(5);

    const totalResult = await db.select({ cnt: sql<number>`COUNT(*)` })
      .from(companies)
      .where(whereClause);
    const total = totalResult[0].cnt;

    if (rows.length === 0) {
      // Fallback: try a LIKE search on the original message
      const fallbackTerm = `%${message.trim()}%`;
      const fallbackRows = await db.select()
        .from(companies)
        .where(
          or(
            like(companies.businessName, fallbackTerm),
            like(companies.category, fallbackTerm),
            like(companies.city, fallbackTerm),
          )
        )
        .orderBy(desc(companies.rating), desc(companies.reviewCount))
        .limit(5);

      const fallbackCountResult = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(companies)
        .where(
          or(
            like(companies.businessName, fallbackTerm),
            like(companies.category, fallbackTerm),
            like(companies.city, fallbackTerm),
          )
        );
      const fallbackTotal = fallbackCountResult[0].cnt;

      if (fallbackRows.length === 0) {
        return res.json({ text: "I couldn't find any companies matching that description. Try being more specific \u2014 mention a trade (plumber, electrician, roofer) and a location.", companies: [] });
      }

      return res.json({
        text: `I found **${fallbackTotal.toLocaleString()} results** for "${message.trim()}". Here are the top rated:`,
        companies: fallbackRows.map(parseRow),
      });
    }

    // Build response text
    const descParts: string[] = [];
    if (parsed.category) descParts.push(`**${parsed.category}**`);
    if (parsed.city) descParts.push(`in **${parsed.city}**`);
    if (parsed.state) descParts.push(`in **${STATE_CODE_TO_NAME[parsed.state] || parsed.state}**`);
    if (parsed.emergency) descParts.push('with **emergency service**');
    if (parsed.freeEstimate) descParts.push('offering **free estimates**');
    if (parsed.warranty) descParts.push('with **warranty**');

    let text;
    if (parsed.intent === 'compare') {
      const best = rows[0];
      text = `The top-rated ${descParts.join(' ') || 'company'} is **${best.businessName}** with a **${best.rating} star** rating (${best.reviewCount} reviews).`;
      if (total > 1) text += ` Found ${total.toLocaleString()} total.`;
    } else {
      text = `Found **${total.toLocaleString()}** ${descParts.join(' ') || 'companies'}. Here are the top rated:`;
    }

    if (total > 5) text += `\n\nWant to see all results? Try refining with a city, rating, or feature like "free estimates".`;

    res.json({ text, companies: rows.map(parseRow) });
  } catch (err) {
    console.error('Chat error:', err);
    res.json({ text: "Sorry, something went wrong. Try rephrasing your question.", companies: [] });
  }
});

export default router;
