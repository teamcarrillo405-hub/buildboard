/**
 * RankedRail — Static row of 5 ranked company cards with staggered entrance.
 *
 * Shows exactly 5 cards, sized to fill the available width.
 * Cards animate in with a staggered delay as the section enters the viewport.
 * Gold accent bar + section title + "See All" link.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import RankedCard from './RankedCard';
import type { Company } from '../api/types';

export interface RankedRailProps {
  title: string;
  companies: Company[];
  isLoading?: boolean;
  category?: string;
  /** Short all-caps word rendered as a large faded watermark behind the header */
  ghostLabel?: string;
  /** Accent color for the left bar — defaults to brand gold */
  accentColor?: string;
}

const CARD_WIDTH_VW = 0.18; // ~18% of viewport per card
const GAP_PX = 10;
const STAGGER_MS = 60;
const SCROLL_AMOUNT = 0.55; // scroll ~55% of viewport per click

const RankedRail: React.FC<RankedRailProps> = ({ title, companies, isLoading = false, category, ghostLabel, accentColor = '#F5C518' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Intersection observer for staggered entrance
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const fallback = setTimeout(() => setIsVisible(true), 200);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          clearTimeout(fallback);
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.05, rootMargin: '200px 0px 0px 0px' }
    );
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, [isLoading]);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => el.removeEventListener('scroll', checkScroll);
  }, [companies, checkScroll]);

  // Pass vertical wheel events through to the page — don't let the
  // horizontal scroll container hijack up/down scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        window.scrollBy({ top: e.deltaY, behavior: 'auto' });
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isLoading]);

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -window.innerWidth * SCROLL_AMOUNT : window.innerWidth * SCROLL_AMOUNT, behavior: 'smooth' });
  };

  const cardWidth = `${CARD_WIDTH_VW * 100}vw`;

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="py-6">
        <div className="flex items-center gap-3 mb-5 px-[4%]">
          <div className="w-1 h-5 rounded-full flex-shrink-0 opacity-30" style={{ backgroundColor: accentColor }} />
          <div className="h-5 w-48 bg-white/[0.04] rounded animate-pulse" />
        </div>
        <div className="flex px-[4%]" style={{ gap: `${GAP_PX}px` }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-shrink-0 flex items-end" style={{ width: cardWidth }}>
              <div className="w-[clamp(2.5rem,4vw,4rem)] h-[130px] bg-white/[0.03] rounded-lg animate-pulse mr-1 flex-shrink-0" />
              <div className="flex-1 h-[130px] bg-white/[0.04] rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const seeAllHref = category
    ? `/search?category=${encodeURIComponent(category)}`
    : '/search';

  return (
    <div
      className="py-6 relative"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Section header */}
      <div className="relative flex items-center justify-between mb-5 px-[4%] overflow-hidden">

        {/* Title row — sits above the watermark */}
        <div className="relative flex items-center gap-3 z-10">
          <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
          <h2 className="font-display text-[clamp(1.1rem,2.5vw,1.5rem)] font-bold uppercase text-white tracking-tight">
            {title}
          </h2>
        </div>

        <Link
          to={seeAllHref}
          className="relative z-10 flex items-center gap-1 text-sm text-gray-500 hover:text-[#F5C518] transition-colors font-medium group/link flex-shrink-0"
        >
          See All
          <ChevronRight className="w-4 h-4 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>

      {/* Scroll arrows */}
      <button
        onClick={() => scroll('left')}
        className={`absolute left-0 top-[44px] bottom-0 z-20 w-14 hidden md:flex items-center justify-start pl-1 transition-opacity duration-200 ${
          canScrollLeft && isHovering ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to right, #0A0A0A 30%, transparent)' }}
        aria-label="Scroll left"
      >
        <div className="w-9 h-9 rounded-full border border-white/20 bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:border-[#F5C518]/60 hover:text-[#F5C518] transition-colors ml-1">
          <ChevronLeft className="w-5 h-5" />
        </div>
      </button>

      <button
        onClick={() => scroll('right')}
        className={`absolute right-0 top-[44px] bottom-0 z-20 w-14 hidden md:flex items-center justify-end pr-1 transition-opacity duration-200 ${
          canScrollRight && isHovering ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to left, #0A0A0A 30%, transparent)' }}
        aria-label="Scroll right"
      >
        <div className="w-9 h-9 rounded-full border border-white/20 bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:border-[#F5C518]/60 hover:text-[#F5C518] transition-colors mr-1">
          <ChevronRight className="w-5 h-5" />
        </div>
      </button>

      {/* Scrollable card row */}
      <div ref={rowRef}>
        <div
          ref={scrollRef}
          className="flex overflow-x-auto scrollbar-hide touch-pan-x px-[4%] py-2"
          style={{ gap: `${GAP_PX}px` }}
        >
          {companies.map((company, index) => (
            <div
              key={company.id}
              className="flex-shrink-0"
              style={{
                width: cardWidth,
                minWidth: '160px',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * STAGGER_MS}ms, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * STAGGER_MS}ms`,
              }}
            >
              <RankedCard company={company} rank={index + 1} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RankedRail;
