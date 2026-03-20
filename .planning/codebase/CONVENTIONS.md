# Coding Conventions

**Analysis Date:** 2026-03-11

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `CompanyCard.tsx`, `ContentRail.tsx`, `HeroBanner.tsx`)
- Pages: PascalCase (e.g., `Home.tsx`, `SearchResults.tsx`, `CompanyProfile.tsx`)
- Layouts: PascalCase (e.g., `MainLayout.tsx`)
- Non-component modules: camelCase (e.g., `api.ts`, `hooks.ts`, `filters.ts`, `types.ts`)
- Server files: camelCase `.js` (e.g., `server/api.js`, `server/import-data.js`)

**Functions:**
- React components: PascalCase arrow functions assigned to `const` (e.g., `const CompanyCard: React.FC<...> = (...)`)
- Custom hooks: camelCase with `use` prefix (e.g., `useCompanies`, `useFeaturedCompanies`, `useSearch`, `useDebounce`)
- Helper/utility functions: camelCase (e.g., `filterByCategory`, `sortByRatingDesc`, `applyFilters`, `parseRow`)
- Event handlers: camelCase with `handle` prefix (e.g., `handleSearchSubmit`, `handleImgError`, `handleMouseEnter`)

**Variables:**
- camelCase for all variables, state, refs (e.g., `searchQuery`, `isLoading`, `scrollRef`, `totalPages`)
- Boolean state variables use `is`/`has`/`can` prefix (e.g., `isLoading`, `isError`, `isScrolled`, `hasNextPage`, `canScrollLeft`)

**Types/Interfaces:**
- PascalCase for all types and interfaces (e.g., `Company`, `CompanyFilters`, `SearchResult`)
- Props interfaces: `{ComponentName}Props` (e.g., `CompanyCardProps`, `ContentRailProps`, `NavigationProps`)
- Hook return types: `Use{Name}Return` (e.g., `UseCompaniesReturn`, `UseSearchReturn`)
- Hook option types: `Use{Name}Options` (e.g., `UseCompaniesOptions`, `UseSearchOptions`)
- Generic API response types: `ApiResponse<T>`, `PaginatedResponse<T>`

**Constants:**
- SCREAMING_SNAKE_CASE for constant arrays/objects at module level (e.g., `CONSTRUCTION_CATEGORIES`, `US_STATES`, `CATEGORY_IMAGES`, `PORTRAIT_IMAGES`, `CATEGORY_CONFIG`, `TOP_STATES`)
- `as const` assertion used for immutable constant arrays

## Code Style

**Formatting:**
- No Prettier config detected -- formatting appears manual/editor-based
- 2-space indentation throughout all `.tsx`, `.ts`, `.js` files
- Single quotes for string literals in TypeScript/JavaScript
- Semicolons used consistently at end of statements
- Trailing commas in multi-line arrays, objects, and parameter lists
- Max line length approximately 120-140 characters (no strict enforcement)

**Linting:**
- ESLint configured via `package.json` scripts: `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`
- Plugins: `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- No `.eslintrc` config file found at root -- relies on ESLint plugin defaults or inline config
- TypeScript strict mode enabled in `tsconfig.json` (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`)

**TypeScript Strictness:**
- `strict: true` in `tsconfig.json`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`
- Target: ES2020
- Module: ESNext with bundler resolution

## Component Patterns

**Component Declaration:**
- Use `React.FC<Props>` for all components
- Arrow function syntax: `const Component: React.FC<Props> = ({ prop1, prop2 }) => { ... }`
- Default export at bottom of file: `export default ComponentName;`
- One component per file (with occasional inline sub-components like `FilterTag` in `src/components/FilterBar.tsx`)

**Example pattern from `src/components/CompanyCard.tsx`:**
```tsx
interface CompanyCardProps {
  company: Company;
  index?: number;
  fill?: boolean;
}

const CompanyCard: React.FC<CompanyCardProps> = ({ company, index = 0, fill = false }) => {
  // hooks
  const [imgError, setImgError] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // callbacks
  const handleImgError = useCallback(() => setImgError(true), []);

  return (
    <div ref={wrapRef} className="...">
      {/* JSX */}
    </div>
  );
};

export default CompanyCard;
```

**Props Interface Documentation:**
- Use JSDoc-style `/** comment */` for individual prop documentation where needed
- Example from `src/components/CompanyCard.tsx`: `/** When true, card fills its parent width instead of fixed 230px */`

## Import Organization

**Order:**
1. React core (`import React, { useState, useRef, useCallback } from 'react'`)
2. Third-party libraries (`react-router-dom`, `framer-motion`, `lucide-react`)
3. Internal modules -- types first with `import type`, then implementations
4. Local components (relative imports `./` or `../`)
5. Styles (CSS imports last)

**Example from `src/pages/Home.tsx`:**
```tsx
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import HeroBanner from '../components/HeroBanner';
import ContentRail from '../components/ContentRail';
import { useFeaturedCompanies, useTopRatedCompanies, ... } from '../api/hooks';
```

**Path Aliases:**
- Configured in both `tsconfig.json` and `vite.config.ts`
- Available: `@/*`, `@components/*`, `@pages/*`, `@api/*`, `@hooks/*`, `@types/*`, `@utils/*`, `@context/*`, `@styles/*`
- **Not actively used in source code** -- all imports use relative paths (`../api/types`, `./PreviewPopup`)
- When writing new code: prefer relative imports to match existing convention, but aliases are available

## Error Handling

**API Layer (`src/api/api.ts`):**
- Generic `fetchJSON<T>` helper throws on non-OK HTTP responses: `if (!res.ok) throw new Error('API error: ' + res.status)`
- Individual API methods catch and return `null` for single-entity lookups (e.g., `getById` returns `null` on error)
- No structured error types -- uses plain `Error` objects

**Hook Layer (`src/api/hooks.ts`):**
- All data-fetching hooks follow the same try/catch pattern:
  ```tsx
  try {
    const data = await API.someMethod();
    setData(data);
  } catch (err) {
    setIsError(true);
    setError(err instanceof Error ? err : new Error('Failed to fetch X'));
  } finally {
    setIsLoading(false);
  }
  ```
- Error state exposed as `{ isError: boolean; error: Error | null }`
- `instanceof Error` guard with fallback message

**Component Layer:**
- Loading states render skeletons/spinners (pulsing div placeholders)
- Error states render fallback UI with navigation back to home
- Image errors handled via `onError` callback with fallback images from `CATEGORY_IMAGES['_default']`

**Server Layer (`server/api.js`):**
- Chat endpoint wraps entire handler in try/catch, returns friendly error message
- Other endpoints have no explicit error handling (rely on Express default)
- 404 responses: `res.status(404).json({ error: 'Not found' })`

## Logging

**Framework:** `console` (browser and Node.js built-in)

**Patterns:**
- Client-side: `console.error('Error reading from localStorage:', error)` in `src/api/hooks.ts`
- Server-side: `console.error('Chat error:', err)` in `server/api.js`
- Server startup: `console.log` for port and endpoint listing
- No structured logging library

## Comments

**When to Comment:**
- File-level JSDoc block at top of every file explaining the file's purpose:
  ```tsx
  /**
   * CompanyCard Component
   * Netflix-style card: 16:9 image with name overlay + hover preview popup
   */
  ```
- Section separators using `// ==================== Section Name ====================` in larger files (`types.ts`, `hooks.ts`, `filters.ts`, `server/api.js`)
- Inline comments for non-obvious logic: `// Reset to first page when filters change`
- Improvement tracking comments: `// Improvement #5: Mobile tap support`, `// Improvement #6: scroll arrows`, `// Improvement #7: auto-rotate`

**JSDoc/TSDoc:**
- JSDoc `/** */` used for utility functions in `src/api/filters.ts` (e.g., `/** Filter companies by category */`)
- Not used for component props or hook parameters (types serve as documentation)
- Server functions have no JSDoc

## Function Design

**Size:**
- Components: 30-100 lines typical, largest is `SearchResults.tsx` at ~555 lines
- Utility functions: 5-20 lines
- Hooks: 40-80 lines each (repetitive boilerplate pattern)

**Parameters:**
- Destructured options objects for hooks: `function useCompanies(options: UseCompaniesOptions = {})`
- Props destructured in function signature for components
- Default values provided in destructuring: `{ limit = 10, enabled = true }`

**Return Values:**
- Components return JSX
- Hooks return structured objects: `{ data, isLoading, isError, error, refetch }`
- Utility functions return transformed data (new arrays, formatted strings)
- Sort functions always create new arrays with spread: `[...companies].sort(...)`

## Module Design

**Exports:**
- Components: single default export per file
- API modules: named exports for individual API objects + default aggregate export
  - `src/api/api.ts`: exports `CompanyAPI`, `CategoryAPI`, `LocationAPI`, `StatsAPI`, `ChatAPI` individually, plus `API` aggregate as default
- Hooks: all named exports from `src/api/hooks.ts` (no default)
- Filters: individual named function exports + `Filters` namespace object + default export of `Filters`
- Types: all named exports from `src/api/types.ts`

**Barrel Files:**
- No barrel/index files used -- direct imports from specific files

**API Client Organization:**
- Namespace-style object literals for API grouping: `CompanyAPI = { async getAll() {...}, async getById() {...} }`
- Allows `API.companies.getAll()` calling pattern

## Tailwind / Styling Conventions

**Class Organization:**
- Utility-first Tailwind classes directly in JSX `className` attributes
- Long class strings on single lines (no multi-line splitting)
- Dynamic classes via template literals with ternary: `` className={`base-classes ${condition ? 'active-classes' : 'inactive-classes'}`} ``
- No CSS modules, styled-components, or CSS-in-JS

**Design Tokens (from `tailwind.config.js`):**
- Brand color: `brand-gold` (#F5C518), `brand-gold-hover` (#D4A017)
- Background: `background` (#141414), `surface` (#222222), `surface-hover` (#2F2F2F)
- Text: `text` (#FFFFFF), `text-muted` (#b3b3b3), `text-disabled` (#777777)
- Fonts: `font-display` (Oswald) for headings/buttons, `font-sans` (Inter) for body
- Use these token names, not raw hex values

**Spacing Convention:**
- Horizontal page padding: `px-[4%]` (percentage-based, responsive)
- Component gaps: Tailwind `gap-2`, `gap-3`, `gap-4`
- Section margins: `mb-12` for content rails

**Animation:**
- Framer Motion for complex animations (modals, hero transitions)
- Tailwind `transition-*` utilities for simple hover/state changes
- Custom Tailwind animations: `animate-fade-in`, `animate-shimmer`, `animate-pulse`
- `prefers-reduced-motion` respected in `src/index.css`

## State Management

**Approach:**
- Local component state via `useState` for UI state
- Custom hooks for data fetching (hand-rolled, not using React Query despite it being a dependency)
- URL search params as state source for `SearchResults` page (`useSearchParams`)
- `localStorage` for persistence (`useFavorites`, `useRecentlyViewed`)
- No global state management (no Redux, Zustand, Context providers)
- `useRef` for mutable values that should not trigger re-renders (e.g., `filtersRef`, `debounceTimerRef`)
- `useCallback` used extensively to memoize event handlers and fetchers

---

*Convention analysis: 2026-03-11*
