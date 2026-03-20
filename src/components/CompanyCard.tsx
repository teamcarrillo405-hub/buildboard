/**
 * CompanyCard Component
 * HCC brand data-card with gold top-bar hover animation
 * Improvement #5: Mobile tap support (cards are tappable links)
 * Improvement #3: No global event references
 */

import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Company } from '../api/types';
import { useFavorites } from '../api/hooks';
import PreviewPopup from './PreviewPopup';
import CompanyImage, { getCategoryImageUrl } from './CompanyImage';
import VerificationBadge from './VerificationBadge';

interface CompanyCardProps {
  company: Company;
  index?: number;
  /** When true, card fills its parent width instead of fixed 185px */
  fill?: boolean;
}

const CompanyCard: React.FC<CompanyCardProps> = ({ company, fill = false }) => {
  const [previewSide, setPreviewSide] = useState<'left' | 'right'>('left');
  const wrapRef = useRef<HTMLDivElement>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const isFav = isFavorite(company.id);

  // Build a URL string for the PreviewPopup (which requires imgSrc as string)
  const previewImgSrc = company.imageUrl || getCategoryImageUrl(company.category, company.id);

  const handleMouseEnter = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    setPreviewSide(rect.left + 320 > vw - 16 ? 'right' : 'left');
  }, []);

  // Render star icons
  const renderStars = (rating: number) => {
    const stars = [];
    const full = Math.floor(rating);
    const hasHalf = rating - full >= 0.5;
    for (let i = 0; i < 5; i++) {
      if (i < full) stars.push(<span key={i} className="text-[#F5C518]">&#9733;</span>);
      else if (i === full && hasHalf) stars.push(<span key={i} className="text-[#F5C518]">&#9733;</span>);
      else stars.push(<span key={i} className="text-[#F5C518]/30">&#9733;</span>);
    }
    return stars;
  };

  return (
    <div
      ref={wrapRef}
      className={`relative group ${fill ? 'w-full' : 'flex-shrink-0 w-[185px]'}`}
      onMouseEnter={handleMouseEnter}
      style={{ zIndex: 'var(--card-z, auto)' } as React.CSSProperties}
      onMouseOver={() => wrapRef.current?.style.setProperty('--card-z', '20')}
      onMouseLeave={() => wrapRef.current?.style.setProperty('--card-z', 'auto')}
    >
      {/* HCC Data Card */}
      <Link
        to={`/company/${company.id}`}
        className="block relative overflow-hidden rounded-xl cursor-pointer transition-transform duration-300 ease-out group-hover:-translate-y-1"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 30px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
        }}
      >
        {/* Gold top-bar — animates on hover */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px] origin-left transition-transform duration-[400ms] ease-out scale-x-0 group-hover:scale-x-100"
          style={{ background: '#F5C518', zIndex: 10 }}
        />

        {/* Card image */}
        <CompanyImage
          company={company}
          className="w-full aspect-video object-cover block"
        />

        {/* Verification badge */}
        {company.verificationStatus && company.verificationStatus !== 'unverified' && (
          <div className="absolute top-2 right-2 z-10">
            <VerificationBadge status={company.verificationStatus} size="sm" />
          </div>
        )}

        {/* Slim card footer — name + stars only */}
        <div className="px-3 py-2.5 bg-white">
          <h3 className="font-display text-[0.82rem] font-bold uppercase tracking-[0.03em] text-gray-900 leading-tight truncate">
            {company.businessName}
          </h3>
          {company.rating > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <div className="flex items-center text-[0.65rem] gap-0.5">
                {renderStars(company.rating)}
              </div>
              <span className="text-[0.65rem] text-gray-400">{company.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </Link>

      {/* Hover Preview Popup -- hidden on mobile */}
      <PreviewPopup
        company={company}
        imgSrc={previewImgSrc}
        side={previewSide}
        isFavorite={isFav}
        onToggleFavorite={() => toggleFavorite(company.id)}
      />
    </div>
  );
};

export default CompanyCard;
