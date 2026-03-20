/**
 * VerificationBadge Component
 * HCC-branded verification badge with gold accent
 */

import React from 'react';
import { ShieldCheck, Award } from 'lucide-react';

interface VerificationBadgeProps {
  status: 'unverified' | 'verified' | 'hcc_member';
  size?: 'sm' | 'md';
}

const VerificationBadge: React.FC<VerificationBadgeProps> = ({ status, size = 'md' }) => {
  if (status === 'unverified') return null;

  const isVerified = status === 'verified';

  const tooltipText = isVerified
    ? 'Business identity and license verified by BuildBoard'
    : 'Member of the Hispanic Construction Council';

  const tooltipId = isVerified ? 'tooltip-verified' : 'tooltip-hcc-member';

  const containerClass = [
    'inline-flex items-center gap-1 font-display font-bold uppercase tracking-wider rounded-full px-2 py-0.5',
    'bg-[#F5C518]/15 text-[#F5C518] border border-[#F5C518]/30',
  ].join(' ');

  const textClass = size === 'sm' ? 'text-[0.65rem]' : 'text-xs';
  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span className="relative group inline-flex">
      <span
        className={containerClass}
        aria-describedby={tooltipId}
      >
        {isVerified ? (
          <ShieldCheck className={iconClass} />
        ) : (
          <Award className={iconClass} />
        )}
        <span className={textClass}>
          {isVerified ? 'Verified' : 'HCC Member'}
        </span>
      </span>

      {/* Tooltip */}
      <span
        id={tooltipId}
        role="tooltip"
        className={[
          'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
          'w-max max-w-[200px] px-3 py-1.5',
          'bg-[#1A1A1A] text-white text-xs leading-snug',
          'rounded-lg shadow-lg border border-white/10',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
        ].join(' ')}
      >
        {tooltipText}
        {/* Caret pointing down */}
        <span
          className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #1A1A1A',
          }}
          aria-hidden="true"
        />
      </span>
    </span>
  );
};

export default VerificationBadge;
