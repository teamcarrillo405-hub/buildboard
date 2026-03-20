/**
 * PreviewPopup Component
 * Hover preview card extracted from CompanyCard for readability
 * Shows rating, location, service tags, and action buttons
 */

import React from 'react';
import { Link } from 'react-router-dom';
import type { Company } from '../api/types';

interface PreviewPopupProps {
  company: Company;
  imgSrc: string;
  side: 'left' | 'right';
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

const PreviewPopup: React.FC<PreviewPopupProps> = ({
  company,
  imgSrc,
  side,
  isFavorite,
  onToggleFavorite,
}) => {
  const topServices = company.services?.slice(0, 2) || [];

  return (
    <Link
      to={`/company/${company.id}`}
      className={`absolute top-0 ${
        side === 'right' ? 'right-0' : 'left-0'
      } w-[320px] bg-surface rounded-md overflow-hidden shadow-preview z-50
      opacity-0 pointer-events-none scale-95
      group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100
      transition-all duration-200 ease-smooth
      hidden md:block`}
    >
      <img
        className="w-full aspect-video object-cover block"
        src={imgSrc}
        alt={company.businessName}
        loading="lazy"
      />
      <div className="p-3.5 pt-3.5">
        {/* Action Buttons */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-base cursor-pointer transition-all ${
              isFavorite
                ? 'bg-brand-gold text-black border-brand-gold'
                : 'border-brand-gold text-brand-gold hover:bg-brand-gold hover:text-black'
            }`}
            title="Add to Favorites"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorite ? '♥' : '♡'}
          </button>
          <a
            href={`tel:${company.phone?.replace(/[^\d+]/g, '')}`}
            onClick={(e) => e.stopPropagation()}
            className="w-9 h-9 rounded-full border-2 border-white/50 text-white flex items-center justify-center text-base hover:border-white hover:bg-white/10 transition-all"
            title="Call"
            aria-label={`Call ${company.businessName}`}
          >
            ☎
          </a>
          <span className="ml-auto w-9 h-9 rounded-full border-2 border-white/50 text-white flex items-center justify-center text-lg hover:border-white hover:bg-white/10">
            ▼
          </span>
        </div>

        {/* Rating & Location */}
        <div className="text-[0.8rem] font-semibold mb-1.5">
          <span className="text-brand-gold">★ {company.rating.toFixed(1)}</span>
          <span className="text-match-green"> · {company.location || `${company.city}, ${company.state}`}</span>
        </div>

        {/* Service Tags */}
        <div className="flex gap-1.5 flex-wrap">
          {topServices.map((s, i) => (
            <span
              key={i}
              className="text-[0.7rem] font-medium px-2.5 py-0.5 rounded border border-border text-text-muted"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
};

export default PreviewPopup;
