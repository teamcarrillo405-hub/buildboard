/**
 * StatsSection Component
 * Animated stats counter section with HCC brand identity.
 * Three stat cards with count-up animation triggered on scroll into view.
 */

import React, { useEffect, useRef, useState } from 'react';

interface Stat {
  value: string;
  numericPart: number;
  prefix?: string;
  suffix: string;
  label: string;
  sub: string;
}

const STATS: Stat[] = [
  { value: '4M+', numericPart: 4, prefix: '', suffix: 'M+', label: 'Contractors Nationwide', sub: 'Across all 50 states' },
  { value: '50+', numericPart: 50, prefix: '', suffix: '+', label: 'Trades Covered', sub: 'Every specialty represented' },
  { value: '50', numericPart: 50, prefix: '', suffix: '', label: 'States', sub: 'Complete U.S. coverage' },
];

const StatCard: React.FC<{ stat: Stat; isVisible: boolean; delay: number }> = ({ stat, isVisible, delay }) => {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isVisible || hasAnimated.current) return;
    hasAnimated.current = true;

    const duration = 1600;
    const steps = 40;
    const stepTime = duration / steps;
    let current = 0;

    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        current++;
        const progress = current / steps;
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(eased * stat.numericPart);
        if (current >= steps) {
          setCount(stat.numericPart);
          clearInterval(interval);
        }
      }, stepTime);
    }, delay);

    return () => clearTimeout(timer);
  }, [isVisible, stat.numericPart, delay]);

  const displayValue = stat.suffix.includes('M')
    ? `${count.toFixed(1)}${stat.suffix}`
    : `${Math.round(count)}${stat.suffix}`;

  return (
    <div
      className={`group bg-[#1A1A1A] border border-white/[0.08] rounded-lg px-8 py-6 flex-1 min-w-[200px]
        transition-all duration-300 hover:bg-[#F5C518] hover:border-[#F5C518]
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="font-display text-[36px] font-bold text-white group-hover:text-black transition-colors duration-300 leading-tight">
        {stat.prefix}{displayValue}
      </div>
      <div className="text-[#999999] text-sm font-medium mt-1 group-hover:text-black/70 transition-colors duration-300">
        {stat.label}
      </div>
      <div className="text-[#666666] text-xs mt-0.5 group-hover:text-black/50 transition-colors duration-300">
        {stat.sub}
      </div>
    </div>
  );
};

const StatsSection: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="bg-[#0A0A0A] py-16 px-[4%]">
      {/* HCC Section Label */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-[18px] bg-[#F5C518] flex-shrink-0" />
        <span className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-[#F5C518]">
          THE DIRECTORY
        </span>
      </div>
      <h2 className="font-display text-[clamp(1.6rem,3vw,2.5rem)] font-bold uppercase text-white tracking-tight mb-8">
        By the Numbers
      </h2>

      {/* Stat Cards */}
      <div className="flex flex-col sm:flex-row gap-4 max-w-4xl">
        {STATS.map((stat, i) => (
          <StatCard key={stat.label} stat={stat} isVisible={isVisible} delay={i * 200} />
        ))}
      </div>
    </section>
  );
};

export default StatsSection;
