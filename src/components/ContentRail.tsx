/**
 * ContentRail Component
 * Horizontal scrolling content rail with scroll arrows (Improvement #6)
 */

import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import CompanyCard from './CompanyCard';
import type { Company } from '../api/types';

interface ContentRailProps {
  title: string;
  companies: Company[];
  isLoading?: boolean;
  emptyMessage?: string;
  /** Category name for "Explore All" link — navigates to /?category=X */
  exploreCategory?: string;
}

const ContentRail: React.FC<ContentRailProps> = ({
  title,
  companies,
  isLoading = false,
  emptyMessage = 'No companies found',
  exploreCategory,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isHovering, setIsHovering] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => el.removeEventListener('scroll', checkScroll);
  }, [companies]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="mb-12 px-[4%]">
        <div className="h-7 w-48 bg-gray-200 rounded animate-pulse mb-3.5" />
        <div className="flex gap-3 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-[185px] aspect-video bg-gray-200 rounded animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="mb-12 px-[4%] bg-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-[18px] bg-[#F5C518] flex-shrink-0" />
          <span className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-[#F5C518]">
            {title}
          </span>
        </div>
        <div className="text-center py-12 text-[#666666]">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div
      className="mb-12 relative bg-transparent"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* HCC Section Label */}
      <div className="px-[4%] mb-3.5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1 h-[18px] bg-[#F5C518] flex-shrink-0" />
          <h2 className="font-display text-[clamp(1.1rem,2.5vw,1.5rem)] font-bold uppercase text-white tracking-tight">
            {title}
          </h2>
          {exploreCategory && (
            <Link
              to={`/search?category=${encodeURIComponent(exploreCategory)}`}
              className="font-display text-[0.75rem] font-bold tracking-[0.1em] uppercase text-[#F5C518] transition-colors hover:text-[#D4A017] ml-auto"
            >
              Explore All &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* Scroll Container with Arrows */}
      <div className="relative">
        {/* Left Arrow (desktop only) */}
        <button
          onClick={() => scroll('left')}
          className={`absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-white to-transparent hidden md:flex items-center justify-start pl-1 transition-opacity duration-300 ${
            canScrollLeft && isHovering ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          aria-label="Scroll left"
        >
          <div className="w-10 h-10 bg-white border border-gray-200 shadow-sm rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </div>
        </button>

        {/* Right Arrow (desktop only) */}
        <button
          onClick={() => scroll('right')}
          className={`absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-white to-transparent hidden md:flex items-center justify-end pr-1 transition-opacity duration-300 ${
            canScrollRight && isHovering ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          aria-label="Scroll right"
        >
          <div className="w-10 h-10 bg-white border border-gray-200 shadow-sm rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100">
            <ChevronRight className="w-6 h-6" />
          </div>
        </button>

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-[200px] mb-[-200px] px-[4%] touch-pan-x"
          style={{ scrollBehavior: 'smooth' }}
        >
          {companies.map((company, i) => (
            <CompanyCard key={company.id} company={company} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContentRail;
