/**
 * Detail Modal Component (Legacy - not actively used)
 * Full-screen modal for company details
 */

import React, { useEffect, useState } from 'react';
import { ensureUrl } from '../utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Star,
  MapPin,
  Phone,
  Globe,
  Clock,
  Check,
  Heart,
  Share2,
  ExternalLink,
  ChevronRight,
  Award,
  Users,
  Calendar,
  ThumbsUp,
} from 'lucide-react';
import type { Company } from '../api/types';

interface DetailModalProps {
  company: Company | null;
  isOpen: boolean;
  onClose: () => void;
  similarCompanies?: Company[];
  onViewSimilar?: (company: Company) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (company: Company) => void;
}

const DetailModal: React.FC<DetailModalProps> = ({
  company,
  isOpen,
  onClose,
  similarCompanies = [],
  onViewSimilar,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'hours'>('overview');
  const [imageLoaded, setImageLoaded] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }

    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Reset state when company changes
  useEffect(() => {
    setActiveTab('overview');
    setImageLoaded(false);
  }, [company?.id]);

  if (!company) return null;

  // Check if business is open
  const isBusinessOpen = () => {
    if (typeof company.hours === 'string') return true;
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const today = days[now.getDay()];
    const hours = (company.hours as unknown as Record<string, string>)[today];
    return hours && hours.toLowerCase() !== 'closed';
  };

  // Get today's hours
  const getTodayHours = () => {
    if (typeof company.hours === 'string') return company.hours;
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const today = days[now.getDay()];
    return (company.hours as unknown as Record<string, string>)[today];
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: 'Services' },
    { id: 'hours', label: 'Hours' },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 50 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl mx-4 my-8 bg-surface rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero Image */}
            <div className="relative h-64 md:h-80 overflow-hidden">
              {!imageLoaded && (
                <div className="absolute inset-0 bg-gray-800 animate-pulse" />
              )}
              <img
                src={company.imageUrl ?? ''}
                alt={company.businessName}
                className={`w-full h-full object-cover transition-opacity duration-500 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImageLoaded(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />

              {/* Close Button */}
              <motion.button
                onClick={onClose}
                className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors z-10"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-5 h-5" />
              </motion.button>

              {/* Badges */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                {company.isFeatured && (
                  <span className="px-3 py-1 bg-brand-primary text-white text-sm font-semibold rounded-full">
                    FEATURED
                  </span>
                )}
                {company.isNew && (
                  <span className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-full">
                    NEW
                  </span>
                )}
              </div>

              {/* Hero Content */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <span className="text-brand-primary font-semibold text-sm mb-2 block">
                    {company.category}
                  </span>
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                    {company.businessName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-gray-300">
                    <div className="flex items-center">
                      <Star className="w-5 h-5 text-yellow-400 fill-current mr-1" />
                      <span className="font-semibold text-white">
                        {company.rating.toFixed(1)}
                      </span>
                      <span className="ml-1">
                        ({company.reviewCount} reviews)
                      </span>
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-1" />
                      {company.location}
                    </div>
                    <div
                      className={`flex items-center ${
                        isBusinessOpen() ? 'text-green-400' : 'text-gray-400'
                      }`}
                    >
                      <Clock className="w-4 h-4 mr-1" />
                      {isBusinessOpen() ? 'Open now' : 'Closed'} •{' '}
                      {getTodayHours()}
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="px-6 md:px-8 py-4 border-b border-white/10 flex flex-wrap gap-3"
            >
              <motion.a
                href={`tel:${company.phone}`}
                className="flex items-center space-x-2 px-6 py-3 bg-brand-primary text-white rounded-lg font-semibold hover:bg-brand-primary-dark transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Phone className="w-5 h-5" />
                <span>Call Now</span>
              </motion.a>
              {company.website && (
                <motion.a
                  href={ensureUrl(company.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-6 py-3 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/20 transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Globe className="w-5 h-5" />
                  <span>Website</span>
                </motion.a>
              )}
              {onToggleFavorite && (
                <motion.button
                  onClick={() => onToggleFavorite(company)}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold transition-colors ${
                    isFavorite
                      ? 'bg-brand-primary text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Heart
                    className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`}
                  />
                  <span>{isFavorite ? 'Saved' : 'Save'}</span>
                </motion.button>
              )}
              <motion.button
                className="flex items-center space-x-2 px-6 py-3 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/20 transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Share2 className="w-5 h-5" />
                <span>Share</span>
              </motion.button>
            </motion.div>

            {/* Tabs */}
            <div className="px-6 md:px-8 border-b border-white/10">
              <div className="flex space-x-6">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 text-sm font-medium transition-colors relative ${
                      activeTab === tab.id
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6 md:p-8">
              <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    {/* Description */}
                    <div>
                      <h3 className="text-white font-semibold mb-2">
                        About
                      </h3>
                      <p className="text-gray-300 leading-relaxed">
                        {company.reviewSummary}
                      </p>
                    </div>

                    {/* Quick Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {company.yearFounded && (
                        <div className="bg-white/5 rounded-lg p-4">
                          <Calendar className="w-5 h-5 text-brand-primary mb-2" />
                          <div className="text-gray-400 text-sm">Founded</div>
                          <div className="text-white font-semibold">
                            {company.yearFounded}
                          </div>
                        </div>
                      )}
                      {company.employeeCount && (
                        <div className="bg-white/5 rounded-lg p-4">
                          <Users className="w-5 h-5 text-brand-primary mb-2" />
                          <div className="text-gray-400 text-sm">Employees</div>
                          <div className="text-white font-semibold">
                            {company.employeeCount}
                          </div>
                        </div>
                      )}
                      <div className="bg-white/5 rounded-lg p-4">
                        <Award className="w-5 h-5 text-brand-primary mb-2" />
                        <div className="text-gray-400 text-sm">Rating</div>
                        <div className="text-white font-semibold">
                          {company.rating.toFixed(1)}/5
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-4">
                        <ThumbsUp className="w-5 h-5 text-brand-primary mb-2" />
                        <div className="text-gray-400 text-sm">Reviews</div>
                        <div className="text-white font-semibold">
                          {company.reviewCount}
                        </div>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div>
                      <h3 className="text-white font-semibold mb-3">
                        Contact Information
                      </h3>
                      <div className="space-y-2">
                        <a
                          href={`tel:${company.phone}`}
                          className="flex items-center text-gray-300 hover:text-white transition-colors"
                        >
                          <Phone className="w-5 h-5 mr-3 text-brand-primary" />
                          {company.phone}
                        </a>
                        {company.website && (
                          <a
                            href={ensureUrl(company.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-gray-300 hover:text-white transition-colors"
                          >
                            <Globe className="w-5 h-5 mr-3 text-brand-primary" />
                            {company.website}
                            <ExternalLink className="w-4 h-4 ml-2" />
                          </a>
                        )}
                        <div className="flex items-center text-gray-300">
                          <MapPin className="w-5 h-5 mr-3 text-brand-primary" />
                          {company.location}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'services' && (
                  <motion.div
                    key="services"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <h3 className="text-white font-semibold mb-4">
                      Services Offered
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {company.services.map((service, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center p-3 bg-white/5 rounded-lg"
                        >
                          <Check className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                          <span className="text-gray-300">{service}</span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'hours' && (
                  <motion.div
                    key="hours"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <h3 className="text-white font-semibold mb-4">
                      Business Hours
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(company.hours).map(([day, hours]) => {
                        const isToday =
                          day ===
                          ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
                            new Date().getDay()
                          ];
                        return (
                          <div
                            key={day}
                            className={`flex justify-between items-center p-3 rounded-lg ${
                              isToday ? 'bg-white/10' : 'bg-white/5'
                            }`}
                          >
                            <span
                              className={`capitalize ${
                                isToday ? 'text-white font-semibold' : 'text-gray-300'
                              }`}
                            >
                              {day}
                              {isToday && (
                                <span className="ml-2 text-brand-primary text-sm">
                                  (Today)
                                </span>
                              )}
                            </span>
                            <span
                              className={
                                hours.toLowerCase() === 'closed'
                                  ? 'text-gray-500'
                                  : 'text-gray-300'
                              }
                            >
                              {hours}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Similar Companies */}
            {similarCompanies.length > 0 && (
              <div className="border-t border-white/10 p-6 md:p-8">
                <h3 className="text-white font-semibold mb-4">
                  Similar Companies
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {similarCompanies.slice(0, 3).map((similar) => (
                    <motion.button
                      key={similar.id}
                      onClick={() => onViewSimilar?.(similar)}
                      className="flex items-center p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-left"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <img
                        src={similar.imageUrl ?? ''}
                        alt={similar.businessName}
                        className="w-12 h-12 rounded-lg object-cover mr-3"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">
                          {similar.businessName}
                        </div>
                        <div className="flex items-center text-gray-400 text-sm">
                          <Star className="w-3 h-3 text-yellow-400 fill-current mr-1" />
                          {similar.rating.toFixed(1)}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DetailModal;
