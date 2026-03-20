/**
 * RankedCardPopup — Floating hover popup rendered via React portal.
 *
 * Uses createPortal to render at document.body so it's never clipped
 * by parent overflow:auto containers. Positioned with fixed coords
 * from the card's getBoundingClientRect().
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';
import type { Company } from '../api/types';

interface RankedCardPopupProps {
  company: Company;
  isVisible: boolean;
  anchorRect: DOMRect | null;
}

const RankedCardPopup: React.FC<RankedCardPopupProps> = ({ company, isVisible, anchorRect }) => {
  if (!anchorRect) return null;

  const popup = (
    <div
      className="hidden md:block"
      style={{
        position: 'fixed',
        top: anchorRect.bottom + 6,
        left: anchorRect.left,
        width: anchorRect.width,
        zIndex: 9999,
        pointerEvents: isVisible ? 'auto' : 'none',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
      }}
    >
      <div className="bg-[#161616] border border-[rgba(245,197,24,0.3)] rounded-lg shadow-2xl shadow-black/60 px-3 py-2.5 space-y-1.5">
        {/* Rating row */}
        {company.rating > 0 && (
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 fill-[#F5C518] text-[#F5C518]" />
            <span className="text-white text-xs font-semibold">{company.rating.toFixed(1)}</span>
            {company.reviewCount > 0 && (
              <span className="text-gray-500 text-[10px]">({company.reviewCount.toLocaleString()})</span>
            )}
          </div>
        )}

        {/* Category badge */}
        {company.category && (
          <div>
            <span className="inline-block text-[9px] font-medium uppercase tracking-wider text-[#F5C518]/80 bg-[#F5C518]/10 rounded px-1.5 py-0.5">
              {company.category}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(popup, document.body);
};

export default RankedCardPopup;
