/**
 * ClaimListingCard — sidebar card that launches the full claim flow.
 *
 * Clicking "Claim This Listing" navigates to /claim/:companyId where
 * the user completes the 4-step verification form and $150 payment.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';

interface ClaimListingCardProps {
  companyId: string;
  businessName: string;
}

const ClaimListingCard: React.FC<ClaimListingCardProps> = ({ companyId, businessName }) => {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-xl p-5 border border-black">
      <div className="flex items-center gap-3 mb-3">
        <Shield className="w-4 h-4 text-[#F5C518]" />
        <span className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-gray-900">
          OWN THIS BUSINESS?
        </span>
      </div>

      <p className="text-gray-500 text-[0.82rem] mb-4 leading-relaxed">
        Claim your listing to update contact info, add photos, and earn the HCC Verified badge. Verification takes 2–3 weeks.
      </p>

      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Claiming</p>
        <p className="text-gray-800 font-semibold text-sm truncate">{businessName}</p>
      </div>

      <button
        onClick={() => navigate(`/claim/${companyId}`)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#F5C518] text-black font-display text-[0.8rem] font-bold uppercase tracking-[0.1em] hover:bg-[#D4A017] transition-colors"
      >
        Claim This Listing
        <ArrowRight className="w-3.5 h-3.5" />
      </button>

      <p className="text-center text-[10px] text-gray-400 mt-3">
        $150 verification fee &middot; Secure payment via Stripe
      </p>
    </div>
  );
};

export default ClaimListingCard;
