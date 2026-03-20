/**
 * BuildBoard - Construction Directory Types
 */

// ==================== Core Company Types ====================

export interface BusinessHours {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

export interface Company {
  id: string;
  businessName: string;
  category: string;
  subCategory?: string | null;
  location: string;
  state: string;
  city: string;
  rating: number;
  reviewCount: number;
  website: string;
  phone: string;
  email: string;
  address: string;
  zipCode: string;
  hours: BusinessHours | string;
  services: string[];
  certifications: string[];
  specialties?: string[];
  reviewSummary?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  isFeatured?: boolean;
  isNew?: boolean;
  popularityScore?: number;
  yearFounded: number | null;
  employeeCount: string | null;
  licenseNumber: string | null;
  warranty: string | null;
  emergencyService: boolean;
  freeEstimate: boolean;
  verificationStatus: 'unverified' | 'verified' | 'hcc_member';
  // Real-data fields (from Yelp + CSLB ingestion)
  latitude?: number | null;
  longitude?: number | null;
  yelpId?: string | null;
  yelpUrl?: string | null;
  priceRange?: string | null;       // "$" | "$$" | "$$$" | "$$$$"
  yearsInBusiness?: number | null;
  licenseStatus?: string | null;    // "active" | "expired" | "suspended"
  licenseType?: string | null;
  licenseExpiry?: string | null;
  bondAmount?: number | null;
  insuranceVerified?: boolean;
  backgroundCheck?: boolean;
  responseTime?: string | null;
  dataSource?: string;
  lastUpdated?: string | null;
  // Computed by search route
  distanceMi?: number;
}

// ==================== Category Types ====================

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  companyCount: number;
  subCategories: string[];
}

// ==================== Location Types ====================

export interface Location {
  id: string;
  city: string;
  state: string;
  stateCode: string;
  displayName: string;
  companyCount: number;
  zipCodes: string[];
}

export interface State {
  code: string;
  name: string;
  companyCount: number;
  cities: string[];
}

// ==================== Filter Types ====================

export interface CompanyFilters {
  category?: string;
  subCategory?: string;
  state?: string;
  city?: string;
  location?: string;
  minRating?: number;
  maxRating?: number;
  services?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  yearFoundedMin?: number;
  yearFoundedMax?: number;
  searchQuery?: string;
}

export interface FilterOptions {
  categories: Category[];
  states: State[];
  cities: string[];
  services: string[];
  ratingRanges: RatingRange[];
}

export interface RatingRange {
  label: string;
  min: number;
  max: number;
  count: number;
}

// ==================== API Response Types ====================

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CompaniesResponse extends PaginatedResponse<Company> {
  filters: FilterOptions;
}

// ==================== Search Types ====================

export interface SearchResult {
  companies: Company[];
  suggestions: string[];
  totalResults: number;
  searchTime: number;
}

export interface SearchSuggestion {
  type: 'company' | 'category' | 'location' | 'service';
  value: string;
  displayText: string;
  count?: number;
}

// ==================== Sort Types ====================

export type SortOption =
  | 'relevance'
  | 'rating_desc'
  | 'rating_asc'
  | 'reviews_desc'
  | 'reviews_asc'
  | 'name_asc'
  | 'name_desc'
  | 'popularity_desc'
  | 'newest'
  | 'oldest';

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
  label: string;
}

// ==================== Statistics Types ====================

export interface DirectoryStats {
  totalCompanies: number;
  totalCategories: number;
  totalLocations: number;
  averageRating: number;
  totalReviews: number;
  featuredCompanies: number;
  newCompaniesThisMonth: number;
}

export interface CategoryStats {
  category: string;
  companyCount: number;
  averageRating: number;
  topCompanies: Company[];
}

// ==================== Review Types ====================

export interface Review {
  id: string;
  companyId: string;
  authorName: string;
  rating: number;
  title: string;
  content: string;
  date: string;
  verified: boolean;
  helpful: number;
}

// ==================== Hook Return Types ====================

export interface UseCompaniesReturn {
  companies: Company[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  total: number;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

export interface UseCompanyReturn {
  company: Company | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export interface UseSearchReturn {
  results: Company[];
  suggestions: string[];
  isLoading: boolean;
  isError: boolean;
  query: string;
  setQuery: (query: string) => void;
}

// ==================== Enrichment Types (Google Places) ====================

export interface PlacePhoto {
  name: string; // "places/xxx/photos/yyy" -- used with /api/places/photo proxy
  widthPx: number;
  heightPx: number;
  authorAttributions: Array<{ displayName: string; uri: string }>;
}

export interface PlaceReview {
  authorAttribution: { displayName: string; uri: string; photoUri: string };
  rating: number;
  text: { text: string; languageCode: string };
  relativePublishTimeDescription: string;
  publishTime: string;
}

export interface PlaceOpeningHours {
  openNow?: boolean;
  weekdayDescriptions: string[];
}

export interface EnrichmentData {
  enriched: boolean;
  placeId: string | null;
  photos: PlacePhoto[];
  reviews: PlaceReview[];
  rating: number | null;
  userRatingCount: number | null;
  regularOpeningHours: PlaceOpeningHours | null;
  websiteUri: string | null;
  nationalPhoneNumber: string | null;
}

// ==================== AI Search Types ====================

export interface AISearchFilters {
  query?: string;
  category?: string;
  city?: string;
  state?: string;
  minRating?: number;
  services?: string[];
  zip?: string;
  radius?: number;
  loc?: string;
}

export interface FilterChip {
  key: string;       // 'category' | 'city' | 'state' | 'minRating' | 'service:X'
  label: string;     // Display text: "Plumbing", "Austin", "TX", "4.5+ Stars"
  value: string;     // Raw filter value
  type: 'category' | 'location' | 'rating' | 'service';
}

export interface AISearchRequest {
  message: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

export interface AISearchResponse {
  filters: AISearchFilters;
  summary: string;
  source: 'ai' | 'fallback';
}

export interface SearchArea {
  label: string;        // e.g. "Portland, OR 97140"
  radiusMiles: number;
  centerLat: number;
  centerLng: number;
}

export interface SearchResultsResponse {
  companies: Company[];
  totalResults: number;
  searchTime: number;
  source: 'fts5' | 'like';
  suggestions?: string[];
  searchArea?: SearchArea;
}

// ==================== Auth Types ====================

export interface AuthUser {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  accountId: number;
  membershipLevel: string;
}

// ==================== Media Types ====================

export interface MediaRecord {
  id: string;
  companyId: string;
  type: 'photo' | 'video';
  r2Key: string;
  url: string;
  filename: string;
  fileSize: number;
  sortOrder: number;
  createdAt: string;
}

// ==================== Constants ====================

export const CONSTRUCTION_CATEGORIES = [
  'Commercial Building Construction',
  'Residential Remodelers',
  'Electrical Contractors',
  'Plumbing',
  'Foundation',
  'Roofing',
  'Highway',
  'Site Preparation Contractors',
  'Flooring Contractors',
  'Painting and Wall Covering Contractors',
  'Concrete',
  'Landscaping',
  'HVAC',
  'Framing Contractors',
  'Drywall and Insulation Contractors',
] as const;

export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
] as const;

export const MAJOR_CITIES = [
  'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX',
  'Phoenix, AZ', 'Philadelphia, PA', 'San Antonio, TX', 'San Diego, CA',
  'Dallas, TX', 'San Jose, CA', 'Austin, TX', 'Jacksonville, FL',
] as const;

// Category → Unsplash image fallbacks (matching BuildBoard approach)
export const CATEGORY_IMAGES: Record<string, string[]> = {
  'Commercial Building Construction': [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=75',
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=75',
    'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400&q=75',
  ],
  'Electrical Contractors': [
    'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&q=75',
    'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=400&q=75',
  ],
  'Plumbing': [
    'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400&q=75',
    'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400&q=75',
  ],
  'Roofing': [
    'https://images.unsplash.com/photo-1632759145351-1d592919f522?w=400&q=75',
  ],
  'Foundation': [
    'https://images.unsplash.com/photo-1590479773265-7464e5d48118?w=400&q=75',
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=75',
  ],
  'Residential Remodelers': [
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=75',
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&q=75',
  ],
  'Highway': [
    'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=400&q=75',
    'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&q=75',
  ],
  '_default': [
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=75',
    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&q=75',
    'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400&q=75',
  ],
};

// Portrait images for Top 10 row
export const PORTRAIT_IMAGES = [
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1590479773265-7464e5d48118?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=300&h=450&q=75&fit=crop',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=300&h=450&q=75&fit=crop',
];
