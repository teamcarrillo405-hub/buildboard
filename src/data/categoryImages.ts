/**
 * Category-based placeholder images using Unsplash direct URLs.
 * These provide attractive fallback images when no company photo or
 * R2 category image is available.
 *
 * All URLs use Unsplash's free image CDN with w=400 for card-size images.
 */

export const CATEGORY_IMAGES: Record<string, string> = {
  // ---- Top categories from the database (sorted by frequency) ----

  'Foundation':
    'https://images.unsplash.com/photo-1590650213165-c1fef80648c4?w=400&q=80&auto=format&fit=crop',
  'Other Specialty Trade Contractors':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
  'Site Preparation Contractors':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
  'Highway':
    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=400&q=80&auto=format&fit=crop',
  'Flooring Contractors':
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80&auto=format&fit=crop',
  'Plumbing':
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80&auto=format&fit=crop',
  'Electrical Contractors':
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80&auto=format&fit=crop',
  'Building Finishing Contractors':
    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&q=80&auto=format&fit=crop',
  'Commercial Building Construction':
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80&auto=format&fit=crop',
  'Residential Remodelers':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Glass and Glazing Contractors':
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&q=80&auto=format&fit=crop',
  'Drywall and Insulation Contractors':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Siding Contractors':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Other Heavy and Civil Engineering Construction':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
  'Finish Carpentry Contractors':
    'https://images.unsplash.com/photo-1601058272524-0611e132f3c9?w=400&q=80&auto=format&fit=crop',
  'Other Building Finishing Contractors':
    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&q=80&auto=format&fit=crop',
  'New Single-Family Housing Construction':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Framing Contractors':
    'https://images.unsplash.com/photo-1601058272524-0611e132f3c9?w=400&q=80&auto=format&fit=crop',
  'All Other Specialty Trade Contractors':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
  'Painting and Wall Covering Contractors':
    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&q=80&auto=format&fit=crop',
  'Structural Steel and Precast Concrete Contractors':
    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&q=80&auto=format&fit=crop',
  'Masonry Contractors':
    'https://images.unsplash.com/photo-1590650516494-0c8e4a4dd67e?w=400&q=80&auto=format&fit=crop',
  'Roofing Contractors':
    'https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?w=400&q=80&auto=format&fit=crop',
  'Poured Concrete Foundation and Structure Contractors':
    'https://images.unsplash.com/photo-1590650213165-c1fef80648c4?w=400&q=80&auto=format&fit=crop',
  'Tile and Terrazzo Contractors':
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80&auto=format&fit=crop',
  'New Multifamily Housing Construction':
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80&auto=format&fit=crop',
  'Power and Communication Line Construction':
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80&auto=format&fit=crop',
  'Water and Sewer Line Construction':
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80&auto=format&fit=crop',
  'Other Building Equipment Contractors':
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&q=80&auto=format&fit=crop',
  'Other Foundation':
    'https://images.unsplash.com/photo-1590650213165-c1fef80648c4?w=400&q=80&auto=format&fit=crop',
  'Oil and Gas Pipeline Construction':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
  'Residential Building Construction':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Utility System Construction':
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80&auto=format&fit=crop',
  'Building Equipment Contractors':
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&q=80&auto=format&fit=crop',
  'Residential remodelers':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Land Subdivision':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
  'Plumbing Contractor':
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80&auto=format&fit=crop',
  'Fence Contractor':
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80&auto=format&fit=crop',
  'Insulation Contractor':
    'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&q=80&auto=format&fit=crop',
  'Concrete Contractor':
    'https://images.unsplash.com/photo-1590650213165-c1fef80648c4?w=400&q=80&auto=format&fit=crop',
  'Carpentry Contractor':
    'https://images.unsplash.com/photo-1601058272524-0611e132f3c9?w=400&q=80&auto=format&fit=crop',
  'HVAC Contractor':
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&q=80&auto=format&fit=crop',
  'Tile Contractor':
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80&auto=format&fit=crop',
  'Roofing Contractor':
    'https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?w=400&q=80&auto=format&fit=crop',
  'Drywall Contractor':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Electrical Contractor':
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80&auto=format&fit=crop',
  'Flooring Contractor':
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80&auto=format&fit=crop',
  'Window and Door Contractor':
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&q=80&auto=format&fit=crop',
  'Welding Contractor':
    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&q=80&auto=format&fit=crop',
  'Deck Builder':
    'https://images.unsplash.com/photo-1601058272524-0611e132f3c9?w=400&q=80&auto=format&fit=crop',
  'Demolition Contractor':
    'https://images.unsplash.com/photo-1565117173939-69caf04aab38?w=400&q=80&auto=format&fit=crop',
  'Asphalt Paving Contractor':
    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=400&q=80&auto=format&fit=crop',
  'Gutter Contractor':
    'https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?w=400&q=80&auto=format&fit=crop',
  'Landscaping Contractor':
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80&auto=format&fit=crop',
  'Painting Contractor':
    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&q=80&auto=format&fit=crop',
  'Siding Contractor':
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=400&q=80&auto=format&fit=crop',
  'Excavation Contractor':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
  'Masonry Contractor':
    'https://images.unsplash.com/photo-1590650516494-0c8e4a4dd67e?w=400&q=80&auto=format&fit=crop',
  'Nonresidential Building Construction':
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80&auto=format&fit=crop',
  'Landscaping Services':
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80&auto=format&fit=crop',

  // Default for anything not matched
  '_default':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80&auto=format&fit=crop',
};

/**
 * Get an Unsplash category image URL.
 * Tries exact match, then keyword match, then default.
 */
export function getCategoryImage(category: string | undefined): string {
  if (!category) return CATEGORY_IMAGES['_default'];

  // Exact match
  if (CATEGORY_IMAGES[category]) return CATEGORY_IMAGES[category];

  // Keyword match -- check if any key is a substring of the category (or vice versa)
  const lower = category.toLowerCase();
  for (const [key, url] of Object.entries(CATEGORY_IMAGES)) {
    if (key === '_default') continue;
    if (
      lower.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(lower.split(' ')[0])
    ) {
      return url;
    }
  }

  return CATEGORY_IMAGES['_default'];
}
