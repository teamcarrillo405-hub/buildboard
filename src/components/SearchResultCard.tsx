/**
 * SearchResultCard — Yelp-style horizontal result card
 * Layout: photo LEFT (160×120px) | info RIGHT
 * HCC brand colors throughout
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import type { Company } from '../api/types';
import CompanyImage from './CompanyImage';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface SearchResultCardProps {
  company: Company;
  /** Optional distance in miles — shown when a location search was used */
  distanceMi?: number;
  /** Optional rank badge (1-based position in result list) */
  rank?: number;
}

// ─────────────────────────────────────────────
// Star renderer
// ─────────────────────────────────────────────

function renderStars(rating: number): React.ReactNode {
  const stars: React.ReactNode[] = [];
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(
        <span key={i} className="text-[#F5C518] leading-none">&#9733;</span>
      );
    } else if (i === full && hasHalf) {
      stars.push(
        <span key={i} className="text-[#F5C518] leading-none">&#9733;</span>
      );
    } else {
      stars.push(
        <span key={i} className="text-[#F5C518]/25 leading-none">&#9733;</span>
      );
    }
  }
  return stars;
}

// ─────────────────────────────────────────────
// Feature tag chips
// ─────────────────────────────────────────────

interface TagChipProps {
  label: string;
}

const TagChip: React.FC<TagChipProps> = ({ label }) => (
  <span className="inline-block text-[10px] font-display font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">
    {label}
  </span>
);

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

const SearchResultCard: React.FC<SearchResultCardProps> = ({
  company,
  distanceMi: distanceMiProp,
  rank,
}) => {
  // Use server-computed distanceMi on the company object as fallback
  const resolvedDistance = distanceMiProp ?? company.distanceMi;

  const hasTags =
    company.emergencyService ||
    company.freeEstimate ||
    company.verificationStatus === 'verified' ||
    company.verificationStatus === 'hcc_member' ||
    company.licenseStatus === 'active' ||
    company.insuranceVerified ||
    company.backgroundCheck ||
    company.dataSource === 'yelp';

  return (
    <div
      className="group relative flex flex-col sm:flex-row rounded-xl overflow-hidden transition-all duration-300 bg-white border border-black hover:border-t-2 hover:border-t-[#F5C518] hover:bg-gray-50 hover:shadow-[0_4px_24px_rgba(0,0,0,0.12)]"
    >
      {/* ── Photo ── */}
      <Link
        to={`/company/${company.id}`}
        className="block flex-shrink-0 w-full sm:w-[160px] h-[140px] sm:h-[120px] overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
      >
        <CompanyImage
          company={company}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </Link>

      {/* ── Info panel ── */}
      <div className="flex flex-col justify-center gap-1.5 px-4 py-3 flex-1 min-w-0">

        {/* Row 1: Name + Category badge + Price range */}
        <div className="flex items-start gap-2 flex-wrap">
          <Link
            to={`/company/${company.id}`}
            className="font-bold text-gray-900 text-[1.05rem] leading-snug hover:text-[#F5C518] transition-colors truncate flex-shrink min-w-0"
          >
            {company.businessName}
          </Link>
          {company.category && (
            <span className="flex-shrink-0 inline-block text-[10px] font-display font-bold uppercase tracking-[0.1em] px-2.5 py-0.5 rounded-full bg-[#F5C518]/10 text-[#F5C518] border border-[#F5C518]/20 whitespace-nowrap">
              {company.category}
            </span>
          )}
          {company.priceRange && (
            <span className="flex-shrink-0 inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-[#7DCA69] border border-[#7DCA69]/20 whitespace-nowrap">
              {company.priceRange}
            </span>
          )}
        </div>

        {/* Row 2: Stars + review count + distance */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {company.rating > 0 ? (
            <>
              <div className="flex items-center text-[0.9rem] gap-px">
                {renderStars(company.rating)}
              </div>
              <span className="text-[0.8rem] font-bold text-[#F5C518]">
                {company.rating.toFixed(1)}
              </span>
              <span className="text-[0.75rem] text-gray-500">
                ({company.reviewCount.toLocaleString()}{' '}
                {company.reviewCount === 1 ? 'review' : 'reviews'})
              </span>
            </>
          ) : (
            <span className="text-[0.75rem] text-gray-400">No reviews yet</span>
          )}
          {resolvedDistance !== undefined && (
            <span className="text-[0.75rem] text-gray-500">
              &middot; {resolvedDistance.toFixed(1)} mi
            </span>
          )}
        </div>

        {/* Row 3: Location */}
        {(company.city || company.state) && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span className="text-[0.78rem] text-gray-500">
              {[company.city, company.state].filter(Boolean).join(', ')}
            </span>
          </div>
        )}

        {/* Row 4: Feature tags + trust badges */}
        {hasTags && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {company.licenseStatus === 'active' && (
              <TagChip label="Licensed ✓" />
            )}
            {company.insuranceVerified && (
              <TagChip label="Insured ✓" />
            )}
            {company.backgroundCheck && (
              <TagChip label="Background Check ✓" />
            )}
            {company.emergencyService && (
              <TagChip label="Emergency Service" />
            )}
            {company.freeEstimate && (
              <TagChip label="Free Estimate" />
            )}
            {company.verificationStatus === 'hcc_member' && (
              <TagChip label="HCC Member" />
            )}
            {company.verificationStatus === 'verified' && !company.licenseStatus && (
              <TagChip label="Verified" />
            )}
            {company.dataSource === 'yelp' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF1A1A]/10 border border-[#FF1A1A]/20 text-[10px] font-display font-bold uppercase tracking-[0.08em] text-[#FF6B6B]">
                Yelp Listing
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchResultCard;
