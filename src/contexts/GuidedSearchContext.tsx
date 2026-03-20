/**
 * GuidedSearchContext
 * Provides `openGuidedSearch(q, loc)` to any component in the tree.
 * Renders <GuidedSearchModal> at the app level so it sits above everything.
 *
 * onComplete: combines answers + query into an enriched search string,
 *             then navigates to /search?q=...&loc=...
 * onSkip:     navigates directly to /search?q=...&loc=... unchanged
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import GuidedSearchModal from '../components/GuidedSearchModal';

// ── Context shape ─────────────────────────────────────────────────────────

interface GuidedSearchContextValue {
  openGuidedSearch: (q: string, loc: string) => void;
}

const GuidedSearchContext = createContext<GuidedSearchContextValue | null>(null);

// ── Hook ──────────────────────────────────────────────────────────────────

export function useGuidedSearch(): GuidedSearchContextValue {
  const ctx = useContext(GuidedSearchContext);
  if (!ctx) {
    throw new Error('useGuidedSearch must be used within a GuidedSearchProvider');
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────

interface GuidedSearchState {
  isOpen: boolean;
  q: string;
  loc: string;
}

export const GuidedSearchProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const navigate = useNavigate();
  const [state, setState] = useState<GuidedSearchState>({
    isOpen: false,
    q: '',
    loc: '',
  });

  const openGuidedSearch = useCallback((q: string, loc: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (loc) params.set('loc', loc);
    navigate(`/search?${params.toString()}`);
  }, [navigate]);

  const handleClose = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  /**
   * User completed all steps — enrich the query with their answers.
   * Answers are human-readable labels joined with spaces, appended to the
   * original query so search results can be further filtered.
   */
  const handleComplete = useCallback(
    (_answers: string[], q: string, loc: string) => {
      setState((s) => ({ ...s, isOpen: false }));
      // Navigate with the original query unchanged.
      // Modal answers (e.g. 'leak-repair', 'driveway') are UX-guidance for the user
      // but are NOT useful as FTS search terms — they are work-type slugs that don't
      // appear in the FTS-indexed columns and cause near-zero results when AND-combined.
      // The AI search on SearchResults mount will extract the best structured filters
      // from the trade query (e.g. "plumbing" → category=Plumbing) without extra noise.
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (loc) params.set('loc', loc);
      navigate(`/search?${params.toString()}`);
    },
    [navigate],
  );

  /** User clicked "Skip" — go straight to results with the bare query */
  const handleSkip = useCallback(
    (q: string, loc: string) => {
      setState((s) => ({ ...s, isOpen: false }));
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (loc) params.set('loc', loc);
      navigate(`/search?${params.toString()}`);
    },
    [navigate],
  );

  return (
    <GuidedSearchContext.Provider value={{ openGuidedSearch }}>
      {children}
      <GuidedSearchModal
        isOpen={state.isOpen}
        query={state.q}
        loc={state.loc}
        onComplete={handleComplete}
        onSkip={handleSkip}
        onClose={handleClose}
      />
    </GuidedSearchContext.Provider>
  );
};

export default GuidedSearchContext;
