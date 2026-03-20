# Technology Stack

**Analysis Date:** 2026-03-11

## Languages

**Primary:**
- TypeScript 5.9.3 - Frontend application (`src/**/*.tsx`, `src/**/*.ts`) and Vite config (`vite.config.ts`)
- JavaScript (ES Modules) - Backend server (`server/api.js`, `server/import-data.js`)

**Secondary:**
- Python 3.13 - Data import scripts (`server/import-data.py`) and image scraping utility (`scrape_images.py`)
- CSS - Global styles with Tailwind directives (`src/index.css`)
- HTML - Single entry point (`index.html`)

## Runtime

**Environment:**
- Node.js >= 18.0.0 (currently v24.13.1 installed)
- Python 3.13 (for offline utilities only)

**Package Manager:**
- npm >= 9.0.0 (currently 11.8.0 installed)
- Lockfile: `package-lock.json` present (199 KB)

## Frameworks

**Core:**
- React 18.3.1 - UI framework, SPA with client-side routing (`src/main.tsx`)
- Express 5.2.1 - REST API backend server (`server/api.js`)
- React Router DOM 6.30.3 - Client-side routing (`src/App.tsx`)

**Data Layer:**
- TanStack React Query 5.90.21 - Listed as dependency but custom hooks in `src/api/hooks.ts` use manual `useState`/`useEffect` pattern instead (not actually used at runtime)
- better-sqlite3 12.6.2 - SQLite database driver for the API server (`server/api.js`)

**UI & Animation:**
- Tailwind CSS 3.4.19 - Utility-first CSS framework (`tailwind.config.js`)
- Framer Motion 10.18.0 - Animation library (listed in deps, used for transitions)
- Lucide React 0.303.0 - Icon library (`src/pages/CompanyProfile.tsx`, `src/pages/SearchResults.tsx`)

**Build/Dev:**
- Vite 5.4.21 - Build tool and dev server (`vite.config.ts`)
- PostCSS 8.x + Autoprefixer 10.x - CSS processing (`postcss.config.js`)
- ESLint 8.x - Linting with TypeScript and React plugins
- Terser - Production minification (configured in `vite.config.ts`)

## Key Dependencies

**Critical (Runtime):**
- `react` 18.3.1 - Core UI framework
- `react-dom` 18.3.1 - DOM rendering
- `react-router-dom` 6.30.3 - Client routing (3 routes: `/`, `/search`, `/company/:id`)
- `express` 5.2.1 - API server (Express 5, major version)
- `better-sqlite3` 12.6.2 - SQLite access, native addon with C++ bindings
- `cors` 2.8.6 - CORS middleware for Express

**UI (Runtime):**
- `framer-motion` 10.18.0 - Animation (split into separate chunk in build)
- `lucide-react` 0.303.0 - SVG icon components
- `@tanstack/react-query` 5.90.21 - Installed but effectively unused (custom hooks replace it)
- `@tanstack/react-query-devtools` 5.17.0 - Dev-only, not imported anywhere in source
- `axios` 1.13.6 - Listed but NOT used; `src/api/api.ts` uses native `fetch()` instead

**Dev Dependencies:**
- `typescript` 5.9.3 - Type checking and compilation
- `@vitejs/plugin-react` 4.x - Vite React plugin (JSX transform, HMR)
- `@typescript-eslint/*` 6.x - TypeScript ESLint integration
- `eslint-plugin-react-hooks` 4.x - React hooks linting rules
- `eslint-plugin-react-refresh` 0.4.x - React Refresh compatibility

**Python (Offline Utilities Only):**
- `requests` - HTTP client for web scraping (`scrape_images.py`)
- `beautifulsoup4` (bs4) - HTML parsing for image extraction (`scrape_images.py`)
- `csv`, `json`, `sqlite3` - Standard library modules for data import (`server/import-data.py`)

## Configuration

**TypeScript (`tsconfig.json`):**
- Target: ES2020
- Module: ESNext with bundler resolution
- Strict mode: enabled
- `noUnusedLocals` and `noUnusedParameters`: enabled
- JSX: react-jsx (automatic runtime)
- Path aliases configured (see below)

**Path Aliases (both `tsconfig.json` and `vite.config.ts`):**
- `@/*` -> `./src/*`
- `@components/*` -> `./src/components/*`
- `@pages/*` -> `./src/pages/*`
- `@api/*` -> `./src/api/*`
- `@hooks/*` -> `./src/hooks/*`
- `@types/*` -> `./src/types/*`
- `@utils/*` -> `./src/utils/*`
- `@context/*` -> `./src/context/*`
- `@styles/*` -> `./src/styles/*`

**Vite (`vite.config.ts`):**
- Dev server: port 3000, auto-opens browser
- API proxy: `/api` -> `http://localhost:3001` (Express backend)
- Build: outputs to `dist/`, sourcemaps enabled, Terser minification
- Manual chunks: `vendor` (react/react-dom/react-router), `animation` (framer-motion), `query` (react-query)
- Chunk size warning limit: 1000 KB

**Tailwind (`tailwind.config.js`):**
- Content scan: `index.html` + `src/**/*.{js,ts,jsx,tsx}`
- Extended theme with brand colors (gold `#F5C518`, black `#1A1A1A`), dark surface palette
- Custom fonts: Oswald (display headings), Inter (body text)
- Custom animations: fade-in, fade-in-up, scale-in, shimmer
- Custom utilities: text-shadow, line-clamp (1-3), scrollbar-hide

**PostCSS (`postcss.config.js`):**
- Plugins: tailwindcss, autoprefixer

**Environment:**
- No `.env` file present - configuration is hardcoded
- API port: `process.env.PORT || 3001` (only env var used, in `server/api.js`)
- DB path: resolved relative to `server/api.js` at `server/constructflix.db`

**Build Commands (`package.json` scripts):**
```bash
npm run dev        # Start Vite dev server on port 3000
npm run build      # tsc && vite build (type-check then bundle)
npm run preview    # Serve production build on port 4173
npm run lint       # ESLint with zero-warning policy
npm run lint:fix   # ESLint auto-fix
npm run type-check # TypeScript check without emit
```

**Server Start (manual):**
```bash
node server/api.js  # Start Express API on port 3001
```

## Database

**Primary: SQLite via better-sqlite3**
- File: `server/constructflix.db` (2.1 GB)
- Contains ~3.4M construction company records
- Opened in read-only mode by the API server
- WAL journal mode enabled
- Table: `companies` with 22 columns
- Indexes: `idx_state`, `idx_category`, `idx_city`, `idx_rating`, `idx_name`, `idx_state_category`

**Secondary (empty): `server/construction_directory.db`**
- 0 bytes, unused placeholder

**Public fallback: `public/database.json`**
- 217 KB static JSON file in public directory (likely a subset or legacy artifact)

## Platform Requirements

**Development:**
- Node.js >= 18 (uses ES modules, `import.meta.dirname`)
- npm >= 9
- Windows environment (paths reference `C:/Users/` in scripts)
- Two terminal processes needed: Vite dev server (port 3000) + Express API (port 3001)
- Python 3.x only needed for `scrape_images.py` and `server/import-data.py` data preparation

**Production:**
- Static SPA build in `dist/` served by any static host
- Express API server requires Node.js runtime with better-sqlite3 native module
- SQLite DB file (~2.1 GB) must be co-located with `server/api.js`
- No external service dependencies (fully self-contained)

---

*Stack analysis: 2026-03-11*
