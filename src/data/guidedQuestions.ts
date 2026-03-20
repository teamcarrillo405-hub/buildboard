/**
 * Guided Search Questions
 * Per-category step-by-step question sets for the GuidedSearchModal.
 * Each set is matched against the user's search query via keywords.
 */

export interface QuestionOption {
  label: string;
  value: string;
  emoji?: string;
}

export interface QuestionStep {
  question: string;
  options: QuestionOption[];
}

export interface GuidedQuestionSet {
  keywords: string[]; // keywords to match against the search query
  steps: QuestionStep[];
}

// Universal Step 2 — appended to every category set
const TIMELINE_STEP: QuestionStep = {
  question: 'When do you need this done?',
  options: [
    { label: 'ASAP',           value: 'asap',           emoji: '⚡' },
    { label: '1–2 Weeks',      value: '1-2-weeks',      emoji: '📅' },
    { label: 'Within a Month', value: 'within-a-month', emoji: '🗓️' },
    { label: 'Just Planning',  value: 'just-planning',  emoji: '🤔' },
  ],
};

export const GUIDED_QUESTION_SETS: GuidedQuestionSet[] = [
  // ── Concrete / Masonry ───────────────────────────────────────────────────
  {
    keywords: ['concrete', 'masonry', 'cement', 'brick', 'block', 'stone'],
    steps: [
      {
        question: 'What type of concrete work?',
        options: [
          { label: 'Driveway',           value: 'driveway',           emoji: '🚗' },
          { label: 'Foundation',         value: 'foundation',         emoji: '🏗️' },
          { label: 'Patio / Porch',      value: 'patio-porch',        emoji: '🏡' },
          { label: 'Retaining Wall',     value: 'retaining-wall',     emoji: '🧱' },
          { label: 'Stamped / Decorative', value: 'stamped-decorative', emoji: '✨' },
          { label: 'Other',              value: 'other',              emoji: '🔧' },
        ],
      },
      TIMELINE_STEP,
    ],
  },

  // ── Electrical ───────────────────────────────────────────────────────────
  {
    keywords: ['electrical', 'electrician', 'electric', 'wiring', 'panel', 'outlet', 'lighting', 'generator', 'ev charger'],
    steps: [
      {
        question: 'What electrical work do you need?',
        options: [
          { label: 'New Wiring',         value: 'new-wiring',         emoji: '⚡' },
          { label: 'Panel Upgrade',      value: 'panel-upgrade',      emoji: '🔌' },
          { label: 'Outlet Installation', value: 'outlet-installation', emoji: '🔦' },
          { label: 'Lighting',           value: 'lighting',           emoji: '💡' },
          { label: 'Generator',          value: 'generator',          emoji: '🔋' },
          { label: 'EV Charger',         value: 'ev-charger',         emoji: '🚗' },
        ],
      },
      TIMELINE_STEP,
    ],
  },

  // ── Plumbing ─────────────────────────────────────────────────────────────
  {
    keywords: ['plumbing', 'plumber', 'pipe', 'pipes', 'water heater', 'drain', 'leak', 'sewer'],
    steps: [
      {
        question: 'What plumbing work is needed?',
        options: [
          { label: 'Leak / Repair',      value: 'leak-repair',        emoji: '💧' },
          { label: 'New Installation',   value: 'new-installation',   emoji: '🚿' },
          { label: 'Pipe Replacement',   value: 'pipe-replacement',   emoji: '🔧' },
          { label: 'Water Heater',       value: 'water-heater',       emoji: '♨️' },
          { label: 'Drain Cleaning',     value: 'drain-cleaning',     emoji: '🪠' },
          { label: 'Other',              value: 'other',              emoji: '🔩' },
        ],
      },
      TIMELINE_STEP,
    ],
  },

  // ── Roofing ──────────────────────────────────────────────────────────────
  {
    keywords: ['roofing', 'roof', 'shingles', 'gutter', 'gutters', 'flashing'],
    steps: [
      {
        question: 'What roofing work do you need?',
        options: [
          { label: 'Repair Leak',        value: 'repair-leak',        emoji: '🌧️' },
          { label: 'Full Replacement',   value: 'full-replacement',   emoji: '🏠' },
          { label: 'New Installation',   value: 'new-installation',   emoji: '🏗️' },
          { label: 'Gutters',            value: 'gutters',            emoji: '🌿' },
          { label: 'Emergency',          value: 'emergency',          emoji: '🚨' },
          { label: 'Inspection',         value: 'inspection',         emoji: '🔍' },
        ],
      },
      TIMELINE_STEP,
    ],
  },

  // ── HVAC ─────────────────────────────────────────────────────────────────
  {
    keywords: ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace', 'ac', 'heat pump', 'ductwork', 'duct'],
    steps: [
      {
        question: 'What HVAC service do you need?',
        options: [
          { label: 'AC Repair',          value: 'ac-repair',          emoji: '❄️' },
          { label: 'Heating Repair',     value: 'heating-repair',     emoji: '🔥' },
          { label: 'New Install',        value: 'new-install',        emoji: '⚙️' },
          { label: 'Maintenance',        value: 'maintenance',        emoji: '🔧' },
          { label: 'Ductwork',           value: 'ductwork',           emoji: '💨' },
          { label: 'Other',              value: 'other',              emoji: '🌡️' },
        ],
      },
      TIMELINE_STEP,
    ],
  },

  // ── Landscaping ──────────────────────────────────────────────────────────
  {
    keywords: ['landscaping', 'landscape', 'lawn', 'tree', 'irrigation', 'hardscape', 'hardscaping', 'snow removal', 'grass', 'sod', 'mowing'],
    steps: [
      {
        question: 'What landscaping work?',
        options: [
          { label: 'Lawn Maintenance',   value: 'lawn-maintenance',   emoji: '✂️' },
          { label: 'Landscaping Design', value: 'landscaping-design', emoji: '🌺' },
          { label: 'Tree Service',       value: 'tree-service',       emoji: '🌳' },
          { label: 'Irrigation',         value: 'irrigation',         emoji: '💦' },
          { label: 'Hardscaping',        value: 'hardscaping',        emoji: '🪨' },
          { label: 'Snow Removal',       value: 'snow-removal',       emoji: '❄️' },
        ],
      },
      TIMELINE_STEP,
    ],
  },

  // ── General Contractor / Construction ────────────────────────────────────
  {
    keywords: ['general', 'contractor', 'construction', 'renovation', 'remodel', 'remodeling', 'addition', 'build', 'builder', 'demolition'],
    steps: [
      {
        question: 'What type of project?',
        options: [
          { label: 'Home Renovation',    value: 'home-renovation',    emoji: '🏠' },
          { label: 'New Construction',   value: 'new-construction',   emoji: '🏗️' },
          { label: 'Commercial Build',   value: 'commercial-build',   emoji: '🏢' },
          { label: 'Addition / Extension', value: 'addition-extension', emoji: '📐' },
          { label: 'Demolition',         value: 'demolition',         emoji: '🔨' },
          { label: 'Other',              value: 'other',              emoji: '🔧' },
        ],
      },
      TIMELINE_STEP,
    ],
  },
];

// ── Fallback set — shown when no keyword matches ──────────────────────────
export const FALLBACK_QUESTION_SET: GuidedQuestionSet = {
  keywords: [],
  steps: [
    {
      question: 'What type of work do you need?',
      options: [
        { label: 'General Contracting', value: 'general-contracting', emoji: '🏗️' },
        { label: 'Electrical',          value: 'electrical',          emoji: '⚡' },
        { label: 'Plumbing',            value: 'plumbing',            emoji: '💧' },
        { label: 'Roofing',             value: 'roofing',             emoji: '🏠' },
        { label: 'HVAC',                value: 'hvac',                emoji: '❄️' },
        { label: 'Other',               value: 'other',               emoji: '🔧' },
      ],
    },
    TIMELINE_STEP,
  ],
};

/**
 * Returns the question steps for a given search query.
 * Matches the query against each set's keywords (case-insensitive).
 * Falls back to the generic set if no match is found.
 */
export function getQuestionsForQuery(query: string): QuestionStep[] {
  const lower = query.toLowerCase();
  for (const set of GUIDED_QUESTION_SETS) {
    if (set.keywords.some((kw) => lower.includes(kw))) {
      return set.steps;
    }
  }
  return FALLBACK_QUESTION_SET.steps;
}
