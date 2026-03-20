# Testing Patterns

**Analysis Date:** 2026-03-11

## Test Framework

**Runner:**
- No test framework installed or configured
- No test runner present (no Jest, Vitest, Mocha, or other test runner in `package.json`)
- No test-related scripts in `package.json`
- `@tanstack/react-query` is installed (includes dev tools) but React Query is not used for data fetching -- custom hooks use raw `useState`/`useEffect`

**Assertion Library:**
- None installed

**Run Commands:**
```bash
# No test commands exist. When tests are added, recommend:
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

## Test File Organization

**Location:**
- No test files exist in the project (no `*.test.*`, `*.spec.*`, or `__tests__/` directories)
- No test infrastructure has been set up

**Recommended Setup (matching Vite + React + TypeScript stack):**
- Use Vitest as the test runner (native Vite integration, faster than Jest for Vite projects)
- Co-locate test files next to source files: `CompanyCard.test.tsx` alongside `CompanyCard.tsx`
- Place shared test utilities in `src/__test-utils__/`

**Naming (when added):**
- `{Component}.test.tsx` for component tests
- `{module}.test.ts` for utility/hook tests
- Match the existing filename convention

**Recommended Structure:**
```
src/
├── api/
│   ├── api.ts
│   ├── api.test.ts          # API client tests
│   ├── hooks.ts
│   ├── hooks.test.ts        # Hook tests
│   ├── filters.ts
│   ├── filters.test.ts      # Pure function tests (best ROI)
│   └── types.ts
├── components/
│   ├── CompanyCard.tsx
│   ├── CompanyCard.test.tsx
│   └── ...
├── pages/
│   ├── Home.tsx
│   ├── Home.test.tsx
│   └── ...
└── __test-utils__/
    ├── setup.ts             # Global test setup
    ├── render.tsx            # Custom render with providers
    └── fixtures.ts           # Test data factories
```

## Recommended Test Configuration

**Install Dependencies:**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

**Vitest Config (`vitest.config.ts` or extend `vite.config.ts`):**
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@api': path.resolve(__dirname, './src/api'),
      // ... match existing aliases from vite.config.ts
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__test-utils__/setup.ts'],
    css: true,
  },
});
```

**Package.json Scripts (to add):**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Test Structure

**Recommended Suite Organization (matching codebase conventions):**
```typescript
/**
 * filterByCategory - Filter utilities
 */
import { describe, it, expect } from 'vitest';
import { filterByCategory, applySort, paginate } from '../api/filters';
import type { Company } from '../api/types';

describe('filterByCategory', () => {
  const mockCompanies: Company[] = [/* ... */];

  it('returns all companies when category is empty', () => {
    expect(filterByCategory(mockCompanies, '')).toEqual(mockCompanies);
  });

  it('filters companies by category (case-insensitive)', () => {
    const result = filterByCategory(mockCompanies, 'Plumbing');
    expect(result.every(c => c.category.toLowerCase() === 'plumbing')).toBe(true);
  });
});
```

**Patterns:**
- Use `describe` blocks matching function/component name
- Use `it` with descriptive strings starting with verb
- Setup shared test data at describe scope
- No beforeEach/afterEach unless testing stateful side effects

## Mocking

**Framework:** Vitest built-in mocking (when tests are added)

**Recommended Patterns for This Codebase:**

**Mocking the API layer (for hook tests):**
```typescript
import { vi } from 'vitest';
import { API } from '../api/api';

vi.mock('../api/api', () => ({
  API: {
    companies: {
      getAll: vi.fn(),
      getById: vi.fn(),
      getFeatured: vi.fn(),
      search: vi.fn(),
    },
    categories: { getAll: vi.fn() },
    locations: { getAll: vi.fn() },
    stats: { getStats: vi.fn() },
    chat: { send: vi.fn() },
  },
}));
```

**Mocking fetch (for API client tests):**
```typescript
import { vi } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});
```

**Mocking react-router-dom (for component tests):**
```typescript
import { vi } from 'vitest';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: 'test-company-id' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});
```

**What to Mock:**
- `fetch` / network calls
- `react-router-dom` navigation hooks
- `window.localStorage` (for `useFavorites`, `useRecentlyViewed`)
- `window.scrollY`, `window.innerWidth` (for scroll-dependent behavior)
- Timers (for `useSearch` debounce, `HeroBanner` auto-rotate)

**What NOT to Mock:**
- Pure functions in `src/api/filters.ts` (test directly)
- Type definitions in `src/api/types.ts`
- Tailwind CSS classes
- DOM rendering (use Testing Library instead)

## Fixtures and Factories

**Test Data (recommended factory matching `Company` interface from `src/api/types.ts`):**
```typescript
import type { Company } from '../api/types';

export function createCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'test-company-1',
    businessName: 'Test Construction Co',
    category: 'Plumbing',
    subCategory: 'Residential Plumbing',
    location: 'Dallas, TX',
    state: 'TX',
    city: 'Dallas',
    rating: 4.5,
    reviewCount: 42,
    website: 'https://example.com',
    phone: '(555) 123-4567',
    email: 'info@test.com',
    address: '123 Main St',
    zipCode: '75001',
    hours: {
      monday: '8:00 AM - 5:00 PM',
      tuesday: '8:00 AM - 5:00 PM',
      wednesday: '8:00 AM - 5:00 PM',
      thursday: '8:00 AM - 5:00 PM',
      friday: '8:00 AM - 5:00 PM',
      saturday: 'Closed',
      sunday: 'Closed',
    },
    services: ['Pipe Repair', 'Drain Cleaning'],
    certifications: ['Licensed', 'Insured'],
    reviewSummary: 'Great service and professional staff.',
    imageUrl: 'https://images.unsplash.com/photo-test',
    videoUrl: null,
    isFeatured: false,
    isNew: false,
    popularityScore: 85,
    yearFounded: 2010,
    employeeCount: '10-50',
    licenseNumber: 'PLB-12345',
    warranty: '1 year parts and labor',
    emergencyService: true,
    freeEstimate: true,
    dataSource: null,
    ...overrides,
  };
}

export function createCompanyList(count: number, overrides: Partial<Company> = {}): Company[] {
  return Array.from({ length: count }, (_, i) =>
    createCompany({ id: `company-${i}`, businessName: `Company ${i}`, ...overrides })
  );
}
```

**Location:**
- Place in `src/__test-utils__/fixtures.ts`

## Coverage

**Requirements:** None enforced (no tests exist)

**Recommended Targets:**
- `src/api/filters.ts`: 90%+ (pure functions, easiest to test, highest ROI)
- `src/api/api.ts`: 80%+ (API client methods)
- `src/api/hooks.ts`: 70%+ (data fetching hooks)
- Components: 50%+ (focus on interaction logic over rendering)

**View Coverage (when configured):**
```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests (priority: HIGH):**
- Pure utility functions in `src/api/filters.ts` -- 30+ functions covering filtering, sorting, pagination, formatting
- These are the highest ROI tests: no mocking needed, deterministic, cover core business logic
- `filterByCategory`, `filterByState`, `applySort`, `paginate`, `formatPhoneNumber`, `formatReviewCount`, `isBusinessOpen`, `getActiveFilterCount`

**Hook Tests (priority: MEDIUM):**
- Custom hooks in `src/api/hooks.ts` -- test with `@testing-library/react-hooks` or `renderHook`
- Focus on: state transitions (loading -> loaded -> error), debounce behavior in `useSearch`, localStorage integration in `useFavorites`/`useRecentlyViewed`

**Component Tests (priority: MEDIUM):**
- `CompanyCard`: renders company name, handles image error fallback
- `ContentRail`: renders loading skeleton, handles empty state, renders correct card type
- `Navigation`: search form submission navigates correctly
- `SearchResults`: URL params drive filter state, pagination works
- `CompanyProfile`: displays company details, handles not-found state

**Integration Tests (priority: LOW):**
- Full page rendering with mocked API responses
- Search flow: type query -> submit -> see results
- Filter flow: apply category filter -> URL updates -> results update

**E2E Tests:**
- Not configured
- Recommend Playwright or Cypress if E2E is needed in the future
- Would test: home page loads with data, search returns results, company profile page displays details

**Server API Tests (priority: MEDIUM):**
- `server/api.js` Express endpoints -- test with `supertest`
- Requires separate test setup with in-memory SQLite database
- Key endpoints: `/api/companies` (pagination, filtering, sorting), `/api/search`, `/api/chat` (NLP parsing)
- `parseChat()` function in `server/api.js` is highly testable (pure function with string input -> structured output)

## Common Patterns

**Async Testing:**
```typescript
import { describe, it, expect, vi } from 'vitest';

it('fetches companies successfully', async () => {
  const mockData = { data: [createCompany()], total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
  vi.mocked(API.companies.getAll).mockResolvedValue(mockData);

  // ... render hook or component
  // await waitFor(() => expect(result.current.isLoading).toBe(false));
});
```

**Error Testing:**
```typescript
it('handles fetch errors gracefully', async () => {
  vi.mocked(API.companies.getAll).mockRejectedValue(new Error('Network error'));

  // ... render hook or component
  // await waitFor(() => expect(result.current.isError).toBe(true));
  // expect(result.current.error?.message).toBe('Failed to fetch companies');
});
```

**Pure Function Testing (`src/api/filters.ts`):**
```typescript
describe('applySort', () => {
  const companies = [
    createCompany({ rating: 3.0, businessName: 'Bravo' }),
    createCompany({ rating: 5.0, businessName: 'Alpha' }),
    createCompany({ rating: 4.0, businessName: 'Charlie' }),
  ];

  it('sorts by rating descending', () => {
    const sorted = applySort(companies, 'rating_desc');
    expect(sorted[0].rating).toBe(5.0);
    expect(sorted[2].rating).toBe(3.0);
  });

  it('sorts by name ascending', () => {
    const sorted = applySort(companies, 'name_asc');
    expect(sorted[0].businessName).toBe('Alpha');
  });

  it('does not mutate original array', () => {
    const original = [...companies];
    applySort(companies, 'rating_desc');
    expect(companies).toEqual(original);
  });
});
```

**Testing localStorage hooks:**
```typescript
describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds a favorite', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => result.current.addFavorite('company-1'));
    expect(result.current.isFavorite('company-1')).toBe(true);
  });

  it('persists favorites to localStorage', () => {
    const { result } = renderHook(() => useFavorites());
    act(() => result.current.addFavorite('company-1'));
    expect(JSON.parse(localStorage.getItem('favorites')!)).toContain('company-1');
  });
});
```

## Immediate Test Priorities

**Tier 1 -- Quick Wins (pure functions, no mocking):**
1. `src/api/filters.ts` -- all filter functions, sort functions, `paginate`, format utilities
2. `server/api.js` -- `parseChat()` function (extract and test NLP parsing)

**Tier 2 -- Hook Tests (mock API):**
3. `src/api/hooks.ts` -- `useSearch` (debounce behavior), `useFavorites` (localStorage), `useDebounce`

**Tier 3 -- Component Tests (mock hooks + router):**
4. `src/components/CompanyCard.tsx` -- rendering, image fallback
5. `src/components/ContentRail.tsx` -- loading/empty/data states
6. `src/pages/SearchResults.tsx` -- URL-driven state, filter interactions

---

*Testing analysis: 2026-03-11*
