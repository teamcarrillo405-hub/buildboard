/**
 * AI-powered search endpoint.
 *
 * POST /api/ai-search
 *
 * Accepts a natural language message and optional conversation history,
 * returns structured filters extracted by Gemini (or the fallback parser)
 * along with a summary and source indicator.
 */

import { Router } from 'express';
import { smartSearch } from '../services/gemini-search.js';
import type { ConversationMessage } from '../services/gemini-search.js';

// Try to import categoryMatcher from Plan 03-01 (may not exist yet)
let matchCategory: ((input: string) => string | null) | null = null;
try {
  const mod = await import('../helpers/categoryMatcher.js');
  matchCategory = mod.matchCategory;
} catch {
  // categoryMatcher not available yet
}

const router = Router();

router.post('/ai-search', async (req, res, next) => {
  try {
    const { message, history } = req.body as {
      message?: string;
      history?: ConversationMessage[];
    };

    // Validate message
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: 'Message is required and must be a non-empty string.',
      });
    }

    // Validate history if provided
    const validHistory: ConversationMessage[] = [];
    if (Array.isArray(history)) {
      for (const entry of history) {
        if (
          entry &&
          typeof entry.text === 'string' &&
          (entry.role === 'user' || entry.role === 'model')
        ) {
          validHistory.push({ role: entry.role, text: entry.text });
        }
      }
    }

    const result = await smartSearch(message.trim(), validHistory);

    // Apply category normalization if categoryMatcher is available
    if (result.filters.category && matchCategory) {
      const normalized = matchCategory(result.filters.category);
      if (normalized) {
        result.filters.category = normalized;
      }
    }

    console.log(
      `[ai-search] source=${result.source} filters=${JSON.stringify(result.filters)}`,
    );

    res.json({
      filters: result.filters,
      summary: result.summary,
      source: result.source,
      conversationEntry: result.conversationEntry,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
