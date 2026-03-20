/**
 * ReviewsSection Component
 * HCC-branded reviews with gold stars, dark card backgrounds, and section label
 */

import React, { useState } from 'react';
import { Star } from 'lucide-react';
import type { PlaceReview } from '../api/types';

// ---------------------------------------------------------------------------
// Star Rating helper
// ---------------------------------------------------------------------------

const StarRating: React.FC<{ rating: number; size?: string }> = ({
  rating,
  size = 'w-5 h-5',
}) => (
  <div className="flex items-center gap-0.5">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`${size} ${
          i < Math.floor(rating)
            ? 'text-[#F5C518] fill-[#F5C518]'
            : i < rating
              ? 'text-[#F5C518] fill-[#F5C518]/50'
              : 'text-gray-200'
        }`}
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Single Review Card
// ---------------------------------------------------------------------------

const ReviewCard: React.FC<{ review: PlaceReview }> = ({ review }) => {
  const [expanded, setExpanded] = useState(false);
  const text = review.text?.text || '';
  const isLong = text.length > 200;
  const displayText = expanded || !isLong ? text : text.slice(0, 200) + '...';

  return (
    <div className="bg-white rounded-lg p-4 border border-black">
      {/* Author & Rating */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {review.authorAttribution?.photoUri && (
            <img
              src={review.authorAttribution.photoUri}
              alt=""
              className="w-8 h-8 rounded-full flex-shrink-0"
              loading="lazy"
            />
          )}
          <span className="text-gray-900 font-medium text-sm truncate">
            {review.authorAttribution?.displayName || 'Anonymous'}
          </span>
        </div>
        <StarRating rating={review.rating} size="w-4 h-4" />
      </div>

      {/* Review text */}
      {text && (
        <p className="text-gray-600 text-sm leading-relaxed">
          {displayText}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-[#F5C518] hover:text-[#D4A017] text-sm font-medium"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </p>
      )}

      {/* Relative time */}
      {review.relativePublishTimeDescription && (
        <p className="text-gray-400 text-xs mt-2">
          {review.relativePublishTimeDescription}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ReviewsSectionProps {
  reviews: PlaceReview[];
  googleRating: number | null;
  googleReviewCount: number | null;
  dbRating: number;
  dbReviewCount: number;
}

const ReviewsSection: React.FC<ReviewsSectionProps> = ({
  reviews,
  googleRating,
  googleReviewCount,
  dbRating,
  dbReviewCount,
}) => {
  const hasGoogleData = googleRating !== null && googleRating > 0;
  const displayRating = hasGoogleData ? googleRating : dbRating;
  const displayCount = hasGoogleData ? (googleReviewCount ?? 0) : dbReviewCount;
  const sourceLabel = hasGoogleData ? 'Google Reviews' : 'Directory Rating';

  return (
    <div className="bg-white rounded-lg p-6 border border-black">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-1 h-[18px] bg-[#F5C518] flex-shrink-0" />
        <span className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-gray-900">
          REVIEWS
        </span>
      </div>

      {/* Rating Summary */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-4xl font-bold text-gray-900">
          {displayRating.toFixed(1)}
        </span>
        <div>
          <StarRating rating={displayRating} />
          <p className="text-gray-500 text-sm mt-0.5">
            {displayCount} review{displayCount !== 1 ? 's' : ''}{' '}
            <span className="text-gray-400">({sourceLabel})</span>
          </p>
        </div>
      </div>

      {/* Google Review Cards */}
      {reviews.length > 0 && (
        <div className="space-y-3 mt-4">
          {reviews.map((review, i) => (
            <ReviewCard key={i} review={review} />
          ))}

          {/* Google attribution (required by TOS) */}
          <p className="text-gray-400 text-xs mt-3 pt-3 border-t border-gray-200">
            Reviews from Google
          </p>
        </div>
      )}
    </div>
  );
};

export default ReviewsSection;
