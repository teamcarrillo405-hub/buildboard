/**
 * RankedCard — Unified ranked company card used on every homepage section.
 *
 * Shows company logo on a warm off-white card background.
 * Logo fallback chain: Uplead → Google favicon → gradient initials placeholder.
 * Number sits to the LEFT of the card with proper spacing.
 * Hover: gold border + glow, card lifts, number turns gold, popup appears.
 */

import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Company } from '../api/types';
import RankedCardPopup from './RankedCardPopup';

export interface RankedCardProps {
  company: Company;
  rank: number; // 1-based
}

/** Extract a bare domain from a website field (strip protocol, www, trailing slash) */
function getDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  return website
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '');
}

/** Generate 1-2 letter initials from a business name */
function getInitials(name: string): string {
  const words = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Gradient pairs for initials placeholder — more vibrant than flat colors */
const GRADIENT_PAIRS = [
  ['#1e40af', '#3b82f6'],  // blue
  ['#7c3aed', '#a78bfa'],  // purple
  ['#0891b2', '#22d3ee'],  // cyan
  ['#059669', '#34d399'],  // emerald
  ['#d97706', '#fbbf24'],  // amber
  ['#dc2626', '#f87171'],  // red
  ['#4f46e5', '#818cf8'],  // indigo
  ['#0d9488', '#2dd4bf'],  // teal
  ['#9333ea', '#c084fc'],  // violet
  ['#2563eb', '#60a5fa'],  // blue-bright
  ['#c026d3', '#e879f9'],  // fuchsia
  ['#ea580c', '#fb923c'],  // orange
];
function getGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENT_PAIRS[Math.abs(hash) % GRADIENT_PAIRS.length];
}

const RankedCard: React.FC<RankedCardProps> = ({ company, rank }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [popupRect, setPopupRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const domain = getDomain(company.website);
  const upleadUrl = domain ? `https://logo.uplead.com/${domain}` : null;
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;

  // Logo fallback chain: uplead → favicon → yelp photo → gradient initials
  type LogoState = 'uplead' | 'favicon' | 'photo' | 'none';
  const [logoState, setLogoState] = useState<LogoState>(() => {
    if (upleadUrl) return 'uplead';
    if (company.imageUrl) return 'photo';
    return 'none';
  });

  const handleLogoError = () => {
    setLogoState(prev => {
      if (prev === 'uplead' && faviconUrl) return 'favicon';
      if (prev !== 'photo' && company.imageUrl) return 'photo';
      return 'none';
    });
  };

  const handleLogoLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Reject tiny favicon-sized images — they look terrible when upscaled
    if (img.naturalWidth <= 32 || img.naturalHeight <= 32) {
      handleLogoError();
    }
  };

  const currentLogoUrl = logoState === 'uplead' ? upleadUrl
    : logoState === 'favicon' ? faviconUrl
    : logoState === 'photo' ? company.imageUrl
    : null;

  const initials = getInitials(company.businessName);
  const [gradFrom, gradTo] = getGradient(company.businessName);

  return (
    <div
      ref={cardRef}
      className="group relative flex items-end w-full"
      onMouseEnter={() => {
        setIsHovered(true);
        if (bodyRef.current) setPopupRect(bodyRef.current.getBoundingClientRect());
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Large italic stroke number — left of card */}
      <span
        className="font-display text-[clamp(5rem,8vw,9rem)] font-bold leading-none italic select-none flex-shrink-0 transition-all duration-300 z-[3] overflow-visible"
        style={{
          color: 'transparent',
          WebkitTextStroke: isHovered
            ? '3px #F5C518'
            : '2px #3a3a3a',
          minWidth: rank >= 10 ? 'clamp(3.5rem,6vw,5.5rem)' : 'clamp(2.5rem,4vw,4rem)',
          textAlign: 'right',
          paddingRight: '6px',
          marginBottom: '0.6rem',
        } as React.CSSProperties}
      >
        {rank}
      </span>

      {/* Card body */}
      <div ref={bodyRef} className="flex-1 min-w-0 relative">
        <Link
          to={`/company/${company.id}`}
          className="block rounded-lg overflow-hidden relative z-[2] transition-all duration-300"
          style={{
            boxShadow: isHovered
              ? '0 0 0 2px #F5C518, 0 8px 24px rgba(245, 197, 24, 0.25)'
              : '0 1px 6px rgba(0,0,0,0.35)',
            zIndex: isHovered ? 10 : 2,
          }}
        >
          <div
            className="w-full rounded-lg flex flex-col p-3 gap-3 transition-colors duration-300"
            style={{
              backgroundColor: '#161616',
              border: '1.5px solid rgba(255,255,255,0.07)',
            }}
          >
            {/* Logo mount — fixed height */}
            <div className="w-full flex items-center justify-center" style={{ height: '80px' }}>
              {currentLogoUrl ? (
                logoState === 'photo' ? (
                  // Yelp photo: full-bleed cover image
                  <div className="w-full h-full rounded-md overflow-hidden">
                    <img
                      src={currentLogoUrl}
                      alt={company.businessName}
                      className="w-full h-full"
                      style={{ objectFit: 'cover', objectPosition: 'center' }}
                      loading="lazy"
                      onError={handleLogoError}
                    />
                  </div>
                ) : (
                  // Logo from Uplead/favicon: white bg, contained
                  <div
                    className="flex items-center justify-center w-full h-full rounded-md"
                    style={{ padding: '8px 12px', background: '#e8e8e8' }}
                  >
                    <img
                      src={currentLogoUrl}
                      alt={`${company.businessName} logo`}
                      className="object-contain"
                      style={{ maxWidth: '100%', maxHeight: '100%', mixBlendMode: 'multiply' }}
                      loading="lazy"
                      onLoad={handleLogoLoad}
                      onError={handleLogoError}
                    />
                  </div>
                )
              ) : (
                <div
                  className="w-full h-full rounded-md flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
                >
                  <span className="font-display text-3xl font-bold text-white tracking-wide">
                    {initials}
                  </span>
                </div>
              )}
            </div>

            {/* Company name + meta — granite gray zone */}
            <div
              className="flex flex-col items-center justify-center rounded-md px-3 py-2.5 gap-1"
              style={{
                background: '#2C2C2E',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                margin: '0 -4px -4px -4px',
                minHeight: '56px',
              }}
            >
              <p className="font-display text-[clamp(0.75rem,1vw,0.9rem)] font-bold uppercase tracking-[0.04em] text-gray-200 leading-snug w-full text-center line-clamp-2">
                {company.businessName}
              </p>
              {/* Meta row: city + state */}
              <div className="flex items-center justify-center gap-2">
                {(company.city || company.state) && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide truncate" style={{ color: '#F5C518' }}>
                    {[company.city, company.state].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Link>

        {/* Hover popup — rendered via portal so it overlays above overflow containers */}
        <RankedCardPopup company={company} isVisible={isHovered} anchorRect={popupRect} />
      </div>
    </div>
  );
};

export default RankedCard;
