/**
 * GuidedSearchModal
 * Angi-style step-by-step project qualifier shown on every search.
 * Framer Motion handles option card entrance and step slide transitions.
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getQuestionsForQuery, type QuestionStep } from '../data/guidedQuestions';

// ── Props ─────────────────────────────────────────────────────────────────

interface GuidedSearchModalProps {
  isOpen: boolean;
  query: string;      // search query — drives which question set is shown
  loc: string;        // location string passed through to results
  onComplete: (answers: string[], q: string, loc: string) => void;
  onSkip: (q: string, loc: string) => void;
  onClose: () => void;
}

// ── Animation variants ────────────────────────────────────────────────────

const overlayVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1 },
  exit:    { opacity: 0 },
};

const cardVariants = {
  hidden:  { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1,    y: 0  },
  exit:    { opacity: 0, scale: 0.96, y: -12 },
};

// Step slide directions: entering from right (+x), exiting to left (-x)
const stepEnter  = { opacity: 0, x: 40 };
const stepCenter = { opacity: 1, x: 0  };
const stepExit   = { opacity: 0, x: -40 };

const stepTransition = { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as const };

// Option card stagger
const optionContainer = {
  visible: { transition: { staggerChildren: 0.045 } },
};
const optionItem = {
  hidden:  { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1    },
};
const optionTransition = { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] as const };

// ── Component ─────────────────────────────────────────────────────────────

const GuidedSearchModal: React.FC<GuidedSearchModalProps> = ({
  isOpen,
  query,
  loc,
  onComplete,
  onSkip,
  onClose,
}) => {
  const [steps, setSteps] = useState<QuestionStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  // Derive question steps whenever query changes (or modal opens)
  useEffect(() => {
    if (isOpen) {
      const derived = getQuestionsForQuery(query);
      setSteps(derived);
      setCurrentStep(0);
      setAnswers([]);
      setSelectedValue(null);
    }
  }, [isOpen, query]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || steps.length === 0) return null;

  const totalSteps    = steps.length;
  const step          = steps[currentStep];
  const isLastStep    = currentStep === totalSteps - 1;
  const progressPct   = ((currentStep) / totalSteps) * 100;

  const handleOptionSelect = (value: string) => {
    setSelectedValue(value);
  };

  const handleContinue = () => {
    if (!selectedValue) return;

    const newAnswers = [...answers, selectedValue];

    if (isLastStep) {
      onComplete(newAnswers, query, loc);
    } else {
      setAnswers(newAnswers);
      setCurrentStep((s) => s + 1);
      setSelectedValue(null);
    }
  };

  const handleSkip = () => {
    onSkip(query, loc);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        // ── Overlay ──────────────────────────────────────────────────────
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            // Close when clicking the backdrop (not the card)
            if (e.target === e.currentTarget) onClose();
          }}
          aria-modal="true"
          role="dialog"
          aria-label="Tell us about your project"
        >
          {/* ── Card ─────────────────────────────────────────────────────── */}
          <motion.div
            className="w-full max-w-lg rounded-2xl p-8 relative overflow-hidden"
            style={{
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#F5C518' }}>
                  Step {currentStep + 1} of {totalSteps}
                </p>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  Tell us about your project
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-colors flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.16)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                aria-label="Close modal"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* ── Progress bar ───────────────────────────────────────────── */}
            <div
              className="w-full rounded-full mb-6"
              style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.08)' }}
              role="progressbar"
              aria-valuenow={currentStep + 1}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: '#F5C518' }}
                animate={{ width: `${progressPct + (100 / totalSteps)}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>

            {/* ── Step content (animated per-step) ───────────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={stepEnter}
                animate={stepCenter}
                exit={stepExit}
                transition={stepTransition}
              >
                {/* Question */}
                <h3 className="text-2xl font-bold text-white mb-5">
                  {step.question}
                </h3>

                {/* Options grid */}
                <motion.div
                  className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6"
                  variants={optionContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {step.options.map((option) => {
                    const isSelected = selectedValue === option.value;
                    return (
                      <motion.button
                        key={option.value}
                        variants={optionItem}
                        transition={optionTransition}
                        onClick={() => handleOptionSelect(option.value)}
                        className="flex flex-col items-center justify-center rounded-xl p-4 cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2"
                        style={{
                          border: isSelected
                            ? '1px solid #F5C518'
                            : '1px solid rgba(255,255,255,0.10)',
                          backgroundColor: isSelected
                            ? 'rgba(245,197,24,0.10)'
                            : 'transparent',
                          focusVisibleRingColor: '#F5C518',
                        } as React.CSSProperties}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.30)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                          }
                        }}
                        aria-pressed={isSelected}
                        aria-label={option.label}
                      >
                        {option.emoji && (
                          <span className="text-2xl mb-1.5" aria-hidden="true">
                            {option.emoji}
                          </span>
                        )}
                        <span
                          className="text-sm text-center font-medium leading-tight"
                          style={{ color: isSelected ? '#F5C518' : '#ffffff' }}
                        >
                          {option.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mt-2">
              {/* Skip link — always visible */}
              <button
                onClick={handleSkip}
                className="text-sm transition-colors"
                style={{ color: '#999999' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#999999')}
              >
                Skip, show all results →
              </button>

              {/* Continue / Show Results */}
              <button
                onClick={handleContinue}
                disabled={!selectedValue}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-200"
                style={{
                  backgroundColor: selectedValue ? '#F5C518' : 'rgba(245,197,24,0.25)',
                  color: selectedValue ? '#0A0A0A' : 'rgba(255,255,255,0.3)',
                  cursor: selectedValue ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={(e) => {
                  if (selectedValue) e.currentTarget.style.backgroundColor = '#D4A017';
                }}
                onMouseLeave={(e) => {
                  if (selectedValue) e.currentTarget.style.backgroundColor = '#F5C518';
                }}
              >
                {isLastStep ? 'Show Results →' : 'Continue →'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GuidedSearchModal;
