/**
 * Gemini AI search service for natural language query parsing.
 *
 * Uses Gemini function calling to extract structured filters from user queries.
 * Falls back to the rule-based parseChat parser when Gemini is unavailable,
 * the API key is missing, or the request times out (3 seconds).
 */

import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';
import { parseChat } from '../helpers/parseChat.js';

// ---------------------------------------------------------------------------
// Try to import categoryMatcher from Plan 03-01 (may not exist yet)
// ---------------------------------------------------------------------------

let matchCategory: ((input: string) => string | null) | null = null;
try {
  // Dynamic import is used because Plan 03-01 runs in parallel and may not
  // have been committed yet.
  const mod = await import('../helpers/categoryMatcher.js');
  matchCategory = mod.matchCategory;
} catch {
  // categoryMatcher not available yet -- no normalization applied
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchFilters {
  query?: string;
  category?: string;
  city?: string;
  state?: string;
  minRating?: number;
  services?: string[];
}

export interface ConversationMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AISearchResult {
  filters: SearchFilters;
  summary: string;
  source: 'ai' | 'fallback';
  conversationEntry: { role: 'model'; text: string };
}

// ---------------------------------------------------------------------------
// Function declaration for Gemini
// ---------------------------------------------------------------------------

const SEARCH_FUNCTION = {
  name: 'search_directory',
  description: `Search the BuildBoard construction contractor directory with 3.4M companies across the US.
Extract structured search filters from the user's natural language query.
Categories include: Plumbing, Electrical Contractors, Roofing Contractors, HVAC Contractor,
Foundation, General Contractor, Masonry Contractors, Landscaping Contractor, Painting Contractor,
Flooring Contractors, Drywall and Insulation Contractors, Siding Contractors, Residential Remodelers,
Commercial Building Construction, Demolition Contractor, Fence Contractor, Gutter Contractor,
Welding Contractor, Deck Builder, Kitchen remodeling contractors, Bathroom remodeling contractors,
Window and Door Contractor, Solar panel installation, Asphalt Paving Contractor,
Excavation Contractor, Finish Carpentry Contractors, Tile and Terrazzo Contractors.
States use 2-letter codes (TX, CA, FL, NY, etc).`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          'Free-text search keywords for full-text matching (company names, service descriptions). Only set if the user mentions something that does not fit into the other structured fields.',
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
        description: 'US state 2-letter code (e.g., TX, CA, FL)',
      },
      minRating: {
        type: Type.NUMBER,
        description: 'Minimum star rating filter (1.0 to 5.0)',
      },
      services: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          'Specific services the user is looking for (e.g., Free Estimates, Emergency Services, 24/7 Service)',
      },
      summary: {
        type: Type.STRING,
        description:
          'A brief, helpful one-sentence summary explaining what you understood from the query and what you are searching for',
      },
    },
    required: ['summary'],
  },
};

// ---------------------------------------------------------------------------
// AI availability check
// ---------------------------------------------------------------------------

/**
 * Returns true if the GEMINI_API_KEY environment variable is set.
 * Logs a warning on first call if the key is missing.
 */
let _checkedOnce = false;
export function isAIAvailable(): boolean {
  const available = Boolean(process.env.GEMINI_API_KEY);
  if (!_checkedOnce) {
    _checkedOnce = true;
    if (!available) {
      console.warn(
        '[gemini-search] GEMINI_API_KEY is not set. ' +
          'AI search will fall back to the rule-based parser. ' +
          'Set the key in your .env file to enable AI-powered search.',
      );
    }
  }
  return available;
}

// ---------------------------------------------------------------------------
// Core AI parsing function
// ---------------------------------------------------------------------------

/**
 * Parse a natural language query into structured search filters using Gemini
 * function calling.
 *
 * @throws If the API key is missing, the call fails, or no function call is
 *         returned -- callers should catch and fall back.
 */
export async function aiParseQuery(
  message: string,
  history: ConversationMessage[] = [],
): Promise<{ filters: SearchFilters; summary: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build conversation contents: system preamble + history + current message
  const contents = [
    {
      role: 'user' as const,
      parts: [
        {
          text: 'You are the BuildBoard search assistant. Help users find construction contractors by extracting search filters from their queries. Be conversational and helpful in your summaries. When the user refines a previous search (e.g. "what about in Dallas instead?"), incorporate the context from the conversation history.',
        },
      ],
    },
    {
      role: 'model' as const,
      parts: [
        {
          text: 'Understood! I will extract search filters and provide helpful summaries for finding construction contractors.',
        },
      ],
    },
    // Conversation history for follow-up queries
    ...history.map((msg) => ({
      role: msg.role as 'user' | 'model',
      parts: [{ text: msg.text }],
    })),
    // Current user message
    { role: 'user' as const, parts: [{ text: message }] },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
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

  const functionCall = response.functionCalls?.[0];
  if (!functionCall) {
    throw new Error('Gemini did not return a function call');
  }

  const args = functionCall.args as Record<string, unknown>;

  const filters: SearchFilters = {};
  if (args.query) filters.query = args.query as string;
  if (args.category) {
    let category = args.category as string;
    // Try to normalize using categoryMatcher if available
    if (matchCategory) {
      const normalized = matchCategory(category);
      if (normalized) category = normalized;
    }
    filters.category = category;
  }
  if (args.city) filters.city = args.city as string;
  if (args.state) filters.state = args.state as string;
  if (args.minRating) filters.minRating = args.minRating as number;
  if (args.services && Array.isArray(args.services)) {
    filters.services = args.services as string[];
  }

  const summary =
    (args.summary as string) || 'Here are the results for your search.';

  return { filters, summary };
}

// ---------------------------------------------------------------------------
// Smart search with timeout + fallback
// ---------------------------------------------------------------------------

/**
 * Attempt AI-powered search parsing with a 3-second timeout.
 * Falls back to the rule-based parseChat parser on any failure.
 */
export async function smartSearch(
  message: string,
  history: ConversationMessage[] = [],
): Promise<AISearchResult> {
  // Handle empty/whitespace messages
  if (!message || !message.trim()) {
    return {
      filters: {},
      summary: 'What kind of contractor are you looking for? Try something like "plumbers in Austin TX" or "highly rated electricians near me."',
      source: 'fallback',
      conversationEntry: {
        role: 'model',
        text: 'What kind of contractor are you looking for? Try something like "plumbers in Austin TX" or "highly rated electricians near me."',
      },
    };
  }

  // Skip AI entirely if no API key
  if (!isAIAvailable()) {
    return buildFallbackResult(message);
  }

  // Try AI with 3-second timeout
  try {
    const aiResult = await Promise.race([
      aiParseQuery(message, history),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI search timed out after 3s')), 3000),
      ),
    ]);

    const summary = aiResult.summary;
    return {
      filters: aiResult.filters,
      summary,
      source: 'ai',
      conversationEntry: { role: 'model', text: summary },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`[gemini-search] AI unavailable, using fallback: ${errorMessage}`);
    return buildFallbackResult(message);
  }
}

// ---------------------------------------------------------------------------
// Fallback builder
// ---------------------------------------------------------------------------

function buildFallbackResult(message: string): AISearchResult {
  const parsed = parseChat(message);

  const filters: SearchFilters = {};
  // Always include the original message as query for FTS matching
  filters.query = message;
  if (parsed.category) filters.category = parsed.category;
  if (parsed.state) filters.state = parsed.state;
  if (parsed.city) filters.city = parsed.city;
  if (parsed.minRating) filters.minRating = parsed.minRating;

  // Map boolean features to services array
  const services: string[] = [];
  if (parsed.emergency) services.push('Emergency Services');
  if (parsed.freeEstimate) services.push('Free Estimates');
  if (parsed.warranty) services.push('Warranty');
  if (services.length > 0) filters.services = services;

  const summary = 'Here are the results for your search.';
  return {
    filters,
    summary,
    source: 'fallback',
    conversationEntry: { role: 'model', text: summary },
  };
}
