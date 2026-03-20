/**
 * HeroBanner Component
 * Cinematic video hero — broadcast-quality visual design
 *
 * Video transitions: Ken Burns effect (slow drift + zoom per clip)
 * with Framer Motion crossfade. All 4 videos stay mounted in the DOM
 * with stable keys — zero flicker, zero re-download on transition.
 *
 * Trade word cycling: AnimatePresence slide-up rotates through trade
 * categories every 3 seconds.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Video playlist — Pexels, free for commercial use, HD 1080p
// ---------------------------------------------------------------------------
interface HeroVideo {
  src: string;
  poster: string;
  alt: string;
}

const HERO_VIDEOS: HeroVideo[] = [
  {
    src: 'https://videos.pexels.com/video-files/4135408/4135408-hd_1920_1080_30fps.mp4',
    poster:
      'https://images.pexels.com/videos/4135408/free-video-4135408.jpg?auto=compress&cs=tinysrgb&w=1920',
    alt: 'Workers pouring concrete from a mixer truck',
  },
  {
    src: 'https://videos.pexels.com/video-files/10294766/10294766-hd_1920_1080_30fps.mp4',
    poster:
      'https://images.pexels.com/videos/10294766/pexels-photo-10294766.jpeg?auto=compress&cs=tinysrgb&w=1920',
    alt: 'Construction workers at a scaffolded building site',
  },
  {
    src: 'https://videos.pexels.com/video-files/855271/855271-hd_1920_1080_25fps.mp4',
    poster:
      'https://images.pexels.com/videos/855271/free-video-855271.jpg?auto=compress&cs=tinysrgb&w=1920',
    alt: 'Construction site with cranes and heavy equipment',
  },
  {
    src: 'https://videos.pexels.com/video-files/13094722/13094722-hd_1920_1080_30fps.mp4',
    poster:
      'https://images.pexels.com/videos/13094722/pexels-photo-13094722.jpeg?auto=compress&cs=tinysrgb&w=1920',
    alt: 'Workers on a commercial building construction site',
  },
];

// Each clip gets its own Ken Burns direction — alternating pan gives
// a broadcast documentary feel (used in Ken Burns films, BBC docs, etc.)
const KEN_BURNS: { scale: number; x: string; y: string }[] = [
  { scale: 1.07, x: '-2%', y: '-1%' },   // clip 0 — pan left + up
  { scale: 1.06, x: '2%',  y: '1%'  },   // clip 1 — pan right + down
  { scale: 1.07, x: '-1%', y: '2%'  },   // clip 2 — pan left + down
  { scale: 1.06, x: '1.5%',y: '-2%' },   // clip 3 — pan right + up
];

// ---------------------------------------------------------------------------
// Trade word cycling
// ---------------------------------------------------------------------------
const TRADE_WORDS = ['Construction', 'Plumbing', 'Electrical', 'Roofing', 'Masonry'];

/** Each clip plays for this long before the next crossfade begins */
const CLIP_DURATION = 12_000;

/** Crossfade duration — Framer Motion handles the easing */
const FADE_DURATION = 2.2;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const HeroBanner: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);

  // Stable ref array — one ref per video, never remounted
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);

  // ── Reduced motion ──
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Word cycling ──
  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => {
      setWordIndex((i) => (i + 1) % TRADE_WORDS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  // ── Video cycling — pure index increment, no two-pointer swapping ──
  useEffect(() => {
    if (reducedMotion || !isPlaying) return;
    const timer = setTimeout(() => {
      setActiveIndex((i) => (i + 1) % HERO_VIDEOS.length);
    }, CLIP_DURATION);
    return () => clearTimeout(timer);
  }, [activeIndex, reducedMotion, isPlaying]);

  // ── Playback management — active + next preloaded, others paused ──
  useEffect(() => {
    const nextIndex = (activeIndex + 1) % HERO_VIDEOS.length;
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      const shouldPlay = isPlaying && (i === activeIndex || i === nextIndex);
      if (shouldPlay) {
        video.play().catch(() => {});
      } else {
        video.pause();
        // Reset non-active, non-next clips so they start fresh next time
        if (i !== activeIndex && i !== nextIndex) {
          video.currentTime = 0;
        }
      }
    });
  }, [activeIndex, isPlaying]);

  // ── Play/pause ──
  const togglePlayPause = () => setIsPlaying((p) => !p);

  return (
    <section
      role="banner"
      aria-label="BuildBoard directory hero"
      className="relative h-[69vh] min-h-[440px] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* ── Video layers — all 4 mounted, stable key=i, zero flicker ──
          Each clip has its own Ken Burns direction. Two nested motion.divs:
          outer = opacity crossfade, inner = scale + pan (Ken Burns). ── */}
      {!reducedMotion ? (
        HERO_VIDEOS.map((video, i) => {
          const isActive = i === activeIndex;
          const kb = KEN_BURNS[i];
          return (
            <motion.div
              key={i}                        // STABLE — never changes, never remounts
              className="absolute inset-0"
              animate={{ opacity: isActive ? 1 : 0 }}
              initial={{ opacity: i === 0 ? 1 : 0 }}
              transition={{ duration: FADE_DURATION, ease: [0.4, 0, 0.2, 1] }}
              aria-hidden="true"
            >
              {/* Ken Burns — slow zoom + directional drift per clip */}
              <motion.div
                className="absolute inset-0"
                animate={{
                  scale: isActive ? kb.scale : 1.0,
                  x: isActive ? kb.x : '0%',
                  y: isActive ? kb.y : '0%',
                }}
                transition={{
                  // Active: drift slowly over the full clip duration
                  // Inactive: snap back quickly so it's ready for next cycle
                  duration: isActive ? (CLIP_DURATION + 2000) / 1000 : 1.8,
                  ease: isActive ? 'linear' : [0.4, 0, 0.2, 1],
                }}
              >
                <video
                  ref={(el) => { videoRefs.current[i] = el; }}
                  className="w-full h-full object-cover"
                  src={video.src}
                  poster={video.poster}
                  muted
                  playsInline
                  loop
                  preload="auto"
                />
              </motion.div>
            </motion.div>
          );
        })
      ) : (
        /* Reduced motion fallback — static poster image */
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url('${HERO_VIDEOS[0].poster}')` }}
          aria-hidden="true"
        />
      )}

      {/* ── Cinematic gradient stack ──
          Radial vignette only at edges — center stays open so video pops. ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 80% at 50% 45%, transparent 30%, rgba(10,10,10,0.35) 100%)',
        }}
        aria-hidden="true"
      />

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-[900px] px-6 gap-6">

        {/* Headline */}
        <h1
          className="font-display uppercase leading-[0.95] tracking-[0.015em] animate-fade-in-up"
          style={{ fontSize: 'clamp(2.6rem, 7vw, 5rem)' }}
        >
          <span style={{ color: '#ffffff', textShadow: '0 2px 16px rgba(0,0,0,0.55)' }}>
            The Trades
          </span>
          <br />
          <span
            className="inline-flex items-center justify-center overflow-hidden"
            style={{ minWidth: '10ch', verticalAlign: 'bottom' }}
            aria-live="polite"
            aria-atomic="true"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={TRADE_WORDS[wordIndex]}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -28 }}
                transition={{ duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="text-transparent bg-clip-text inline-block"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #F5C518 0%, #FFD740 45%, #F5C518 100%)',
                }}
              >
                {TRADE_WORDS[wordIndex]}
              </motion.span>
            </AnimatePresence>
          </span>
          <br />
          <span style={{ color: '#ffffff', textShadow: '0 2px 16px rgba(0,0,0,0.55)' }}>
            Directory
          </span>
        </h1>

        {/* Quick trade access — drives users into the directory */}
        <div
          className="flex items-center gap-2 flex-wrap justify-center animate-fade-in-up"
          style={{ animationDelay: '0.44s', animationFillMode: 'both' }}
        >
          <span className="text-[10px] uppercase tracking-[0.15em] font-display mr-1" style={{ color: '#000000' }}>Browse:</span>
          {[
            { label: 'General', category: 'General Contractor' },
            { label: 'Electrical', category: 'Electrical' },
            { label: 'Plumbing', category: 'Plumbing' },
            { label: 'Roofing', category: 'Roofing' },
            { label: 'HVAC', category: 'HVAC' },
          ].map(({ label, category }) => (
            <Link
              key={label}
              to={`/search?category=${encodeURIComponent(category)}`}
              className="px-3 py-1 rounded-full font-display text-[10px] font-bold uppercase tracking-[0.1em] transition-all duration-200"
              style={{
                background: '#000000',
                border: '1px solid rgba(0,0,0,0.4)',
                color: '#ffffff',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(245,197,24,0.12)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,197,24,0.4)';
                (e.currentTarget as HTMLElement).style.color = '#F5C518';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = '#000000';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,0,0,0.4)';
                (e.currentTarget as HTMLElement).style.color = '#ffffff';
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Play/pause (WCAG 2.2.2) ── */}
      {!reducedMotion && (
        <button
          onClick={togglePlayPause}
          className="absolute bottom-6 right-6 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white hover:bg-black/50 transition-all duration-300"
          aria-label={isPlaying ? 'Pause background video' : 'Play background video'}
        >
          <span className="text-xs">{isPlaying ? '⏸' : '▶'}</span>
        </button>
      )}
    </section>
  );
};

export default HeroBanner;
