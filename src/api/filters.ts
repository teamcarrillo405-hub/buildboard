/**
 * Construction Company Directory - Filter Utilities
 * Helper functions for filtering and sorting companies
 */

import type {
  Company,
  CompanyFilters,
  SortOption,
  RatingRange,
} from './types';

// ==================== Filter Functions ====================

/**
 * Filter companies by category
 */
export function filterByCategory(
  companies: Company[],
  category: string
): Company[] {
  if (!category) return companies;
  return companies.filter(
    c => c.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Filter companies by subcategory
 */
export function filterBySubCategory(
  companies: Company[],
  subCategory: string
): Company[] {
  if (!subCategory) return companies;
  return companies.filter(
    c => (c.subCategory ?? '').toLowerCase() === subCategory.toLowerCase()
  );
}

/**
 * Filter companies by location (state)
 */
export function filterByState(companies: Company[], state: string): Company[] {
  if (!state) return companies;
  return companies.filter(
    c => c.state.toLowerCase() === state.toLowerCase()
  );
}

/**
 * Filter companies by city
 */
export function filterByCity(companies: Company[], city: string): Company[] {
  if (!city) return companies;
  return companies.filter(
    c => c.city.toLowerCase() === city.toLowerCase()
  );
}

/**
 * Filter companies by location (city, state, or full location string)
 */
export function filterByLocation(
  companies: Company[],
  location: string
): Company[] {
  if (!location) return companies;
  const locationLower = location.toLowerCase();
  return companies.filter(
    c =>
      c.location.toLowerCase().includes(locationLower) ||
      c.city.toLowerCase().includes(locationLower) ||
      c.state.toLowerCase().includes(locationLower)
  );
}

/**
 * Filter companies by minimum rating
 */
export function filterByMinRating(
  companies: Company[],
  minRating: number
): Company[] {
  if (minRating === undefined || minRating === null) return companies;
  return companies.filter(c => c.rating >= minRating);
}

/**
 * Filter companies by maximum rating
 */
export function filterByMaxRating(
  companies: Company[],
  maxRating: number
): Company[] {
  if (maxRating === undefined || maxRating === null) return companies;
  return companies.filter(c => c.rating <= maxRating);
}

/**
 * Filter companies by rating range
 */
export function filterByRatingRange(
  companies: Company[],
  minRating: number,
  maxRating: number
): Company[] {
  return companies.filter(
    c => c.rating >= minRating && c.rating <= maxRating
  );
}

/**
 * Filter companies by services
 */
export function filterByServices(
  companies: Company[],
  services: string[]
): Company[] {
  if (!services || services.length === 0) return companies;
  return companies.filter(c =>
    services.some(service =>
      c.services.some(s =>
        s.toLowerCase().includes(service.toLowerCase())
      )
    )
  );
}

/**
 * Filter featured companies
 */
export function filterFeatured(companies: Company[]): Company[] {
  return companies.filter(c => !!c.isFeatured);
}

/**
 * Filter new companies
 */
export function filterNew(companies: Company[]): Company[] {
  return companies.filter(c => !!c.isNew);
}

/**
 * Filter companies by year founded range
 */
export function filterByYearFounded(
  companies: Company[],
  minYear?: number,
  maxYear?: number
): Company[] {
  return companies.filter(c => {
    if (!c.yearFounded) return false;
    if (minYear && c.yearFounded < minYear) return false;
    if (maxYear && c.yearFounded > maxYear) return false;
    return true;
  });
}

/**
 * Search companies by query string
 */
export function searchCompanies(
  companies: Company[],
  query: string
): Company[] {
  if (!query || query.trim() === '') return companies;

  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);

  return companies.filter(c => {
    const searchableText = [
      c.businessName,
      c.category,
      c.subCategory ?? '',
      c.location,
      c.city,
      c.state,
      ...c.services,
    ]
      .join(' ')
      .toLowerCase();

    // Check if all query words are present
    return queryWords.every(word => searchableText.includes(word));
  });
}

// ==================== Sort Functions ====================

/**
 * Sort companies by rating (descending)
 */
export function sortByRatingDesc(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => b.rating - a.rating);
}

/**
 * Sort companies by rating (ascending)
 */
export function sortByRatingAsc(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => a.rating - b.rating);
}

/**
 * Sort companies by review count (descending)
 */
export function sortByReviewsDesc(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => b.reviewCount - a.reviewCount);
}

/**
 * Sort companies by review count (ascending)
 */
export function sortByReviewsAsc(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => a.reviewCount - b.reviewCount);
}

/**
 * Sort companies by name (ascending)
 */
export function sortByNameAsc(companies: Company[]): Company[] {
  return [...companies].sort((a, b) =>
    a.businessName.localeCompare(b.businessName)
  );
}

/**
 * Sort companies by name (descending)
 */
export function sortByNameDesc(companies: Company[]): Company[] {
  return [...companies].sort((a, b) =>
    b.businessName.localeCompare(a.businessName)
  );
}

/**
 * Sort companies by popularity score (descending)
 */
export function sortByPopularity(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => (b.popularityScore ?? 0) - (a.popularityScore ?? 0));
}

/**
 * Sort companies by newest (using isNew flag)
 */
export function sortByNewest(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => {
    if (!!a.isNew && !b.isNew) return -1;
    if (!a.isNew && !!b.isNew) return 1;
    return (b.popularityScore ?? 0) - (a.popularityScore ?? 0);
  });
}

/**
 * Sort companies by year founded (oldest first)
 */
export function sortByOldest(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => {
    if (!a.yearFounded) return 1;
    if (!b.yearFounded) return -1;
    return a.yearFounded - b.yearFounded;
  });
}

/**
 * Apply sort option to companies
 */
export function applySort(
  companies: Company[],
  sortOption: SortOption
): Company[] {
  switch (sortOption) {
    case 'rating_desc':
      return sortByRatingDesc(companies);
    case 'rating_asc':
      return sortByRatingAsc(companies);
    case 'reviews_desc':
      return sortByReviewsDesc(companies);
    case 'reviews_asc':
      return sortByReviewsAsc(companies);
    case 'name_asc':
      return sortByNameAsc(companies);
    case 'name_desc':
      return sortByNameDesc(companies);
    case 'popularity_desc':
      return sortByPopularity(companies);
    case 'newest':
      return sortByNewest(companies);
    case 'oldest':
      return sortByOldest(companies);
    case 'relevance':
    default:
      return companies;
  }
}

// ==================== Combined Filter Function ====================

/**
 * Apply all filters to companies
 */
export function applyFilters(
  companies: Company[],
  filters: CompanyFilters
): Company[] {
  let result = [...companies];

  if (filters.category) {
    result = filterByCategory(result, filters.category);
  }

  if (filters.subCategory) {
    result = filterBySubCategory(result, filters.subCategory);
  }

  if (filters.state) {
    result = filterByState(result, filters.state);
  }

  if (filters.city) {
    result = filterByCity(result, filters.city);
  }

  if (filters.location) {
    result = filterByLocation(result, filters.location);
  }

  if (filters.minRating !== undefined) {
    result = filterByMinRating(result, filters.minRating);
  }

  if (filters.maxRating !== undefined) {
    result = filterByMaxRating(result, filters.maxRating);
  }

  if (filters.services && filters.services.length > 0) {
    result = filterByServices(result, filters.services);
  }

  if (filters.isFeatured !== undefined) {
    result = filters.isFeatured ? filterFeatured(result) : result;
  }

  if (filters.isNew !== undefined) {
    result = filters.isNew ? filterNew(result) : result;
  }

  if (filters.yearFoundedMin || filters.yearFoundedMax) {
    result = filterByYearFounded(
      result,
      filters.yearFoundedMin,
      filters.yearFoundedMax
    );
  }

  if (filters.searchQuery) {
    result = searchCompanies(result, filters.searchQuery);
  }

  return result;
}

// ==================== Utility Functions ====================

/**
 * Get unique categories from companies
 */
export function getUniqueCategories(companies: Company[]): string[] {
  return Array.from(new Set(companies.map(c => c.category)));
}

/**
 * Get unique subcategories from companies
 */
export function getUniqueSubCategories(companies: Company[]): string[] {
  return Array.from(new Set(companies.map(c => c.subCategory ?? '').filter(Boolean)));
}

/**
 * Get unique states from companies
 */
export function getUniqueStates(companies: Company[]): string[] {
  return Array.from(new Set(companies.map(c => c.state)));
}

/**
 * Get unique cities from companies
 */
export function getUniqueCities(companies: Company[]): string[] {
  return Array.from(new Set(companies.map(c => c.city)));
}

/**
 * Get unique services from companies
 */
export function getUniqueServices(companies: Company[]): string[] {
  const services = new Set<string>();
  companies.forEach(c => c.services.forEach(s => services.add(s)));
  return Array.from(services);
}

/**
 * Get subcategories for a category
 */
export function getSubCategoriesForCategory(
  companies: Company[],
  category: string
): string[] {
  return Array.from(
    new Set(
      companies
        .filter(c => c.category.toLowerCase() === category.toLowerCase())
        .map(c => c.subCategory ?? '').filter(Boolean)
    )
  );
}

/**
 * Get cities for a state
 */
export function getCitiesForState(
  companies: Company[],
  state: string
): string[] {
  return Array.from(
    new Set(
      companies
        .filter(c => c.state.toLowerCase() === state.toLowerCase())
        .map(c => c.city)
    )
  );
}

/**
 * Calculate rating distribution
 */
export function getRatingDistribution(
  companies: Company[]
): { rating: number; count: number }[] {
  const distribution = new Map<number, number>();

  for (let i = 5; i >= 1; i -= 0.5) {
    distribution.set(i, 0);
  }

  companies.forEach(c => {
    const roundedRating = Math.round(c.rating * 2) / 2;
    const current = distribution.get(roundedRating) || 0;
    distribution.set(roundedRating, current + 1);
  });

  return Array.from(distribution.entries())
    .map(([rating, count]) => ({ rating, count }))
    .sort((a, b) => b.rating - a.rating);
}

/**
 * Calculate rating ranges with counts
 */
export function getRatingRanges(companies: Company[]): RatingRange[] {
  const ranges = [
    { label: '4.5 & up', min: 4.5, max: 5, count: 0 },
    { label: '4.0 & up', min: 4.0, max: 5, count: 0 },
    { label: '3.5 & up', min: 3.5, max: 5, count: 0 },
    { label: '3.0 & up', min: 3.0, max: 5, count: 0 },
  ];

  companies.forEach(c => {
    ranges.forEach(range => {
      if (c.rating >= range.min) {
        range.count++;
      }
    });
  });

  return ranges;
}

/**
 * Get active filter count
 */
export function getActiveFilterCount(filters: CompanyFilters): number {
  let count = 0;

  if (filters.category) count++;
  if (filters.subCategory) count++;
  if (filters.state) count++;
  if (filters.city) count++;
  if (filters.location) count++;
  if (filters.minRating !== undefined) count++;
  if (filters.maxRating !== undefined) count++;
  if (filters.services && filters.services.length > 0) count++;
  if (filters.isFeatured !== undefined) count++;
  if (filters.isNew !== undefined) count++;
  if (filters.yearFoundedMin) count++;
  if (filters.yearFoundedMax) count++;
  if (filters.searchQuery) count++;

  return count;
}

/**
 * Clear all filters
 */
export function clearAllFilters(): CompanyFilters {
  return {};
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters(filters: CompanyFilters): boolean {
  return getActiveFilterCount(filters) > 0;
}

// ==================== Pagination Functions ====================

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Paginate an array of items
 */
export function paginate<T>(
  items: T[],
  page: number = 1,
  limit: number = 20
): PaginationResult<T> {
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  return {
    data: items.slice(startIndex, endIndex),
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

// ==================== Format Functions ====================

/**
 * Format rating as stars display
 */
export function formatRatingStars(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    '★'.repeat(fullStars) +
    (hasHalfStar ? '½' : '') +
    '☆'.repeat(emptyStars)
  );
}

/**
 * Format review count with proper pluralization
 */
export function formatReviewCount(count: number): string {
  if (count === 0) return 'No reviews';
  if (count === 1) return '1 review';
  return `${count} reviews`;
}

/**
 * Format phone number
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

/**
 * Format business hours
 */
export function formatBusinessHours(hours: string): string {
  if (hours.toLowerCase() === 'closed') return 'Closed';
  return hours;
}

/**
 * Check if business is currently open
 */
export function isBusinessOpen(hours: Record<string, string>): boolean {
  const now = new Date();
  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const today = dayNames[now.getDay()];
  const todayHours = hours[today];

  if (!todayHours || todayHours.toLowerCase() === 'closed') {
    return false;
  }

  const [openTime, closeTime] = todayHours.split(' - ');
  if (!openTime || !closeTime) return false;

  const currentTime = now.getHours() * 60 + now.getMinutes();
  const parseTime = (timeStr: string): number => {
    const [time, period] = timeStr.trim().split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    let totalMinutes = hours * 60 + (minutes || 0);
    if (period === 'PM' && hours !== 12) totalMinutes += 12 * 60;
    if (period === 'AM' && hours === 12) totalMinutes = minutes || 0;
    return totalMinutes;
  };

  const openMinutes = parseTime(openTime);
  const closeMinutes = parseTime(closeTime);

  return currentTime >= openMinutes && currentTime <= closeMinutes;
}

// ==================== Export All ====================

export const Filters = {
  // Filter functions
  byCategory: filterByCategory,
  bySubCategory: filterBySubCategory,
  byState: filterByState,
  byCity: filterByCity,
  byLocation: filterByLocation,
  byMinRating: filterByMinRating,
  byMaxRating: filterByMaxRating,
  byRatingRange: filterByRatingRange,
  byServices: filterByServices,
  featured: filterFeatured,
  new: filterNew,
  byYearFounded: filterByYearFounded,
  search: searchCompanies,

  // Sort functions
  sortByRatingDesc,
  sortByRatingAsc,
  sortByReviewsDesc,
  sortByReviewsAsc,
  sortByNameAsc,
  sortByNameDesc,
  sortByPopularity,
  sortByNewest,
  sortByOldest,
  applySort,

  // Combined
  applyAll: applyFilters,

  // Utility
  getUniqueCategories,
  getUniqueSubCategories,
  getUniqueStates,
  getUniqueCities,
  getUniqueServices,
  getSubCategoriesForCategory,
  getCitiesForState,
  getRatingDistribution,
  getRatingRanges,
  getActiveFilterCount,
  clearAllFilters,
  hasActiveFilters,

  // Pagination
  paginate,

  // Format
  formatRatingStars,
  formatReviewCount,
  formatPhoneNumber,
  formatBusinessHours,
  isBusinessOpen,
};

export default Filters;
