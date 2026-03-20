# Feature Landscape

**Domain:** B2B Construction Subcontractor Directory
**Project:** BuildBoard (HCC-powered)
**Researched:** 2026-03-11
**Context:** Subsequent milestone -- adding features to an existing directory with 3.4M companies, working search, browse, and profiles.

## Table Stakes

Features users expect from a B2B construction directory. Missing any of these and general contractors will leave for ConstructConnect, BuildZoom, or even plain Google Maps.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Company photos on every listing | Users judge businesses visually. 100% of competitor directories show photos. Currently using ~10 stock Unsplash images for 3.4M companies -- unusable. | Medium | Google Places API provides real photos. AI-generated fallbacks fill gaps. Must achieve 100% coverage. |
| Google reviews and ratings | GCs rely on reviews to vet subs. BuildZoom, ConstructConnect, and Google Maps all surface reviews. BuildBoard's current ratings appear to be imported but have no visible source. | Medium | Google Places API returns up to 5 "most relevant" reviews per place. Must display with proper Google attribution. |
| Business hours display | GCs need to know when a sub is reachable. Google Maps, Yelp, and every directory shows hours. | Low | Google Places API provides structured hours data. Straightforward to display. |
| Search that actually works | Current search uses LIKE '%term%' on 3.4M rows -- slow and imprecise. Every competitor uses relevance-ranked search. Users expect instant, accurate results. | High | Requires SQLite FTS5 or external search engine (MeiliSearch/Typesense). This is the foundation for the AI search feature. |
| Authenticated favorites (synced) | Currently localStorage-only -- lost on device switch. Any directory with accounts syncs favorites. This is baseline for authenticated platforms. | Low | Requires auth (Wild Apricot SSO) first. Simple CRUD on a user-favorites table. |
| Mobile-responsive search and profiles | Construction professionals browse on-site from phones. Existing UI is responsive but untested on real mobile workflows. | Low | Already built with Tailwind responsive classes. Needs validation, not rebuilding. |
| Contact information accuracy | Phone, email, website for every listing. GCs need to reach subs immediately. | Low | Already in database for most records. Google Places API can backfill missing data. |

## Differentiators

Features that set BuildBoard apart. Not expected by default, but create competitive advantage in the crowded construction directory space.

### AI-Powered Search with Chat + Smart Filter Interface

**Value Proposition:** Natural language queries like "find me an electrical contractor in Dallas that does commercial work and has good reviews" translated into structured search with visual filter chips the user can adjust. No competitor in the construction directory space offers this -- ConstructConnect and BuildingConnected still rely on traditional faceted search.

**Complexity:** High

**Expected Behavior in B2B Directory Platforms:**
- User types a natural language query in a chat-style input
- System parses intent and extracts structured filters: category, location, rating threshold, services, certifications
- Extracted filters appear as editable "chips" above results (e.g., `Category: Electrical` `Location: Dallas, TX` `Min Rating: 4.0`)
- User can remove, modify, or add chips manually without retyping
- Results update in real-time as chips change
- Chat provides a brief natural language summary of what it found ("I found 47 electrical contractors in Dallas with ratings above 4.0")
- Follow-up queries refine rather than replace (conversational context)
- Fallback: if AI parsing fails, treat input as keyword search

**Key UX Patterns (from industry research):**
1. **Hybrid input** -- single input field accepts both natural language and structured queries
2. **Transparent parsing** -- show users what the system understood via filter chips so they can correct misinterpretations
3. **Progressive refinement** -- start broad, let users narrow down with chips rather than requiring perfect queries
4. **Conversational memory** -- "now show me only those with free estimates" refines the previous query
5. **Direct answers** -- provide concise summaries backed by verifiable data, not just a list of results

**Implementation Notes:**
- Current `parseChat()` in `server/api.js` is keyword/regex-based and brittle (documented in CONCERNS.md). Needs replacement with an LLM-based parser or a structured NLP pipeline.
- The chip-based filter UI is a proven pattern from Booking.com, Airbnb, and Google Flights -- well-understood by users.
- For a 3.4M record directory, the AI layer should generate structured queries (SQL/FTS parameters) rather than doing semantic search over embeddings. The data is structured, not unstructured.

### Business Verification Tiers with Badges and Search Boosting

**Value Proposition:** Trust is the core problem in B2B construction. GCs need to know a sub is legitimate, insured, and capable. A paid verification tier creates a revenue stream while solving the trust problem. BuildZoom does this with license verification and a scoring system; BuildBoard can do it better with HCC organizational backing.

**Complexity:** Medium

**Expected Behavior in Directory Platforms:**
- **Visual badges** on company cards and profiles indicating verification status (e.g., checkmark icon, colored badge, "Verified" label)
- **Search ranking boost** -- verified businesses appear higher in results. Industry standard is a multiplier on the relevance score (e.g., 1.2x-1.5x boost), not a separate section. Users should see organic-feeling results where verified businesses naturally float up, not a "sponsored" section that feels like ads.
- **Tiered verification levels** are common:
  - **Basic (free):** Business exists in directory, unverified data from import
  - **Verified (paid):** Business has confirmed contact info, active license, insurance documentation. Gets badge + search boost + profile management access
  - **HCC Member (via Wild Apricot):** All verified benefits plus HCC member badge, member-only directory features
- **Badge psychology:** Research shows verified badges increase click-through rates by 15-30% (Jasmine Directory study). The badge must be visually distinct but not garish -- a subtle checkmark with tooltip works better than a large banner.
- **Verification process:** Business submits documentation (license, insurance, contact info). Admin reviews and approves. Automated reverification on a schedule (quarterly/annually).

**Implementation Notes:**
- Database needs a `verification_status` field (enum: unverified/verified/hcc_member) and `verification_date`
- Search ranking: add a boost factor in the SQL ORDER BY clause. FTS5 supports rank boosting natively.
- Badge display: small icon on CompanyCard component, expanded details on CompanyProfile page
- Revenue model: verification is a standalone product, separate from HCC membership dues (per PROJECT.md)
- Verification is admin-managed initially, not self-service verification

### Verified Business Profile Management

**Value Proposition:** Verified businesses can edit their own listing -- update services, hours, contact info, upload portfolio photos and videos. This is the core value proposition of the paid verification tier. Google My Business established this pattern; BuildBoard applies it to a specialized construction context.

**Complexity:** Medium-High

**Expected Behavior:**
- **Self-service editing dashboard** accessible after authentication
- **Editable fields:** business description, services list, certifications, hours, phone, email, website, address
- **Photo uploads:** portfolio/project photos showcasing completed work (before/after, in-progress, finished). Industry best practice is 10-20 photos per profile, organized by project.
- **Video uploads:** project walkthroughs, team introductions, capability demonstrations. Short-form (30-90 seconds) is the sweet spot for B2B. Longer project documentation videos (3-5 min) also have a place.
- **Moderation:** changes may require admin approval before going live (common in directories to prevent spam/abuse), or go live immediately with post-moderation
- **File handling:** images should be resized/compressed on upload. Videos need transcoding. Both need CDN hosting (not SQLite).

**Implementation Notes:**
- Requires write endpoints on the API (currently read-only SQLite)
- Need file storage: S3/Cloudflare R2 for images and videos, not local filesystem
- Database migration from read-only SQLite to something that supports writes (Turso, PostgreSQL, or a separate SQLite DB for user-generated content alongside the read-only directory DB)
- Photo upload: accept JPEG/PNG/WebP, max 10MB, resize to standard dimensions, generate thumbnails
- Video upload: accept MP4/MOV, max 100MB, transcode to H.264/WebM for web playback. Consider Cloudflare Stream or Mux for video hosting/transcoding.

### Wild Apricot SSO Authentication

**Value Proposition:** HCC members log in with existing credentials. No new accounts to create. Unlocks personalized features (synced favorites, profile management for verified businesses).

**Complexity:** Medium

**Expected Behavior:**
- "Sign in with HCC" button on the navigation bar
- Clicking redirects to Wild Apricot's OAuth authorization page
- After approval, user is redirected back to BuildBoard with an authorization code
- BuildBoard exchanges the code for an access token (server-side)
- Token used to fetch member data (name, email, membership status, member ID)
- Session established -- user sees their name in nav, favorites sync, profile management unlocks
- Logout clears session and redirects to home

**Wild Apricot OAuth Flow (from official docs):**
1. Register BuildBoard as an authorized application in Wild Apricot admin settings
2. Redirect user to Wild Apricot's authorization endpoint
3. User authenticates with Wild Apricot credentials
4. Wild Apricot redirects back with an authorization code
5. Server exchanges code for access token using client_id + client_secret (Basic auth, base64-encoded)
6. Use token to call Wild Apricot Member API for user info
7. Store session server-side (JWT or session cookie)

**Implementation Notes:**
- Wild Apricot supports OAuth 2.0 authorization code flow -- standard pattern
- Member API provides membership level, status, and contact info -- enough to determine HCC membership tier
- Wild Apricot account has NOT been set up yet (per PROJECT.md) -- this is a dependency
- Need to handle token refresh, session expiry, and error states
- Consider a local user table that maps Wild Apricot member IDs to BuildBoard user records

### Google Places API Integration (Photos, Reviews, Hours)

**Value Proposition:** Enrich 3.4M bare listings with real photos, genuine reviews, and accurate hours from Google's database. This is the critical path to making the directory feel alive rather than a dry data dump.

**Complexity:** High (due to scale and cost management)

**Expected Behavior:**
- For each company, match to a Google Place ID using business name + address
- Pull photos (up to 10 per place), reviews (up to 5 most relevant), hours, and rating
- Display Google photos as the primary images on company cards and profiles
- Show Google reviews with proper attribution (reviewer name, avatar, rating, date -- required by Google TOS)
- Show business hours in a formatted schedule
- Where Google data is unavailable, fall back to AI-generated category images

**Key Constraints (from Google Places API docs):**
- **Pricing (post-March 2025):** Place Details $17/1,000 requests, Place Photos $7/1,000 requests. At 3.4M companies, enriching every listing would cost $57,800 for details + $23,800 for photos = $81,600 minimum. This is NOT viable for bulk enrichment.
- **Rate limits:** API has per-second and daily quotas
- **Attribution requirements:** Must show "Powered by Google" and review author attributions
- **Data freshness:** Google data changes; need a refresh strategy
- **Photo limits:** Up to 10 photos per place via the API

**Cost Management Strategy:**
- Do NOT bulk-enrich all 3.4M records upfront
- **On-demand enrichment:** fetch Google data when a user visits a company profile for the first time, then cache it
- **Priority enrichment:** proactively enrich verified businesses and frequently-viewed companies
- **Aggressive caching:** cache Google Place IDs and data in the database with a TTL (30-90 days)
- **Field masks:** request only needed fields (photos, reviews, hours, rating) to reduce per-request cost
- This turns the cost from $81K upfront to a gradual, traffic-driven cost proportional to actual usage

## Anti-Features

Features to explicitly NOT build. Each would waste development time, add complexity, or actively harm the product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| User-generated reviews | Opens moderation nightmare. Google reviews already exist and are trusted. Building a review system from scratch invites fake reviews and legal liability. No construction directory succeeds with proprietary reviews alone. | Display Google Places reviews. Let Google handle the review ecosystem. |
| In-app messaging between businesses | BuildBoard is a directory, not a collaboration platform. GCs have phones, email, and existing communication tools. In-app messaging adds massive complexity (real-time infrastructure, moderation, abuse prevention) for minimal value. | Show phone number and email prominently. Link to company website. Make it dead simple to contact businesses through existing channels. |
| Bidding/RFQ system | ConstructConnect, BuildingConnected, and Procore own this space with deep integrations. Building a bidding system is a completely different product. Attempting it would dilute the directory's focus. | Focus on discovery. Help GCs find the right sub. Let existing bid management tools handle the bid process. Link out to them if appropriate. |
| Payment processing | Verification payments should happen externally (per PROJECT.md). Adding payment processing means PCI compliance, chargebacks, refund handling. Massive liability for minimal value. | Use Stripe payment links or Wild Apricot's built-in payment system for verification fees. Keep payments off-platform. |
| Social features (following, feeds, commenting) | This is a search-and-find tool, not LinkedIn for construction. Social features require ongoing engagement loops that don't match the directory use case. GCs search for subs when they need them, not daily. | Focus on search quality and trust signals. The value is in finding the right sub quickly, not building a social network. |
| Mobile native apps | Responsive web covers mobile use cases. Native apps add two more codebases to maintain. Construction professionals use browsers. The ROI is terrible for a directory. | Ensure responsive design works flawlessly on mobile. Add PWA capabilities (offline favorites, home screen install) if needed later. |
| Multi-language / i18n | English-only for v1 (per PROJECT.md). Adding i18n now would slow every feature by requiring translation workflows. HCC's primary market is English-speaking US construction. | Build with i18n-friendly architecture (no hardcoded strings in components) but don't implement translations until there's proven demand. |
| Real-time notifications | No use case for push notifications in a directory. Users search when they need a sub, not on a schedule. | Email notifications (if any) for verified businesses when their profile is viewed could be a future differentiator, but not real-time push. |
| Individual company website scraping | Already attempted with 99.2% failure rate (documented in PROJECT.md). Most construction company websites lack usable images, block scraping, or have only logos. | Use Google Places API for real photos. AI-generated images as fallback. Abandon the scraping approach entirely. |

## Feature Dependencies

```
Google Places API Integration
  |
  +--> Company photos on listings (table stakes)
  +--> Google reviews display (table stakes)
  +--> Business hours display (table stakes)

Search Infrastructure (FTS5 or search engine)
  |
  +--> AI-powered search with chat interface (differentiator)
  |     |
  |     +--> Smart filter chips UI (part of AI search)
  |
  +--> Verified business search boosting (differentiator)

Wild Apricot SSO Authentication
  |
  +--> Authenticated favorites (table stakes, once auth exists)
  +--> Business verification tier management
  |     |
  |     +--> Verification badges on listings (differentiator)
  |     +--> Search ranking boost for verified (differentiator)
  |     +--> Profile management dashboard (differentiator)
  |           |
  |           +--> Photo uploads (differentiator)
  |           +--> Video uploads (differentiator)
  |           +--> Service/hours editing (differentiator)
  |
  +--> HCC member badge display

Database Write Capability (migration from read-only SQLite)
  |
  +--> Authenticated favorites storage
  +--> Verification status storage
  +--> Profile edits storage
  +--> Google Places data caching
  +--> Photo/video metadata storage

File Storage (S3/R2/similar)
  |
  +--> Portfolio photo uploads
  +--> Video uploads
  +--> AI-generated fallback images
```

## MVP Recommendation

**Phase 1: Make the directory credible (no auth required)**

Prioritize:
1. **Google Places API integration** (on-demand enrichment) -- real photos and reviews transform bare listings into credible profiles. This is the single highest-impact change.
2. **Search infrastructure upgrade** (FTS5) -- replace LIKE queries with proper full-text search. This unblocks AI search and handles 3.4M records at acceptable speed.
3. **AI-generated fallback images** -- achieve 100% image coverage for listings that Google Places cannot match.

**Phase 2: AI search and trust layer**

4. **AI-powered search with chat + filter chips** -- the flagship differentiator. Built on top of the FTS5 foundation from Phase 1.
5. **Verification badges** (visual only, admin-managed) -- add verification_status to the database, display badges. Admin manually verifies businesses. Search boosting for verified listings.

**Phase 3: Authenticated features**

6. **Wild Apricot SSO** -- the auth foundation. Depends on HCC setting up Wild Apricot.
7. **Authenticated favorites** -- migrate localStorage favorites to server-synced.
8. **Verified business profile management** -- self-service editing, photo/video uploads.

**Defer:**
- Video uploads: defer until photo uploads are proven and storage infrastructure is in place. Photos are higher priority (every listing needs images; videos are a nice-to-have).
- HCC member-specific features beyond the badge: defer until Wild Apricot integration is stable and member base is established.

## Sources

- [Google Places API Overview](https://developers.google.com/maps/documentation/places/web-service/overview) -- HIGH confidence
- [Google Places API Pricing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) -- HIGH confidence
- [Wild Apricot API Authentication](https://gethelp.wildapricot.com/en/articles/484-api-authentication) -- HIGH confidence
- [Wild Apricot Authorizing External Applications](https://gethelp.wildapricot.com/en/articles/180-authorizing-external-applications) -- HIGH confidence
- [Wild Apricot SSO Service](https://gethelp.wildapricot.com/en/articles/200-single-sign-on-service-sso) -- HIGH confidence
- [Mesh Professional License Verification](https://meshverify.com/) -- MEDIUM confidence
- [Verified Badge Psychology and CTR](https://www.jasminedirectory.com/blog/the-verified-badge-consumer-psychology-and-click-through-rates/) -- MEDIUM confidence
- [Business Directory Pricing Models](https://www.memberstack.com/blog/business-directory-pricing-models-how-to-price-your-business-directory) -- MEDIUM confidence
- [Premium Listing Pricing Models](https://www.jasminedirectory.com/blog/pricing-models-for-premium-listings-what-businesses-will-pay-for/) -- MEDIUM confidence
- [BuildZoom Contractor Scoring System](https://www.buildzoom.com/blog/guides/buildzoom-contractor-scoring-system-works) -- MEDIUM confidence
- [Downtobid Verified Subcontractor Database](https://downtobid.com/contractors) -- MEDIUM confidence
- [UX Patterns for Favorites](https://uxplanet.org/how-to-design-better-favorites-d1fe8f204a1) -- MEDIUM confidence
- [Search Filter UX Best Practices (Algolia)](https://www.algolia.com/blog/ux/search-filter-ux-best-practices) -- MEDIUM confidence
- [AI-Powered Search Overview (Meilisearch)](https://www.meilisearch.com/blog/ai-powered-search) -- MEDIUM confidence
- [Search Boosting Patterns (Google Cloud)](https://cloud.google.com/generative-ai-app-builder/docs/boost-search-results) -- MEDIUM confidence
- [Vertex AI Natural Language Filters](https://cloud.google.com/generative-ai-app-builder/docs/natural-language-queries) -- MEDIUM confidence
- [How Search Algorithms Rank Marketplace Listings](https://www.onrampfunds.com/resources/how-search-algorithms-rank-marketplace-listings) -- LOW confidence
- [Construction Portfolio Best Practices (Batieu)](https://batieu.com/en/blog/construction-portfolio-best-practices/) -- LOW confidence
