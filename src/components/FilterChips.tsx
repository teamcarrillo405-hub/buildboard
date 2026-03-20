/**
 * FilterChips - AI-extracted filter chips with remove/clear
 * HCC brand: gold active chips, dark inactive, Oswald font
 */

import React from 'react';
import { X, MapPin, Star, Building2, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FilterChip } from '../api/types';

interface FilterChipsProps {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClear: () => void;
}

const CHIP_ICONS: Record<FilterChip['type'], React.ReactNode> = {
  category: <Building2 className="w-3.5 h-3.5" />,
  location: <MapPin className="w-3.5 h-3.5" />,
  rating: <Star className="w-3.5 h-3.5 fill-current" />,
  service: <Wrench className="w-3.5 h-3.5" />,
};

const FilterChips: React.FC<FilterChipsProps> = ({ chips, onRemove, onClear }) => {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <AnimatePresence mode="popLayout">
        {chips.map((chip) => (
          <motion.button
            key={chip.key}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => onRemove(chip.key)}
            className="inline-flex items-center gap-1.5 bg-[#F5C518] text-[#0A0A0A] rounded-full px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-[#D4A017] transition-colors group"
            title={`Remove ${chip.label}`}
          >
            {CHIP_ICONS[chip.type]}
            <span>{chip.label}</span>
            <X className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
          </motion.button>
        ))}
      </AnimatePresence>

      {chips.length > 1 && (
        <motion.button
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onClear}
          className="text-[11px] text-[#F5C518] hover:text-[#D4A017] font-display font-bold uppercase tracking-[0.1em] transition-colors"
        >
          Clear all
        </motion.button>
      )}
    </div>
  );
};

export default FilterChips;
