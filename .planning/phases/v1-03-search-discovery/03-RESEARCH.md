# Phase 3: Search & Discovery - Research

**Researched:** 2026-03-11
**Domain:** Full-text search, AI-powered natural language query parsing, conversational search UI
**Confidence:** HIGH

## Summary

Phase 3 transforms BuildBoard's search from slow LIKE-based queries (1.3 seconds on 3.4M rows) into a two-layer system: SQLite FTS5 for sub-10ms full-text search, and Gemini function-calling for intelligent natural language query parsing with visual filter chips. The existing `@google/genai` v1.44.0 SDK is already installed and supports function calling via `generateContent` with tool declarations. The existing `parseChat.ts` rule-based parser becomes the graceful fallback when AI is unavailable.

The architecture pattern is: user types natural language -> Gemini extracts structured filters (category, location, rating, services) via function calling -> filters drive FTS5/SQL queries -> results display with editable filter chips. Conversational context is maintained client-side as chat history sent back to Gemini on follow-up queries. FTS5 was validated on the full 3.4M-row dataset: indexed in ~23 seconds (one-time), searches return in 6-34ms with BM25 ranking.

**Primary recommendation:** Use Gemini 2.5 Flash with `FunctionCallingConfigMode.ANY` to force structured filter extraction on every query, fall back to the existing `parseChat` rule-based parser + FTS5 keyword search when the AI service is unavailable or slow. Build FTS5 as an external-content virtual table pointing at the `companies` table with porter stemming.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | Full-text search returning relevant results in <500ms | FTS5 external-content table with BM25 ranking; validated at 6-34ms on 3.4M rows |
| SRCH-02 | Natural language queries produce AI-extracted filter chips (category, location, rating, services) | Gemini function calling with `FunctionCallingConfigMode.ANY` extracts structured params; render as removable chips |
| SRCH-03 | Add, remove, modify filter chips without retyping query | Client-side filter chip state management; chips modify URL params independently of query text |
| SRCH-04 | AI search provides brief natural language summary of results | Gemini generates summary text alongside function call; return as `aiSummary` field in response |
| SRCH-05 | Follow-up queries refine previous results conversationally | Send chat history (previous messages + extracted filters) as context to Gemini; merge new filters with existing |
| SRCH-06 | Graceful fallback to FTS5 keyword search if AI fails | Try/catch around Gemini call with timeout; fall back to existing `parseChat` + FTS5 MATCH |
| UI-03 | Navigation and search feel intuitive | Unified search bar in nav that handles both keyword and natural language; filter chips visible above results |
| UI-05 | AI search agent has a distinct, helpful presence | Styled AI response card with agent identity; animated thinking state; conversational tone in summaries |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | 1.44.0 | Gemini API client for function calling | Already installed; official Google SDK; supports function calling with `Type` enum and `FunctionCallingConfigMode` |
| `@libsql/client` | 0.17.0 | SQLite client (supports FTS5) | Already installed; confirmed FTS5 support with SQLite 3.45.1 |
| `drizzle-orm` | 0.45.1 | ORM for structured queries | Already installed; use `sql` tagged template for raw FTS5 queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 0.303.0 | Icons for filter chips, AI indicator | Already installed; use Sparkles for AI, X for chip dismiss, Filter for chip |
| `framer-motion` | 10.17.0 | Chip animations, AI card transitions | Already installed; used in existing FilterBar component |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FTS5 | Meilisearch/Typesense | External service adds infra complexity; FTS5 is built-in and validated at 6ms on this dataset |
| Gemini function calling | OpenAI structured outputs | User already has Gemini API key; `@google/genai` already installed; no reason to switch |
| External-content FTS5 | Regular FTS5 table | External-content saves ~500MB+ disk by not duplicating text data; worth the trigger complexity |
| Vector/semantic search | N/A | Explicitly out of scope per REQUIREMENTS.md -- "Overkill for structured data" |

**Installation:**
```bash
# No new packages needed -- everything is already installed
# Just need GEMINI_API_KEY in .env
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  routes/
    search.ts          # MODIFY: Replace LIKE queries with FTS5 + AI parsing
  services/
    gemini-search.ts   # NEW: Gemini function-calling service for query parsing
    fts5.ts            # NEW: FTS5 index management (create, rebuild, query)
  helpers/
    parseChat.ts       # KEEP: Becomes fallback parser when AI unavailable
src/
  components/
    SearchBar.tsx       # NEW: Unified search bar (replaces separate nav/sidebar inputs)
    FilterChips.tsx     # NEW: AI-extracted filter chips with add/remove/modify
    AIAssistant.tsx     # NEW: AI response card with personality and summary
    ChatHistory.tsx     # NEW: Conversational search history panel
  pages/
    SearchResults.tsx   # MODIFY: Integrate filter chips + AI assistant
  api/
    api.ts             # MODIFY: Add AI search endpoint
    types.ts           # MODIFY: Add AI search types
```

### Pattern 1: Gemini Function Calling for Query Parsing
**What:** Define a `search_directory` function declaration that tells Gemini to extract structured filters from natural language. Use `FunctionCallingConfigMode.ANY` to force the model to always call the function (never freeform text).
**When to use:** Every search query -- the function call IS the query parsing step.
**Example:**
```typescript
// Source: Verified against @google/genai v1.44.0 exports + official docs
import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';

const searchFunctionDeclaration = {
  name: 'search_directory',
  description: 'Search the BuildBoard construction contractor directory. Extract structured filters from the user query to find matching companies.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Keywords to search for in company names, services, and descriptions',
      },
      category: {
        type: Type.STRING,
        description: 'Construction trade category (e.g., Plumbing, Electrical Contractors, Roofing Contractors, HVAC Contractor, Foundation, General Contractor)',
      },
      city: {
        type: Type.STRING,
        description: 'City name to filter by',
      },
      state: {
        type: Type.STRING,
        description: 'US state 2-letter code (e.g., TX, CA, FL)',
      },
      minRating: {
        type: Type.NUMBER,
        description: 'Minimum star rating (1.0 to 5.0)',
      },
      services: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Specific services to look for (e.g., Free Estimates, Emergency Services, 24/7 Service)',
      },
      summary: {
        type: Type.STRING,
        description: 'A brief, helpful one-sentence summary to show the user about what you found based on their query',
      },
    },
    required: ['summary'],
  },
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function parseSearchQuery(
  userMessage: string,
  conversationHistory: Array<{ role: string; text: string }> = []
): Promise<{ filters: SearchFilters; summary: string }> {
  const contents = [
    ...conversationHistory.map(msg => ({
      role: msg.role as 'user' | 'model',
      parts: [{ text: msg.text }],
    })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      tools: [{ functionDeclarations: [searchFunctionDeclaration] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ['search_directory'],
        },
      },
    },
  });

  const functionCall = response.functionCalls?.[0];
  if (!functionCall) throw new Error('No function call returned');

  const args = functionCall.args as Record<string, unknown>;
  return {
    filters: {
      query: args.query as string | undefined,
      category: args.category as string | undefined,
      city: args.city as string | undefined,
      state: args.state as string | undefined,
      minRating: args.minRating as number | undefined,
      services: args.services as string[] | undefined,
    },
    summary: args.summary as string || 'Here are the results for your search.',
  };
}
```

### Pattern 2: FTS5 External-Content Table with BM25 Ranking
**What:** Create an FTS5 virtual table that indexes `businessName`, `category`, `city`, `state`, and `services` from the existing `companies` table. Use porter stemming for morphological matching. Use BM25 with column weights (businessName 10x, category 5x, city 3x, state 1x, services 2x).
**When to use:** All full-text search queries. The AI-extracted filters drive both FTS5 MATCH and SQL WHERE clauses.
**Example:**
```sql
-- Source: https://www.sqlite.org/fts5.html (verified with SQLite 3.45.1)

-- Create external-content FTS5 table
CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
  businessName, category, city, state, services,
  content='companies',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Populate index (one-time, ~23 seconds for 3.4M rows)
INSERT INTO companies_fts(companies_fts) VALUES('rebuild');

-- Search with BM25 ranking
-- Weights: businessName=10, category=5, city=3, state=1, services=2
SELECT c.*, bm25(companies_fts, 10.0, 5.0, 3.0, 1.0, 2.0) as relevance
FROM companies_fts
JOIN companies c ON c.rowid = companies_fts.rowid
WHERE companies_fts MATCH 'plumbing AND austin'
ORDER BY relevance
LIMIT 20;
```

### Pattern 3: Hybrid Search (AI Filters + FTS5 + SQL)
**What:** Combine AI-extracted structured filters with FTS5 full-text search and standard SQL WHERE clauses. FTS5 handles keyword/text matching; SQL WHERE handles exact filters (state, category, rating).
**When to use:** When the AI returns both free-text query terms and structured filters.
**Example:**
```typescript
// Combine FTS5 MATCH with SQL WHERE
async function hybridSearch(filters: SearchFilters, limit = 20, offset = 0) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // FTS5 MATCH for text query
  let ftsJoin = '';
  let ftsOrder = 'c.rating DESC, c.reviewCount DESC';
  if (filters.query) {
    ftsJoin = 'JOIN companies_fts ON companies_fts.rowid = c.rowid';
    conditions.push('companies_fts MATCH ?');
    params.push(filters.query);
    ftsOrder = 'bm25(companies_fts, 10.0, 5.0, 3.0, 1.0, 2.0), c.rating DESC';
  }

  // Structured SQL filters
  if (filters.category) { conditions.push('c.category = ?'); params.push(filters.category); }
  if (filters.state) { conditions.push('c.state = ?'); params.push(filters.state); }
  if (filters.city) { conditions.push("LOWER(c.city) = LOWER(?)"); params.push(filters.city); }
  if (filters.minRating) { conditions.push('c.rating >= ?'); params.push(filters.minRating); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT c.*, ${filters.query ? 'bm25(companies_fts, 10.0, 5.0, 3.0, 1.0, 2.0) as relevance' : 'NULL as relevance'}
    FROM companies c
    ${ftsJoin}
    ${where}
    ORDER BY ${ftsOrder}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return db.execute(sql, params);
}
```

### Pattern 4: Conversational Context via Chat History
**What:** Maintain conversation history client-side and send it with each follow-up query to Gemini. The model uses prior context to understand refinements like "what about in Dallas instead?" or "show me ones with free estimates."
**When to use:** SRCH-05 conversational refinement.
**Example:**
```typescript
// Client-side conversation state
interface SearchConversation {
  messages: Array<{ role: 'user' | 'model'; text: string }>;
  currentFilters: SearchFilters;
}

// On follow-up query, send full history
const response = await fetch('/api/ai-search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'what about in Dallas instead?',
    history: conversation.messages,
    currentFilters: conversation.currentFilters,
  }),
});
```

### Pattern 5: Graceful AI Fallback
**What:** Wrap the Gemini call in a try/catch with a timeout. If the AI fails (network error, rate limit, API key missing), fall back to the existing `parseChat` rule-based parser + FTS5 keyword search. The user should never see an error -- they just get slightly less intelligent results.
**When to use:** Always -- every AI search call wraps fallback logic.
**Example:**
```typescript
async function smartSearch(message: string, history: Message[] = []) {
  // Try AI first with timeout
  try {
    const aiResult = await Promise.race([
      parseSearchQuery(message, history),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    return { ...aiResult, source: 'ai' as const };
  } catch (err) {
    // Fallback to rule-based parser
    console.warn('[search] AI unavailable, using fallback:', err.message);
    const parsed = parseChat(message);
    return {
      filters: {
        query: message,
        category: parsed.category,
        state: parsed.state,
        city: parsed.city,
        minRating: parsed.minRating,
      },
      summary: null,
      source: 'fallback' as const,
    };
  }
}
```

### Anti-Patterns to Avoid
- **Sending raw SQL to Gemini:** Never let the AI generate SQL directly. Use function calling to extract structured filters, then build SQL yourself. Prevents injection and ensures predictable queries.
- **FTS5 without content table sync:** If not using external-content, you duplicate all text data. The companies table is already 2.1GB -- doubling it with a regular FTS5 table wastes space.
- **Blocking on AI for every search:** The AI call adds 500-2000ms latency. For simple keyword searches (e.g., "plumber"), consider skipping AI entirely and using FTS5 directly. Only invoke AI for natural language queries.
- **Storing conversation history server-side without auth:** Phase 4 adds auth. For now, keep conversation history in client memory (React state). No persistent storage needed.
- **Indexing the `services` column as-is:** The services column is JSON (e.g., `["Free Estimates", "Emergency Services"]`). FTS5 will tokenize the JSON brackets/quotes. Either parse the JSON and concatenate values before indexing, or accept minor noise in results.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Natural language parsing | Custom regex/NLP parser for all query patterns | Gemini function calling | The existing `parseChat.ts` has 120 lines of fragile regex and only covers ~30 category synonyms; Gemini handles any phrasing |
| Full-text search | LIKE queries across multiple columns | SQLite FTS5 with BM25 | LIKE takes 1289ms on 3.4M rows; FTS5 takes 6ms. Not in the same league. |
| Search result ranking | Custom scoring algorithm | FTS5 bm25() with column weights | BM25 is the industry standard for text relevance; column weights let you prioritize businessName matches |
| Query tokenization | Custom word stemming/normalization | FTS5 porter tokenizer | Porter stemming handles plurals, verb forms, etc. automatically (plumber/plumbing/plumbers all match) |
| Filter chip extraction | Regex parsing of AI text responses | Gemini function calling with typed schema | Function calling returns structured JSON directly; no parsing needed |

**Key insight:** The existing `parseChat.ts` is a hand-rolled NLP parser with ~30 hardcoded category synonyms, regex-based intent detection, and fragile city extraction. Gemini function calling replaces all of this with a single API call that handles arbitrary natural language. Keep `parseChat` only as a fallback.

## Common Pitfalls

### Pitfall 1: FTS5 Index Not Created on Server Start
**What goes wrong:** The FTS5 virtual table needs to exist before any search queries. If the server starts without it, all FTS5 queries fail.
**Why it happens:** FTS5 tables are virtual tables that persist in the database file, but the index needs to be built once (or rebuilt after schema changes).
**How to avoid:** Check for the FTS5 table on server startup. If it does not exist, create it and run `INSERT INTO companies_fts(companies_fts) VALUES('rebuild')`. The rebuild takes ~23 seconds on 3.4M rows -- do it once, log progress, and handle the server being ready after.
**Warning signs:** "no such table: companies_fts" errors in server logs.

### Pitfall 2: Category Name Mismatch Between AI and Database
**What goes wrong:** Gemini returns "Plumbing Contractor" but the database has "Plumbing", "Plumbing Contractor", and "Plumbing Contractors" (163 distinct categories with case and naming variations).
**Why it happens:** The database has inconsistent category naming (case differences, singular/plural variations, some with "Contractor" suffix and some without).
**How to avoid:** Include the exact list of valid categories (or a representative sample) in the function declaration's `description` field. Also implement fuzzy category matching on the server: normalize the AI-returned category to the closest database category using case-insensitive prefix matching.
**Warning signs:** Empty results when user searches for common trades.

### Pitfall 3: Gemini API Key Not Configured
**What goes wrong:** AI search fails silently on first request because `GEMINI_API_KEY` is not in `.env`.
**Why it happens:** The key was used as a shell env var for image generation scripts but never added to `.env`. The `.env.example` does not list it.
**How to avoid:** Add `GEMINI_API_KEY` to `.env.example`. On server startup, log whether AI search is available or degraded. The fallback parser must work without any API key.
**Warning signs:** All searches fall back to the rule-based parser.

### Pitfall 4: Gemini Latency Exceeding 2-Second Budget
**What goes wrong:** The success criteria requires results "in under 2 seconds." Gemini API calls typically take 500-2000ms, plus FTS5 query time.
**Why it happens:** Network latency to the Gemini API, especially on first cold request.
**How to avoid:** Run AI parsing and keyword FTS5 search in parallel. Show FTS5 results immediately, then enhance with AI-parsed filter chips when the AI responds. Use a 3-second timeout on the Gemini call. Consider using `gemini-2.5-flash` (not Pro) for lower latency.
**Warning signs:** Search feels sluggish; users see loading spinners for more than 2 seconds.

### Pitfall 5: FTS5 Special Characters in User Input
**What goes wrong:** User input containing FTS5 syntax characters (quotes, asterisks, AND, OR, NOT, parentheses) causes query errors.
**Why it happens:** FTS5 MATCH interprets these as query operators.
**How to avoid:** Sanitize user input before passing to FTS5 MATCH. Escape or remove special characters. Wrap user terms in double quotes for phrase matching if needed.
**Warning signs:** "fts5: syntax error" in server logs.

### Pitfall 6: External-Content FTS5 Table Losing Sync
**What goes wrong:** The FTS5 index returns stale or missing results because the companies table was modified without updating the FTS index.
**Why it happens:** External-content FTS5 tables require triggers on INSERT/UPDATE/DELETE of the content table to stay synchronized.
**How to avoid:** Create the three sync triggers (AFTER INSERT, AFTER DELETE, AFTER UPDATE) on the `companies` table when creating the FTS5 table. For this project, the companies table is essentially read-only (data was imported once), so this is low risk, but still create the triggers for correctness.
**Warning signs:** Search results missing recently added companies.

## Code Examples

Verified patterns from official sources:

### FTS5 Table Creation with External Content
```sql
-- Source: https://www.sqlite.org/fts5.html (External Content Tables section)
-- Create external-content FTS5 table
CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
  businessName,
  category,
  city,
  state,
  services,
  content='companies',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Sync triggers (important for data integrity)
CREATE TRIGGER IF NOT EXISTS companies_fts_insert AFTER INSERT ON companies BEGIN
  INSERT INTO companies_fts(rowid, businessName, category, city, state, services)
  VALUES (new.rowid, new.businessName, new.category, new.city, new.state, new.services);
END;

CREATE TRIGGER IF NOT EXISTS companies_fts_delete AFTER DELETE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, businessName, category, city, state, services)
  VALUES ('delete', old.rowid, old.businessName, old.category, old.city, old.state, old.services);
END;

CREATE TRIGGER IF NOT EXISTS companies_fts_update AFTER UPDATE ON companies BEGIN
  INSERT INTO companies_fts(companies_fts, rowid, businessName, category, city, state, services)
  VALUES ('delete', old.rowid, old.businessName, old.category, old.city, old.state, old.services);
  INSERT INTO companies_fts(rowid, businessName, category, city, state, services)
  VALUES (new.rowid, new.businessName, new.category, new.city, new.state, new.services);
END;

-- Build the index (one-time operation, ~23 seconds for 3.4M rows)
INSERT INTO companies_fts(companies_fts) VALUES('rebuild');
```

### FTS5 Input Sanitization
```typescript
// Source: SQLite FTS5 docs -- special characters section
function sanitizeFtsQuery(input: string): string {
  // Remove FTS5 syntax operators that could break queries
  let sanitized = input
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[()]/g, '') // Remove parentheses
    .replace(/\*/g, '')   // Remove wildcards
    .trim();

  // Split into words and join with implicit AND
  const words = sanitized.split(/\s+/).filter(w => {
    const upper = w.toUpperCase();
    // Remove bare FTS operators
    return w.length > 0 && upper !== 'AND' && upper !== 'OR' && upper !== 'NOT' && upper !== 'NEAR';
  });

  if (words.length === 0) return '';

  // Use prefix matching on last word for type-ahead behavior
  const terms = words.map((w, i) => i === words.length - 1 ? `"${w}"*` : `"${w}"`);
  return terms.join(' ');
}
```

### Gemini Function Calling with @google/genai v1.44.0
```typescript
// Source: https://ai.google.dev/gemini-api/docs/function-calling
// Verified exports: GoogleGenAI, FunctionCallingConfigMode, Type
import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const SEARCH_FUNCTION = {
  name: 'search_directory',
  description: `Search the BuildBoard construction contractor directory with 3.4M companies across the US.
Extract structured search filters from the user's natural language query.
Categories include: Plumbing, Electrical Contractors, Roofing Contractors, HVAC Contractor,
Foundation, General Contractor, Masonry Contractors, Landscaping Contractor, Painting Contractor,
Flooring Contractors, Drywall and Insulation Contractors, Siding Contractors, and many more.
States use 2-letter codes (TX, CA, FL, etc).`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Free-text search keywords for FTS5 matching (company names, service descriptions)',
      },
      category: {
        type: Type.STRING,
        description: 'Construction trade category to filter by',
      },
      city: {
        type: Type.STRING,
        description: 'City name to filter by',
      },
      state: {
        type: Type.STRING,
        description: 'US state 2-letter code',
      },
      minRating: {
        type: Type.NUMBER,
        description: 'Minimum star rating filter (1.0 to 5.0)',
      },
      services: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Specific services to search for',
      },
      summary: {
        type: Type.STRING,
        description: 'Brief one-sentence summary explaining what you understood from the query and what you are searching for',
      },
    },
    required: ['summary'],
  },
};

async function aiParseQuery(message: string, history: Message[] = []) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      // System instruction as first message
      {
        role: 'user',
        parts: [{ text: 'You are the BuildBoard search assistant. Help users find construction contractors by extracting search filters from their queries. Be conversational and helpful in your summaries.' }],
      },
      { role: 'model', parts: [{ text: 'Understood! I will extract search filters and provide helpful summaries.' }] },
      // Conversation history
      ...history,
      // Current message
      { role: 'user', parts: [{ text: message }] },
    ],
    config: {
      tools: [{ functionDeclarations: [SEARCH_FUNCTION] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ['search_directory'],
        },
      },
    },
  });

  const fc = response.functionCalls?.[0];
  if (!fc) throw new Error('No function call in response');
  return fc.args as SearchFilters & { summary: string };
}
```

### Filter Chip Component Pattern
```tsx
// React component for AI-extracted filter chips
interface FilterChip {
  key: string;      // 'category' | 'city' | 'state' | 'minRating' | 'service'
  label: string;    // Display text: "Plumbing", "Austin, TX", "4.5+ Stars"
  value: string;    // Raw value for the filter
}

const FilterChips: React.FC<{
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onModify: (key: string, newValue: string) => void;
}> = ({ chips, onRemove, onModify }) => (
  <div className="flex flex-wrap gap-2">
    {chips.map((chip) => (
      <span
        key={chip.key}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                   bg-brand-primary/15 border border-brand-primary/30 text-brand-primary
                   text-[0.8rem] font-medium"
      >
        {chip.label}
        <button
          onClick={() => onRemove(chip.key)}
          className="ml-0.5 hover:bg-brand-primary/20 rounded-full p-0.5"
          aria-label={`Remove ${chip.label} filter`}
        >
          <X className="w-3 h-3" />
        </button>
      </span>
    ))}
  </div>
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `parseChat.ts` regex parsing (120 lines, ~30 synonyms) | Gemini function calling (handles any phrasing) | This phase | Orders of magnitude better NLU; regex becomes fallback only |
| `LIKE '%term%'` queries (1289ms on 3.4M rows) | FTS5 with BM25 ranking (6-34ms) | This phase | 200x faster search; relevance-ranked results |
| Separate keyword search + chat endpoints | Unified AI-powered search endpoint | This phase | One search bar handles everything |
| Static filter sidebar (category, state, city, rating dropdowns) | Dynamic AI-extracted filter chips | This phase | Filters emerge from natural language instead of requiring manual selection |

**Deprecated/outdated:**
- The existing `/api/chat` endpoint with rule-based `parseChat` becomes the internal fallback, not the primary search path
- The existing `/api/search` LIKE-based endpoint is replaced by FTS5
- The sidebar-based filter UI in `SearchResults.tsx` may be simplified to work alongside filter chips

## Open Questions

1. **FTS5 Index Persistence Strategy**
   - What we know: The FTS5 index takes ~23 seconds to build on 3.4M rows. Once built, it persists in the SQLite database file.
   - What's unclear: Should we build the index once (via a setup script) and commit the larger DB file, or rebuild on every server start? The DB is already 2.1GB -- the FTS5 index will add roughly 300-500MB.
   - Recommendation: Build once via a migration/setup script. Check for the FTS5 table on server start; only rebuild if missing. Do NOT rebuild on every start.

2. **Category Normalization for AI**
   - What we know: 163 distinct categories in the database with case/naming variations (e.g., "Plumbing", "Plumbing Contractor", "Plumbing Contractors"). Phase 2 mapped these to 61 image slugs.
   - What's unclear: Should we provide all 163 categories to Gemini in the function declaration, or just the 61 normalized groups?
   - Recommendation: Provide the 61 normalized group names in the function description. Implement server-side fuzzy matching to map AI output to actual database categories (case-insensitive, prefix matching, and the existing category synonym map).

3. **Search Results Page Redesign Scope**
   - What we know: The current SearchResults page has a sidebar with manual dropdowns. The new design needs AI-extracted filter chips and a conversational AI assistant.
   - What's unclear: Does the sidebar filter panel stay alongside chips, or do chips fully replace it?
   - Recommendation: Replace the sidebar with a horizontal filter chip bar above results. The sidebar was useful for manual browsing but conflicts with the AI-first search experience. Keep sort options accessible but move them inline.

4. **POST vs GET for AI Search Endpoint**
   - What we know: The existing `/api/chat` uses GET with query params. The new endpoint needs to send conversation history (array of messages).
   - What's unclear: N/A -- this is clear.
   - Recommendation: Use POST for the new `/api/ai-search` endpoint. Conversation history can be large and doesn't fit in query params. Keep the existing GET `/api/search` for simple FTS5 keyword searches.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (recommended -- pairs with existing Vite config) |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | FTS5 search returns results in <500ms | integration | `npx vitest run server/__tests__/fts5-search.test.ts -t "returns results under 500ms"` | No - Wave 0 |
| SRCH-02 | AI extracts filter chips from natural language | unit (mocked) | `npx vitest run server/__tests__/gemini-search.test.ts -t "extracts filters"` | No - Wave 0 |
| SRCH-03 | Filter chips can be added/removed/modified | unit | `npx vitest run src/__tests__/FilterChips.test.tsx -t "chip management"` | No - Wave 0 |
| SRCH-04 | AI provides natural language summary | unit (mocked) | `npx vitest run server/__tests__/gemini-search.test.ts -t "returns summary"` | No - Wave 0 |
| SRCH-05 | Follow-up queries refine previous results | integration (mocked) | `npx vitest run server/__tests__/gemini-search.test.ts -t "conversational refinement"` | No - Wave 0 |
| SRCH-06 | Graceful fallback when AI unavailable | unit | `npx vitest run server/__tests__/search-fallback.test.ts -t "falls back"` | No - Wave 0 |
| UI-03 | Search feels intuitive (navigation integration) | manual-only | N/A -- subjective UX evaluation | N/A |
| UI-05 | AI assistant has distinct presence | manual-only | N/A -- visual design evaluation | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest` -- install as dev dependency: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
- [ ] `vitest.config.ts` -- Vitest config with jsdom environment for React tests
- [ ] `server/__tests__/fts5-search.test.ts` -- FTS5 search integration tests
- [ ] `server/__tests__/gemini-search.test.ts` -- Gemini function calling tests (mocked API)
- [ ] `server/__tests__/search-fallback.test.ts` -- Fallback parser tests
- [ ] `src/__tests__/FilterChips.test.tsx` -- Filter chip component tests

## Sources

### Primary (HIGH confidence)
- SQLite FTS5 official documentation (https://www.sqlite.org/fts5.html) -- external content tables, BM25, tokenizers, triggers
- @google/genai v1.44.0 npm package -- verified exports: `GoogleGenAI`, `FunctionCallingConfigMode`, `Type` enum values
- Gemini API function calling docs (https://ai.google.dev/gemini-api/docs/function-calling) -- function declarations, tool config, modes
- Local database testing -- validated FTS5 on actual 3.4M-row dataset (6-34ms search, 23s index build)
- Local codebase analysis -- existing search routes, parseChat.ts, schema, component structure

### Secondary (MEDIUM confidence)
- Gemini API pricing docs (https://ai.google.dev/gemini-api/docs/pricing) -- Gemini 2.5 Flash: $0.30/M input tokens, $2.50/M output tokens; free tier available with rate limits
- SQLite FTS5 practical guides -- BM25 column weighting patterns, porter stemming behavior

### Tertiary (LOW confidence)
- AI search UI patterns (filter chips, conversational refinement) -- based on common patterns; specific implementation details are planner's discretion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified working; FTS5 tested on actual dataset
- Architecture: HIGH -- function calling pattern verified with @google/genai SDK; FTS5 external content pattern from official SQLite docs
- Pitfalls: HIGH -- most identified through actual testing (LIKE performance, FTS5 syntax, category inconsistency confirmed in database)
- UI patterns: MEDIUM -- filter chip pattern is well-established but specific conversational search UI is design-dependent

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable libraries; Gemini API may update but function calling interface is stable)
