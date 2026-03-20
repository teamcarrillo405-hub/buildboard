/**
 * AIAssistant - AI response card with thinking animation and summary
 * Shows when AI processes a search query, displays extracted summary
 */

import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIAssistantProps {
  isLoading: boolean;
  summary: string | null;
  source: 'ai' | 'fallback' | null;
  onDismiss: () => void;
  visible: boolean;
}

const ThinkingDots: React.FC = () => (
  <div className="flex gap-1.5 py-1">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-2 h-2 bg-brand-primary/60 rounded-full"
        animate={{ y: [0, -6, 0] }}
        transition={{
          duration: 0.6,
          repeat: Infinity,
          delay: i * 0.15,
          ease: 'easeInOut',
        }}
      />
    ))}
  </div>
);

const AIAssistant: React.FC<AIAssistantProps> = ({
  isLoading,
  summary,
  source,
  onDismiss,
  visible,
}) => {
  const show = visible && (isLoading || summary);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          role="region"
          aria-label="AI search assistant"
          aria-live="polite"
          className="mb-5 bg-brand-primary/5 border border-brand-primary/20 rounded-lg p-4 relative"
        >
          {/* Dismiss button */}
          {!isLoading && (
            <button
              onClick={onDismiss}
              className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-text-muted hover:text-white transition-colors"
              aria-label="Dismiss AI summary"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-brand-primary" />
            <span className="font-display text-[0.75rem] font-bold uppercase tracking-[0.1em] text-brand-primary">
              AI Assistant
            </span>
            {source === 'ai' && !isLoading && (
              <span className="text-[0.65rem] text-brand-primary/60 bg-brand-primary/10 rounded px-1.5 py-0.5 font-medium">
                AI-powered
              </span>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <ThinkingDots />
          ) : (
            <p className="text-[0.9rem] text-white/85 leading-relaxed pr-8">
              {summary}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIAssistant;
