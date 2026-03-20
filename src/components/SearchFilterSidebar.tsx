/**
 * SearchFilterSidebar — Yelp-style sticky left filter panel
 * Collapsible sections: Category / Distance / Min Rating / Features
 * Mobile: hidden behind a slide-up drawer triggered by a floating "Filters" button
 */

import React, { useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import SponsorCard from './SponsorCard';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SidebarFilters {
  category?: string;
  state?: string;
  minRating?: number;
  radiusMiles?: number;
  licenseOnly?: boolean;
  realOnly?: boolean;
  features?: {
    emergency?: boolean;
    freeEstimate?: boolean;
    licensed?: boolean;
  };
}

interface SearchFilterSidebarProps {
  filters: SidebarFilters;
  onChange: (updated: Partial<SidebarFilters>) => void;
  /** Only show the Distance section when a location was provided */
  hasLocation: boolean;
  /** List of category names to populate the dropdown */
  categories: string[];
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full py-2 group"
      >
        <span className="font-display text-[13px] font-bold tracking-[0.14em] uppercase text-gray-900">
          {title}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="pb-3">{children}</div>}
      <div className="border-t border-black" />
    </div>
  );
};

// ─────────────────────────────────────────────
// Main sidebar panel content (shared between
// desktop sticky column and mobile drawer)
// ─────────────────────────────────────────────

// US States for filter
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

const DISTANCE_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '5 mi', value: 5 },
  { label: '10 mi', value: 10 },
  { label: '20 mi', value: 20 },
  { label: '50 mi', value: 50 },
];

const RATING_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '★★★★+ (4.0)', value: 4 },
  { label: '★★★+ (3.0)', value: 3 },
  { label: 'Any', value: 0 },
];

interface PanelProps extends SearchFilterSidebarProps {
  onClose?: () => void;
}

const FilterPanel: React.FC<PanelProps> = ({
  filters,
  onChange,
  hasLocation,
  categories,
  onClose,
}) => {
  const features = filters.features ?? {};

  const handleCategory = (value: string) => {
    onChange({ category: value || undefined });
  };

  const handleDistance = (value: number) => {
    onChange({ radiusMiles: value });
  };

  const handleRating = (value: number) => {
    onChange({ minRating: value === 0 ? undefined : value });
  };

  const handleFeature = (key: keyof NonNullable<SidebarFilters['features']>, checked: boolean) => {
    const updated = { ...features, [key]: checked || undefined };
    // Remove false/undefined keys
    (Object.keys(updated) as Array<keyof typeof updated>).forEach((k) => {
      if (!updated[k]) delete updated[k];
    });
    onChange({ features: Object.keys(updated).length > 0 ? updated : undefined });
  };

  return (
    <div
      className="rounded-xl p-4 space-y-1"
      style={{ background: '#ffffff', border: '1px solid #000000' }}
    >
      {/* Header (mobile only has close button) */}
      {onClose && (
        <div className="flex items-center justify-between mb-3">
          <span className="font-display text-[13px] font-bold tracking-[0.1em] uppercase text-gray-900">
            Filters
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close filters"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Category ── */}
      <Section title="Category">
        <select
          value={filters.category ?? ''}
          onChange={(e) => handleCategory(e.target.value)}
          className="w-full mt-2 bg-white border border-black rounded-lg px-3 py-2 text-gray-900 text-[0.82rem] outline-none focus:border-[#F5C518] transition-colors appearance-none"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </Section>

      {/* ── State ── */}
      <Section title="State">
        <select
          value={filters.state || ''}
          onChange={(e) => onChange({ state: e.target.value || undefined })}
          className="w-full mt-2 bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-[0.82rem] outline-none focus:border-[#F5C518] transition-colors appearance-none cursor-pointer"
        >
          <option value="">All States</option>
          {US_STATES.map(s => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      </Section>

      {/* ── Distance (only when location search) ── */}
      {hasLocation && (
        <Section title="Distance">
          <div className="flex flex-col gap-1.5 mt-2">
            {DISTANCE_OPTIONS.map(({ label, value }) => {
              const active = (filters.radiusMiles ?? 20) === value;
              return (
                <label key={value} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="radio"
                    name="distance"
                    checked={active}
                    onChange={() => handleDistance(value)}
                    className="sr-only"
                  />
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors ${
                      active
                        ? 'border-[#F5C518] bg-[#F5C518]'
                        : 'border-black group-hover:border-black'
                    }`}
                  />
                  <span
                    className={`text-[0.82rem] transition-colors ${
                      active ? 'text-[#F5C518] font-bold' : 'text-gray-500 group-hover:text-gray-900'
                    }`}
                  >
                    {label}
                  </span>
                </label>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Min Rating ── */}
      <Section title="Min Rating">
        <div className="flex flex-col gap-1.5 mt-2">
          {RATING_OPTIONS.map(({ label, value }) => {
            const currentRating = filters.minRating ?? 0;
            const active = currentRating === value;
            return (
              <label key={value} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="minRating"
                  checked={active}
                  onChange={() => handleRating(value)}
                  className="sr-only"
                />
                <span
                  className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors ${
                    active
                      ? 'border-[#F5C518] bg-[#F5C518]'
                      : 'border-white/20 group-hover:border-white/40'
                  }`}
                />
                <span
                  className={`text-[0.82rem] transition-colors ${
                    active ? 'text-[#F5C518] font-bold' : 'text-[#999999] group-hover:text-white'
                  }`}
                >
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* ── Features ── */}
      <Section title="Features" defaultOpen={true}>
        <div className="flex flex-col gap-1.5 mt-2">
          {(
            [
              { key: 'emergency', label: 'Emergency Service' },
              { key: 'freeEstimate', label: 'Free Estimates' },
              { key: 'licensed', label: 'Licensed & Verified' },
            ] as Array<{ key: keyof NonNullable<SidebarFilters['features']>; label: string }>
          ).map(({ key, label }) => {
            const checked = !!features[key];
            return (
              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => handleFeature(key, e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    checked
                      ? 'border-[#F5C518] bg-[#F5C518]'
                      : 'border-white/20 group-hover:border-white/40'
                  }`}
                >
                  {checked && (
                    <svg className="w-2.5 h-2.5 text-[#0A0A0A]" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-[0.82rem] transition-colors ${
                    checked ? 'text-[#F5C518] font-bold' : 'text-gray-500 group-hover:text-gray-900'
                  }`}
                >
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* ── Verification ── */}
      <Section title="Verification" defaultOpen={false}>
        <div className="flex flex-col gap-3 mt-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => onChange({ licenseOnly: !filters.licenseOnly })}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                filters.licenseOnly ? 'bg-[#F5C518]' : 'bg-gray-200'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${
                filters.licenseOnly ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </div>
            <span className="text-[0.82rem] text-gray-500 group-hover:text-gray-900 transition-colors">
              Licensed contractors only
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => onChange({ realOnly: !filters.realOnly })}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                filters.realOnly ? 'bg-[#FF6B6B]' : 'bg-gray-200'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${
                filters.realOnly ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </div>
            <div className="flex flex-col">
              <span className="text-[0.82rem] text-gray-500 group-hover:text-gray-900 transition-colors leading-tight">
                Yelp listings only
              </span>
              <span className="text-[0.7rem] text-gray-400 leading-tight">
                Real businesses, photos &amp; reviews
              </span>
            </div>
          </label>
        </div>
      </Section>
    </div>
  );
};

// ─────────────────────────────────────────────
// Mobile Trigger Button
// ─────────────────────────────────────────────

interface MobileFilterButtonProps {
  activeCount: number;
  onClick: () => void;
}

export const MobileFilterButton: React.FC<MobileFilterButtonProps> = ({
  activeCount,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-lg font-display text-[0.78rem] font-bold uppercase tracking-[0.08em] transition-colors"
    style={{
      background: activeCount > 0 ? '#F5C518' : '#ffffff',
      color: activeCount > 0 ? '#0A0A0A' : '#374151',
      border: '1px solid #d1d5db',
    }}
  >
    <SlidersHorizontal className="w-3.5 h-3.5" />
    Filters
    {activeCount > 0 && (
      <span className="w-4 h-4 rounded-full bg-[#0A0A0A]/20 text-[10px] font-bold flex items-center justify-center">
        {activeCount}
      </span>
    )}
  </button>
);

// ─────────────────────────────────────────────
// Count active filters for badge
// ─────────────────────────────────────────────

export function countActiveFilters(filters: SidebarFilters): number {
  let count = 0;
  if (filters.category) count++;
  if (filters.state) count++;
  if (filters.minRating) count++;
  if (filters.radiusMiles && filters.radiusMiles !== 20) count++;
  if (filters.licenseOnly) count++;
  if (filters.realOnly) count++;
  if (filters.features) {
    count += Object.values(filters.features).filter(Boolean).length;
  }
  return count;
}

// ─────────────────────────────────────────────
// Main exported component
// ─────────────────────────────────────────────

const SearchFilterSidebar: React.FC<SearchFilterSidebarProps> = (props) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = countActiveFilters(props.filters);

  return (
    <>
      {/* ── Desktop sticky sidebar (hidden on < lg) ── */}
      <aside className="hidden lg:flex flex-col gap-4 sticky top-[100px] self-start w-[240px] flex-shrink-0">
        <FilterPanel {...props} />
        <SponsorCard slotName="search_sidebar" variant="sidebar" />
      </aside>

      {/* ── Mobile trigger button ── */}
      <MobileFilterButton
        activeCount={activeCount}
        onClick={() => setMobileOpen(true)}
      />

      {/* ── Mobile slide-up drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 lg:hidden rounded-t-2xl overflow-y-auto max-h-[85vh]"
              style={{ background: '#ffffff' }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="px-4 pb-6">
                <FilterPanel {...props} onClose={() => setMobileOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default SearchFilterSidebar;
