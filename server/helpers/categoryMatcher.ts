import { sqlite } from '../db.js';
import { CATEGORY_SYNONYMS } from './parseChat.js';
import { CATEGORY_TO_IMAGE_SLUG } from '../data/category-map.js';

// ---------------------------------------------------------------------------
// Category Cache
// ---------------------------------------------------------------------------

let cachedCategories: string[] | null = null;

/**
 * Returns the full list of distinct categories from the database (cached).
 */
export function getValidCategories(): string[] {
  if (cachedCategories) return cachedCategories;

  const rows = sqlite.prepare(
    `SELECT DISTINCT category FROM companies WHERE category IS NOT NULL ORDER BY category`
  ).all() as { category: string }[];

  cachedCategories = rows.map(r => r.category);
  return cachedCategories;
}

// ---------------------------------------------------------------------------
// Category Matching
// ---------------------------------------------------------------------------

/**
 * Maps an AI-returned or user-typed category string to an actual database category.
 *
 * Priority:
 *   1. Exact match (case-insensitive) against DB categories
 *   2. CATEGORY_SYNONYMS lookup from parseChat.ts
 *   3. Prefix match (e.g., "Plumbing" matches "Plumbing Contractor")
 *   4. CATEGORY_TO_IMAGE_SLUG keys for normalized group matching
 *   5. null if no match
 */
export function matchCategory(input: string): string | null {
  if (!input || !input.trim()) return null;

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const categories = getValidCategories();

  // 1. Exact match (case-insensitive) — but prefer a shorter parent category
  // if one exists. e.g. "Electrical Contractors" exact-matches the 4-record
  // niche category, but "Electrical" (a prefix of the input) covers 330k records.
  // Prefer the shortest category whose name is a prefix of the input.
  const parentMatch = categories
    .filter(c => lower.startsWith(c.toLowerCase()) && lower !== c.toLowerCase())
    .sort((a, b) => b.length - a.length)[0]; // longest prefix wins (most specific parent)
  if (parentMatch) return parentMatch;

  const exact = categories.find(c => c.toLowerCase() === lower);
  if (exact) return exact;

  // 2. CATEGORY_SYNONYMS lookup
  const synonym = CATEGORY_SYNONYMS[lower];
  if (synonym) {
    // The synonym value may not exactly match a DB category either; find closest
    const synonymMatch = categories.find(c => c.toLowerCase() === synonym.toLowerCase());
    if (synonymMatch) return synonymMatch;
    // Try prefix match with the synonym value
    const synonymPrefix = categories.find(c =>
      c.toLowerCase().startsWith(synonym.toLowerCase())
    );
    if (synonymPrefix) return synonymPrefix;
  }

  // 3. Prefix match (input is prefix of a DB category)
  const prefixMatch = categories.find(c =>
    c.toLowerCase().startsWith(lower)
  );
  if (prefixMatch) return prefixMatch;

  // Also check reverse: DB category is prefix of input
  const reversePrefix = categories.find(c =>
    lower.startsWith(c.toLowerCase())
  );
  if (reversePrefix) return reversePrefix;

  // 4. CATEGORY_TO_IMAGE_SLUG: find categories that share the same slug as the input
  //    First, see if input matches any key in the slug map
  const slugMapKey = Object.keys(CATEGORY_TO_IMAGE_SLUG).find(
    k => k.toLowerCase() === lower
  );
  if (slugMapKey) {
    // This key IS a valid DB category
    const dbMatch = categories.find(c => c === slugMapKey);
    if (dbMatch) return dbMatch;
  }

  // Try matching by slug: find the slug for input, then find the first DB category with that slug
  const inputSlug = findSlugForInput(lower);
  if (inputSlug) {
    // Find the first DB category that maps to this slug
    for (const cat of categories) {
      if (CATEGORY_TO_IMAGE_SLUG[cat] === inputSlug) {
        return cat;
      }
    }
  }

  // 5. Contains match as last resort -- input contained in category name or vice versa
  const containsMatch = categories.find(c =>
    c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())
  );
  if (containsMatch) return containsMatch;

  return null;
}

/**
 * Find the image slug for a given input string.
 */
function findSlugForInput(lower: string): string | null {
  // Direct key lookup
  for (const [key, slug] of Object.entries(CATEGORY_TO_IMAGE_SLUG)) {
    if (key.toLowerCase() === lower) return slug;
  }

  // Check if input matches any slug directly
  const allSlugs = new Set(Object.values(CATEGORY_TO_IMAGE_SLUG));
  if (allSlugs.has(lower)) return lower;

  // Check synonyms -> category -> slug
  const synonym = CATEGORY_SYNONYMS[lower];
  if (synonym) {
    const slug = CATEGORY_TO_IMAGE_SLUG[synonym];
    if (slug) return slug;
  }

  return null;
}
