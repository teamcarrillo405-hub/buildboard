/**
 * Navigation Component
 * BuildBoard navbar with professional branding, mobile-collapsible search bar,
 * and FTS5-powered autocomplete typeahead.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import AuthButton from './AuthButton';
import { useGuidedSearch } from '../contexts/GuidedSearchContext';

// ---------------------------------------------------------------------------
// Autocomplete types
// ---------------------------------------------------------------------------

interface AutocompleteSuggestion {
  label: string;
  type: 'business' | 'category';
  city?: string;
  state?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function fetchAutocomplete(q: string): Promise<AutocompleteSuggestion[]> {
  if (q.trim().length < 2) return [];
  try {
    const res = await fetch(`${API_BASE}/api/autocomplete?q=${encodeURIComponent(q)}&limit=8`);
    if (!res.ok) return [];
    const data = await res.json() as { suggestions: AutocompleteSuggestion[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NavigationProps {
  onSearch?: (query: string) => void;
}

const Navigation: React.FC<NavigationProps> = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { openGuidedSearch } = useGuidedSearch();

  const debouncedQuery = useDebounce(searchQuery, 200);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sync nav search inputs with current search page URL params
  useEffect(() => {
    if (location.pathname === '/search') {
      const q = searchParams.get('q') || '';
      const loc = searchParams.get('loc') || '';
      setSearchQuery(q);
      setLocationQuery(loc);
    }
  }, [location.pathname, searchParams]);

  // Fetch autocomplete suggestions when query changes
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    fetchAutocomplete(debouncedQuery).then(results => {
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setActiveIndex(-1);
    });
  }, [debouncedQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    const loc = locationQuery.trim();
    if (q || loc) {
      setIsSearchOpen(false);
      setShowDropdown(false);
      openGuidedSearch(q, loc);
    }
  };

  const handleSuggestionClick = useCallback((suggestion: AutocompleteSuggestion) => {
    setSearchQuery(suggestion.label);
    setShowDropdown(false);
    const loc = locationQuery.trim();
    setIsSearchOpen(false);
    openGuidedSearch(suggestion.label, loc);
  }, [locationQuery, openGuidedSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center px-[4%] h-[72px] transition-all duration-300 bg-[#0A0A0A] ${
          isScrolled ? 'shadow-[0_4px_24px_rgba(0,0,0,0.5)]' : ''
        }`}
      >
        {/* Brand — HCC logo + BuildBoard product name */}
        <Link
          to="/"
          className="flex flex-col items-center mr-8 flex-shrink-0 group"
          aria-label="HCC BuildBoard — Home"
        >
          <img
            src="/hcc-logo-white.svg"
            alt="HCC"
            className="h-11 w-auto"
          />
          <span
            className="font-display text-[9px] font-bold tracking-[0.28em] uppercase text-brand-gold leading-none mt-[3px]"
          >
            BuildBoard
          </span>
        </Link>

        {/* Desktop Search Bar — always visible on md+ */}
        <div className="relative hidden md:flex flex-1 max-w-[620px] min-w-0" ref={dropdownRef}>
          <form
            onSubmit={handleSearchSubmit}
            className="flex w-full rounded-full overflow-hidden border border-border focus-within:border-brand-primary transition-colors bg-background/60"
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder="Trade or service..."
              className="flex-1 px-4 py-2.5 bg-transparent text-white text-[0.88rem] outline-none placeholder-text-muted border-none min-w-0"
              aria-label="Search trade"
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              autoComplete="off"
            />
            <div className="w-px bg-border my-2 flex-shrink-0" />
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="City or ZIP..."
              className="w-[100px] lg:w-[140px] px-4 py-2.5 bg-transparent text-white text-[0.88rem] outline-none placeholder-text-muted border-none"
              aria-label="Location"
              autoComplete="off"
            />
            <button
              type="submit"
              className="px-5 py-2.5 font-display text-[0.8rem] font-bold uppercase tracking-[0.08em] transition-colors flex items-center gap-2 flex-shrink-0"
              style={{ background: '#F5C518', color: '#0A0A0A' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#D4A017')}
              onMouseLeave={e => (e.currentTarget.style.background = '#F5C518')}
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </form>

          {/* Autocomplete dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-[60]"
              style={{
                background: '#1E1E1E',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={`${s.type}-${s.label}-${i}`}
                  type="button"
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  style={{
                    background: activeIndex === i ? 'rgba(245,197,24,0.08)' : 'transparent',
                    borderLeft: activeIndex === i ? '2px solid #F5C518' : '2px solid transparent',
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent blur before click fires
                    handleSuggestionClick(s);
                  }}
                >
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
                    style={{
                      background: s.type === 'category' ? 'rgba(245,197,24,0.1)' : 'rgba(255,255,255,0.05)',
                      color: s.type === 'category' ? '#F5C518' : '#999',
                    }}
                  >
                    {s.type === 'category' ? 'Category' : 'Business'}
                  </span>
                  <span className="text-white text-[0.88rem] flex-1 truncate">{s.label}</span>
                  {s.city && s.state && (
                    <span className="text-[#666] text-[0.76rem] flex-shrink-0">{s.city}, {s.state}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right side: spacer + auth + mobile search toggle */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Auth button */}
          <AuthButton />

          {/* Mobile Search Toggle — visible below md */}
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="md:hidden p-2 text-white hover:text-brand-primary transition-colors"
            aria-label={isSearchOpen ? 'Close search' : 'Open search'}
          >
            {isSearchOpen ? <X className="w-6 h-6" /> : <Search className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Search Drawer — slides down below nav */}
      {isSearchOpen && (
        <div className="fixed top-[72px] left-0 right-0 z-40 bg-[#0A0A0A] border-b border-border px-[4%] py-3 md:hidden animate-fade-in">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2">
            <div className="flex rounded-lg overflow-hidden border border-border focus-within:border-brand-primary transition-colors">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Trade or service..."
                className="flex-1 px-4 py-2.5 bg-background/60 text-white text-[0.9rem] outline-none placeholder-text-muted border-none min-w-0"
                aria-label="Search trade or service"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                placeholder="City or ZIP..."
                className="flex-1 px-4 py-2.5 bg-background/60 text-white text-[0.9rem] outline-none placeholder-text-muted border border-border rounded-lg focus:border-brand-primary transition-colors min-w-0"
                aria-label="Location"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-brand-primary text-[#0A0A0A] font-display text-[0.8rem] font-bold uppercase tracking-[0.08em] hover:bg-brand-primary-hover transition-colors flex items-center gap-2 flex-shrink-0 rounded-lg"
              >
                <Search className="w-4 h-4" />
                Search
              </button>
            </div>
          </form>
        </div>
      )}

    </>
  );
};

export default Navigation;
