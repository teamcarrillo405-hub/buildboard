// Category synonym mapping for natural language parsing
export const CATEGORY_SYNONYMS: Record<string, string> = {
  'plumber': 'Plumbing', 'plumbing': 'Plumbing', 'plumbers': 'Plumbing', 'pipe': 'Plumbing',
  'electrician': 'Electrical Contractors', 'electrical': 'Electrical Contractors', 'electric': 'Electrical Contractors', 'wiring': 'Electrical Contractors',
  'roofer': 'Roofing Contractors', 'roofing': 'Roofing Contractors', 'roof': 'Roofing Contractors',
  'hvac': 'HVAC Contractor', 'heating': 'HVAC Contractor', 'air conditioning': 'HVAC Contractor', 'ac': 'HVAC Contractor',
  'concrete': 'Masonry Contractors', 'masonry': 'Masonry Contractors', 'mason': 'Masonry Contractors', 'brick': 'Masonry Contractors',
  'foundation': 'Foundation', 'foundations': 'Foundation',
  'landscaping': 'Landscaping Contractor', 'landscaper': 'Landscaping Contractor', 'lawn': 'Landscaping Contractor', 'yard': 'Landscaping Contractor',
  'painter': 'Painting Contractor', 'painting': 'Painting Contractor', 'paint': 'Painting Contractor',
  'carpenter': 'Finish Carpentry Contractors', 'carpentry': 'Finish Carpentry Contractors', 'woodwork': 'Finish Carpentry Contractors',
  'flooring': 'Flooring Contractors', 'floor': 'Flooring Contractors', 'tile': 'Tile and Terrazzo Contractors',
  'drywall': 'Drywall and Insulation Contractors', 'insulation': 'Drywall and Insulation Contractors',
  'siding': 'Siding Contractors',
  'commercial': 'Commercial Building Construction', 'commercial construction': 'Commercial Building Construction',
  'residential': 'Residential Remodelers', 'remodel': 'Residential Remodelers', 'remodeling': 'Residential Remodelers', 'renovation': 'Residential Remodelers',
  'general contractor': 'General Contractor', 'gc': 'General Contractor',
  'demolition': 'Demolition Contractor', 'demo': 'Demolition Contractor',
  'fencing': 'Fence Contractor', 'fence': 'Fence Contractor',
  'gutter': 'Gutter Contractor', 'gutters': 'Gutter Contractor',
  'welding': 'Welding Contractor', 'welder': 'Welding Contractor',
  'deck': 'Deck Builder', 'decks': 'Deck Builder', 'patio': 'Deck and Patio Builders',
  'kitchen': 'Kitchen remodeling contractors', 'bathroom': 'Bathroom remodeling contractors',
  'window': 'Window and Door Contractor', 'windows': 'Window and Door Contractor', 'door': 'Window and Door Contractor',
  'solar': 'Solar panel installation', 'solar panel': 'Solar panel installation',
  'paving': 'Asphalt Paving Contractor', 'asphalt': 'Asphalt Paving Contractor',
  'excavation': 'Excavation Contractor', 'excavating': 'Excavation Contractor',
};

// US state name -> code mapping
export const STATE_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};

// Also map abbreviations
const STATE_CODES = new Set(Object.values(STATE_MAP));

export const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_MAP).map(([name, code]) => [code, name.replace(/\b\w/g, c => c.toUpperCase())])
);

export interface ChatParsed {
  intent: 'find' | 'stats' | 'compare' | 'recommend';
  category: string | null;
  state: string | null;
  city: string | null;
  minRating: number | null;
  emergency: boolean;
  freeEstimate: boolean;
  warranty: boolean;
  sortBest: boolean;
}

export function parseChat(message: string): ChatParsed {
  const lower = message.toLowerCase().trim();
  const result: ChatParsed = { intent: 'find', category: null, state: null, city: null, minRating: null, emergency: false, freeEstimate: false, warranty: false, sortBest: false };

  // Detect intent
  if (/how many|count|total|number of/.test(lower)) result.intent = 'stats';
  else if (/best|top|highest.?rated|compare|#1|number one/.test(lower)) { result.intent = 'compare'; result.sortBest = true; }
  else if (/recommend|suggest|help me find|i need|looking for|who can|where can/.test(lower)) result.intent = 'recommend';
  else result.intent = 'find';

  // Extract category (try multi-word first, then single-word)
  const sortedSynonyms = Object.keys(CATEGORY_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const synonym of sortedSynonyms) {
    if (lower.includes(synonym)) {
      result.category = CATEGORY_SYNONYMS[synonym];
      break;
    }
  }

  // Extract state -- check full names first, then 2-letter codes
  for (const [name, code] of Object.entries(STATE_MAP)) {
    if (lower.includes(name)) { result.state = code; break; }
  }
  if (!result.state) {
    const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length === 2 && STATE_CODES.has(w.toUpperCase())) { result.state = w.toUpperCase(); break; }
    }
  }

  // Extract city -- look for "in [City]" pattern, exclude state names
  const inMatch = lower.match(/\bin\s+([a-z][a-z\s]{2,30})(?:,|\s|$)/);
  if (inMatch) {
    let candidate = inMatch[1].trim();
    // Remove trailing state name/code
    for (const [name] of Object.entries(STATE_MAP)) {
      if (candidate.endsWith(name)) candidate = candidate.replace(name, '').trim();
    }
    candidate = candidate.replace(/\b[a-z]{2}$/i, '').trim();
    // Don't use it if it's a category synonym or state name
    if (candidate && !CATEGORY_SYNONYMS[candidate] && !STATE_MAP[candidate] && candidate.length > 1) {
      result.city = candidate.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Extract features
  if (/emergency|urgent|asap|24.?7|immediate/.test(lower)) result.emergency = true;
  if (/free estimate|free quote|no.?cost estimate/.test(lower)) result.freeEstimate = true;
  if (/warranty|guarantee/.test(lower)) result.warranty = true;

  // Extract rating
  if (/highly rated|good review|well.?rated|4\.5|five star|5 star/.test(lower)) result.minRating = 4.5;
  else if (/good|decent|4 star|4\.0/.test(lower) && !/no good/.test(lower)) result.minRating = 4.0;

  // Best/top implies sort by rating
  if (/best|top|highest|#1/.test(lower)) result.sortBest = true;

  return result;
}
