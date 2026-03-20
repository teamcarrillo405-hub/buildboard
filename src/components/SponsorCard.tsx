/**
 * SponsorCard — fetches and renders the active ad for a named slot.
 * Returns null when no ad is assigned (no layout space consumed).
 *
 * variant="skyscraper" — profile page left column (540px)
 * variant="sidebar"    — search results filter sidebar (~240px)
 * variant="banner"     — homepage full-width strip
 */

import React, { useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CarouselImage { src: string; label: string; objectPosition?: string; }

interface AdPayload {
  assignmentId: string;
  sponsor: { name: string; logoPath: string; accentColor: string; website: string; };
  creative: {
    eyebrow: string; headline: string; body: string;
    ctaLabel: string; ctaUrl: string;
    carouselImages: CarouselImage[];
  };
}

interface SponsorCardProps {
  slotName: string;
  variant?: 'skyscraper' | 'sidebar' | 'banner';
}

// ── Carousel sub-component ────────────────────────────────────────────────────

const AdCarousel: React.FC<{ images: CarouselImage[]; imgHeight: number }> = ({ images, imgHeight }) => {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIdx(prev => (prev + 1) % images.length);
    }, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [images.length, images[0]?.src]);

  return (
    <div className="relative w-full overflow-hidden rounded" style={{ background: '#f0f3ff' }}>
      <div
        className="flex"
        style={{ transform: `translateX(-${idx * 100}%)`, transition: 'transform 0.4s ease' }}
      >
        {images.map((img, i) => (
          <div key={i} className="relative flex-shrink-0 w-full">
            <img
              src={img.src}
              alt={img.label}
              style={{ width: '100%', height: imgHeight, objectFit: 'cover', objectPosition: img.objectPosition ?? 'center center', display: 'block' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div
              className="absolute bottom-0 left-0 right-0 px-2 py-1.5"
              style={{
                background: 'linear-gradient(to top, rgba(0,41,107,0.85) 0%, transparent 100%)',
                fontSize: 9, fontWeight: 700, color: '#fff',
                textTransform: 'uppercase' as const, letterSpacing: '0.08em',
              }}
            >
              {img.label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1 py-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            style={{
              width: 5, height: 5, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: i === idx ? '#00296b' : '#d0d9f0',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const SponsorCard: React.FC<SponsorCardProps> = ({ slotName, variant = 'sidebar' }) => {
  const [ad, setAd] = useState<AdPayload | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/ads/${slotName}`)
      .then(r => r.json())
      .then(({ ad: payload }: { ad: AdPayload | null }) => setAd(payload))
      .catch(() => setAd(null));
  }, [slotName]);

  useEffect(() => {
    if (!ad) return;
    fetch('/api/ads/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId: ad.assignmentId, eventType: 'impression' }),
    }).catch(() => {});
  }, [ad?.assignmentId]);

  if (ad === undefined || ad === null) return null;

  const { sponsor, creative } = ad;
  if (!sponsor || !creative) return null;
  const logoUrl = `/${sponsor.logoPath}`;

  const handleCta = () => {
    fetch('/api/ads/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId: ad.assignmentId, eventType: 'click' }),
    }).catch(() => {});
    window.open(creative.ctaUrl, '_blank', 'noopener,noreferrer');
  };

  // Shared elements
  const topBar = (
    <div style={{ height: variant === 'skyscraper' ? 4 : 3, background: '#fdc500', flexShrink: 0 }} />
  );

  const sponsoredLabel = (
    <div style={{
      padding: variant === 'skyscraper' ? '10px 16px 0' : '8px 14px 0',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
    }}>
      <span style={{ fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#bbb', fontWeight: 600 }}>
        Sponsored
      </span>
      <span style={{
        fontSize: 8, color: '#bbb', background: '#f5f5f5', padding: '2px 6px', borderRadius: 4,
        fontWeight: 600, border: '1px solid #e5e5e5', letterSpacing: '0.08em', textTransform: 'uppercase' as const
      }}>
        Ad
      </span>
    </div>
  );

  const containerW = variant === 'skyscraper' ? 188 : 160;
  const containerH = variant === 'skyscraper' ? 80 : 60;
  const imgSize = variant === 'skyscraper' ? 320 : 290;

  const logoBlock = (
    <div style={{
      padding: variant === 'skyscraper' ? '12px 16px 4px' : '10px 14px 4px',
      display: 'flex', justifyContent: 'center', flexShrink: 0
    }}>
      <div style={{ width: containerW, height: containerH, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={logoUrl}
          alt={sponsor.name}
          style={{ width: imgSize, height: imgSize, objectFit: 'contain', flexShrink: 0 }}
        />
      </div>
    </div>
  );

  const divider = (margin: string) => (
    <div style={{ margin, height: 1, background: '#e5e5e5', flexShrink: 0 }} />
  );

  const ctaBtn = (
    <div style={{ padding: variant === 'skyscraper' ? '0 16px 18px' : '0 14px 14px', flexShrink: 0 }}>
      <button
        onClick={handleCta}
        style={{
          display: 'block', width: '100%', textAlign: 'center',
          padding: variant === 'skyscraper' ? 13 : 10,
          borderRadius: variant === 'skyscraper' ? 8 : 7,
          background: '#fdc500', color: '#000',
          fontSize: variant === 'skyscraper' ? 12 : 11,
          fontWeight: 800, textTransform: 'uppercase' as const,
          letterSpacing: '0.1em', border: 'none', cursor: 'pointer',
        }}
      >
        {creative.ctaLabel}
      </button>
      {variant === 'skyscraper' && (
        <p style={{ textAlign: 'center', fontSize: 9, color: '#ccc', marginTop: 6 }}>
          {sponsor.website.replace(/^https?:\/\//, '')}
        </p>
      )}
    </div>
  );

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1.5px solid #000',
    borderRadius: 14,
    overflow: 'hidden',
    fontFamily: "'Cabin', sans-serif",
  };

  // ── Skyscraper ──────────────────────────────────────────────────────────────
  if (variant === 'skyscraper') {
    return (
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minHeight: 700 }}>
        {topBar}
        {sponsoredLabel}
        {logoBlock}
        {divider('6px 16px 14px')}
        <div style={{ padding: '0 16px 6px', flexShrink: 0 }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#fdc500', letterSpacing: '0.16em', marginBottom: 5 }}>
            {creative.eyebrow}
          </p>
          <p style={{ fontSize: 23, fontWeight: 800, color: '#00296b', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
            {creative.headline}
          </p>
        </div>
        <div style={{ padding: '8px 16px 12px', flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: '#666', lineHeight: 1.6 }}>{creative.body}</p>
        </div>
        {creative.carouselImages.length > 0 && (
          <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
            <AdCarousel images={creative.carouselImages} imgHeight={296} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {divider('0 16px 14px')}
        {ctaBtn}
      </div>
    );
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  if (variant === 'sidebar') {
    return (
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
        {topBar}
        {sponsoredLabel}
        {logoBlock}
        {divider('4px 14px 10px')}
        <div style={{ padding: '0 14px 8px' }}>
          <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: '#fdc500', letterSpacing: '0.14em', marginBottom: 4 }}>
            {creative.eyebrow}
          </p>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#00296b', lineHeight: 1.1 }}>
            {creative.headline}
          </p>
        </div>
        {creative.carouselImages.length > 0 && (
          <div style={{ padding: '0 14px 10px' }}>
            <AdCarousel images={creative.carouselImages} imgHeight={169} />
          </div>
        )}
        {ctaBtn}
      </div>
    );
  }

  // ── Banner ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'stretch' }}>
      <div style={{ width: 4, background: '#fdc500', flexShrink: 0 }} />
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5" style={{ padding: '12px 24px', flex: 1 }}>
        <div className="flex-shrink-0 mx-auto sm:mx-0" style={{ width: 80, height: 40, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={logoUrl} alt={sponsor.name} style={{ width: 200, height: 200, objectFit: 'contain', flexShrink: 0 }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: '#fdc500', letterSpacing: '0.16em', marginBottom: 4 }}>
            {creative.eyebrow}
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#00296b', lineHeight: 1.05 }}>{creative.headline}</p>
        </div>
        <p style={{ fontSize: 11, color: '#666', lineHeight: 1.6, maxWidth: 260 }}>{creative.body}</p>
        <button
          onClick={handleCta}
          className="w-full sm:w-auto flex-shrink-0"
          style={{
            padding: '12px 22px', borderRadius: 8, background: '#fdc500', color: '#000',
            fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
            border: 'none', cursor: 'pointer',
          }}
        >
          {creative.ctaLabel}
        </button>
      </div>
    </div>
  );
};

export default SponsorCard;
