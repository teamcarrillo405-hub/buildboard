/**
 * Shared domain-guessing and verification utilities for the website enrichment pipeline.
 * Depends only on Node built-ins (dns, fetch). Requires Node 18+.
 */

import dns from 'dns';

// ---------------------------------------------------------------------------
// Directory exclusion list
// ---------------------------------------------------------------------------

export const DIRECTORY_DOMAINS: Set<string> = new Set([
  'yelp.com',
  'bbb.org',
  'facebook.com',
  'yellowpages.com',
  'homeadvisor.com',
  'angi.com',
  'thumbtack.com',
  'manta.com',
  'mapquest.com',
  'linkedin.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'nextdoor.com',
  'houzz.com',
  'buildzoom.com',
  'porch.com',
  'chamberofcommerce.com',
  'superpages.com',
  'dexknows.com',
  'citysearch.com',
  'merchantcircle.com',
  'alignable.com',
  'google.com',
  'apple.com',
  'bing.com',
]);

// ---------------------------------------------------------------------------
// Parked-domain hostname fragments
// ---------------------------------------------------------------------------

const PARKED_FRAGMENTS: readonly string[] = [
  'godaddy.com',
  'sedoparking',
  'parkingcrew',
  'hugedomains',
  'dan.com',
  'afternic',
];

// ---------------------------------------------------------------------------
// Internal normalization helpers
// ---------------------------------------------------------------------------

const LEGAL_SUFFIX_RE =
  /\b(inc|llc|corp|co|ltd|company|services|group|enterprises|enterprise|associates|assoc)\b\.?/gi;

const TRADE_WORDS = new Set([
  'construction', 'contractor', 'contractors', 'contracting',
  'plumbing', 'plumber', 'plumbers',
  'electrical', 'electrician', 'electricians', 'electric',
  'roofing', 'roofer', 'roofers', 'roof',
  'hvac', 'heating', 'cooling', 'air conditioning',
  'painting', 'painter', 'painters', 'paint',
  'landscaping', 'landscape', 'landscaper',
  'masonry', 'mason', 'masons', 'concrete',
  'flooring', 'floors', 'floor',
  'carpentry', 'carpenter', 'carpenters',
  'drywall', 'tile', 'tiling',
  'fencing', 'fence', 'fences',
  'siding', 'insulation', 'demolition',
  'solar', 'paving', 'paver', 'pavers',
  'remodeling', 'remodel', 'renovation', 'renovations',
  'building', 'builders', 'builder', 'builds',
  'mechanical', 'maintenance', 'repair', 'repairs',
  'restoration', 'interiors', 'interior',
  'exteriors', 'exterior', 'framing',
  'welding', 'welder', 'welders',
  'plbg', 'htg', 'mech', 'elec', 'const',
]);

const CATEGORY_DOMAIN_SUFFIXES: Record<string, string[]> = {
  'General Contractor': ['construction', 'builders', 'contracting', 'builds'],
  'Electrical':         ['electric', 'electrical'],
  'Plumbing':           ['plumbing', 'plumber'],
  'Painting':           ['painting', 'painters'],
  'Masonry Contractors': ['masonry', 'concrete'],
  'HVAC':               ['hvac', 'heating', 'cooling'],
  'Landscaping':        ['landscaping', 'landscape'],
  'Flooring':           ['flooring', 'floors'],
  'Carpentry':          ['carpentry'],
  'Roofing':            ['roofing', 'roof'],
  'Drywall':            ['drywall'],
  'Tile Installation':  ['tile'],
  'Windows & Doors':    ['windows'],
  'Tree Services':      ['tree', 'treeservice'],
  'Fencing':            ['fence', 'fencing'],
  'Insulation':         ['insulation'],
  'Solar':              ['solar'],
  'Pool Services':      ['pools', 'pool'],
  'Siding':             ['siding'],
  'Paving':             ['paving'],
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIX_RE, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTradeWords(name: string): string {
  const words = name.split(' ').filter(w => !TRADE_WORDS.has(w));
  return words.join(' ').trim();
}

function toNoSpaces(value: string): string {
  return value.replace(/\s+/g, '');
}

function toDashed(value: string): string {
  return value.replace(/\s+/g, '-');
}

function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeState(state: string): string {
  return state.toLowerCase().replace(/[^a-z]/g, '').trim();
}

// ---------------------------------------------------------------------------
// generateCandidateDomains
// ---------------------------------------------------------------------------

export function generateCandidateDomains(
  businessName: string,
  city?: string,
  state?: string,
  category?: string,
): string[] {
  const name = normalizeName(businessName);
  if (name.length < 2) return [];

  const nameNoSpaces = toNoSpaces(name);
  const nameDashed = toDashed(name);

  const coreName = stripTradeWords(name);
  const coreNoSpaces = toNoSpaces(coreName);

  const candidates: string[] = [];
  const push = (d: string) => { if (d.length > 4 && !d.startsWith('.')) candidates.push(d); };

  // --- Tier 1: Full name, .com (highest priority) ---
  push(`${nameNoSpaces}.com`);
  push(`${nameDashed}.com`);

  // --- Tier 2: Core name (trade words stripped) + .com ---
  if (coreNoSpaces.length >= 3 && coreNoSpaces !== nameNoSpaces) {
    push(`${coreNoSpaces}.com`);
    push(`${toDashed(coreName)}.com`);
  }

  // --- Tier 3: Category-aware suffixes on the core name ---
  if (category && coreNoSpaces.length >= 3) {
    const suffixes = CATEGORY_DOMAIN_SUFFIXES[category];
    if (suffixes) {
      for (const suffix of suffixes) {
        push(`${coreNoSpaces}${suffix}.com`);
        if (candidates.length >= 24) break;
      }
    }
  }

  // --- Tier 4: Legal suffixes ---
  push(`${nameNoSpaces}llc.com`);
  push(`${nameNoSpaces}inc.com`);
  if (coreNoSpaces !== nameNoSpaces && coreNoSpaces.length >= 3) {
    push(`${coreNoSpaces}llc.com`);
    push(`${coreNoSpaces}inc.com`);
  }

  // --- Tier 5: City/state qualified ---
  if (city && city.trim().length > 0) {
    const normalizedCity = normalizeCity(city);
    const cityNoSpaces = toNoSpaces(normalizedCity);
    push(`${nameNoSpaces}${cityNoSpaces}.com`);
    push(`${nameDashed}-${toDashed(normalizedCity)}.com`);
    if (coreNoSpaces !== nameNoSpaces && coreNoSpaces.length >= 3) {
      push(`${coreNoSpaces}${cityNoSpaces}.com`);
    }
  }
  if (state && state.trim().length > 0) {
    const st = normalizeState(state);
    if (st.length === 2) {
      push(`${nameNoSpaces}${st}.com`);
      if (coreNoSpaces !== nameNoSpaces && coreNoSpaces.length >= 3) {
        push(`${coreNoSpaces}${st}.com`);
      }
    }
  }

  // --- Tier 6: Alternate TLDs for full name ---
  push(`${nameNoSpaces}.net`);
  push(`${nameNoSpaces}.us`);
  push(`${nameNoSpaces}.co`);
  push(`${nameDashed}.net`);

  // --- Deduplicate, cap at 24 ---
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(lower);
    }
    if (unique.length >= 24) break;
  }

  return unique;
}

// ---------------------------------------------------------------------------
// checkDomainDNS
// ---------------------------------------------------------------------------

export async function checkDomainDNS(domain: string): Promise<boolean> {
  // Use dns.promises.lookup (OS resolver) instead of dns.promises.resolve
  // (raw UDP), because many Windows/VPN environments block direct DNS queries.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('DNS_TIMEOUT')), 3_000),
  );

  const lookup = (async (): Promise<boolean> => {
    try {
      await dns.promises.lookup(domain);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await Promise.race([lookup, timeout]);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// verifyWebsite
// ---------------------------------------------------------------------------

export async function verifyWebsite(
  url: string,
): Promise<{ valid: boolean; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConstructFlix/1.0)' },
    });

    const finalUrl = response.url || url;
    const status = response.status;

    if (status < 200 || status > 399) {
      return { valid: false, finalUrl };
    }

    const lowerFinal = finalUrl.toLowerCase();
    for (const fragment of PARKED_FRAGMENTS) {
      if (lowerFinal.includes(fragment)) {
        return { valid: false, finalUrl };
      }
    }

    return { valid: true, finalUrl };
  } catch {
    return { valid: false, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// isDirectoryUrl
// ---------------------------------------------------------------------------

export function isDirectoryUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const bare = hostname.replace(/^www\./, '');
    return DIRECTORY_DOMAINS.has(bare);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// verifyBusinessMatch
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'at', 'to', 'for', 'on', 'by']);

const TITLE_LEGAL_SUFFIX_RE =
  /\b(inc|llc|corp|co|ltd|company|services|group|enterprises|enterprise|associates|assoc)\b\.?/gi;

function normalizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(TITLE_LEGAL_SUFFIX_RE, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 0 && !STOP_WORDS.has(w));
}

/**
 * Fetches the HTML <title> of a URL and checks whether the business name words
 * appear in it.  Returns true (match) or false (mismatch).  On any error —
 * timeout, missing title, network failure — returns true to give the site the
 * benefit of the doubt and avoid discarding valid pages.
 */
export async function verifyBusinessMatch(
  url: string,
  businessName: string,
): Promise<{ match: boolean; title: string }> {
  // Normalise business name up front; bail early if nothing meaningful remains.
  const nameWords = normalizeForMatch(businessName);
  if (nameWords.length === 0 || (nameWords.length === 1 && nameWords[0]!.length <= 1)) {
    return { match: true, title: '' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConstructFlix/1.0)' },
    });

    // Read only the first 20 KB to keep memory usage low.
    const reader = response.body?.getReader();
    if (!reader) return { match: true, title: '' };

    let accumulated = '';
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let bytesRead = 0;
    const MAX_BYTES = 20_480;

    outer: while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      accumulated += decoder.decode(value, { stream: true });
      // Stop as soon as we have seen </title> — no need to read further.
      if (/<\/title>/i.test(accumulated)) break outer;
    }
    reader.cancel().catch(() => undefined);

    // Extract the <title> tag content.
    const titleMatch = accumulated.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleMatch) return { match: true, title: '' };

    const rawTitle = titleMatch[1]!
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .trim();

    const titleWords = new Set(normalizeForMatch(rawTitle));

    if (titleWords.size === 0) return { match: true, title: rawTitle };

    // Require at least 50% of name words (min 1) to appear in the title.
    const requiredMatches = Math.max(1, Math.ceil(nameWords.length * 0.5));
    let matched = 0;
    for (const word of nameWords) {
      if (titleWords.has(word)) matched++;
    }

    return { match: matched >= requiredMatches, title: rawTitle };
  } catch {
    // Timeout, network error, or parse failure — give benefit of the doubt.
    return { match: true, title: '' };
  } finally {
    clearTimeout(timer);
  }
}
