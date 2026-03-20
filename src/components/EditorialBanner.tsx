/**
 * EditorialBanner — Full-width visual break between homepage sections.
 *
 * Shows a construction image with an overlay message + CTA.
 * Image loads eagerly (not lazy) to prevent dead-zone on initial scroll.
 * Compact height variant — editorial strip rather than hero-scale block.
 */

import React, { useRef, useState, useEffect } from 'react';

interface EditorialBannerProps {
  imageUrl: string;
  headline: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  /** Image alignment: which side the subject is on */
  align?: 'left' | 'right';
}

const EditorialBanner: React.FC<EditorialBannerProps> = ({
  imageUrl,
  headline,
  subtitle,
  ctaText,
  ctaHref,
  align = 'right',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fallback = setTimeout(() => setIsVisible(true), 600);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          clearTimeout(fallback);
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: '40px 0px 0px 0px' }
    );
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, []);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden mx-[4%] my-3 rounded-xl"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        minHeight: '130px',
        background: '#111',   // placeholder while image loads — no flash of empty
      }}
    >
      {/* Background image — eager load, no layout shift */}
      <div className="absolute inset-0">
        <img
          src={imageUrl}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: align === 'right'
              ? 'linear-gradient(to right, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.25) 100%)'
              : 'linear-gradient(to left, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.25) 100%)',
          }}
        />
      </div>

      {/* Content */}
      <div
        className={`relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 py-7 sm:py-8 px-8 sm:px-12 ${
          align === 'right' ? 'justify-start' : 'justify-end text-right'
        }`}
      >
        <div className={`flex-1 ${align === 'left' ? 'flex flex-col items-end' : ''}`}>
          <h3 className="font-display text-xl sm:text-2xl font-bold uppercase tracking-[0.03em] text-white mb-1.5 max-w-md leading-tight">
            {headline}
          </h3>
          <p className="text-gray-300 text-xs sm:text-sm leading-relaxed max-w-sm">
            {subtitle}
          </p>
        </div>
        <a
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F5C518] text-black font-display font-bold uppercase tracking-[0.05em] text-sm hover:bg-[#FFD54F] transition-colors"
        >
          {ctaText}
        </a>
      </div>
    </div>
  );
};

export default EditorialBanner;
