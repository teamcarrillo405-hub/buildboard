/**
 * ServicesList Component
 * HCC-branded services display with gold section label and visual grouping
 */

import React from 'react';
import {
  Clock,
  Zap,
  Shield,
  Award,
  BadgeCheck,
  CreditCard,
  PhoneCall,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Feature tag detection
// ---------------------------------------------------------------------------

interface FeatureConfig {
  keywords: string[];
  icon: React.FC<{ className?: string }>;
}

const FEATURE_CONFIGS: FeatureConfig[] = [
  { keywords: ['free estimate', 'free consultation'], icon: BadgeCheck },
  { keywords: ['emergency', '24/7', '24 hour', 'after hours'], icon: Zap },
  { keywords: ['licensed'], icon: Award },
  { keywords: ['insured', 'bonded'], icon: Shield },
  { keywords: ['warranty', 'guarantee'], icon: Shield },
  { keywords: ['financing', 'payment plan'], icon: CreditCard },
  { keywords: ['same day', 'same-day', 'quick response'], icon: Clock },
  { keywords: ['on call', 'on-call'], icon: PhoneCall },
];

function getFeatureIcon(service: string): React.FC<{ className?: string }> | null {
  const lower = service.toLowerCase();
  for (const config of FEATURE_CONFIGS) {
    if (config.keywords.some((kw) => lower.includes(kw))) {
      return config.icon;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ServicesListProps {
  services: string[];
}

const ServicesList: React.FC<ServicesListProps> = ({ services }) => {
  if (!services || services.length === 0) return null;

  const featureTags: { label: string; Icon: React.FC<{ className?: string }> }[] = [];
  const coreTags: string[] = [];

  for (const service of services) {
    const icon = getFeatureIcon(service);
    if (icon) {
      featureTags.push({ label: service, Icon: icon });
    } else {
      coreTags.push(service);
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 border border-black">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-1 h-[18px] bg-[#F5C518] flex-shrink-0" />
        <span className="font-display text-[11px] font-bold tracking-[0.22em] uppercase text-gray-900">
          SERVICES OFFERED
        </span>
      </div>

      {/* Feature tags */}
      {featureTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {featureTags.map(({ label, Icon }, i) => (
            <span
              key={`feature-${i}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C518]/10 border border-[#F5C518]/30 text-[#F5C518] text-sm rounded"
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Core service tags */}
      {coreTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {coreTags.map((service, i) => (
            <span
              key={`core-${i}`}
              className="px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-600 text-sm rounded"
            >
              {service}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServicesList;
