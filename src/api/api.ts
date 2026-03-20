/**
 * BuildBoard - Live API Client
 * Calls the Express + SQLite backend at /api
 */

import type {
  Company,
  Category,
  CompanyFilters,
  FilterOptions,
  CompaniesResponse,
  SortOption,
  SearchResult,
  DirectoryStats,
  Location,
  EnrichmentData,
  AISearchRequest,
  AISearchResponse,
  AISearchFilters,
  SearchResultsResponse,
  AuthUser,
  MediaRecord,
} from './types';

const API_BASE = '/api';

// Module-level cache for filter options (categories + states rarely change)
let filterOptionsCache: FilterOptions | null = null;
let filterOptionsFetchPromise: Promise<FilterOptions> | null = null;

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ==================== Company API ====================

export const CompanyAPI = {
  async getAll(
    filters: CompanyFilters = {},
    page: number = 1,
    limit: number = 20,
    sort: SortOption = 'relevance'
  ): Promise<CompaniesResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
    });

    if (filters.category) params.set('category', filters.category);
    if (filters.state) params.set('state', filters.state);
    if (filters.city) params.set('city', filters.city);
    if (filters.location) params.set('location', filters.location);
    if (filters.minRating !== undefined) params.set('minRating', String(filters.minRating));
    if (filters.maxRating !== undefined) params.set('maxRating', String(filters.maxRating));
    if (filters.searchQuery) params.set('search', filters.searchQuery);

    const response = await fetchJSON<CompaniesResponse>(`${API_BASE}/companies?${params}`);

    // Cache filter options — only fetch once
    if (!filterOptionsCache && !filterOptionsFetchPromise) {
      filterOptionsFetchPromise = this.getFilterOptions().then(opts => {
        filterOptionsCache = opts;
        filterOptionsFetchPromise = null;
        return opts;
      });
    }
    const filterOptions = filterOptionsCache ?? await (filterOptionsFetchPromise ?? this.getFilterOptions());

    return {
      ...response,
      filters: filterOptions,
    };
  },

  async getById(id: string): Promise<Company | null> {
    try {
      return await fetchJSON<Company>(`${API_BASE}/companies/${encodeURIComponent(id)}`);
    } catch {
      return null;
    }
  },

  async getFeatured(limit: number = 10): Promise<Company[]> {
    return fetchJSON<Company[]>(`${API_BASE}/featured?limit=${limit}`);
  },

  async getNew(limit: number = 10): Promise<Company[]> {
    return fetchJSON<Company[]>(`${API_BASE}/new?limit=${limit}`);
  },

  async getTopRated(limit: number = 10): Promise<Company[]> {
    return fetchJSON<Company[]>(`${API_BASE}/top-rated?limit=${limit}`);
  },

  async getByCategory(category: string, limit: number = 20): Promise<Company[]> {
    const response = await fetchJSON<CompaniesResponse>(
      `${API_BASE}/companies?category=${encodeURIComponent(category)}&limit=${limit}&sort=rating_desc`
    );
    return response.data;
  },

  async getByState(state: string, limit: number = 20): Promise<Company[]> {
    const response = await fetchJSON<CompaniesResponse>(
      `${API_BASE}/companies?state=${encodeURIComponent(state)}&limit=${limit}&sort=rating_desc`
    );
    return response.data;
  },

  async getByLocation(location: string, limit: number = 20): Promise<Company[]> {
    const response = await fetchJSON<CompaniesResponse>(
      `${API_BASE}/companies?location=${encodeURIComponent(location)}&limit=${limit}&sort=rating_desc`
    );
    return response.data;
  },

  async getSimilar(companyId: string, limit: number = 6): Promise<Company[]> {
    return fetchJSON<Company[]>(`${API_BASE}/similar/${encodeURIComponent(companyId)}?limit=${limit}`);
  },

  async search(query: string, limit: number = 20): Promise<SearchResult> {
    const result = await fetchJSON<SearchResult>(
      `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return {
      ...result,
      searchTime: result.searchTime || 0,
    };
  },

  async getFilterOptions(): Promise<FilterOptions> {
    const [categories, states] = await Promise.all([
      fetchJSON<{ name: string; companyCount: number; avgRating: number }[]>(`${API_BASE}/categories`),
      fetchJSON<{ code: string; name: string; companyCount: number }[]>(`${API_BASE}/states`),
    ]);

    return {
      categories: categories.map((c, i) => ({
        id: String(i),
        name: c.name,
        slug: c.name.toLowerCase().replace(/\s+/g, '-'),
        description: '',
        icon: '',
        companyCount: c.companyCount,
        subCategories: [],
      })),
      states: states.map(s => ({
        code: s.code,
        name: s.name,
        companyCount: s.companyCount,
        cities: [],
      })),
      cities: [],
      services: [],
      ratingRanges: [
        { label: '4.5 & up', min: 4.5, max: 5, count: 0 },
        { label: '4.0 & up', min: 4.0, max: 5, count: 0 },
        { label: '3.5 & up', min: 3.5, max: 5, count: 0 },
        { label: '3.0 & up', min: 3.0, max: 5, count: 0 },
      ],
    };
  },

  async getCompaniesByState(states: string[], limit: number = 10): Promise<Record<string, Company[]>> {
    return fetchJSON<Record<string, Company[]>>(
      `${API_BASE}/companies-by-state?states=${states.join(',')}&limit=${limit}`
    );
  },

  async getTopCompanies(
    category: string,
    subCategory?: string,
    limit: number = 25
  ): Promise<{ companies: Company[]; total: number; category: string }> {
    const params = new URLSearchParams({ category, limit: String(limit) });
    if (subCategory) params.set('subCategory', subCategory);
    return fetchJSON(`${API_BASE}/top-companies?${params}`);
  },
};

// ==================== Category API ====================

export const CategoryAPI = {
  async getAll(): Promise<Category[]> {
    const cats = await fetchJSON<{ name: string; companyCount: number; avgRating: number }[]>(`${API_BASE}/categories`);
    return cats.map((c, i) => ({
      id: String(i),
      name: c.name,
      slug: c.name.toLowerCase().replace(/\s+/g, '-'),
      description: '',
      icon: '',
      companyCount: c.companyCount,
      subCategories: [],
    }));
  },

  async getBySlug(slug: string): Promise<Category | null> {
    const all = await this.getAll();
    return all.find(c => c.slug === slug) || null;
  },

  async getWithCounts(): Promise<Category[]> {
    return this.getAll();
  },
};

// ==================== Location API ====================

export const LocationAPI = {
  async getAll(): Promise<Location[]> {
    const states = await fetchJSON<{ code: string; name: string; companyCount: number }[]>(`${API_BASE}/states`);
    return states.map((s, i) => ({
      id: String(i),
      city: '',
      state: s.name,
      stateCode: s.code,
      displayName: s.name,
      companyCount: s.companyCount,
      zipCodes: [],
    }));
  },

  async getById(id: string): Promise<Location | null> {
    const all = await this.getAll();
    return all.find(l => l.id === id) || null;
  },

  async getByState(stateCode: string): Promise<Location[]> {
    const all = await this.getAll();
    return all.filter(l => l.stateCode.toLowerCase() === stateCode.toLowerCase());
  },

  async getPopular(limit: number = 10): Promise<Location[]> {
    const all = await this.getAll();
    return all.sort((a, b) => b.companyCount - a.companyCount).slice(0, limit);
  },

  async search(query: string, limit: number = 10): Promise<Location[]> {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all
      .filter(l => l.state.toLowerCase().includes(q) || l.stateCode.toLowerCase().includes(q))
      .slice(0, limit);
  },
};

// ==================== Stats API ====================

export const StatsAPI = {
  async getStats(): Promise<DirectoryStats> {
    const stats = await fetchJSON<any>(`${API_BASE}/stats`);
    return {
      totalCompanies: stats.totalCompanies,
      totalCategories: stats.totalCategories,
      totalLocations: stats.totalStates,
      averageRating: stats.averageRating,
      totalReviews: stats.totalReviews,
      featuredCompanies: 0,
      newCompaniesThisMonth: 0,
    };
  },

  async getCategoryStats(): Promise<{ category: string; companyCount: number; averageRating: number }[]> {
    return fetchJSON(`${API_BASE}/categories`);
  },
};

// ==================== Chat API ====================

export interface ChatResponse {
  text: string;
  companies: Company[];
}

export const ChatAPI = {
  async send(message: string): Promise<ChatResponse> {
    const data = await fetchJSON<ChatResponse>(
      `${API_BASE}/chat?message=${encodeURIComponent(message)}`
    );
    return {
      text: data.text || '',
      companies: data.companies || [],
    };
  },
};

// ==================== Enrichment API ====================

export const EnrichmentAPI = {
  async getEnrichment(companyId: string): Promise<EnrichmentData> {
    return fetchJSON<EnrichmentData>(
      `${API_BASE}/companies/${encodeURIComponent(companyId)}/enrichment`
    );
  },

  getPhotoUrl(photoName: string, maxWidth: number = 400): string {
    return `${API_BASE}/places/photo?name=${encodeURIComponent(photoName)}&maxWidth=${maxWidth}`;
  },
};

// ==================== AI Search API ====================

export const AISearchAPI = {
  async search(request: AISearchRequest): Promise<AISearchResponse> {
    const res = await fetch(`${API_BASE}/ai-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`AI search error: ${res.status}`);
    return res.json();
  },
};

// ==================== FTS Search API ====================

export const FTSSearchAPI = {
  async search(params: AISearchFilters & {
    limit?: number;
    offset?: number;
    sort?: string;
    zip?: string;
    radius?: number;
    loc?: string;
  }): Promise<SearchResultsResponse> {
    const sp = new URLSearchParams();
    if (params.query) sp.set('q', params.query);
    if (params.category) sp.set('category', params.category);
    if (params.state) sp.set('state', params.state);
    if (params.city) sp.set('city', params.city);
    if (params.minRating) sp.set('minRating', String(params.minRating));
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.offset) sp.set('offset', String(params.offset));
    if (params.sort) sp.set('sort', params.sort);
    if (params.zip) sp.set('zip', params.zip);
    if (params.radius !== undefined) sp.set('radius', String(params.radius));
    if (params.loc) sp.set('loc', params.loc);
    if ((params as Record<string, unknown>).licenseOnly) sp.set('licenseOnly', 'true');
    if ((params as Record<string, unknown>).realOnly) sp.set('realOnly', 'true');
    return fetchJSON<SearchResultsResponse>(`${API_BASE}/search?${sp}`);
  },
};

// ==================== Auth API ====================

export const AuthAPI = {
  getLoginUrl(): string {
    return `${API_BASE}/auth/login`;
  },

  async getMe(): Promise<{ user: AuthUser | null }> {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (!res.ok) return { user: null };
    return res.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  },
};

// ==================== Favorites API ====================

export const FavoritesAPI = {
  async getAll(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/favorites`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Favorites error: ${res.status}`);
    const data: { favorites: string[] } = await res.json();
    return data.favorites;
  },

  async add(companyId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/favorites/${encodeURIComponent(companyId)}`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Add favorite error: ${res.status}`);
  },

  async remove(companyId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/favorites/${encodeURIComponent(companyId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Remove favorite error: ${res.status}`);
  },

  async sync(ids: string[]): Promise<void> {
    const res = await fetch(`${API_BASE}/favorites/sync`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`Sync favorites error: ${res.status}`);
  },
};

// ==================== Admin API ====================

// ---------------------------------------------------------------------------
// Admin secret (for local/dev use without WA SSO).
// Set once via AdminAPI.setSecret(); persists for the browser session only.
// ---------------------------------------------------------------------------
let _adminSecret: string | null = null;

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return _adminSecret
    ? { ...extra, Authorization: `Bearer ${_adminSecret}` }
    : extra;
}

export interface SyncStatus {
  status: 'idle' | 'running' | 'complete' | 'error';
  processed?: number;
  inserted?: number;
  updated?: number;
  errors?: number;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  message?: string;
}

export interface EnrichStatus {
  status: 'idle' | 'running' | 'complete' | 'error';
  total?: number;
  matched?: number;
  skipped?: number;
  errors?: number;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  message?: string;
}

export const AdminAPI = {
  /** Store the admin secret for the session. Pass null to clear. */
  setSecret(secret: string | null): void {
    _adminSecret = secret;
  },

  async searchCompanies(params: {
    q?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ companies: Company[]; totalResults: number }> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.status) sp.set('status', params.status);
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.offset) sp.set('offset', String(params.offset));

    const res = await fetch(`${API_BASE}/admin/companies?${sp}`, {
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`Admin API error: ${res.status}`);
    return res.json();
  },

  async setVerificationStatus(
    companyId: string,
    status: 'unverified' | 'verified' | 'hcc_member',
  ): Promise<void> {
    const res = await fetch(
      `${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/verification`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status }),
      },
    );
    if (!res.ok) throw new Error(`Set verification error: ${res.status}`);
  },

  async getStats(): Promise<{
    unverified: number;
    verified: number;
    hcc_member: number;
    total: number;
    dataSources?: Record<string, number>;
  }> {
    const res = await fetch(`${API_BASE}/admin/stats`, {
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`Admin stats error: ${res.status}`);
    return res.json();
  },

  /** Trigger a Yelp Fusion sync in the background. Returns immediately. */
  async startYelpSync(opts?: { metros?: string[]; categories?: string[] }): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/admin/sync-yelp`, {
      method: 'POST',
      credentials: 'include',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(opts ?? {}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) || `Sync start error: ${res.status}`);
    }
    return res.json();
  },

  /** Poll the current Yelp sync progress. */
  async getSyncStatus(): Promise<SyncStatus> {
    const res = await fetch(`${API_BASE}/admin/sync-status`, {
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`Sync status error: ${res.status}`);
    return res.json();
  },

  /** Start Yelp match-and-enrich for existing records. Returns immediately. */
  async startYelpEnrich(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/admin/enrich-yelp`, {
      method: 'POST',
      credentials: 'include',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) || `Enrich start error: ${res.status}`);
    }
    return res.json();
  },

  /** Poll the current Yelp enrich progress. */
  async getEnrichStatus(): Promise<EnrichStatus> {
    const res = await fetch(`${API_BASE}/admin/enrich-status`, {
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`Enrich status error: ${res.status}`);
    return res.json();
  },

  async getDataQuality(): Promise<{
    bySource: { dataSource: string; count: number; avgRating: number; withPhoto: number; withCoords: number }[];
    yelpCount: number;
    total: number;
  }> {
    const res = await fetch(`${API_BASE}/admin/data-quality`, {
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`Data quality error: ${res.status}`);
    return res.json();
  },

  async purgeSeedData(): Promise<{ success: boolean; deleted: number; seedRecordsBefore: number; totalRemaining: number }> {
    const res = await fetch(`${API_BASE}/admin/purge-seed-data`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Purge error: ${res.status}`);
    return res.json();
  },

  /** Fetch the list of configured state license data sources. */
  async getStateLicenseSources(): Promise<{
    sources: Array<{
      stateCode: string;
      stateName: string;
      agency: string;
      agencyUrl: string;
      format: string;
      estimatedRecords: number;
      requiresFirecrawl: boolean;
    }>;
  }> {
    const res = await fetch(`${API_BASE}/admin/state-license-sources`, {
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`State license sources error: ${res.status}`);
    return res.json();
  },

  /** Trigger a state license database import (background). Responds immediately. */
  async syncStateLicense(stateCode: string): Promise<{ status: string; stateCode: string; message: string }> {
    const res = await fetch(`${API_BASE}/admin/sync-state-license`, {
      method: 'POST',
      credentials: 'include',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ stateCode }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) || `State sync error: ${res.status}`);
    }
    return res.json();
  },

  /** Trigger an FTS5 index force-rebuild (background). Responds immediately. */
  async rebuildFts(): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/admin/rebuild-fts`, {
      method: 'POST',
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((body.error as string) || `FTS rebuild error: ${res.status}`);
    }
    return res.json();
  },

  /** Poll FTS rebuild progress. */
  async getFtsStatus(): Promise<{
    status: 'idle' | 'running' | 'complete' | 'error';
    rowsIndexed?: number;
    elapsedSeconds?: number;
    startedAt?: string;
    finishedAt?: string;
    error?: string;
    currentCount?: number;
  }> {
    const res = await fetch(`${API_BASE}/admin/fts-status`, {
      credentials: 'include',
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`FTS status error: ${res.status}`);
    return res.json();
  },
};

// ==================== Profile API ====================

export const ProfileAPI = {
  async update(companyId: string, data: Record<string, unknown>): Promise<Company> {
    const res = await fetch(`${API_BASE}/profile/${encodeURIComponent(companyId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Profile update error: ${res.status}`);
    return res.json();
  },

  async getUploadUrl(
    companyId: string,
    file: { filename: string; contentType: string; fileSize: number },
  ): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
    const res = await fetch(`${API_BASE}/profile/${encodeURIComponent(companyId)}/upload-url`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
    if (!res.ok) throw new Error(`Upload URL error: ${res.status}`);
    return res.json();
  },

  async registerMedia(
    companyId: string,
    media: { key: string; type: string; filename: string; fileSize: number },
  ): Promise<MediaRecord> {
    const res = await fetch(`${API_BASE}/profile/${encodeURIComponent(companyId)}/media`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(media),
    });
    if (!res.ok) throw new Error(`Register media error: ${res.status}`);
    return res.json();
  },

  async getMedia(companyId: string): Promise<MediaRecord[]> {
    return fetchJSON<MediaRecord[]>(`${API_BASE}/profile/${encodeURIComponent(companyId)}/media`);
  },

  async deleteMedia(companyId: string, mediaId: string): Promise<void> {
    const res = await fetch(
      `${API_BASE}/profile/${encodeURIComponent(companyId)}/media/${mediaId}`,
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );
    if (!res.ok) throw new Error(`Delete media error: ${res.status}`);
  },

  async uploadFile(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!res.ok) throw new Error(`R2 upload error: ${res.status}`);
  },
};

// ==================== Export ====================

export const API = {
  companies: CompanyAPI,
  categories: CategoryAPI,
  locations: LocationAPI,
  stats: StatsAPI,
  chat: ChatAPI,
  enrichment: EnrichmentAPI,
  aiSearch: AISearchAPI,
  ftsSearch: FTSSearchAPI,
  auth: AuthAPI,
  favorites: FavoritesAPI,
  admin: AdminAPI,
  profile: ProfileAPI,
};

export default API;
