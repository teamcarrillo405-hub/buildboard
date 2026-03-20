/**
 * CompanyProfile Page
 * HCC-branded full company profile with gold accents and dark theme
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  Globe,
  MapPin,
  Star,
  Shield,
  FileText,
  Users,
  Calendar,
  Wrench,
  CheckCircle,
  Loader2,
  Edit3,
} from 'lucide-react';
import { useCompany, useFavorites } from '../api/hooks';
import { ensureUrl } from '../utils';
import { API, ProfileAPI } from '../api/api';
import type { EnrichmentData, MediaRecord } from '../api/types';
import CompanyImage from '../components/CompanyImage';
import ServicesList from '../components/ServicesList';
import ReviewsSection from '../components/ReviewsSection';
import ClaimListingCard from '../components/ClaimListingCard';
import SponsorCard from '../components/SponsorCard';
import HoursDisplay from '../components/HoursDisplay';
import VerificationBadge from '../components/VerificationBadge';
import { EnrichmentAPI } from '../api/api';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

/** HCC section label with gold left-bar accent */
const SectionLabel: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center gap-3 mb-3">
    <div className="w-1 h-[18px] bg-[#F5C518] flex-shrink-0" />
    <span className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-gray-900">
      {text}
    </span>
  </div>
);

const CompanyProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: company, isLoading, isError } = useCompany({ id });
  const { isFavorite, toggleFavorite } = useFavorites();
  const { user: _user, isAuthenticated } = useAuth();
  const [copied, setCopied] = useState(false);

  usePageTitle(
    company ? `${company.businessName} | ${company.category} in ${company.city}, ${company.state}` : 'Company Profile',
    company ? `${company.businessName} is a ${company.category} contractor located in ${company.city}, ${company.state}. ${company.phone ? 'Call ' + company.phone + '.' : ''} View ratings, license info, and contact details on HCC BuildBoard.` : undefined
  );

  // Enrichment state
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);

  // Media state
  const [media, setMedia] = useState<MediaRecord[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  // Fetch enrichment data when company ID changes
  useEffect(() => {
    if (!id) return;
    setEnrichmentLoading(true);
    setEnrichment(null);
    API.enrichment
      .getEnrichment(id)
      .then((data) => setEnrichment(data))
      .catch(() => setEnrichment(null))
      .finally(() => setEnrichmentLoading(false));
  }, [id]);

  // Fetch portfolio media
  useEffect(() => {
    if (!id) return;
    ProfileAPI.getMedia(id).then(setMedia).catch(() => setMedia([]));
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div role="status" aria-label="Loading company profile" className="w-10 h-10 border-3 border-[#F5C518] border-t-transparent rounded-full animate-spin">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 font-display uppercase">Company Not Found</h1>
          <p className="text-gray-500 mb-4">The company you're looking for doesn't exist.</p>
          <Link to="/" className="text-[#F5C518] hover:text-[#D4A017] font-medium inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  const isFav = isFavorite(company.id);
  const location = company.location || `${company.city}, ${company.state}`;


  // Build google photo URL for hero if enrichment has photos
  const googlePhotoUrl =
    enrichment?.enriched && enrichment.photos.length > 0
      ? EnrichmentAPI.getPhotoUrl(enrichment.photos[0].name, 800)
      : null;

  // Parse hours for DB fallback
  const hoursStr =
    typeof company.hours === 'string'
      ? company.hours
      : company.hours
        ? Object.entries(company.hours)
            .map(([d, h]) => `${d}: ${h}`)
            .join(', ')
        : null;

  // B2B detail items
  const details = [
    company.warranty && { icon: Shield, label: 'Warranty', value: company.warranty },
    company.employeeCount && { icon: Users, label: 'Employees', value: company.employeeCount },
    company.yearFounded && { icon: Calendar, label: 'Founded', value: String(company.yearFounded) },
    company.emergencyService && { icon: Wrench, label: 'Emergency', value: '24/7 Available' },
    company.freeEstimate && { icon: CheckCircle, label: 'Free Estimate', value: 'Yes' },
    company.zipCode && { icon: MapPin, label: 'ZIP Code', value: company.zipCode },
  ].filter(Boolean) as { icon: React.FC<any>; label: string; value: string }[];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Banner */}
      <div className="relative h-[50vh] min-h-[350px] flex items-end overflow-hidden">
        {/* Hero background image */}
        <div className="absolute inset-0">
          <CompanyImage
            company={{ ...company, googlePhotoUrl }}
            className="w-full h-full object-cover"
            variant="hero"
          />
          {/* Gradient overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/85 via-[#0A0A0A]/40 to-transparent" />
        </div>

        {/* Back Button -- gold text */}
        <button
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/search');
            }
          }}
          className="absolute top-4 left-[4%] flex items-center gap-2 text-[#F5C518] hover:text-[#D4A017] transition-colors text-sm z-10 font-medium bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Results
        </button>

        <div className="max-w-4xl px-[4%] pb-8 z-[2] relative">
          {/* Category Badge + Price Range */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-block bg-[#F5C518]/10 border border-[#F5C518]/50 text-[#F5C518] font-display text-xs font-bold px-3 py-1 rounded uppercase tracking-[0.15em]">
              {company.category}
            </span>
            {company.priceRange && (
              <span className="inline-block bg-[#7DCA69]/10 border border-[#7DCA69]/40 text-[#7DCA69] font-semibold text-xs px-2.5 py-1 rounded">
                {company.priceRange}
              </span>
            )}
          </div>

          {/* Company Name -- white Oswald bold uppercase */}
          <h1 className="font-display text-hero-mobile md:text-[3rem] font-bold uppercase text-white text-shadow-lg mb-3">
            {company.businessName}
          </h1>

          {company.verificationStatus && company.verificationStatus !== 'unverified' && (
            <div className="mb-2">
              <VerificationBadge status={company.verificationStatus} size="md" />
            </div>
          )}

          {/* Rating & Location */}
          <div className="flex flex-wrap items-center gap-4 text-white/90 mb-4">
            <div className="flex items-center gap-1.5">
              <Star className="w-5 h-5 text-[#F5C518] fill-[#F5C518]" />
              <span className="font-semibold">
                {(enrichment?.rating ?? company.rating).toFixed(1)}
              </span>
              <span className="text-white/60">
                ({enrichment?.userRatingCount ?? company.reviewCount} reviews)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#F5C518]" />
              <span>{location}</span>
            </div>
            {enrichment?.regularOpeningHours?.openNow !== undefined && (
              <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                enrichment.regularOpeningHours.openNow
                  ? 'bg-[#7DCA69]/15 text-[#7DCA69] border border-[#7DCA69]/30'
                  : 'bg-red-500/15 text-red-400 border border-red-500/30'
              }`}>
                {enrichment.regularOpeningHours.openNow ? 'Open Now' : 'Closed'}
              </span>
            )}
            {company.responseTime && (
              <span className="text-xs text-white/50">
                Responds {company.responseTime}
              </span>
            )}
          </div>

          {/* Action Buttons -- primary = gold bg black text, secondary = gold border */}
          <div className="flex flex-wrap gap-3">
            {company.phone && (
              <a
                href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}
                className="inline-flex items-center gap-2 px-6 py-3 w-full sm:w-auto bg-[#F5C518] text-black font-display text-sm font-bold tracking-wider uppercase rounded hover:bg-[#D4A017] transition-all"
              >
                <Phone className="w-4 h-4" />
                {company.phone}
              </a>
            )}
            {company.website && (
              <a
                href={ensureUrl(company.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 w-full sm:w-auto bg-transparent text-[#F5C518] border-2 border-[#F5C518] font-display text-sm font-bold tracking-wider uppercase rounded hover:bg-[#F5C518] hover:text-black transition-all"
              >
                <Globe className="w-4 h-4" />
                Website
              </a>
            )}
            <button
              onClick={() => toggleFavorite(company.id)}
              className={`px-6 py-3 w-full sm:w-auto rounded border-2 font-display text-sm font-bold tracking-wider uppercase transition-all ${
                isFav
                  ? 'bg-[#F5C518] text-black border-[#F5C518]'
                  : 'bg-transparent text-[#F5C518] border-[#F5C518] hover:bg-[#F5C518] hover:text-black'
              }`}
            >
              {isFav ? '\u2665 Saved' : '\u2661 Save'}
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: company.businessName, url: window.location.href });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="px-6 py-3 w-full sm:w-auto rounded border-2 border-white/20 text-white/70 hover:border-[#F5C518]/40 hover:text-[#F5C518] font-display text-sm font-bold tracking-wider uppercase transition-all bg-transparent"
            >
              {copied ? 'Copied!' : 'Share \u2191'}
            </button>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="px-[4%] py-10">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] xl:grid-cols-[540px_1fr_300px] gap-6 max-w-[1500px]">

          {/* Left: Skyscraper Ad — sticky, full height */}
          <div className="hidden xl:block sticky top-[88px] self-start h-[calc(100vh-120px)]">
            <SponsorCard slotName="profile_skyscraper" variant="skyscraper" />
          </div>

          {/* Main Content */}
          <div className="min-w-0 space-y-8">
            {/* About */}
            <div className="bg-white rounded-lg p-6 border border-black">
              <SectionLabel text="ABOUT" />
              <p className="text-gray-600 leading-relaxed">
                {company.reviewSummary || `${company.businessName} is a ${company.category} contractor${company.city ? ` based in ${company.city}, ${company.state}` : ''}${company.yearFounded ? `, founded in ${company.yearFounded}` : ''}. Contact them for a free estimate or to learn more about their services.`}
              </p>
            </div>

            {/* Services -- improved grouped layout */}
            <ServicesList services={company.services} />

            {/* Reviews -- enhanced with Google reviews */}
            {enrichmentLoading ? (
              <div className="bg-white rounded-lg p-6 border border-black">
                <SectionLabel text="REVIEWS" />
                <div className="flex items-center gap-3 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading reviews...</span>
                </div>
              </div>
            ) : (
              <ReviewsSection
                reviews={enrichment?.reviews ?? []}
                googleRating={enrichment?.rating ?? null}
                googleReviewCount={enrichment?.userRatingCount ?? null}
                dbRating={company.rating}
                dbReviewCount={company.reviewCount}
              />
            )}

            {/* Portfolio Photos */}
            {media.filter((m) => m.type === 'photo').length > 0 && (
              <div className="bg-white rounded-lg p-6 border border-black">
                <SectionLabel text="PORTFOLIO" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {media.filter((m) => m.type === 'photo').map((m) => (
                    <div key={m.id} className="aspect-square rounded-lg overflow-hidden">
                      <img
                        src={m.url}
                        alt={m.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {company.certifications?.length > 0 && (
              <div className="bg-white rounded-lg p-6 border border-black">
                <SectionLabel text="CERTIFICATIONS" />
                <div className="flex flex-wrap gap-3">
                  {company.certifications.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-black rounded-lg hover:border-[#F5C518] transition-colors group">
                      <div className="w-6 h-6 rounded-full bg-[#F5C518]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#F5C518]/20 transition-colors">
                        <Shield className="w-3.5 h-3.5 text-[#F5C518]" />
                      </div>
                      <span className="text-gray-900 text-sm font-medium">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Business Details -- stat-card style */}
            {details.length > 0 && (
              <div className="bg-white rounded-lg p-6 border border-black">
                <SectionLabel text="BUSINESS DETAILS" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {details.map((d) => (
                    <div
                      key={d.label}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-black hover:border-[#F5C518]/30 transition-colors group"
                    >
                      <d.icon className="w-5 h-5 text-[#F5C518] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">{d.label}</p>
                        <p className="text-gray-900 font-medium group-hover:text-[#F5C518] transition-colors">{d.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* License & Verification panel (populated from CSLB data) */}
            {(company.licenseStatus || company.licenseType || company.licenseExpiry || company.bondAmount) && (
              <div className="bg-white rounded-lg p-6 border border-black">
                <SectionLabel text="LICENSE & VERIFICATION" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {company.licenseStatus && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-black">
                      <Shield className="w-5 h-5 text-[#F5C518] flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">License Status</p>
                        <p className={`font-semibold capitalize ${
                          company.licenseStatus === 'active' ? 'text-[#7DCA69]' :
                          company.licenseStatus === 'expired' ? 'text-[#FF6B6B]' :
                          'text-[#FFB347]'
                        }`}>
                          {company.licenseStatus === 'active' ? '✓ Active' : company.licenseStatus}
                        </p>
                      </div>
                    </div>
                  )}
                  {company.licenseNumber && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-black">
                      <FileText className="w-5 h-5 text-[#F5C518] flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">License #</p>
                        <div className="flex items-center gap-2">
                          <p className="text-gray-900 font-medium">{company.licenseNumber}</p>
                          <a
                            href={`https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=${company.licenseNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#F5C518] hover:underline"
                          >
                            Verify ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                  {company.licenseType && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-black sm:col-span-2">
                      <CheckCircle className="w-5 h-5 text-[#F5C518] flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">License Type</p>
                        <p className="text-gray-900 font-medium">{company.licenseType}</p>
                      </div>
                    </div>
                  )}
                  {company.licenseExpiry && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-black">
                      <Calendar className="w-5 h-5 text-[#F5C518] flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Expires</p>
                        <p className="text-gray-900 font-medium">{new Date(company.licenseExpiry).toLocaleDateString()}</p>
                      </div>
                    </div>
                  )}
                  {company.bondAmount != null && company.bondAmount > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-black">
                      <Shield className="w-5 h-5 text-[#F5C518] flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Bond</p>
                        <p className="text-gray-900 font-medium">${company.bondAmount.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {company.insuranceVerified && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-black">
                      <CheckCircle className="w-5 h-5 text-[#7DCA69] flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Insurance</p>
                        <p className="text-[#7DCA69] font-medium">Workers Comp Verified</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Yelp attribution (when data sourced from Yelp) */}
            {company.dataSource === 'yelp' && company.yelpUrl && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-white border border-black">
                <div className="flex items-center gap-3">
                  <Star className="w-4 h-4 text-[#F5C518]" />
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Reviews from</p>
                    <p className="text-gray-900 font-semibold text-sm">Yelp</p>
                  </div>
                </div>
                <a
                  href={company.yelpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.8rem] text-[#F5C518] hover:text-[#D4A017] transition-colors font-medium"
                >
                  View on Yelp ↗
                </a>
              </div>
            )}

          </div>

          {/* Sidebar */}
          <div className="space-y-6 order-first md:order-none">
            {/* Map */}
            {(() => {
              const mapQuery = company.latitude && company.longitude
                ? `${company.latitude},${company.longitude}`
                : company.address
                  ? encodeURIComponent(`${company.address}, ${company.city}, ${company.state}`)
                  : company.city
                    ? encodeURIComponent(`${company.city}, ${company.state}`)
                    : null;
              return mapQuery ? (
                <div className="rounded-xl overflow-hidden border border-black" style={{ height: '200px' }}>
                  <iframe
                    title={`${company.businessName} location`}
                    src={`https://maps.google.com/maps?q=${mapQuery}&z=14&output=embed`}
                    width="100%"
                    height="100%"
                    style={{ border: 0, filter: 'invert(0.9) hue-rotate(180deg)' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : null;
            })()}

            {/* Contact Card — redesigned: email primary, address+hours prominent */}
            <div className="bg-white rounded-xl p-6 border border-black lg:sticky lg:top-[88px]">
              <SectionLabel text="CONTACT" />
              <div className="space-y-4">

                {/* Email — PRIMARY action */}
                {company.email ? (
                  <a
                    href={`mailto:${company.email}`}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-[#F5C518] text-black rounded-lg font-display text-sm font-bold uppercase tracking-wider hover:bg-[#D4A017] transition-colors w-full"
                  >
                    <Mail className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate">{company.email}</span>
                  </a>
                ) : (
                  <div className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-400 rounded-lg font-display text-sm uppercase tracking-wider w-full border border-gray-200">
                    <Mail className="w-5 h-5" />
                    <span>No email listed</span>
                  </div>
                )}

                {/* Address */}
                {company.address && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-black">
                    <MapPin className="w-4 h-4 text-[#F5C518] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Address</p>
                      <p className="text-gray-900 text-sm leading-snug">{company.address}{company.zipCode ? `, ${company.zipCode}` : ''}</p>
                    </div>
                  </div>
                )}

                {/* Hours */}
                {(enrichment?.regularOpeningHours || hoursStr) && (
                  <div className="p-3 rounded-lg bg-gray-50 border border-black">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Hours</p>
                    {enrichmentLoading ? (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin text-[#F5C518]" />
                        <span className="text-xs">Loading...</span>
                      </div>
                    ) : (
                      <HoursDisplay
                        googleHours={enrichment?.regularOpeningHours ?? null}
                        dbHours={hoursStr}
                      />
                    )}
                  </div>
                )}

                {/* Phone — secondary link, not primary CTA */}
                {company.phone && (
                  <a
                    href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}
                    className="flex items-center gap-3 text-gray-500 hover:text-[#F5C518] transition-colors text-sm"
                  >
                    <Phone className="w-4 h-4 text-[#F5C518] flex-shrink-0" />
                    <span>{company.phone}</span>
                  </a>
                )}

                {/* Website */}
                {company.website && (
                  <a
                    href={ensureUrl(company.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-gray-500 hover:text-[#F5C518] transition-colors text-sm"
                  >
                    <Globe className="w-4 h-4 text-[#F5C518] flex-shrink-0" />
                    <span className="truncate">Visit Website</span>
                  </a>
                )}

                {/* Edit CTA — verified owners only */}
                {isAuthenticated && company.verificationStatus && company.verificationStatus !== 'unverified' && (
                  <Link
                    to={`/company/${company.id}/edit`}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-gray-100 text-gray-600 font-display text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-gray-200 transition-colors border border-gray-300"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Profile
                  </Link>
                )}

              </div>
            </div>

            {/* Featured review */}
            {enrichment?.reviews && enrichment.reviews.length > 0 && (() => {
              const top = enrichment.reviews.reduce((a, b) => b.rating > a.rating ? b : a);
              return (
                <div className="bg-white rounded-xl p-5 border border-black">
                  <SectionLabel text="TOP REVIEW" />
                  <div className="flex gap-0.5 mb-2">
                    {Array.from({ length: top.rating }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-[#F5C518] text-[#F5C518]" />
                    ))}
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed line-clamp-4">
                    "{top.text.text}"
                  </p>
                  <p className="text-gray-400 text-xs mt-2">— {top.authorAttribution.displayName}</p>
                </div>
              );
            })()}

            {/* Claim listing card */}
            <ClaimListingCard companyId={company.id} businessName={company.businessName} />

          </div>
        </div>
      </div>

    </div>
  );
};

export default CompanyProfile;
