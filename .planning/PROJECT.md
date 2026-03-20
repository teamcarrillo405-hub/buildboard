# BuildBoard

## What This Is

BuildBoard is a B2B construction business directory for the United States, powered by the Hispanic Construction Council (HCC). General contractors use it to find specialty subcontractors across ~50 construction categories. The directory contains 4.2M+ companies with images, websites, phone numbers, reviews, locations, hours, and detailed service descriptions. The homepage showcases Top 25 rankings by trade (General Contractors, Electricians, Plumbers, Roofing, Concrete, HVAC, Painting) with a unified card design. Verified businesses get premium features and search priority through a paid tier, while HCC members authenticate via Wild Apricot for personalized features.

## Core Value

General contractors can confidently find the right subcontractor for any job — understanding exactly what services each company provides, with verified businesses they can trust.

## Requirements

### Validated

<!-- Shipped and working -->

- ✓ Browse companies by category via content rails — existing
- ✓ Search companies by name, category, state, city with paginated results — existing
- ✓ View company profile with contact info, services, certifications, rating — existing
- ✓ Save favorites and recently viewed companies (localStorage) — existing
- ✓ 4.2M+ company SQLite database with indexed queries — existing
- ✓ REST API serving company data from SQLite via Express 5 — existing
- ✓ White-canvas UI with dark cards, gold (#F5C518) accents, Oswald/Inter fonts — existing
- ✓ Category-based fallback images for companies without photos — existing
- ✓ FTS5 full-text search with AI-powered chat search (Gemini) — existing
- ✓ Company detail pages with similar company recommendations — existing
- ✓ Wild Apricot SSO authentication with JWT sessions — existing
- ✓ Verified business badges with search ranking boost — existing
- ✓ Business profile editing with media uploads for verified companies — existing
- ✓ Google Places lazy enrichment (photos, reviews, hours) — existing
- ✓ AI-generated category images via Imagen 4 — existing
- ✓ Database cleaned of non-construction entries (~20K removed) — existing
- ✓ Domain guesser wired into enrichWorker.ts — 67% hit rate, no Playwright needed — v2.0
- ✓ Yelp enrichment hardened: SIGINT-safe, per-record lastRowId, pre-call skip guard — v2.0
- ✓ Playwright contact extractor: homepage + /contact fallback, 56% email hit rate — v2.0
- ✓ Daily orchestrator: `npm run enrich` runs all 3 pipelines, delta summary to logs/daily_summary.json — v2.0

### Active

<!-- Current scope — building toward these -->

- [ ] Deploy to Vercel/Netlify (static frontend + serverless API)

### Out of Scope

- Individual company website scraping for images — 99.2% failure rate, not viable at scale
- Mobile native apps — web-first, responsive design covers mobile
- E-commerce / payment processing within directory — verification payments handled externally
- Social features (messaging, commenting between businesses) — not a social platform
- User-generated reviews — rely on Google Places reviews initially
- Real-time features (WebSockets, live chat) — static directory, not collaboration tool
- Multi-language / i18n — English only for v1
- Framing category on homepage — insufficient data (only 25 companies, most with 0 reviews)

## Context

**Origin:** Existing codebase ("ConstructFlix") rebranded to BuildBoard. Built with Vite + React 18 + TypeScript + Tailwind frontend and Express 5 + better-sqlite3 + Drizzle ORM backend. Contains 4,205,315 companies across all 50 US states in ~50 construction categories.

**HCC:** Hispanic Construction Council — existing organization. Wild Apricot SSO integration is built. Gold (#F5C518) brand accent throughout.

**Homepage Evolution:** Originally Netflix-inspired dark theme. Redesigned to white background with dark cards. Now transitioning to a ranked Top 25 format showcasing the best companies in each major trade category, pulling from database (except General Contractors which are seeded from ENR research).

**Data Quality:** Yelp-sourced data cleaned in two rounds — removed restaurants, salons, theaters, and other non-construction entries (~20K records). Remaining data is construction-focused. HVAC has strongest review counts (800+ reviews per top company), Plumbing strong (300+), Electrical strong (400+), Roofing strong (300+), Concrete moderate (via Masonry/Concrete subcategory), Painting needs verification.

**Primary User:** General contractors searching for specialty subcontractors for construction projects. B2B context — not homeowners, not consumer-facing.

## Constraints

- **Data:** 4.2M+ records in a 3GB+ SQLite file — queries must be optimized with proper indexing
- **Images:** Must achieve 100% image coverage — every listing needs a relevant image (Google Places + AI fallback)
- **Deployment:** Vercel/Netlify target means serverless API — SQLite may need migration to hosted DB
- **Auth:** Wild Apricot SSO built — depends on Wild Apricot account setup for production
- **Budget:** Gemini/Imagen API for image generation, Google Places API for enrichment — API costs must be managed
- **Existing Stack:** Vite + React + TypeScript + Tailwind + Express 5 — build on existing stack, don't rewrite

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| White background with dark cards | Professional B2B look, dark cards pop on white canvas | ✓ Good |
| Top 25 per category (not Top 10) | National directory needs deeper rankings; 25 gives scroll engagement | ✓ Good |
| ENR Top 25 GCs seeded into DB | Big nationals aren't in Yelp data; ENR is authoritative source | ✓ Good |
| Replace Framing with Painting | Framing has only 25 companies with near-zero reviews; Painting has rich data | ✓ Good |
| 5-card-wide unified design | Consistent visual rhythm; scroll arrows for discovery | ✓ Good |
| Hover popup for details | Clean card face (name only); city/state + favorites on hover | ✓ Good |
| Remove Browse by Category + State rows | Top 25 trade sections replace category browsing; cleaner homepage | ✓ Good |
| Domain guessing before Playwright search | Free, fast — 67% hit rate eliminates majority of browser launches | ✓ Good |
| Direct DB writes, no staging | Simpler pipeline, no intermediate files to manage | ✓ Good |
| Kill-safe progress JSON per pipeline | Each script resumes independently — orchestrator doesn't need to re-implement resume | ✓ Good |
| Delta-based daily summary | Per-run stats (not lifetime totals) make daily_summary.json actionable | ✓ Good |
| Google Places + AI-generated images (layered) | Scraping failed at 99.2%; Google Places provides real photos, Gemini fills gaps | ✓ Good |
| Public directory first, verification later | Get value to users fast; membership features depend on Wild Apricot setup | ✓ Good |
| Keep existing React + Tailwind stack | Working codebase, no reason to rewrite — extend instead | ✓ Good |

## Current State

**Shipped:** v2.0 Data Enrichment Pipeline (2026-03-19)

The database now has autonomous daily enrichment running via `npm run enrich`:
- Yelp enrichment fills phone/image for 5,000 companies/day with kill-safe resume
- Domain guesser verifies website URLs (67% hit rate) before falling back to Playwright search
- Playwright contact extractor navigates homepage + /contact pages (56% email hit rate)
- Delta-based daily summary logged to `logs/daily_summary.json`

**Next milestone:** Deployment — Vercel/Netlify (serverless API, hosted DB migration from 3GB SQLite)

---
*Last updated: 2026-03-19 after v2.0 Data Enrichment Pipeline shipped*
