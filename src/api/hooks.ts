/**
 * Construction Company Directory - React Query Hooks
 * Custom hooks for data fetching and state management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Company,
  Category,
  Location,
  CompanyFilters,
  FilterOptions,
  SortOption,
  DirectoryStats,
} from './types';
import { API, FavoritesAPI } from './api';
import { useAuth } from '../contexts/AuthContext';

// ==================== Hook Return Types ====================

interface UseQueryReturn<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UsePaginatedQueryReturn<T> extends UseQueryReturn<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  setLimit: (limit: number) => void;
}

// ==================== useCompanies Hook ====================

export interface UseCompaniesOptions {
  filters?: CompanyFilters;
  initialPage?: number;
  initialLimit?: number;
  sort?: SortOption;
  enabled?: boolean;
}

export interface UseCompaniesReturn extends UsePaginatedQueryReturn<Company> {
  filters: FilterOptions | null;
  setFilters: (filters: CompanyFilters) => void;
  setSort: (sort: SortOption) => void;
}

export function useCompanies(
  options: UseCompaniesOptions = {}
): UseCompaniesReturn {
  const {
    filters: initialFilters = {},
    initialPage = 1,
    initialLimit = 20,
    sort: initialSort = 'relevance',
    enabled = true,
  } = options;

  const [data, setData] = useState<Company[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [sort, setSort] = useState<SortOption>(initialSort);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);

  const filtersRef = useRef(initialFilters);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const response = await API.companies.getAll(
        filtersRef.current,
        page,
        limit,
        sort
      );
      setData(response.data);
      setFilters(response.filters);
      setTotal(response.total);
      setTotalPages(response.totalPages);
      setHasNextPage(response.hasNextPage);
      setHasPrevPage(response.hasPrevPage);
    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err : new Error('Failed to fetch companies'));
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, sort, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateFilters = useCallback((newFilters: CompanyFilters) => {
    filtersRef.current = newFilters;
    setPage(1); // The useEffect on fetchData will trigger the re-fetch
  }, []);

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setPage(p => p + 1);
    }
  }, [hasNextPage]);

  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      setPage(p => p - 1);
    }
  }, [hasPrevPage]);

  const goToPage = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  }, [totalPages]);

  const updateLimit = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  const updateSort = useCallback((newSort: SortOption) => {
    setSort(newSort);
    setPage(1);
  }, []);

  return {
    data,
    filters,
    isLoading,
    isError,
    error,
    refetch: fetchData,
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    goToPage,
    setLimit: updateLimit,
    setFilters: updateFilters,
    setSort: updateSort,
  };
}

// ==================== useCompany Hook ====================

export interface UseCompanyOptions {
  id?: string;
  enabled?: boolean;
}

export function useCompany(
  options: UseCompanyOptions = {}
): UseQueryReturn<Company> {
  const { id, enabled = true } = options;

  const [data, setData] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!id || !enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const company = await API.companies.getById(id);
      setData(company);
    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err : new Error('Failed to fetch company'));
    } finally {
      setIsLoading(false);
    }
  }, [id, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useFeaturedCompanies Hook ====================

export interface UseFeaturedCompaniesOptions {
  limit?: number;
  enabled?: boolean;
}

export function useFeaturedCompanies(
  options: UseFeaturedCompaniesOptions = {}
): UseQueryReturn<Company[]> {
  const { limit = 10, enabled = true } = options;

  const [data, setData] = useState<Company[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const companies = await API.companies.getFeatured(limit);
      setData(companies);
    } catch (err) {
      setIsError(true);
      setError(
        err instanceof Error ? err : new Error('Failed to fetch featured companies')
      );
    } finally {
      setIsLoading(false);
    }
  }, [limit, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useNewCompanies Hook ====================

export interface UseNewCompaniesOptions {
  limit?: number;
  enabled?: boolean;
}

export function useNewCompanies(
  options: UseNewCompaniesOptions = {}
): UseQueryReturn<Company[]> {
  const { limit = 10, enabled = true } = options;

  const [data, setData] = useState<Company[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const companies = await API.companies.getNew(limit);
      setData(companies);
    } catch (err) {
      setIsError(true);
      setError(
        err instanceof Error ? err : new Error('Failed to fetch new companies')
      );
    } finally {
      setIsLoading(false);
    }
  }, [limit, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useTopRatedCompanies Hook ====================

export interface UseTopRatedCompaniesOptions {
  limit?: number;
  enabled?: boolean;
}

export function useTopRatedCompanies(
  options: UseTopRatedCompaniesOptions = {}
): UseQueryReturn<Company[]> {
  const { limit = 10, enabled = true } = options;

  const [data, setData] = useState<Company[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const companies = await API.companies.getTopRated(limit);
      setData(companies);
    } catch (err) {
      setIsError(true);
      setError(
        err instanceof Error ? err : new Error('Failed to fetch top-rated companies')
      );
    } finally {
      setIsLoading(false);
    }
  }, [limit, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useSearch Hook ====================

export interface UseSearchOptions {
  debounceMs?: number;
  enabled?: boolean;
}

export interface UseSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: Company[];
  suggestions: string[];
  totalResults: number;
  searchTime: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  search: (query: string) => Promise<void>;
  clear: () => void;
}

export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const { debounceMs = 300, enabled = true } = options;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Company[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [searchTime, setSearchTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !enabled) {
      setResults([]);
      setSuggestions([]);
      setTotalResults(0);
      setSearchTime(0);
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const searchResult = await API.companies.search(searchQuery);
      setResults(searchResult.companies);
      setSuggestions(searchResult.suggestions);
      setTotalResults(searchResult.totalResults);
      setSearchTime(searchResult.searchTime);
    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err : new Error('Search failed'));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  const debouncedSearch = useCallback((searchQuery: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, debounceMs);
  }, [performSearch, debounceMs]);

  const updateQuery = useCallback((newQuery: string) => {
    setQuery(newQuery);
    debouncedSearch(newQuery);
  }, [debouncedSearch]);

  const search = useCallback(async (searchQuery: string) => {
    setQuery(searchQuery);
    await performSearch(searchQuery);
  }, [performSearch]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSuggestions([]);
    setTotalResults(0);
    setSearchTime(0);
    setIsError(false);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    query,
    setQuery: updateQuery,
    results,
    suggestions,
    totalResults,
    searchTime,
    isLoading,
    isError,
    error,
    search,
    clear,
  };
}

// ==================== useCategories Hook ====================

export interface UseCategoriesOptions {
  enabled?: boolean;
}

export function useCategories(
  options: UseCategoriesOptions = {}
): UseQueryReturn<Category[]> {
  const { enabled = true } = options;

  const [data, setData] = useState<Category[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const cats = await API.categories.getAll();
      setData(cats);
    } catch (err) {
      setIsError(true);
      setError(
        err instanceof Error ? err : new Error('Failed to fetch categories')
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useLocations Hook ====================

export interface UseLocationsOptions {
  enabled?: boolean;
}

export function useLocations(
  options: UseLocationsOptions = {}
): UseQueryReturn<Location[]> {
  const { enabled = true } = options;

  const [data, setData] = useState<Location[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const locs = await API.locations.getAll();
      setData(locs);
    } catch (err) {
      setIsError(true);
      setError(
        err instanceof Error ? err : new Error('Failed to fetch locations')
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useStats Hook ====================

export interface UseStatsOptions {
  enabled?: boolean;
}

export function useStats(
  options: UseStatsOptions = {}
): UseQueryReturn<DirectoryStats> {
  const { enabled = true } = options;

  const [data, setData] = useState<DirectoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const stats = await API.stats.getStats();
      setData(stats);
    } catch (err) {
      setIsError(true);
      setError(
        err instanceof Error ? err : new Error('Failed to fetch stats')
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useSimilarCompanies Hook ====================

export interface UseSimilarCompaniesOptions {
  companyId?: string;
  limit?: number;
  enabled?: boolean;
}

export function useSimilarCompanies(
  options: UseSimilarCompaniesOptions = {}
): UseQueryReturn<Company[]> {
  const { companyId, limit = 6, enabled = true } = options;

  const [data, setData] = useState<Company[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!companyId || !enabled) return;

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const companies = await API.companies.getSimilar(companyId, limit);
      setData(companies);
    } catch (err) {
      setIsError(true);
      setError(
        err instanceof Error ? err : new Error('Failed to fetch similar companies')
      );
    } finally {
      setIsLoading(false);
    }
  }, [companyId, limit, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  };
}

// ==================== useDebounce Hook ====================

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ==================== useLocalStorage Hook ====================

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      setStoredValue(prev => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        return valueToStore;
      });
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }, [key]);

  return [storedValue, setValue];
}

// ==================== useFavorites Hook ====================

const FAVORITES_LS_KEY = 'favorites';
const FAVORITES_SYNCED_KEY = 'favorites_synced';

export function useFavorites(): {
  favorites: string[];
  addFavorite: (id: string) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
} {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // localStorage-based state (used when not authenticated, or as initial state)
  const [localFavorites, setLocalFavorites] = useLocalStorage<string[]>(FAVORITES_LS_KEY, []);

  // Server-backed state (used when authenticated)
  const [serverFavorites, setServerFavorites] = useState<string[]>([]);
  const [serverLoaded, setServerLoaded] = useState(false);
  const syncedRef = useRef(false);

  // When user becomes authenticated, sync localStorage favorites to server and load server favorites
  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      // Reset server state when logged out
      setServerLoaded(false);
      syncedRef.current = false;
      return;
    }

    let cancelled = false;

    const syncAndLoad = async () => {
      try {
        // Check if we already synced localStorage to the server for this session
        const alreadySynced = window.localStorage.getItem(FAVORITES_SYNCED_KEY) === 'true';

        if (!alreadySynced && localFavorites.length > 0) {
          // First login: merge localStorage favorites into the server
          await FavoritesAPI.sync(localFavorites);
          // Mark as synced and clear localStorage favorites
          window.localStorage.setItem(FAVORITES_SYNCED_KEY, 'true');
          window.localStorage.removeItem(FAVORITES_LS_KEY);
        }

        // Load server favorites
        const favs = await FavoritesAPI.getAll();
        if (!cancelled) {
          setServerFavorites(favs);
          setServerLoaded(true);
          syncedRef.current = true;
        }
      } catch (err) {
        console.error('Failed to sync/load favorites:', err);
        // Fall back to localStorage if server is unavailable
        if (!cancelled) {
          setServerLoaded(false);
        }
      }
    };

    syncAndLoad();
    return () => { cancelled = true; };
  }, [isAuthenticated, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine which source of truth to use
  const useServer = isAuthenticated && serverLoaded;
  const favorites = useServer ? serverFavorites : localFavorites;

  const addFavorite = useCallback((id: string) => {
    if (useServer) {
      // Optimistic update
      setServerFavorites(prev => {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      });
      FavoritesAPI.add(id).catch(err => {
        console.error('Failed to add favorite:', err);
        // Rollback
        setServerFavorites(prev => prev.filter(fav => fav !== id));
      });
    } else {
      setLocalFavorites(prev => {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      });
    }
  }, [useServer, setLocalFavorites]);

  const removeFavorite = useCallback((id: string) => {
    if (useServer) {
      // Optimistic update
      setServerFavorites(prev => prev.filter(fav => fav !== id));
      FavoritesAPI.remove(id).catch(err => {
        console.error('Failed to remove favorite:', err);
        // Rollback
        setServerFavorites(prev => [...prev, id]);
      });
    } else {
      setLocalFavorites(prev => prev.filter(fav => fav !== id));
    }
  }, [useServer, setLocalFavorites]);

  const isFavorite = useCallback((id: string) => {
    return favorites.includes(id);
  }, [favorites]);

  const toggleFavorite = useCallback((id: string) => {
    if (isFavorite(id)) {
      removeFavorite(id);
    } else {
      addFavorite(id);
    }
  }, [isFavorite, addFavorite, removeFavorite]);

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
  };
}

// ==================== Category Config ====================
// Curated categories matching the BuildBoard reference design.
// Maps DB category names to user-friendly display labels.

export const CATEGORY_CONFIG = [
  { dbName: 'Commercial Building Construction', label: 'Commercial Construction' },
  { dbName: 'Electrical Contractors', label: 'Electricians' },
  { dbName: 'Plumbing', label: 'Plumbers & Pipefitters' },
  { dbName: 'Roofing Contractors', label: 'Roofing Specialists' },
  { dbName: 'Masonry Contractors', label: 'Concrete & Masonry' },
  { dbName: 'Residential Remodelers', label: 'Residential & Remodeling' },
  { dbName: 'Landscaping Contractor', label: 'Landscaping & Outdoor' },
  { dbName: 'Foundation', label: 'Foundation Contractors' },
  { dbName: 'HVAC Contractor', label: 'HVAC Specialists' },
] as const;

// Lookup: DB name → display label
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_CONFIG.map(c => [c.dbName, c.label])
);

// ==================== useCategoryCompanies Hook ====================

// Batch fetcher — prevents Windows TCP port exhaustion by grouping requests.
// Each individual fetch is wrapped in try/catch so a single 503 (e.g. from
// React 18 StrictMode double-mount) returns [] rather than aborting the
// entire chain and leaving all category rows blank.
async function fetchInBatches<T extends readonly { dbName: string }[]>(
  items: T,
  fetchFn: (dbName: string) => Promise<Company[]>,
  batchSize = 3
): Promise<[string, Company[]][]> {
  const results: [string, Company[]][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async ({ dbName }) => {
        try {
          return [dbName, await fetchFn(dbName)] as [string, Company[]];
        } catch {
          return [dbName, []] as [string, Company[]];  // graceful per-item fallback
        }
      })
    );
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 100)); // 100ms gap — safer on Windows
    }
  }
  return results;
}

export function useCategoryCompanies(limit: number = 15) {
  const [data, setData] = useState<Record<string, Company[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // `cancelled` prevents React 18 StrictMode double-mount from applying
    // the first (discarded) effect's stale results over the second's live data.
    let cancelled = false;
    setIsLoading(true);
    fetchInBatches(
      CATEGORY_CONFIG,
      (dbName) => API.companies.getByCategory(dbName, limit),
      3
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, Company[]> = {};
      results.forEach(([cat, companies]) => { map[cat] = companies; });
      setData(map);
      setIsLoading(false);
    }).catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  return { data, isLoading };
}

// ==================== useStateCompanies Hook ====================

const TOP_STATES = [
  { code: 'TX', name: 'Texas' },
  { code: 'CA', name: 'California' },
  { code: 'FL', name: 'Florida' },
  { code: 'NY', name: 'New York' },
  { code: 'IL', name: 'Illinois' },
  { code: 'OH', name: 'Ohio' },
];

export { TOP_STATES };

export function useStateCompanies(limit: number = 15) {
  const [data, setData] = useState<Record<string, Company[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      const map: Record<string, Company[]> = {};
      for (let i = 0; i < TOP_STATES.length; i += 3) {
        if (cancelled) return;
        const batch = TOP_STATES.slice(i, i + 3);
        const batchResults = await Promise.all(
          batch.map(async (s) => {
            try {
              return [s.code, await API.companies.getByState(s.code, limit)] as [string, Company[]];
            } catch {
              return [s.code, []] as [string, Company[]];
            }
          })
        );
        batchResults.forEach(([code, companies]) => { map[code] = companies; });
        if (i + 3 < TOP_STATES.length) await new Promise(r => setTimeout(r, 100));
      }
      if (!cancelled) {
        setData(map);
        setIsLoading(false);
      }
    })().catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  return { data, isLoading };
}

// ==================== HOMEPAGE_CATEGORIES Config ====================

export const HOMEPAGE_CATEGORIES = [
  { key: 'general-contractor', category: 'General Contractor', label: 'Top 25 General Contractors' },
  { key: 'electrical', category: 'Electrical', label: 'Top 25 Electricians' },
  { key: 'plumbing', category: 'Plumbing', label: 'Top 25 Plumbers' },
  { key: 'roofing', category: 'Roofing', label: 'Top 25 Roofing' },
  { key: 'concrete', category: 'Masonry Contractors', label: 'Top 25 Concrete' },
  { key: 'hvac', category: 'HVAC', label: 'Top 25 HVAC' },
  { key: 'painting', category: 'Painting', label: 'Top 25 Painting' },
] as const;

// ==================== useTopCompanies Hook ====================

export interface UseTopCompaniesOptions {
  category: string;
  subCategory?: string;
  limit?: number;
  enabled?: boolean;
}

export function useTopCompanies(
  options: UseTopCompaniesOptions
): { data: Company[]; isLoading: boolean; isError: boolean; error: Error | null } {
  const { category, subCategory, limit = 25, enabled = true } = options;

  const [data, setData] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Cache key based on category + subCategory + limit
  const cacheKey = `${category}|${subCategory ?? ''}|${limit}`;
  const cacheRef = useRef<Map<string, Company[]>>(new Map());

  const fetchData = useCallback(async () => {
    if (!enabled || !category) return;

    // Return cached result immediately if available
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const result = await API.companies.getTopCompanies(category, subCategory, limit);
      cacheRef.current.set(cacheKey, result.companies);
      setData(result.companies);
    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err : new Error('Failed to fetch top companies'));
    } finally {
      setIsLoading(false);
    }
  }, [category, subCategory, limit, enabled, cacheKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, isError, error };
}

// ==================== useRecentlyViewed Hook ====================

export function useRecentlyViewed(maxItems: number = 10): {
  recentlyViewed: string[];
  addRecentlyViewed: (id: string) => void;
  clearRecentlyViewed: () => void;
} {
  const [recentlyViewed, setRecentlyViewed] = useLocalStorage<string[]>(
    'recentlyViewed',
    []
  );

  const addRecentlyViewed = useCallback((id: string) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(item => item !== id);
      return [id, ...filtered].slice(0, maxItems);
    });
  }, [setRecentlyViewed, maxItems]);

  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
  }, [setRecentlyViewed]);

  return {
    recentlyViewed,
    addRecentlyViewed,
    clearRecentlyViewed,
  };
}
