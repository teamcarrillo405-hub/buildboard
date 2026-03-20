#!/usr/bin/env node
/**
 * BuildBoard API Server
 * Express + SQLite backend for 3.4M construction firms
 */

import Database from 'better-sqlite3';
import express from 'express';
import cors from 'cors';
import { resolve } from 'path';

const DB_PATH = resolve(import.meta.dirname, 'constructflix.db');
const PORT = process.env.PORT || 3001;

const db = new Database(DB_PATH, { readonly: true });
db.pragma('journal_mode = WAL');

const app = express();
app.use(cors());
app.use(express.json());

// Helper: parse JSON fields from DB rows
function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    services: tryParseJSON(row.services, []),
    certifications: tryParseJSON(row.certifications, []),
    hours: tryParseJSON(row.hours, row.hours),
    emergencyService: !!row.emergencyService,
    freeEstimate: !!row.freeEstimate,
  };
}

function tryParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ==================== COMPANIES ====================

// GET /api/companies - paginated, filtered, sorted
app.get('/api/companies', (req, res) => {
  const {
    page = 1, limit = 20, sort = 'relevance',
    category, state, city, location, search,
    minRating, maxRating,
  } = req.query;

  const p = Math.max(1, parseInt(page));
  const lim = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (p - 1) * lim;

  let where = [];
  let params = [];

  if (category) { where.push('category = ?'); params.push(category); }
  if (state) { where.push('state = ?'); params.push(state); }
  if (city) { where.push('city = ?'); params.push(city); }
  if (location) {
    where.push('(city LIKE ? OR state LIKE ? OR location LIKE ?)');
    const loc = `%${location}%`;
    params.push(loc, loc, loc);
  }
  if (search) {
    where.push('(businessName LIKE ? OR category LIKE ? OR city LIKE ? OR state LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (minRating) { where.push('rating >= ?'); params.push(parseFloat(minRating)); }
  if (maxRating) { where.push('rating <= ?'); params.push(parseFloat(maxRating)); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // Sort
  let orderBy = 'ORDER BY rating DESC, reviewCount DESC';
  switch (sort) {
    case 'rating_desc': orderBy = 'ORDER BY rating DESC'; break;
    case 'rating_asc': orderBy = 'ORDER BY rating ASC'; break;
    case 'reviews_desc': orderBy = 'ORDER BY reviewCount DESC'; break;
    case 'reviews_asc': orderBy = 'ORDER BY reviewCount ASC'; break;
    case 'name_asc': orderBy = 'ORDER BY businessName ASC'; break;
    case 'name_desc': orderBy = 'ORDER BY businessName DESC'; break;
  }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM companies ${whereClause}`).get(...params).cnt;
  const totalPages = Math.ceil(total / lim);
  const rows = db.prepare(
    `SELECT * FROM companies ${whereClause} ${orderBy} LIMIT ? OFFSET ?`
  ).all(...params, lim, offset);

  res.json({
    data: rows.map(parseRow),
    total,
    page: p,
    limit: lim,
    totalPages,
    hasNextPage: p < totalPages,
    hasPrevPage: p > 1,
  });
});

// GET /api/companies/:id
app.get('/api/companies/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});

// GET /api/search
app.get('/api/search', (req, res) => {
  const { q = '', limit = 20 } = req.query;
  if (!q.trim()) return res.json({ companies: [], totalResults: 0 });

  const lim = Math.min(100, parseInt(limit));
  const searchTerm = `%${q}%`;

  const rows = db.prepare(`
    SELECT * FROM companies
    WHERE businessName LIKE ? OR category LIKE ? OR city LIKE ? OR state LIKE ?
    ORDER BY rating DESC, reviewCount DESC
    LIMIT ?
  `).all(searchTerm, searchTerm, searchTerm, searchTerm, lim);

  const total = db.prepare(`
    SELECT COUNT(*) as cnt FROM companies
    WHERE businessName LIKE ? OR category LIKE ? OR city LIKE ? OR state LIKE ?
  `).get(searchTerm, searchTerm, searchTerm, searchTerm).cnt;

  const suggestions = [...new Set(rows.slice(0, 5).map(r => r.businessName))];

  res.json({
    companies: rows.map(parseRow),
    suggestions,
    totalResults: total,
  });
});

// ==================== FEATURED / TOP / NEW ====================

app.get('/api/featured', (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit || 10));
  const rows = db.prepare(
    'SELECT * FROM companies ORDER BY rating DESC, reviewCount DESC LIMIT ?'
  ).all(limit);
  res.json(rows.map(parseRow));
});

app.get('/api/top-rated', (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit || 10));
  const rows = db.prepare(
    'SELECT * FROM companies WHERE rating >= 4.5 ORDER BY rating DESC, reviewCount DESC LIMIT ?'
  ).all(limit);
  res.json(rows.map(parseRow));
});

app.get('/api/new', (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit || 10));
  const rows = db.prepare(
    'SELECT * FROM companies ORDER BY importedAt DESC LIMIT ?'
  ).all(limit);
  res.json(rows.map(parseRow));
});

// GET /api/similar/:id
app.get('/api/similar/:id', (req, res) => {
  const limit = Math.min(20, parseInt(req.query.limit || 6));
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.json([]);

  const rows = db.prepare(`
    SELECT * FROM companies
    WHERE id != ? AND (category = ? OR city = ?)
    ORDER BY rating DESC
    LIMIT ?
  `).all(company.id, company.category, company.city, limit);

  res.json(rows.map(parseRow));
});

// GET /api/companies-by-state - top companies grouped by state
app.get('/api/companies-by-state', (req, res) => {
  const { states = '', limit = 10 } = req.query;
  const stateList = states.split(',').map(s => s.trim()).filter(Boolean);
  const lim = Math.min(20, Math.max(1, parseInt(limit)));

  if (stateList.length === 0) return res.json({});

  const result = {};
  for (const state of stateList.slice(0, 10)) {
    const rows = db.prepare(
      'SELECT * FROM companies WHERE state = ? ORDER BY rating DESC, reviewCount DESC LIMIT ?'
    ).all(state, lim);
    result[state] = rows.map(parseRow);
  }

  res.json(result);
});

// ==================== FILTERS & STATS ====================

app.get('/api/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT category as name, COUNT(*) as companyCount, ROUND(AVG(rating), 1) as avgRating
    FROM companies
    GROUP BY category
    ORDER BY companyCount DESC
  `).all();
  res.json(rows);
});

app.get('/api/states', (req, res) => {
  const rows = db.prepare(`
    SELECT state as code, state as name, COUNT(*) as companyCount
    FROM companies
    WHERE state != ''
    GROUP BY state
    ORDER BY companyCount DESC
  `).all();
  res.json(rows);
});

app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as cnt FROM companies').get().cnt;
  const categories = db.prepare('SELECT COUNT(DISTINCT category) as cnt FROM companies').get().cnt;
  const states = db.prepare("SELECT COUNT(DISTINCT state) as cnt FROM companies WHERE state != ''").get().cnt;
  const avgRating = db.prepare('SELECT ROUND(AVG(rating), 1) as avg FROM companies').get().avg;
  const totalReviews = db.prepare('SELECT SUM(reviewCount) as total FROM companies').get().total;

  res.json({
    totalCompanies: total,
    totalCategories: categories,
    totalStates: states,
    averageRating: avgRating,
    totalReviews: totalReviews,
  });
});

// ==================== CHAT ASSISTANT ====================

// Category synonym mapping for natural language parsing
const CATEGORY_SYNONYMS = {
  'plumber': 'Plumbing', 'plumbing': 'Plumbing', 'plumbers': 'Plumbing', 'pipe': 'Plumbing',
  'electrician': 'Electrical Contractors', 'electrical': 'Electrical Contractors', 'electric': 'Electrical Contractors', 'wiring': 'Electrical Contractors',
  'roofer': 'Roofing Contractors', 'roofing': 'Roofing Contractors', 'roof': 'Roofing Contractors',
  'hvac': 'HVAC Contractor', 'heating': 'HVAC Contractor', 'air conditioning': 'HVAC Contractor', 'ac': 'HVAC Contractor',
  'concrete': 'Masonry Contractors', 'masonry': 'Masonry Contractors', 'mason': 'Masonry Contractors', 'brick': 'Masonry Contractors',
  'foundation': 'Foundation', 'foundations': 'Foundation',
  'landscaping': 'Landscaping Contractor', 'landscaper': 'Landscaping Contractor', 'lawn': 'Landscaping Contractor', 'yard': 'Landscaping Contractor',
  'painter': 'Painting Contractor', 'painting': 'Painting Contractor', 'paint': 'Painting Contractor',
  'carpenter': 'Finish Carpentry Contractors', 'carpentry': 'Finish Carpentry Contractors', 'woodwork': 'Finish Carpentry Contractors',
  'flooring': 'Flooring Contractors', 'floor': 'Flooring Contractors', 'tile': 'Tile and Terrazzo Contractors',
  'drywall': 'Drywall and Insulation Contractors', 'insulation': 'Drywall and Insulation Contractors',
  'siding': 'Siding Contractors',
  'commercial': 'Commercial Building Construction', 'commercial construction': 'Commercial Building Construction',
  'residential': 'Residential Remodelers', 'remodel': 'Residential Remodelers', 'remodeling': 'Residential Remodelers', 'renovation': 'Residential Remodelers',
  'general contractor': 'General Contractor', 'gc': 'General Contractor',
  'demolition': 'Demolition Contractor', 'demo': 'Demolition Contractor',
  'fencing': 'Fence Contractor', 'fence': 'Fence Contractor',
  'gutter': 'Gutter Contractor', 'gutters': 'Gutter Contractor',
  'welding': 'Welding Contractor', 'welder': 'Welding Contractor',
  'deck': 'Deck Builder', 'decks': 'Deck Builder', 'patio': 'Deck and Patio Builders',
  'kitchen': 'Kitchen remodeling contractors', 'bathroom': 'Bathroom remodeling contractors',
  'window': 'Window and Door Contractor', 'windows': 'Window and Door Contractor', 'door': 'Window and Door Contractor',
  'solar': 'Solar panel installation', 'solar panel': 'Solar panel installation',
  'paving': 'Asphalt Paving Contractor', 'asphalt': 'Asphalt Paving Contractor',
  'excavation': 'Excavation Contractor', 'excavating': 'Excavation Contractor',
};

// US state name → code mapping
const STATE_MAP = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};
// Also map abbreviations
const STATE_CODES = new Set(Object.values(STATE_MAP));
const STATE_CODE_TO_NAME = Object.fromEntries(Object.entries(STATE_MAP).map(([name, code]) => [code, name.replace(/\b\w/g, c => c.toUpperCase())]));

function parseChat(message) {
  const lower = message.toLowerCase().trim();
  const result = { intent: 'find', category: null, state: null, city: null, minRating: null, emergency: false, freeEstimate: false, warranty: false, sortBest: false };

  // Detect intent
  if (/how many|count|total|number of/.test(lower)) result.intent = 'stats';
  else if (/best|top|highest.?rated|compare|#1|number one/.test(lower)) { result.intent = 'compare'; result.sortBest = true; }
  else if (/recommend|suggest|help me find|i need|looking for|who can|where can/.test(lower)) result.intent = 'recommend';
  else result.intent = 'find';

  // Extract category (try multi-word first, then single-word)
  const sortedSynonyms = Object.keys(CATEGORY_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const synonym of sortedSynonyms) {
    if (lower.includes(synonym)) {
      result.category = CATEGORY_SYNONYMS[synonym];
      break;
    }
  }

  // Extract state — check full names first, then 2-letter codes
  for (const [name, code] of Object.entries(STATE_MAP)) {
    if (lower.includes(name)) { result.state = code; break; }
  }
  if (!result.state) {
    const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length === 2 && STATE_CODES.has(w.toUpperCase())) { result.state = w.toUpperCase(); break; }
    }
  }

  // Extract city — look for "in [City]" pattern, exclude state names
  const inMatch = lower.match(/\bin\s+([a-z][a-z\s]{2,30})(?:,|\s|$)/);
  if (inMatch) {
    let candidate = inMatch[1].trim();
    // Remove trailing state name/code
    for (const [name] of Object.entries(STATE_MAP)) {
      if (candidate.endsWith(name)) candidate = candidate.replace(name, '').trim();
    }
    candidate = candidate.replace(/\b[a-z]{2}$/i, '').trim();
    // Don't use it if it's a category synonym or state name
    if (candidate && !CATEGORY_SYNONYMS[candidate] && !STATE_MAP[candidate] && candidate.length > 1) {
      result.city = candidate.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Extract features
  if (/emergency|urgent|asap|24.?7|immediate/.test(lower)) result.emergency = true;
  if (/free estimate|free quote|no.?cost estimate/.test(lower)) result.freeEstimate = true;
  if (/warranty|guarantee/.test(lower)) result.warranty = true;

  // Extract rating
  if (/highly rated|good review|well.?rated|4\.5|five star|5 star/.test(lower)) result.minRating = 4.5;
  else if (/good|decent|4 star|4\.0/.test(lower) && !/no good/.test(lower)) result.minRating = 4.0;

  // Best/top implies sort by rating
  if (/best|top|highest|#1/.test(lower)) result.sortBest = true;

  return result;
}

app.get('/api/chat', (req, res) => {
  const { message = '' } = req.query;
  if (!message.trim()) return res.json({ text: "Hi! I'm the BuildBoard Assistant. Ask me to find contractors, compare companies, or get stats about our directory.", companies: [] });

  const parsed = parseChat(message);

  // Build WHERE clause
  const where = [];
  const params = [];

  if (parsed.category) { where.push('category = ?'); params.push(parsed.category); }
  if (parsed.state) { where.push('state = ?'); params.push(parsed.state); }
  if (parsed.city) { where.push('LOWER(city) = LOWER(?)'); params.push(parsed.city); }
  if (parsed.minRating) { where.push('rating >= ?'); params.push(parsed.minRating); }
  if (parsed.emergency) { where.push('emergencyService = 1'); }
  if (parsed.freeEstimate) { where.push('freeEstimate = 1'); }
  if (parsed.warranty) { where.push("warranty IS NOT NULL AND warranty != ''"); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    // Stats intent
    if (parsed.intent === 'stats') {
      const countResult = db.prepare(`SELECT COUNT(*) as cnt, ROUND(AVG(rating), 1) as avgRating FROM companies ${whereClause}`).get(...params);
      const cnt = countResult.cnt;
      const avg = countResult.avgRating;

      let desc = [];
      if (parsed.category) desc.push(parsed.category.toLowerCase());
      if (parsed.city) desc.push(`in ${parsed.city}`);
      if (parsed.state) desc.push(`in ${STATE_CODE_TO_NAME[parsed.state] || parsed.state}`);

      const text = cnt === 0
        ? `I couldn't find any ${desc.join(' ') || 'companies'} matching that description.`
        : `There are **${cnt.toLocaleString()} ${desc.join(' ') || 'companies'}** in our directory with an average rating of **${avg} stars**.`;

      return res.json({ text, companies: [] });
    }

    // Find / Compare / Recommend
    const orderBy = 'ORDER BY rating DESC, reviewCount DESC';
    const rows = db.prepare(`SELECT * FROM companies ${whereClause} ${orderBy} LIMIT 5`).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM companies ${whereClause}`).get(...params).cnt;

    if (rows.length === 0) {
      // Fallback: try a LIKE search on the original message
      const fallbackTerm = `%${message.trim()}%`;
      const fallbackRows = db.prepare(`SELECT * FROM companies WHERE businessName LIKE ? OR category LIKE ? OR city LIKE ? ORDER BY rating DESC, reviewCount DESC LIMIT 5`).all(fallbackTerm, fallbackTerm, fallbackTerm);
      const fallbackTotal = db.prepare(`SELECT COUNT(*) as cnt FROM companies WHERE businessName LIKE ? OR category LIKE ? OR city LIKE ?`).get(fallbackTerm, fallbackTerm, fallbackTerm).cnt;

      if (fallbackRows.length === 0) {
        return res.json({ text: "I couldn't find any companies matching that description. Try being more specific — mention a trade (plumber, electrician, roofer) and a location.", companies: [] });
      }

      return res.json({
        text: `I found **${fallbackTotal.toLocaleString()} results** for "${message.trim()}". Here are the top rated:`,
        companies: fallbackRows.map(parseRow),
      });
    }

    // Build response text
    let desc = [];
    if (parsed.category) desc.push(`**${parsed.category}**`);
    if (parsed.city) desc.push(`in **${parsed.city}**`);
    if (parsed.state) desc.push(`in **${STATE_CODE_TO_NAME[parsed.state] || parsed.state}**`);
    if (parsed.emergency) desc.push('with **emergency service**');
    if (parsed.freeEstimate) desc.push('offering **free estimates**');
    if (parsed.warranty) desc.push('with **warranty**');

    let text;
    if (parsed.intent === 'compare') {
      const best = rows[0];
      text = `The top-rated ${desc.join(' ') || 'company'} is **${best.businessName}** with a **${best.rating} star** rating (${best.reviewCount} reviews).`;
      if (total > 1) text += ` Found ${total.toLocaleString()} total.`;
    } else {
      text = `Found **${total.toLocaleString()}** ${desc.join(' ') || 'companies'}. Here are the top rated:`;
    }

    if (total > 5) text += `\n\nWant to see all results? Try refining with a city, rating, or feature like "free estimates".`;

    res.json({ text, companies: rows.map(parseRow) });
  } catch (err) {
    console.error('Chat error:', err);
    res.json({ text: "Sorry, something went wrong. Try rephrasing your question.", companies: [] });
  }
});

// ==================== START ====================

app.listen(PORT, () => {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM companies').get().cnt;
  console.log(`\nBuildBoard API running on http://localhost:${PORT}`);
  console.log(`  Database: ${count.toLocaleString()} companies`);
  console.log(`  Endpoints:`);
  console.log(`    GET /api/companies?page=1&limit=20&category=&state=&search=`);
  console.log(`    GET /api/companies/:id`);
  console.log(`    GET /api/search?q=&limit=20`);
  console.log(`    GET /api/featured`);
  console.log(`    GET /api/top-rated`);
  console.log(`    GET /api/companies-by-state?states=TX,CA&limit=10`);
  console.log(`    GET /api/categories`);
  console.log(`    GET /api/states`);
  console.log(`    GET /api/stats`);
});
