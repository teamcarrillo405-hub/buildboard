/**
 * Yelp Fusion API category alias → BuildBoard category name mapping.
 *
 * Yelp businesses can have multiple categories; we use the first matching
 * alias from YELP_TO_BUILDBOARD as the primary category for the company.
 * If no alias matches, we fall back to 'General Contractor'.
 */

export const YELP_TO_BUILDBOARD: Record<string, string> = {
  plumbing: 'Plumbing',
  electricians: 'Electrical',
  roofing: 'Roofing',
  hvac: 'HVAC',
  masonry_concrete: 'Masonry Contractors',
  landscaping: 'Landscaping',
  generalcontractors: 'General Contractor',
  painters: 'Painting',
  flooring: 'Flooring',
  drywall: 'Drywall',
  carpentry: 'Carpentry',
  tiling: 'Tile Installation',
  waterproofing: 'Waterproofing',
  demolitionservices: 'Demolition',
  fencing: 'Fencing',
  insulationinstallation: 'Insulation',
  windows_installation: 'Windows & Doors',
  gutterservices: 'Gutters',
  concretework: 'Masonry Contractors',
  poolcleaners: 'Pool Services',
  solarinstallation: 'Solar',
  drywallinstallation: 'Drywall',
  stonecutting: 'Masonry Contractors',
  handyman: 'Handyman',
  cabinets: 'Cabinets & Millwork',
  countertopinstall: 'Countertops',
  irrigation: 'Irrigation',
  tree_services: 'Tree Services',
};

/**
 * All Yelp category aliases to sweep during full ingestion.
 * Ordered by expected density (high-volume categories first).
 */
export const CATEGORY_SWEEP: string[] = Object.keys(YELP_TO_BUILDBOARD);

/**
 * California metro areas to sweep.
 * These 15 cities cover ~95% of CA's licensed contractor activity.
 */
export const CA_METROS: string[] = [
  'Los Angeles, CA',
  'San Francisco, CA',
  'San Diego, CA',
  'San Jose, CA',
  'Sacramento, CA',
  'Fresno, CA',
  'Long Beach, CA',
  'Oakland, CA',
  'Bakersfield, CA',
  'Riverside, CA',
  'Anaheim, CA',
  'Stockton, CA',
  'Modesto, CA',
  'Fremont, CA',
  'Irvine, CA',
];

/**
 * All 49 non-California US states + DC metro coverage.
 * 119 metros total — sized by state population and contractor density.
 * Large states: 4-6 metros | Medium: 3 | Small: 1-2
 *
 * API cost estimate: 119 metros × 37 categories × ~1.5 pages avg ≈ 6,600 requests.
 * At Yelp's free-tier limit (5,000 req/day) this runs over ~1.5 days.
 */
export const ALL_US_METROS: string[] = [
  // ── Texas (6) ────────────────────────────
  'Houston, TX',
  'Dallas, TX',
  'San Antonio, TX',
  'Austin, TX',
  'Fort Worth, TX',
  'El Paso, TX',

  // ── Florida (5) ──────────────────────────
  'Miami, FL',
  'Tampa, FL',
  'Orlando, FL',
  'Jacksonville, FL',
  'Fort Lauderdale, FL',

  // ── New York (4) ─────────────────────────
  'New York City, NY',
  'Buffalo, NY',
  'Rochester, NY',
  'Yonkers, NY',

  // ── Illinois (4) ─────────────────────────
  'Chicago, IL',
  'Aurora, IL',
  'Naperville, IL',
  'Rockford, IL',

  // ── Pennsylvania (4) ─────────────────────
  'Philadelphia, PA',
  'Pittsburgh, PA',
  'Allentown, PA',
  'Erie, PA',

  // ── Ohio (4) ─────────────────────────────
  'Columbus, OH',
  'Cleveland, OH',
  'Cincinnati, OH',
  'Toledo, OH',

  // ── Georgia (4) ──────────────────────────
  'Atlanta, GA',
  'Augusta, GA',
  'Savannah, GA',
  'Macon, GA',

  // ── North Carolina (4) ───────────────────
  'Charlotte, NC',
  'Raleigh, NC',
  'Greensboro, NC',
  'Durham, NC',

  // ── Michigan (4) ─────────────────────────
  'Detroit, MI',
  'Grand Rapids, MI',
  'Warren, MI',
  'Lansing, MI',

  // ── Arizona (4) ──────────────────────────
  'Phoenix, AZ',
  'Tucson, AZ',
  'Mesa, AZ',
  'Scottsdale, AZ',

  // ── Washington (3) ───────────────────────
  'Seattle, WA',
  'Spokane, WA',
  'Tacoma, WA',

  // ── Colorado (3) ─────────────────────────
  'Denver, CO',
  'Colorado Springs, CO',
  'Aurora, CO',

  // ── Tennessee (3) ────────────────────────
  'Nashville, TN',
  'Memphis, TN',
  'Knoxville, TN',

  // ── Indiana (3) ──────────────────────────
  'Indianapolis, IN',
  'Fort Wayne, IN',
  'Evansville, IN',

  // ── Massachusetts (3) ────────────────────
  'Boston, MA',
  'Worcester, MA',
  'Springfield, MA',

  // ── Missouri (3) ─────────────────────────
  'Kansas City, MO',
  'St. Louis, MO',
  'Springfield, MO',

  // ── Maryland (3) ─────────────────────────
  'Baltimore, MD',
  'Frederick, MD',
  'Rockville, MD',

  // ── Virginia (3) ─────────────────────────
  'Virginia Beach, VA',
  'Richmond, VA',
  'Arlington, VA',

  // ── New Jersey (3) ───────────────────────
  'Newark, NJ',
  'Jersey City, NJ',
  'Paterson, NJ',

  // ── Wisconsin (3) ────────────────────────
  'Milwaukee, WI',
  'Madison, WI',
  'Green Bay, WI',

  // ── Minnesota (3) ────────────────────────
  'Minneapolis, MN',
  'St. Paul, MN',
  'Rochester, MN',

  // ── Nevada (3) ───────────────────────────
  'Las Vegas, NV',
  'Henderson, NV',
  'Reno, NV',

  // ── South Carolina (2) ───────────────────
  'Columbia, SC',
  'Charleston, SC',

  // ── Oregon (2) ───────────────────────────
  'Portland, OR',
  'Salem, OR',

  // ── Alabama (2) ──────────────────────────
  'Birmingham, AL',
  'Montgomery, AL',

  // ── Louisiana (2) ────────────────────────
  'New Orleans, LA',
  'Baton Rouge, LA',

  // ── Kentucky (2) ─────────────────────────
  'Louisville, KY',
  'Lexington, KY',

  // ── Oklahoma (2) ─────────────────────────
  'Oklahoma City, OK',
  'Tulsa, OK',

  // ── Connecticut (2) ──────────────────────
  'Bridgeport, CT',
  'Hartford, CT',

  // ── Utah (2) ─────────────────────────────
  'Salt Lake City, UT',
  'Provo, UT',

  // ── Nebraska (2) ─────────────────────────
  'Omaha, NE',
  'Lincoln, NE',

  // ── Iowa (2) ─────────────────────────────
  'Des Moines, IA',
  'Cedar Rapids, IA',

  // ── Kansas (2) ───────────────────────────
  'Wichita, KS',
  'Overland Park, KS',

  // ── Arkansas (2) ─────────────────────────
  'Little Rock, AR',
  'Fayetteville, AR',

  // ── New Mexico (2) ───────────────────────
  'Albuquerque, NM',
  'Las Cruces, NM',

  // ── Mississippi (2) ──────────────────────
  'Jackson, MS',
  'Gulfport, MS',

  // ── Idaho (2) ────────────────────────────
  'Boise, ID',
  'Meridian, ID',

  // ── New Hampshire (2) ────────────────────
  'Manchester, NH',
  'Nashua, NH',

  // ── West Virginia (2) ────────────────────
  'Charleston, WV',
  'Huntington, WV',

  // ── Montana (2) ──────────────────────────
  'Billings, MT',
  'Missoula, MT',

  // ── South Dakota (2) ─────────────────────
  'Sioux Falls, SD',
  'Rapid City, SD',

  // ── North Dakota (2) ─────────────────────
  'Fargo, ND',
  'Bismarck, ND',

  // ── Small / single-metro states ──────────
  'Honolulu, HI',
  'Anchorage, AK',
  'Providence, RI',
  'Washington, DC',
  'Wilmington, DE',
  'Burlington, VT',
  'Cheyenne, WY',
  'Portland, ME',
];

/**
 * Given a list of Yelp category objects, return the best-matching
 * BuildBoard category name and the secondary Yelp title as subCategory.
 */
export function mapYelpCategories(
  categories: { alias: string; title: string }[],
): { category: string; subCategory: string | null } {
  for (const cat of categories) {
    const mapped = YELP_TO_BUILDBOARD[cat.alias];
    if (mapped) {
      // Use the next unmatched category as subCategory (more specific)
      const sub = categories.find(c => c.alias !== cat.alias)?.title ?? null;
      return { category: mapped, subCategory: sub };
    }
  }
  return { category: 'General Contractor', subCategory: categories[0]?.title ?? null };
}
