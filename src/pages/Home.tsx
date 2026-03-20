/**
 * Home Page — Dark canvas with 8 ranked sections, editorial banners,
 * scroll-triggered animations, and alternating section backgrounds.
 */

import React from 'react';
import HeroBanner from '../components/HeroBanner';
import RankedRail from '../components/RankedRail';
import EditorialBanner from '../components/EditorialBanner';
import SponsorCard from '../components/SponsorCard';
import AnimatedSection from '../components/AnimatedSection';
import {
  useTopRatedCompanies,
  useTopCompanies,
  HOMEPAGE_CATEGORIES,
} from '../api/hooks';
import { usePageTitle } from '../hooks/usePageTitle';

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
const Home: React.FC = () => {
  usePageTitle(
    'Find Construction Contractors Near You',
    'Search 4M+ licensed construction contractors across all 50 states. Plumbers, electricians, roofers, and more. Powered by HCC.'
  );

  // Featured Subcontractors — top rated across all categories
  const { data: featuredRaw, isLoading: featuredLoading } =
    useTopRatedCompanies({ limit: 100 });
  const featuredCompanies = (featuredRaw ?? [])
    .filter(c => c.website)
    .slice(0, 25);

  // Top 25 General Contractors
  const gcCat = HOMEPAGE_CATEGORIES[0];
  const { data: gcCompanies, isLoading: gcLoading } = useTopCompanies({
    category: gcCat.category,
    limit: 25,
  });

  // Remaining 6 trade categories
  const { data: electricalCompanies, isLoading: electricalLoading } = useTopCompanies({
    category: HOMEPAGE_CATEGORIES[1].category,
    limit: 25,
  });
  const { data: plumbingCompanies, isLoading: plumbingLoading } = useTopCompanies({
    category: HOMEPAGE_CATEGORIES[2].category,
    limit: 25,
  });
  const { data: roofingCompanies, isLoading: roofingLoading } = useTopCompanies({
    category: HOMEPAGE_CATEGORIES[3].category,
    limit: 25,
  });
  const { data: concreteCompanies, isLoading: concreteLoading } = useTopCompanies({
    category: HOMEPAGE_CATEGORIES[4].category,
    limit: 25,
  });
  const { data: hvacCompanies, isLoading: hvacLoading } = useTopCompanies({
    category: HOMEPAGE_CATEGORIES[5].category,
    limit: 25,
  });
  const { data: paintingCompanies, isLoading: paintingLoading } = useTopCompanies({
    category: HOMEPAGE_CATEGORIES[6].category,
    limit: 25,
  });

  return (
    <div className="min-h-screen bg-black overflow-x-hidden">
      <HeroBanner />

      {/* Content — alternating backgrounds, dividers, editorial breaks */}
      <div className="relative z-[5]">
        {/* 1. Top 25 General Contractors — hero section with gold wash */}
        <div className="bg-gradient-to-b from-[#F5C518]/[0.05] via-[#F5C518]/[0.02] to-transparent pt-2">
          <RankedRail
            title="Top 25 General Contractors"
            companies={gcCompanies}
            isLoading={gcLoading}
            category={gcCat.category}
            ghostLabel="BUILD"
            accentColor="#F5C518"
          />
        </div>

        <div className="h-px mx-[4%] bg-gradient-to-r from-transparent via-[#F5C518]/20 to-transparent" />

        {/* 2. Featured Subcontractors */}
        <div className="bg-[#0a0a0a]">
          <RankedRail
            title="Featured Subcontractors"
            companies={featuredCompanies ?? []}
            isLoading={featuredLoading}
            ghostLabel="SUBS"
            accentColor="#F5C518"
          />
        </div>

        {/* ─── Editorial Banner 1: Join HCC ─── */}
        <div className="bg-black py-1">
          <EditorialBanner
            imageUrl="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1200&q=80&auto=format&fit=crop"
            headline="Join the Hispanic Construction Council"
            subtitle="Get verified, increase your visibility, and connect with thousands of potential customers."
            ctaText="Learn More"
            ctaHref="https://hispanicconstructioncouncil.com"
            align="right"
          />
        </div>

        <div className="h-px mx-[4%] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        {/* 3. Top 25 Electricians */}
        <div className="bg-black">
          <RankedRail
            title="Top 25 Electricians"
            companies={electricalCompanies}
            isLoading={electricalLoading}
            category={HOMEPAGE_CATEGORIES[1].category}
            ghostLabel="POWER"
            accentColor="#00B4D8"
          />
        </div>

        <div className="h-px mx-[4%] bg-gradient-to-r from-transparent via-[#F5C518]/20 to-transparent" />

        {/* 4. Top 25 Plumbers */}
        <div className="bg-[#0a0a0a]">
          <RankedRail
            title="Top 25 Plumbers"
            companies={plumbingCompanies}
            isLoading={plumbingLoading}
            category={HOMEPAGE_CATEGORIES[2].category}
            ghostLabel="FLOW"
            accentColor="#4A90D9"
          />
        </div>

        <div className="h-px mx-[4%] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        {/* 5. Top 25 Roofing */}
        <div className="bg-black">
          <RankedRail
            title="Top 25 Roofing"
            companies={roofingCompanies}
            isLoading={roofingLoading}
            category={HOMEPAGE_CATEGORIES[3].category}
            ghostLabel="ROOF"
            accentColor="#94A3B8"
          />
        </div>

        {/* ─── Sponsor Banner ─── */}
        <AnimatedSection className="bg-[#0a0a0a]">
          <div className="px-[4%] py-4">
            <SponsorCard slotName="homepage_banner" variant="banner" />
          </div>
        </AnimatedSection>

        <div className="h-px mx-[4%] bg-gradient-to-r from-transparent via-[#F5C518]/20 to-transparent" />

        {/* 6. Top 25 Concrete */}
        <div className="bg-[#0a0a0a]">
          <RankedRail
            title="Top 25 Concrete"
            companies={concreteCompanies}
            isLoading={concreteLoading}
            category={HOMEPAGE_CATEGORIES[4].category}
            ghostLabel="POUR"
            accentColor="#A8A29E"
          />
        </div>

        <div className="h-px mx-[4%] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        {/* 7. Top 25 HVAC */}
        <div className="bg-black">
          <RankedRail
            title="Top 25 HVAC"
            companies={hvacCompanies}
            isLoading={hvacLoading}
            category={HOMEPAGE_CATEGORIES[5].category}
            ghostLabel="AIR"
            accentColor="#2DD4BF"
          />
        </div>

        <div className="h-px mx-[4%] bg-gradient-to-r from-transparent via-[#F5C518]/20 to-transparent" />

        {/* 8. Top 25 Painting */}
        <div className="bg-[#0a0a0a]">
          <RankedRail
            title="Top 25 Painting"
            companies={paintingCompanies}
            isLoading={paintingLoading}
            category={HOMEPAGE_CATEGORIES[6].category}
            ghostLabel="COAT"
            accentColor="#C0392B"
          />
        </div>

        {/* Contractor CTA — full-width conversion section */}
        <AnimatedSection>
          <div
            className="relative overflow-hidden py-16 sm:py-20 px-[4%] text-center"
            style={{
              background: 'linear-gradient(180deg, #0a0a0a 0%, #111008 40%, #0a0a0a 100%)',
            }}
          >
            {/* Gold radial glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(245,197,24,0.07) 0%, transparent 70%)',
              }}
            />

            {/* Top divider line */}
            <div
              className="absolute top-0 left-[4%] right-[4%] h-px"
              style={{ background: 'linear-gradient(to right, transparent, #F5C518, transparent)' }}
            />

            <div className="relative z-10 max-w-3xl mx-auto">
              {/* Overline */}
              <p className="font-display text-xs uppercase tracking-[0.2em] text-[#F5C518] mb-4">
                For Contractors
              </p>

              {/* Headline */}
              <h2
                className="font-display font-black uppercase leading-[0.95] tracking-[0.02em] text-white mb-5"
                style={{ fontSize: 'clamp(2.4rem, 5vw, 4rem)' }}
              >
                Get Listed.<br />Get Found.
              </h2>

              {/* Body */}
              <p className="text-gray-400 text-base sm:text-lg leading-relaxed mb-8 max-w-lg mx-auto">
                Join the most trusted trade directory in the country. Backed by the Hispanic Construction Council network.
              </p>

              {/* CTA */}
              <a
                href="mailto:info@hispanicconstructioncouncil.com?subject=List My Business on BuildBoard"
                className="inline-block px-10 py-4 rounded-lg bg-[#F5C518] text-black font-display font-black uppercase tracking-[0.08em] text-sm hover:bg-[#FFD54F] transition-all duration-200"
                style={{ boxShadow: '0 0 32px rgba(245,197,24,0.25)' }}
              >
                List Your Business &rarr;
              </a>

              {/* Social proof stats */}
              <div className="flex items-center justify-center gap-8 sm:gap-14 mt-10">
                {[
                  { value: '4M+', label: 'Contractors' },
                  { value: '50', label: 'States' },
                  { value: '15+', label: 'Trades' },
                ].map(({ value, label }) => (
                  <div key={label} className="flex flex-col items-center">
                    <span
                      className="font-display font-black text-2xl sm:text-3xl leading-none"
                      style={{ color: '#F5C518' }}
                    >
                      {value}
                    </span>
                    <span className="text-white/40 text-xs uppercase tracking-[0.12em] mt-1 font-display">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom divider line */}
            <div
              className="absolute bottom-0 left-[4%] right-[4%] h-px"
              style={{ background: 'linear-gradient(to right, transparent, rgba(245,197,24,0.3), transparent)' }}
            />
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
};

export default Home;
