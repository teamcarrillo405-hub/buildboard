/**
 * HoursDisplay Component
 * HCC-branded hours display with gold accents
 */

import React from 'react';
import { Clock } from 'lucide-react';
import type { PlaceOpeningHours } from '../api/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayIndex(): number {
  return new Date().getDay(); // 0 = Sunday, 6 = Saturday
}

/**
 * Google weekdayDescriptions are ordered Monday-Sunday.
 * Map them to day indices for highlighting today's row.
 * Index 0 = Monday ... Index 6 = Sunday
 */
function googleDayToJsDay(googleIndex: number): number {
  // Google: 0=Monday, 1=Tuesday, ..., 6=Sunday
  // JS:     0=Sunday, 1=Monday, ..., 6=Saturday
  return googleIndex === 6 ? 0 : googleIndex + 1;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HoursDisplayProps {
  googleHours: PlaceOpeningHours | null;
  dbHours: string | null;
}

const HoursDisplay: React.FC<HoursDisplayProps> = ({ googleHours, dbHours }) => {
  if (!googleHours && !dbHours) return null;

  const todayIndex = getTodayIndex();

  // Google Places structured hours
  if (googleHours && googleHours.weekdayDescriptions?.length > 0) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-[#F5C518] flex-shrink-0" />
          <h4 className="font-display text-sm uppercase tracking-wider text-gray-900">
            Hours
          </h4>
          {googleHours.openNow !== undefined && (
            <span
              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                googleHours.openNow
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  googleHours.openNow ? 'bg-green-400' : 'bg-red-400'
                }`}
              />
              {googleHours.openNow ? 'Open Now' : 'Closed'}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {googleHours.weekdayDescriptions.map((desc, i) => {
            const isToday = googleDayToJsDay(i) === todayIndex;
            return (
              <div
                key={i}
                className={`flex justify-between text-sm py-1 px-2 rounded ${
                  isToday
                    ? 'bg-[#F5C518]/15 text-gray-900 font-medium'
                    : 'text-gray-500'
                }`}
              >
                <span>{desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Database fallback -- plain text hours
  return (
    <div className="flex items-start gap-3 text-gray-500">
      <Clock className="w-5 h-5 text-[#F5C518] flex-shrink-0 mt-0.5" />
      <span>{dbHours}</span>
    </div>
  );
};

export default HoursDisplay;
