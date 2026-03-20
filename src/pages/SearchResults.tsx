/**
 * SearchResults Page — AI-First Search with Filter Chips + Yelp-style layout
 * Flow: User types -> AI extracts filters -> chips display -> FTS5 fetches results
 * Route: /search?q=&category=&state=&city=&minRating=&sort=&page=
 *
 * Layout: sticky filter sidebar (left) | vertical card list (right)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import FilterChips from '../components/FilterChips';
import AIAssistant from '../components/AIAssistant';
import SearchResultCard from '../components/SearchResultCard';
import SearchFilterSidebar from '../components/SearchFilterSidebar';
import type { SidebarFilters } from '../components/SearchFilterSidebar';

import { AISearchAPI, FTSSearchAPI } from '../api/api';
import type { Company, FilterChip, AISearchFilters } from '../api/types';
import { CATEGORY_CONFIG } from '../api/hooks';
import { usePageTitle } from '../hooks/usePageTitle';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'rating_desc', label: 'Top Rated' },
  { value: 'reviews_desc', label: 'Most Reviews' },
  { value: 'name_asc', label: 'Name A\u2013Z' },
  { value: 'name_desc', label: 'Name Z\u2013A' },
];

const RESULTS_PER_PAGE = 20;

// All category display names from CATEGORY_CONFIG for the sidebar dropdown
const SIDEBAR_CATEGORIES = CATEGORY_CONFIG.map((c) => c.dbName);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Convert AI-extracted filters into visual FilterChip array */
function filtersToChips(filters: AISearchFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.category) {
    chips.push({ key: 'category', label: filters.category, value: filters.category, type: 'category' });
  }
  if (filters.state) {
    chips.push({ key: 'state', label: filters.state, value: filters.state, type: 'location' });
  }
  if (filters.city) {
    chips.push({ key: 'city', label: filters.city, value: filters.city, type: 'location' });
  }
  if (filters.minRating) {
    chips.push({ key: 'minRating', label: `${filters.minRating}+ Stars`, value: String(filters.minRating), type: 'rating' });
  }
  if (filters.services?.length) {
    for (const svc of filters.services) {
      chips.push({ key: `service:${svc}`, label: svc, value: svc, type: 'service' });
    }
  }
  return chips;
}

/** Remove a filter by chip key and return updated filters */
function removeFilter(filters: AISearchFilters, key: string): AISearchFilters {
  const updated = { ...filters };
  if (key === 'category') delete updated.category;
  else if (key === 'state') delete updated.state;
  else if (key === 'city') delete updated.city;
  else if (key === 'minRating') delete updated.minRating;
  else if (key.startsWith('service:')) {
    const svc = key.slice(8);
    updated.services = (updated.services || []).filter(s => s !== svc);
    if (updated.services.length === 0) delete updated.services;
  }
  return updated;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

const SearchResults: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven state
  const urlQuery = searchParams.get('q') || '';
  const urlLoc = searchParams.get('loc') || '';   // city name or ZIP from nav search
  const urlCategory = searchParams.get('category') || '';
  const urlState = searchParams.get('state') || '';
  const urlCity = searchParams.get('city') || '';
  const urlMinRating = searchParams.get('minRating') || '';
  const urlZip = searchParams.get('zip') || '';
  const sort = searchParams.get('sort') || 'rating_desc';
  const page = parseInt(searchParams.get('page') || '1');

  // (search input lives in Navigation — no inline form on this page)

  // AI state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<'ai' | 'fallback' | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiVisible, setAiVisible] = useState(true);

  // Active filters + chips (from AI/URL)
  const [activeFilters, setActiveFilters] = useState<AISearchFilters>({});
  const [chips, setChips] = useState<FilterChip[]>([]);

  // Sidebar filters (category, rating, distance, features)
  const [sidebarFilters, setSidebarFilters] = useState<SidebarFilters>({
    category: '',
    minRating: 0,
    radiusMiles: 10,
    features: {},
  });

  // Conversation history for follow-up queries
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);

  // Results
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchSource, setSearchSource] = useState<'fts5' | 'like' | null>(null);

  // Prevent double-fetch on mount
  const lastSearchRef = useRef<string>('');

  // ── Whether a location was provided (shows Distance section in sidebar) ──
  const hasLocation = !!(urlLoc || urlCity || urlZip || activeFilters.city);

  // ── Build initial filters from URL params ──
  useEffect(() => {
    const urlFilters: AISearchFilters = {};
    if (urlCategory) urlFilters.category = urlCategory;
    if (urlState) urlFilters.state = urlState;
    if (urlCity) urlFilters.city = urlCity;
    if (urlMinRating) urlFilters.minRating = parseFloat(urlMinRating);
    // Merge loc (from nav search) into query so the AI search receives location context
    if (urlLoc && urlQuery) {
      urlFilters.query = `${urlQuery} near ${urlLoc}`;
    } else if (urlQuery) {
      urlFilters.query = urlQuery;
    } else if (urlLoc) {
      urlFilters.query = urlLoc;
    }
    setActiveFilters(urlFilters);
    setChips(filtersToChips(urlFilters));

    // Sync sidebar category from URL if present
    if (urlCategory) {
      setSidebarFilters(prev => ({ ...prev, category: urlCategory }));
    }
    if (urlMinRating) {
      setSidebarFilters(prev => ({ ...prev, minRating: parseFloat(urlMinRating) }));
    }
  }, [urlQuery, urlLoc]);

  // ────── AI Search: when user submits a query ──────
  // Also called on mount (via the effect below) to extract structured filters from the URL query
  const runAISearch = useCallback(async (message: string) => {
    if (!message.trim()) return;

    setIsAiLoading(true);
    setAiVisible(true);
    setAiSummary(null);

    try {
      const result = await AISearchAPI.search({ message, history: chatHistory });

      // Update conversation history
      setChatHistory(prev => [
        ...prev,
        { role: 'user' as const, text: message },
        { role: 'model' as const, text: result.summary || 'Search completed' },
      ]);

      // Set AI response
      setAiSummary(result.summary);
      setAiSource(result.source);

      // Build filters from AI response
      const newFilters: AISearchFilters = { ...result.filters };
      if (!newFilters.query) newFilters.query = message;
      // Normalize AI-verbose category names to match DB short names
      // e.g. "Electrical Contractors" → "Electrical", "Plumbing Services" → "Plumbing"
      if (newFilters.category) {
        newFilters.category = newFilters.category
          .replace(/\s+(Contractors?|Services?|Specialists?|Professionals?|Experts?|Companies|Company)$/i, '')
          .trim();
      }
      setActiveFilters(newFilters);
      setChips(filtersToChips(newFilters));

      // Sync URL
      syncFiltersToURL(newFilters);
    } catch {
      // AI failed — fall back to keyword search
      const fallbackFilters: AISearchFilters = { query: message };
      setActiveFilters(fallbackFilters);
      setChips(filtersToChips(fallbackFilters));
      setAiSummary(null);
      setAiSource(null);
      syncFiltersToURL(fallbackFilters);
    } finally {
      setIsAiLoading(false);
    }
  }, [chatHistory]);

  // ────── Trigger AI search on initial page load from URL params ──────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const q = urlQuery.trim();
    const loc = urlLoc.trim();
    // Only run AI extraction when navigated here with a query
    if (q || loc) {
      const message = q && loc ? `${q} near ${loc}` : q || loc;
      runAISearch(message);
    }
  }, [urlQuery, urlLoc]); // re-run when URL query/loc changes (nav bar search)

  // ────── FTS Search: fetch results whenever filters change ──────
  useEffect(() => {
    // Merge sidebar filters into active filters for the fetch
    const mergedFilters: AISearchFilters = {
      ...activeFilters,
    };
    if (sidebarFilters.category) mergedFilters.category = sidebarFilters.category;
    if (sidebarFilters.state) mergedFilters.state = sidebarFilters.state;
    if (sidebarFilters.minRating) mergedFilters.minRating = sidebarFilters.minRating;
    if (sidebarFilters.licenseOnly) (mergedFilters as Record<string, unknown>).licenseOnly = true;
    if (sidebarFilters.realOnly) (mergedFilters as Record<string, unknown>).realOnly = true;

    // Include radiusMiles, features and realOnly in the key so changing sidebar
    // filters triggers a new fetch (they're not directly in mergedFilters).
    const filterKey = JSON.stringify({ ...mergedFilters, urlQuery, urlLoc, radiusMiles: sidebarFilters.radiusMiles, features: sidebarFilters.features, realOnly: sidebarFilters.realOnly, sort, page });
    if (filterKey === lastSearchRef.current) return;
    if (!mergedFilters.query && !mergedFilters.category && !mergedFilters.state && !mergedFilters.city && !mergedFilters.minRating) {
      // No filters at all — don't search
      if (companies.length === 0 && !isLoading) return;
    }
    lastSearchRef.current = filterKey;

    setIsLoading(true);
    // Detect ZIP: urlLoc is a ZIP when it's 5 digits; pass to API only when
    // the user has explicitly selected a radius (radiusMiles > 0).
    const isZip = /^\d{5}$/.test(urlLoc.trim());
    const radiusToApply = sidebarFilters.radiusMiles ?? 0;
    FTSSearchAPI.search({
      ...mergedFilters,
      ...(isZip && radiusToApply > 0 ? { zip: urlLoc.trim(), radius: radiusToApply } : {}),
      limit: RESULTS_PER_PAGE,
      offset: (page - 1) * RESULTS_PER_PAGE,
      sort,
    })
      .then((res) => {
        setCompanies(res.companies || []);
        setTotal(res.totalResults || 0);
        setTotalPages(Math.ceil((res.totalResults || 0) / RESULTS_PER_PAGE));
        setSearchSource(res.source);
      })
      .catch(() => {
        setCompanies([]);
        setTotal(0);
        setTotalPages(0);
      })
      .finally(() => setIsLoading(false));
  }, [activeFilters, sidebarFilters, sort, page, urlQuery, urlLoc]);

  // ────── URL sync helpers ──────
  const syncFiltersToURL = useCallback((filters: AISearchFilters) => {
    const params = new URLSearchParams();
    // Always store the original clean user query as `q` — NOT the AI-enriched message
    // (which includes "near {loc}" and would accumulate into
    //  "plumbing near 97140 near 97140 ..." on each navigation).
    // The loc param is stored separately in 'loc'.
    if (urlQuery) params.set('q', urlQuery);
    if (filters.category) params.set('category', filters.category);
    if (filters.state) params.set('state', filters.state);
    if (filters.city) params.set('city', filters.city);
    if (filters.minRating) params.set('minRating', String(filters.minRating));
    // Preserve the original loc param so Distance sidebar and nav stay in sync
    if (urlLoc) params.set('loc', urlLoc);
    params.set('sort', sort);
    params.set('page', '1');
    setSearchParams(params);
  }, [sort, setSearchParams, urlLoc, urlQuery]);

  // ────── Handlers ──────
  const handleRemoveChip = useCallback((key: string) => {
    const updated = removeFilter(activeFilters, key);
    setActiveFilters(updated);
    setChips(filtersToChips(updated));
    syncFiltersToURL(updated);
  }, [activeFilters, syncFiltersToURL]);

  const handleClearAll = useCallback(() => {
    setActiveFilters({});
    setChips([]);
    setAiSummary(null);
    setAiSource(null);
    setAiVisible(false);
    setChatHistory([]);
    setSidebarFilters({ category: '', state: '', minRating: 0, radiusMiles: 10, licenseOnly: false, realOnly: false, features: {} });
    setCompanies([]);
    setTotal(0);
    setTotalPages(0);
    lastSearchRef.current = '';
    setSearchParams({});
  }, [setSearchParams]);

  const handleSortChange = useCallback((newSort: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('sort', newSort);
    params.set('page', '1');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const goToPage = useCallback((p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(p));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [searchParams, setSearchParams]);

  // Handle sidebar filter changes
  const handleSidebarChange = useCallback((updated: Partial<SidebarFilters>) => {
    setSidebarFilters(prev => ({ ...prev, ...updated }));
    // Reset to page 1 when filters change
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Pagination range
  const paginationRange = (): (number | '...')[] => {
    const range: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) range.push(i);
    } else {
      range.push(1);
      if (page > 3) range.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) range.push(i);
      if (page < totalPages - 2) range.push('...');
      range.push(totalPages);
    }
    return range;
  };

  const hasResults = companies.length > 0;
  const hasActiveSearch = chips.length > 0 || !!urlQuery;

  const pageTitle = [
    urlCategory || activeFilters.category,
    (urlCity || activeFilters.city) && urlState ? `in ${urlCity || activeFilters.city}, ${urlState}` :
    urlState ? `in ${urlState}` :
    (urlCity || activeFilters.city) ? `in ${urlCity || activeFilters.city}` : null,
    total > 0 ? `(${total.toLocaleString()} results)` : null,
  ].filter(Boolean).join(' ') || (urlQuery ? `"${urlQuery}"` : 'Search Results');

  usePageTitle(pageTitle, `Find ${urlCategory || 'contractors'} ${urlState ? 'in ' + urlState : 'near you'}. Browse ${total > 0 ? total.toLocaleString() + '+' : 'thousands of'} licensed professionals on HCC BuildBoard.`);

  return (
    <div className="min-h-screen pt-[84px] bg-white">
      <div className="px-[4%] max-w-7xl mx-auto">

        {/* ── AI Assistant Card ── */}
        <AIAssistant
          isLoading={isAiLoading}
          summary={aiSummary}
          source={aiSource}
          onDismiss={() => setAiVisible(false)}
          visible={aiVisible}
        />

        {/* ── Header: result count + mobile filter trigger + sort ── */}
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div className="flex-1 min-w-0">
            {/* HCC section label */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1 h-[18px] bg-[#F5C518] flex-shrink-0" />
              <span className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-[#F5C518]">
                SEARCH RESULTS
              </span>
            </div>
            {/* Results count */}
            <h1 className="font-display text-[1rem] uppercase tracking-[0.05em] text-gray-700 mb-2 ml-4">
              {isLoading ? 'Searching...' : hasActiveSearch ? `${total.toLocaleString()} contractors found` : 'Search BuildBoard'}
            </h1>
            {/* Filter chips */}
            <FilterChips
              chips={chips}
              onRemove={handleRemoveChip}
              onClear={handleClearAll}
            />
            {/* Search source indicator */}
            {searchSource && !isLoading && hasResults && (
              <p className="text-[0.7rem] text-gray-400 mt-1.5">
                Powered by {searchSource === 'fts5' ? 'full-text search' : 'keyword search'}
              </p>
            )}
          </div>

          {/* Right side: sort pills */}
          {hasResults && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSortChange(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-[0.78rem] font-display font-bold uppercase tracking-[0.06em] transition-colors border ${
                    sort === opt.value
                      ? 'bg-[#F5C518] text-[#0A0A0A] border-[#F5C518]'
                      : 'bg-transparent text-gray-500 border-gray-200 hover:border-[#F5C518]/60 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 2-column layout ── */}
        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6">

          {/* LEFT: sticky filter sidebar.
              On mobile (< lg): renders as a sticky bar at top of scroll area.
              On desktop (lg+): renders as a sticky left column. */}
          <div className="sticky top-[84px] z-20 lg:static bg-white lg:bg-transparent border-b border-gray-100 lg:border-b-0 -mx-[4%] px-[4%] py-2 lg:mx-0 lg:px-0 lg:py-0 mb-3 lg:mb-0">
            <SearchFilterSidebar
              filters={sidebarFilters}
              onChange={handleSidebarChange}
              hasLocation={hasLocation}
              categories={SIDEBAR_CATEGORIES}
            />
          </div>

          {/* RIGHT: results column */}
          <div className="min-w-0">

            {/* Loading skeleton */}
            {isLoading && (
              <div className="flex flex-col gap-3">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col sm:flex-row rounded-xl overflow-hidden"
                    style={{ background: '#ffffff', border: '1px solid #000000' }}
                  >
                    {/* Photo skeleton */}
                    <div className="w-full sm:w-[160px] h-[140px] sm:h-[120px] bg-gray-100 animate-pulse flex-shrink-0" />
                    {/* Info skeleton — matches SearchResultCard rows */}
                    <div className="flex-1 px-4 py-3 space-y-2.5">
                      {/* Row 1: name + category badge */}
                      <div className="flex items-center gap-2">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-2/5" />
                        <div className="h-4 bg-gray-100 rounded-full animate-pulse w-16" />
                      </div>
                      {/* Row 2: stars + review count */}
                      <div className="flex items-center gap-2">
                        <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                        <div className="h-3 bg-gray-100 rounded animate-pulse w-16" />
                      </div>
                      {/* Row 3: location */}
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                      {/* Row 4: feature tags */}
                      <div className="flex gap-1.5">
                        <div className="h-5 bg-gray-100 rounded-full animate-pulse w-20" />
                        <div className="h-5 bg-gray-100 rounded-full animate-pulse w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results list */}
            {!isLoading && hasResults && (
              <div className="flex flex-col gap-3">
                {companies.map((company, i) => (
                  <SearchResultCard
                    key={company.id}
                    company={company}
                    rank={i + 1 + (page - 1) * RESULTS_PER_PAGE}
                    distanceMi={undefined}
                  />
                ))}
              </div>
            )}

            {/* No results — with active search */}
            {!isLoading && !hasResults && hasActiveSearch && (
              <div className="py-16 text-center">
                <div className="w-12 h-1 bg-[#F5C518] mx-auto mb-6" />
                <p className="text-[1.2rem] font-display font-bold uppercase tracking-[0.05em] text-gray-900 mb-2">No results found</p>
                <p className="text-gray-500 text-[0.9rem] mb-4">We couldn't find contractors matching your search. Try one of these:</p>
                <ul className="text-gray-500 text-[0.85rem] space-y-1.5 mb-6 max-w-md mx-auto text-left list-none">
                  <li className="flex items-start gap-2"><span className="text-[#F5C518] mt-0.5">-</span> Check the spelling of the company or trade name</li>
                  <li className="flex items-start gap-2"><span className="text-[#F5C518] mt-0.5">-</span> Try a broader category like "Plumbing" or "Electrical"</li>
                  <li className="flex items-start gap-2"><span className="text-[#F5C518] mt-0.5">-</span> Remove location filters to search nationwide</li>
                  <li className="flex items-start gap-2"><span className="text-[#F5C518] mt-0.5">-</span> Use a nearby ZIP code or larger city name</li>
                </ul>
                <button
                  onClick={handleClearAll}
                  className="px-6 py-2.5 rounded-lg bg-[#F5C518] text-[#0A0A0A] font-display text-[0.85rem] font-bold uppercase tracking-[0.08em] hover:bg-[#D4A017] transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            )}

            {/* Empty state — no search yet */}
            {!isLoading && !hasResults && !hasActiveSearch && (
              <div className="py-16 text-center">
                <div className="w-12 h-1 bg-[#F5C518] mx-auto mb-4" />
                <Search className="w-12 h-12 text-[#999999]/30 mx-auto mb-4" />
                <p className="text-[1.2rem] font-display font-bold uppercase tracking-[0.05em] text-gray-900 mb-2">Find Construction Professionals</p>
                <p className="text-gray-500 text-[0.9rem] mb-6">
                  Search by name, trade, location, or ask a question like "best electricians in Miami"
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
                  {['Plumbing', 'Electrical', 'Roofing', 'HVAC', 'Painting', 'Landscaping'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set('category', cat.toLowerCase());
                        params.set('sort', 'rating_desc');
                        params.set('page', '1');
                        setSearchParams(params);
                      }}
                      className="px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-500 text-[0.82rem] font-display font-bold uppercase tracking-[0.06em] hover:border-[#F5C518]/60 hover:text-[#F5C518] transition-colors"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
              <div className="mt-10 mb-8 space-y-3">
                {/* Showing X-Y of Z results */}
                <p className="text-center text-[0.8rem] text-gray-500">
                  Showing {((page - 1) * RESULTS_PER_PAGE + 1).toLocaleString()}&ndash;{Math.min(page * RESULTS_PER_PAGE, total).toLocaleString()} of {total.toLocaleString()} results
                </p>

                {/* Page buttons */}
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    className="p-2.5 rounded text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {paginationRange().map((p, i) =>
                    p === '...' ? (
                      <span key={`dots-${i}`} className="px-2 text-gray-400">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => goToPage(p)}
                        className={`min-w-[44px] h-11 rounded font-display text-[0.85rem] font-bold transition-colors ${
                          p === page
                            ? 'bg-[#F5C518] text-[#0A0A0A]'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages}
                    className="p-2.5 rounded text-gray-400 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Jump to page (for large result sets) */}
                {totalPages > 7 && (
                  <div className="flex items-center justify-center gap-2">
                    <label htmlFor="jump-page" className="text-[0.78rem] text-gray-500">
                      Go to page
                    </label>
                    <input
                      id="jump-page"
                      type="number"
                      min={1}
                      max={totalPages}
                      defaultValue={page}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (val >= 1 && val <= totalPages) goToPage(val);
                        }
                      }}
                      className="w-16 bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-900 text-[0.82rem] text-center outline-none focus:border-[#F5C518] transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-[0.78rem] text-gray-500">of {totalPages}</span>
                  </div>
                )}
              </div>
            )}

          </div>{/* end results column */}
        </div>{/* end 2-col grid */}
      </div>{/* end max-w container */}
    </div>
  );
};

export default SearchResults;
