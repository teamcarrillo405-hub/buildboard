/**
 * CompanyImage Component
 * Smart image component with 3-tier fallback chain:
 *   1. Google Places photo (via /api/places/photo proxy)
 *   2. R2 category image (via VITE_R2_PUBLIC_URL)
 *   3. Hardcoded default -> CSS initial fallback (never broken)
 */

import React, { useState, useCallback } from 'react';
import { getCategoryImage } from '../data/categoryImages';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || '';

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=75';

// ---------------------------------------------------------------------------
// Category slug helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw category string to a URL-safe slug, matching the server-side
 * normalization logic in server/data/category-map.ts.
 *
 * Rules applied:
 *   1. Lowercase
 *   2. Strip trailing "contractor(s)" suffix
 *   3. Replace whitespace runs with hyphens
 *   4. Remove non-alphanumeric/hyphen characters
 */
function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/\s+contractors?$/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Simple deterministic hash of a string, used to pick a consistent
 * image variation (1-5) for a given company ID.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Build an R2 category image URL for a company.
 * Exported so other components (e.g., PreviewPopup via CompanyCard) can
 * construct a URL string without rendering the full component.
 */
export function getCategoryImageUrl(category: string, companyId: string): string {
  if (!R2_PUBLIC_URL) return DEFAULT_IMAGE;
  const slug = categoryToSlug(category);
  const variation = (hashCode(companyId) % 5) + 1;
  return `${R2_PUBLIC_URL}/categories/${slug}/${variation}.webp`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CompanyImageProps {
  company: {
    id: string;
    category: string;
    businessName?: string;
    /** Yelp CDN photo URL (highest priority) */
    imageUrl?: string | null;
    /** Google Places photo URL (second priority) */
    googlePhotoUrl?: string | null;
  };
  className?: string;
  variant?: 'card' | 'hero'; // card = 400px, hero = 800px
}

/**
 * Fallback levels:
 *   0 = Yelp photo (imageUrl) or Google photo (googlePhotoUrl), whichever is set
 *   1 = R2 category image (after primary photo error)
 *   2 = Unsplash category image (via categoryImages map)
 *   3 = Hardcoded default Unsplash image
 *   4 = Pure CSS initial (colored div with category letter -- never breaks)
 */
const CompanyImage: React.FC<CompanyImageProps> = ({
  company,
  className = 'w-full aspect-video object-cover',
  variant = 'card',
}) => {
  const maxWidth = variant === 'hero' ? 800 : 400;

  // Priority: Yelp image > Google photo > R2 category image
  const primaryPhoto = company.imageUrl || company.googlePhotoUrl || null;

  const getInitialSrc = useCallback(() => {
    if (primaryPhoto) return primaryPhoto;
    // If R2 is configured, start with R2 category image (level 1)
    // Otherwise skip straight to Unsplash category image (level 2)
    if (R2_PUBLIC_URL) return getCategoryImageUrl(company.category, company.id);
    return getCategoryImage(company.category);
  }, [primaryPhoto, company.category, company.id]);

  const [imgSrc, setImgSrc] = useState<string>(getInitialSrc);
  const [fallbackLevel, setFallbackLevel] = useState<number>(
    primaryPhoto ? 0 : R2_PUBLIC_URL ? 1 : 2
  );
  const [showCssFallback, setShowCssFallback] = useState(false);

  const handleError = useCallback(() => {
    if (fallbackLevel === 0) {
      // Primary photo (Yelp/Google) failed -- try R2 category image
      setImgSrc(getCategoryImageUrl(company.category, company.id));
      setFallbackLevel(1);
    } else if (fallbackLevel === 1) {
      // R2 category image failed -- try Unsplash category image
      setImgSrc(getCategoryImage(company.category));
      setFallbackLevel(2);
    } else if (fallbackLevel === 2) {
      // Unsplash category image failed -- try hardcoded default
      setImgSrc(DEFAULT_IMAGE);
      setFallbackLevel(3);
    } else {
      // Default also failed -- show pure CSS fallback
      setShowCssFallback(true);
      setFallbackLevel(4);
    }
  }, [fallbackLevel, company.category, company.id]);

  // Pure CSS fallback -- colored div with category initial letter
  if (showCssFallback) {
    const initial = (company.category || 'C').charAt(0).toUpperCase();
    return (
      <div
        className={`${className} flex items-center justify-center bg-brand-primary/30`}
        aria-label={company.businessName || 'Construction company'}
      >
        <span className="text-4xl font-display font-bold text-white/60">
          {initial}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={company.businessName || 'Construction company'}
      className={className}
      loading="lazy"
      width={maxWidth}
      onError={handleError}
    />
  );
};

export default CompanyImage;
