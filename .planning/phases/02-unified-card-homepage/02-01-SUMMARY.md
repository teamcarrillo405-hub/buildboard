---
phase: 2
plan: 1
subsystem: frontend-components
tags: [homepage, ranked-card, scroll-rail, favorites, hover-popup]
dependency_graph:
  requires: [Phase 01-data-seeding-api: useTopCompanies hook, HOMEPAGE_CATEGORIES config]
  provides: [RankedCard, RankedCardPopup, RankedRail, unified homepage layout]
  affects: [Home.tsx, ContentRail.tsx]
tech_stack:
  added: []
  patterns: [scroll-snap horizontal rail, stroke-number rank display, hover popup with favorites]
key_files:
  created:
    - src/components/RankedCard.tsx
    - src/components/RankedCardPopup.tsx
    - src/components/RankedRail.tsx
  modified:
    - src/pages/Home.tsx
    - src/components/ContentRail.tsx
  deleted:
    - src/components/Top10Card.tsx
decisions:
  - "Rank number placed left of card with fixed 4rem width (no negative margin) — prevents number overlapping company name on any viewport"
  - "RankedCardPopup renders below the card body using absolute positioning anchored to card bottom — stays visually connected to card on hover"
  - "Top10Card removed; ContentRail cleaned of isTop10 prop — CompanyProfile still uses ContentRail for Similar Companies with CompanyCard only"
  - "Featured Subcontractors section uses useTopRatedCompanies (all categories, limit 25) rather than useTopCompanies with a category"
metrics:
  duration: 3 min
  completed_date: "2026-03-17"
  tasks_completed: 6
  files_changed: 6
---

# Phase 2 Plan 1: Unified RankedCard Component & Homepage Rewire Summary

**One-liner:** Unified dark-gradient ranked card with stroke number and hover popup replacing all legacy homepage rows (CategoryRail, Top10Section, state rows) with 8 RankedRail sections.

## What Was Built

Four files created/modified to replace the homepage's legacy multi-component layout with a single unified card system:

**RankedCard** (`src/components/RankedCard.tsx`) — Portrait card (`w-[150px]`, `aspect-[2/3]`) with dark gradient background. Rank number (1-based) sits left of the card body using a fixed `4rem` wide container at `font-display text-[9rem] italic`, stroke color switching from `#334155` to `#F5C518` on hover. Company name only on card face. Card body wraps in `<Link to=/company/:id>`.

**RankedCardPopup** (`src/components/RankedCardPopup.tsx`) — Floating panel that appears on desktop hover. Shows `city, state` in gray text plus a Heart icon wired to `useFavorites().toggleFavorite`. Positioned as absolute below the card body, hidden on mobile via `hidden md:block`, opacity transition controlled by parent hover state.

**RankedRail** (`src/components/RankedRail.tsx`) — Horizontal scroll rail with gold accent bar + title header matching ContentRail style. `scroll-snap-type: x mandatory`, `scrollbar-hide`, `touch-pan-x`. Arrow buttons (white bg, gray border, shadow) stacked vertically at far right, hidden on mobile. Loading skeleton shows 5 placeholder cards. Scroll step = 5 card widths.

**Home.tsx** — Completely rewired. Removed: CategoryRail, Top10Section, Top10Card, ScrollArrows, useHorizontalScroll, TOP_10_COMPANIES static array, CATEGORY_CONFIG rows, TOP_STATES rows. Added: 8 RankedRail sections in specified order (GC, Featured Subcontractors, Electrical, Plumbing, Roofing, Concrete, HVAC, Painting). HeroBanner and contractor CTA preserved.

## Verification

- [x] HOME-01: 8 sections in correct order (GC, Featured, Electrical, Plumbing, Roofing, Concrete, HVAC, Painting)
- [x] HOME-02: No Browse by Category tiles on homepage
- [x] HOME-03: No State rows on homepage
- [x] HOME-04: CTA section at bottom
- [x] CARD-01: All sections use unified RankedCard with rank number not overlapping name
- [x] CARD-02: Card face shows company name only
- [x] CARD-03: 5 cards visible at a time (rail sized with `pr-14` + arrow space)
- [x] CARD-04: Scroll arrows navigate the rail
- [x] CARD-05: Hover popup shows city, state, favorites button
- [x] CARD-06: Cards link to company profile page
- [x] Build: `vite build` succeeds with zero errors (3.87s)

## Decisions Made

1. **Rank number no-overlap via fixed width container** — Used `width: 4rem; textAlign: right; paddingRight: 6px` on the number span rather than the old `mr-[-30px]` approach. This ensures the number never visually overlaps the company name regardless of rank digit count.

2. **RankedCardPopup anchored below card body** — Absolute positioned at `left: 4rem; bottom: 0` (aligning with the card body, not the number). Renders as a bottom panel of the card on hover. Desktop-only via `hidden md:block`.

3. **Featured Subcontractors uses useTopRatedCompanies** — Per plan spec, this row uses top-rated companies across all categories (not a specific category via useTopCompanies). Limit raised from 20 to 25 to match all other sections.

4. **ContentRail kept but cleaned** — ContentRail still needed by CompanyProfile for "Similar Companies". Removed `isTop10` prop and Top10Card import since that code path was dead. Top10Card.tsx deleted.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/components/RankedCard.tsx` — FOUND
- [x] `src/components/RankedCardPopup.tsx` — FOUND
- [x] `src/components/RankedRail.tsx` — FOUND
- [x] `src/pages/Home.tsx` — FOUND (rewired)
- [x] `src/components/Top10Card.tsx` — DELETED (confirmed)
- [x] Commit a9ac48e — FOUND (ranked card components)
- [x] Commit 240e93b — FOUND (Home.tsx rewire)
- [x] Commit f540dc2 — FOUND (cleanup)
- [x] Build: zero errors
