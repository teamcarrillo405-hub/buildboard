# Codebase Concerns

**Analysis Date:** 2026-03-16

## Tech Debt

**Inline Style Manipulation via DOM Events:**
- Issue: Direct imperative DOM style manipulation instead of declarative CSS-based state
- Files: `src/components/CompanyCard.tsx` (lines 58-59, 72-75), `src/components/Navigation.tsx` (lines 218-219), `src/components/GuidedSearchModal.tsx` (lines 167-168, 233-238, 269-270, 286-289), `src/components/DetailModal.tsx` (lines 52, 54, 57)
- Impact: Harder to debug, breaks React principles, performance degradation on hover, style state out of sync with React
- Examples:
  - `element.style.boxShadow = '0 8px 30px rgba(0,0,0,0.15)'` on hover (CompanyCard)
  - `style.setProperty('--card-z', '20')` for z-index management (CompanyCard)
  - `element.style.background = '#D4A017'` on hover (Navigation)
  - `document.body.style.overflow = 'hidden'` for modal (DetailModal)
- Fix approach: Replace with CSS classes/Tailwind state variants (`group-hover:`, `peer-hover:`) or use React state to toggle classes

**Z-Index Management via CSS Variables:**
- Issue: Using dynamic CSS custom property `--card-z` set via JavaScript for z-index stacking
- Files: `src/components/CompanyCard.tsx` (lines 58-59, 57)
- Impact: Fragile z-index layering, not composable with other modal/popup layers, hard to reason about stacking order
- Fix approach: Use Tailwind z-index utilities (`z-20`, `z-50`) directly or implement a proper z-index context/provider

**Content Overflow Hack with Negative Margins:**
- Issue: `pb-[200px] mb-[-200px]` negative margin used to allow PreviewPopup to overflow without clipping
- Files: `src/components/ContentRail.tsx` (line 141)
- Impact: Creates invisible 200px clickable zone below each rail, fragile responsive layout, non-obvious intent
- Fix approach: Use CSS `overflow: visible` on parent or refactor popup positioning with CSS absolute positioning and proper z-index

**Duplicate Scroll Implementation Logic:**
- Issue: Two separate implementations of horizontal scroll behavior
- Files: `src/pages/Home.tsx` (useHorizontalScroll hook, lines 26-60) vs `src/components/ContentRail.tsx` (inline scroll logic, lines 36-48)
- Impact: Code duplication, inconsistent scroll behavior, harder to maintain
- Differences:
  - Home: Scroll by `(cardWidth + gap) * 5` cards
  - ContentRail: Scroll by fixed 300px-350px amounts
  - Home: Uses `ref.addEventListener('scroll', update)` directly
  - ContentRail: Similar pattern but different state management
- Fix approach: Extract shared `useHorizontalScroll` hook with configurable amounts

**Inline Component Definitions in Home.tsx:**
- Issue: Multiple components defined inline instead of extracted to separate files
- Files: `src/pages/Home.tsx` (ScrollArrows lines 63-87, Top10Card lines 105-137, CategoryRail lines 169-213, Top10Section lines 139-164)
- Impact: File is 317 lines, hard to test individual components, duplication of scroll logic, difficult to reuse
- Fix approach: Extract Top10Card, ScrollArrows, CategoryRail to separate files in `src/components/`

**Hardcoded Magic Numbers for Scroll Calculations:**
- Issue: `useHorizontalScroll` assumes 220px card width (line 54) without measuring actual DOM
- Files: `src/pages/Home.tsx` (line 54)
- Impact: Breaks if card width changes, not responsive to actual rendered size
- Fix approach: Use `getBoundingClientRect()` to measure actual card width at runtime

## Known Issues

**Hardcoded Top 10 General Contractors Data:**
- Problem: Static `TOP_10_COMPANIES` array with manual data instead of dynamic database fetch
- Files: `src/pages/Home.tsx` (lines 92-103)
- Current state: Shows same 10 contractors regardless of user location, user preferences, or ratings
- Trigger: View home page
- Workaround: Data exists in database and `useTopRatedCompanies` hook is available but not used for this section
- Risk: Misleads users about relevance and top-rated contractors in their area

**Database Cleanup Not Documented:**
- Problem: ~20K non-construction entries removed from 4.2M Yelp records, but no audit trail or documentation
- Files: Unknown - cleanup script not visible in codebase
- Impact: Can't verify data quality, can't reproduce cleanup if needed, difficult to assess data integrity
- Fix: Document deletion criteria and create audit log

**DetailModal Component is Dead Code:**
- Problem: Component exists but never imported or used
- Files: `src/components/DetailModal.tsx` (100+ lines)
- Current state: Fully implemented but disconnected from routing/component tree
- Impact: Dead code increases bundle size and maintenance burden
- Note: Company details now accessed via `/company/:id` route and dedicated `CompanyProfile.tsx` page
- Fix: Remove component or integrate if intended as fallback

## Fragile Areas

**CompanyCard Component:**
- Files: `src/components/CompanyCard.tsx`
- Why fragile:
  - Direct DOM style manipulation on hover (lines 72-75)
  - CSS variable z-index hack (lines 58-59)
  - Multiple hover state management (isHovered state + inline styles + ref manipulation)
  - PreviewPopup always rendered but hidden via CSS (line 114)
  - Preview side calculation depends on viewport width (lines 34-36)
- Safe modification:
  - Use only CSS-based hover effects via Tailwind classes
  - Replace `onMouseEnter/Leave` handlers that modify `style` with class-based styling
  - Test preview popup on all screen sizes (mobile, tablet, desktop)
  - Verify z-index doesn't conflict with modals or other overlays
- Test coverage: No tests visible

**ContentRail Component:**
- Files: `src/components/ContentRail.tsx`
- Why fragile:
  - Negative margin overflow hack (line 141)
  - Scroll state depends on exact pixel calculations (lines 36-41: `el.scrollLeft + el.clientWidth < el.scrollWidth - 10`)
  - Two different card rendering paths (isTop10 ternary, lines 144-151)
  - Desktop/mobile scroll arrows behave differently
- Safe modification:
  - Test scroll state at multiple viewport sizes
  - Verify popup doesn't get clipped at narrow widths
  - Test smooth scroll behavior across browsers (Safari, Chrome, Firefox)
  - Check that scroll arrows properly disable when at start/end
- Test coverage: No tests visible

**Home Page Layout:**
- Files: `src/pages/Home.tsx`
- Why fragile:
  - Inline component definitions make testing difficult
  - Theme color hardcoded as white (line 233) after multiple flip-flops between white and dark
  - Magic number assumptions in scroll calculations (220px cards, `* 5` multiplier)
  - `useHorizontalScroll` coupled to specific card dimensions
- Safe modification:
  - Extract inline components to separate files
  - Make scroll calculations responsive/dynamic
  - Use design tokens/constants for theme colors
- Test coverage: No tests visible

**Navigation Component Style Manipulation:**
- Files: `src/components/Navigation.tsx` (lines 218-219)
- Why fragile: Button hover color changes via inline `style.background` instead of CSS class
- Impact: Style state not managed by React, inconsistent with rest of codebase
- Safe modification: Use Tailwind hover states (`hover:bg-[#D4A017]`) instead of imperative DOM manipulation

## Performance Bottlenecks

**Large SQLite Database (3GB+):**
- Problem: 4.2M+ company records in single SQLite file
- Current capacity: Single connection, read-only, likely fine for reads but not scalable
- Cause: All data concentrated in one file, no indexing optimization visible in frontend code
- Scaling path:
  - Database already configured for Turso migration (`drizzle.config.ts`)
  - Implement client-side caching via React Query or similar
  - Use FTS5 for search (already implemented as `FTSSearchAPI`)
  - Consider database sharding by state or region if write operations added

**Multiple Fetch Requests on Home Page:**
- Problem: Home page makes multiple API calls for featured, top-rated, and category/state data
- Files: `src/pages/Home.tsx`, `src/api/hooks.ts`
- Cause: No visible caching or request batching
- Impact: Redundant requests on every page load
- Improvement: Use React Query or similar for automatic deduplication and caching

**PreviewPopup Always Rendered:**
- Problem: Hidden DOM nodes for all company cards even when not hovered
- Files: `src/components/CompanyCard.tsx` (line 114)
- Impact: Hundreds of hidden DOM nodes on search results, memory overhead
- Fix: Conditional rendering or lazy loading only on hover

**No Image Optimization:**
- Problem: `CompanyImage` and `PreviewPopup` load images without optimization
- Files: `src/components/CompanyImage.tsx`, `src/components/PreviewPopup.tsx`
- Impact: Large unoptimized images slow page load on mobile
- Fix: Use responsive images with srcset, lazy loading, consider webp format

## Security Considerations

**Admin Secret Stored in Browser Memory:**
- Risk: `AdminAPI.setSecret()` stores token in module variable accessible from browser console
- Files: `src/api/api.ts` (lines 400-406)
- Current mitigation: Only for local dev without WAM SSO
- Recommendations:
  - Use httpOnly cookies for sensitive tokens instead of memory variables
  - Implement proper OAuth/OIDC for admin authentication
  - Add session timeout
  - Log admin actions server-side for audit trail

**Email Exposed in Mailto Link:**
- Risk: Email address hardcoded in page source for harvesting
- Files: `src/pages/Home.tsx` (line 304)
- Current: `mailto:info@hispanicconstructioncouncil.com`
- Recommendations: Use form submission instead of mailto to prevent scraping

## Scaling Limits

**Search Pagination:**
- Current: 20 results per page (RESULTS_PER_PAGE = 20)
- Limit: Offset-based pagination becomes slow with 4.2M records
- Files: `src/pages/SearchResults.tsx` (line 34)
- Scaling path:
  - Implement cursor-based pagination
  - Use search result caching
  - Migrate to Elasticsearch for truly massive datasets

**Category and State Filter Cardinality:**
- Current: All categories/states loaded in filter cache
- Limit: UI becomes unwieldy beyond 100 items
- Files: `src/api/api.ts` (filter caching logic)
- Scaling path: Lazy load filters, use autocomplete/typeahead

## Missing Critical Features

**No Error Boundaries:**
- Problem: Single component error crashes entire page
- Files: `src/pages/SearchResults.tsx` and other critical pages
- Impact: Users see white screen instead of fallback UI
- Fix: Add ErrorBoundary component wrapper

**No Offline Support:**
- Problem: No service worker or offline caching
- Impact: Can't browse company data without internet
- Affects mobile users with intermittent connectivity

**No Image Optimization Pipeline:**
- Problem: Images loaded at full size without compression or responsive sizing
- Files: `src/components/CompanyImage.tsx`, `src/components/PreviewPopup.tsx`
- Impact: Slow page load, especially on mobile
- Fix: Add compression, srcset, lazy loading, consider webp

## Test Coverage Gaps

**All Components Untested:**
- What's not tested: 30+ React components (CompanyCard, ContentRail, Home, SearchResults, etc.)
- Files: `src/components/**/*.tsx`, `src/pages/**/*.tsx`
- Risk: Regressions in UI patterns, fragile styles break silently
- Priority: High
- Recommended first tests:
  1. CompanyCard hover states and popup positioning
  2. ContentRail scroll state management
  3. Home page layout and scroll behavior
  4. SearchResults filter application

**API Hooks Not Tested:**
- What's not tested: useCompanies, useFavorites, useTopRatedCompanies, etc.
- Files: `src/api/hooks.ts`
- Risk: Hook state transitions fail silently, memory leaks from missed cleanup
- Priority: High

**No Test Infrastructure:**
- Problem: No testing framework configured (no Jest/Vitest config)
- Files: package.json (no test script)
- Impact: Can't write tests even if wanted
- Fix: Add Vitest or Jest configuration

---

*Concerns audit: 2026-03-16*
