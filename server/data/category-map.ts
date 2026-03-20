/**
 * Category normalization map for BuildBoard image generation.
 *
 * Maps all 163 distinct raw database categories to ~55 visual image groups (slugs).
 * Each slug has a corresponding AI image generation prompt.
 *
 * Normalization rules applied:
 * 1. Case normalize: "Plumbing" = "plumbing"
 * 2. Suffix merge: "Plumbing Contractor" = "Plumbing Contractors" = "Plumbing" -> plumbing
 * 3. Compound merge: "Plumbing and HVAC contractors" -> plumbing (primary trade)
 * 4. Subtype to parent: "Kitchen remodeling contractors" -> residential-remodelers
 * 5. Activity to trade: "Foundation repair" -> foundation
 */

// ---------------------------------------------------------------------------
// 1. CATEGORY_TO_IMAGE_SLUG — every raw DB category -> normalized image slug
// ---------------------------------------------------------------------------
export const CATEGORY_TO_IMAGE_SLUG: Record<string, string> = {
  // --- Accessibility ---
  'Accessibility modifications': 'accessibility',

  // --- Waste Management ---
  'All Other Miscellaneous Waste Management Services': 'waste-management',
  'Hazardous Waste Collection': 'waste-management',
  'Hazardous Waste Treatment and Disposal': 'waste-management',
  'Other Nonhazardous Waste Treatment and Disposal': 'waste-management',
  'Other Waste Collection': 'waste-management',
  'Solid Waste Collection': 'waste-management',
  'Solid Waste Combustors and Incinerators': 'waste-management',
  'Solid Waste Landfill': 'waste-management',

  // --- General Specialty Trade ---
  'All Other Specialty Trade Contractors': 'specialty-trade',
  'All other specialty trade contractors': 'specialty-trade',
  'Other Specialty Trade Contractors': 'specialty-trade',

  // --- Architecture & Design ---
  'Architectural Services': 'architecture',
  'Drafting Services': 'architecture',
  'Engineering Services': 'engineering',
  'Industrial Design Services': 'engineering',
  'Interior Design Services': 'interior-design',

  // --- Abatement & Remediation ---
  'Asbestos abatement contractors': 'abatement-remediation',
  'Lead paint abatement contractors': 'abatement-remediation',
  'Mold remediation specialists': 'abatement-remediation',
  'Remediation Services': 'abatement-remediation',
  'Fire and water damage restoration': 'disaster-restoration',
  'Disaster recovery contractors': 'disaster-restoration',

  // --- Asphalt / Paving ---
  'Asphalt Paving Contractor': 'asphalt-paving',
  'Asphalt paving contractors': 'asphalt-paving',

  // --- Basement ---
  'Basement finishing': 'basement',
  'Basement finishing contractors': 'basement',

  // --- Bathroom Remodeling ---
  'Bathroom remodeling': 'bathroom-remodeling',
  'Bathroom remodeling contractors': 'bathroom-remodeling',

  // --- Building Equipment ---
  'Building Equipment Contractors': 'building-equipment',
  'Other Building Equipment Contractors': 'building-equipment',
  'Other building equipment contractors': 'building-equipment',

  // --- Building Finishing ---
  'Building Finishing Contractors': 'building-finishing',
  'Other Building Finishing Contractors': 'building-finishing',
  'Other building finishing contractors': 'building-finishing',

  // --- Building Inspection ---
  'Building Inspection Services': 'building-inspection',
  'Testing Laboratories': 'building-inspection',

  // --- Cabinets & Countertops ---
  'Cabinet installation': 'cabinets-countertops',
  'Countertop installation': 'cabinets-countertops',

  // --- Carpentry ---
  'Carpentry Contractor': 'carpentry',
  'Finish Carpentry Contractors': 'carpentry',
  'Finish carpentry contractors': 'carpentry',

  // --- Carpet / Flooring ---
  'Carpet installation': 'flooring',
  'Flooring Contractor': 'flooring',
  'Flooring Contractors': 'flooring',
  'Flooring contractors': 'flooring',
  'Hardwood flooring': 'flooring',

  // --- Commercial Construction ---
  'Commercial Building Construction': 'commercial-construction',
  'Commercial building construction': 'commercial-construction',
  'Nonresidential Building Construction': 'commercial-construction',

  // --- Concrete ---
  'Concrete Contractor': 'concrete',
  'Concrete Contractors': 'concrete',
  'Concrete contractors': 'concrete',
  'Concrete flatwork': 'concrete',
  'Poured Concrete Foundation and Structure Contractors': 'concrete',
  'Poured concrete foundation and structure': 'concrete',
  'Poured concrete foundation and structure contractors': 'concrete',

  // --- Decks & Patios ---
  'Deck Builder': 'decks-patios',
  'Deck and patio builders': 'decks-patios',
  'Deck and patio construction': 'decks-patios',

  // --- Demolition ---
  'Demolition Contractor': 'demolition',
  'Demolition contractors': 'demolition',

  // --- Doors ---
  'Door installation': 'doors-windows',
  'Window and Door Contractor': 'doors-windows',
  'Window installation': 'doors-windows',

  // --- Drywall & Insulation ---
  'Drywall Contractor': 'drywall',
  'Drywall and Insulation Contractors': 'drywall',
  'Drywall and insulation contractors': 'drywall',
  'Insulation Contractor': 'insulation',
  'Insulation contractors': 'insulation',

  // --- Electrical ---
  'Electrical Contractor': 'electrical',
  'Electrical Contractors': 'electrical',
  'Electrical contractors': 'electrical',

  // --- Excavation & Site Prep ---
  'Excavation Contractor': 'excavation',
  'Excavation contractors': 'excavation',
  'Site Preparation Contractors': 'site-preparation',
  'Site preparation contractors': 'site-preparation',
  'Land Subdivision': 'site-preparation',
  'Land subdivision': 'site-preparation',

  // --- Facilities Support ---
  'Facilities Support Services': 'facilities-support',
  'Janitorial Services': 'facilities-support',
  'Other Services to Buildings and Dwellings': 'facilities-support',

  // --- Fencing ---
  'Fence Contractor': 'fencing',
  'Fence installation': 'fencing',
  'Fence installation contractors': 'fencing',

  // --- Foundation ---
  'Foundation': 'foundation',
  'Foundation Contractors': 'foundation',
  'Foundation repair': 'foundation',
  'Other Foundation': 'foundation',
  'Other foundation': 'foundation',

  // --- Framing ---
  'Framing Contractors': 'framing',
  'Framing contractors': 'framing',

  // --- Garage ---
  'Garage builders': 'garage',
  'Garage construction': 'garage',

  // --- General Contractor ---
  'General Contractor': 'general-contractor',
  'General building contractor': 'general-contractor',
  'General building contractors': 'general-contractor',

  // --- Glass & Glazing ---
  'Glass and Glazing Contractors': 'glass-glazing',
  'Glass and glazing contractors': 'glass-glazing',

  // --- Gutters ---
  'Gutter Contractor': 'gutters',
  'Gutter installation': 'gutters',

  // --- HVAC ---
  'HVAC Contractor': 'hvac',
  'Heating and air-conditioning contractors': 'hvac',
  'Plumbing and HVAC contractors': 'plumbing',

  // --- Handyman ---
  'Handyman services': 'handyman',

  // --- Heavy & Civil Engineering ---
  'Highway': 'heavy-civil',
  'Other Heavy and Civil Engineering Construction': 'heavy-civil',
  'Other heavy and civil engineering construction': 'heavy-civil',
  'Process': 'heavy-civil',
  'Utility System Construction': 'heavy-civil',

  // --- Industrial Construction ---
  'Industrial Building Construction': 'industrial-construction',
  'Industrial building construction': 'industrial-construction',

  // --- Kitchen Remodeling ---
  'Kitchen remodeling': 'kitchen-remodeling',
  'Kitchen remodeling contractors': 'kitchen-remodeling',

  // --- Landscaping ---
  'Landscaping Contractor': 'landscaping',
  'Landscaping Services': 'landscaping',
  'Lawn sprinkler systems': 'landscaping',
  'Swimming pool construction': 'swimming-pools',
  'Swimming pool contractors': 'swimming-pools',

  // --- Masonry ---
  'Masonry Contractor': 'masonry',
  'Masonry Contractors': 'masonry',
  'Masonry contractors': 'masonry',

  // --- New Housing ---
  'New Housing Operative Builders': 'new-housing',
  'New Multifamily Housing Construction': 'new-housing',
  'New Single-Family Housing Construction': 'new-housing',
  'New multifamily housing construction': 'new-housing',
  'New single-family housing construction': 'new-housing',

  // --- Oil & Gas Pipeline ---
  'Oil and Gas Pipeline Construction': 'pipeline',
  'Oil and gas pipeline construction': 'pipeline',

  // --- Painting ---
  'Painting Contractor': 'painting',
  'Painting and Wall Covering Contractors': 'painting',
  'Painting and wall covering contractors': 'painting',

  // --- Plumbing ---
  'Plumbing': 'plumbing',
  'Plumbing Contractor': 'plumbing',
  'Plumbing Contractors': 'plumbing',

  // --- Power & Communication Lines ---
  'Power and Communication Line Construction': 'power-lines',
  'Power and communication line construction': 'power-lines',

  // --- Residential Construction ---
  'Residential Building Construction': 'residential-construction',
  'Residential additions contractors': 'residential-construction',

  // --- Residential Remodeling ---
  'Residential Remodelers': 'residential-remodelers',
  'Residential remodelers': 'residential-remodelers',

  // --- Roofing ---
  'Roofing Contractor': 'roofing',
  'Roofing Contractors': 'roofing',
  'Roofing contractors': 'roofing',

  // --- Security ---
  'Security system installation': 'security-systems',

  // --- Septic ---
  'Septic Tank and Related Services': 'septic',
  'Septic system installation': 'septic',

  // --- Siding ---
  'Siding Contractor': 'siding',
  'Siding Contractors': 'siding',
  'Siding contractors': 'siding',

  // --- Solar ---
  'Solar panel installation': 'solar',

  // --- Structural Steel ---
  'Structural Steel and Precast Concrete Contractors': 'structural-steel',
  'Structural steel and precast concrete': 'structural-steel',
  'Structural steel and precast concrete contractors': 'structural-steel',

  // --- Tile ---
  'Tile Contractor': 'tile',
  'Tile and Terrazzo Contractors': 'tile',
  'Tile and terrazzo contractors': 'tile',

  // --- Water & Sewer ---
  'Water and Sewer Line Construction': 'water-sewer',
  'Water and Sewer Line and Related Structures Construction': 'water-sewer',
  'Water and sewer line construction': 'water-sewer',

  // --- Waterproofing ---
  'Waterproofing contractors': 'waterproofing',

  // --- Welding ---
  'Welding Contractor': 'welding',

  // --- Well Drilling ---
  'Well drilling': 'well-drilling',
};

// ---------------------------------------------------------------------------
// 2. IMAGE_SLUGS — unique slug values derived from the map
// ---------------------------------------------------------------------------
export const IMAGE_SLUGS: string[] = [
  ...new Set(Object.values(CATEGORY_TO_IMAGE_SLUG)),
].sort();

// ---------------------------------------------------------------------------
// 3. CATEGORY_PROMPTS — AI image generation prompt per slug
// ---------------------------------------------------------------------------
export const CATEGORY_PROMPTS: Record<string, string> = {
  'abatement-remediation':
    'Professional hazardous material abatement team in full protective suits removing asbestos from a commercial building interior, containment barriers visible, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'accessibility':
    'Professional contractor installing an ADA-compliant wheelchair ramp at a commercial building entrance, concrete work and handrails, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'architecture':
    'Professional architect reviewing blueprints and 3D building models at a modern drafting desk, construction plans spread out, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'asphalt-paving':
    'Professional paving crew operating a commercial asphalt paver on a large parking lot, steam rising from fresh asphalt, roller compactor in background, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'basement':
    'Professional contractor finishing a basement space with framing and drywall, modern basement renovation in progress, exposed utilities being enclosed, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'bathroom-remodeling':
    'Professional contractor installing a modern walk-in shower with glass enclosure and tile work in a high-end bathroom renovation, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'building-equipment':
    'Professional building equipment contractor installing a commercial elevator system in a multi-story building shaft, heavy machinery and safety equipment visible, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'building-finishing':
    'Professional finishing contractor applying final trim and molding in a new commercial office space, detailed millwork and crown molding, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'building-inspection':
    'Professional building inspector with clipboard and hard hat examining structural elements of a commercial building under construction, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'cabinets-countertops':
    'Professional cabinet installer fitting custom kitchen cabinetry with granite countertops in a modern kitchen renovation, precise measurements and quality craftsmanship, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'carpentry':
    'Professional finish carpenter installing custom built-in shelving and detailed woodwork in a high-end residential interior, hand tools and precision joinery, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'commercial-construction':
    'Large commercial building under construction with steel framing and multiple floors, construction cranes and workers in hard hats, active job site, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'concrete':
    'Professional concrete crew pouring and finishing a large commercial foundation, concrete truck and workers with trowels smoothing wet concrete, rebar grid visible, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'decks-patios':
    'Professional deck builder constructing a large composite deck with built-in seating on the back of a residential home, power tools and lumber visible, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'demolition':
    'Professional demolition contractor operating heavy equipment to carefully demolish a commercial structure, excavator with demolition attachment, controlled demolition site with safety barriers, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'disaster-restoration':
    'Professional disaster restoration team using industrial equipment to dry and restore a flood-damaged commercial interior, dehumidifiers and air movers in operation, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'doors-windows':
    'Professional window installer fitting a large energy-efficient window into a residential frame, level and shims visible, new window installation in progress, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'drywall':
    'Professional drywall installer hanging and taping sheetrock in a new commercial interior, stilts and taping tools, smooth finished walls in progress, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'electrical':
    'Licensed electrician working on a commercial electrical panel with organized color-coded wiring, multimeter in hand, professional safety equipment, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'engineering':
    'Professional engineer at a desk reviewing structural engineering calculations with computer-aided design software on multiple monitors, building plans and structural models, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'excavation':
    'Professional excavation contractor operating a large hydraulic excavator digging a commercial building foundation, dirt piles and grading stakes visible, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'facilities-support':
    'Professional facilities maintenance team performing building systems maintenance in a commercial property, cleaning and inspection equipment, well-maintained building interior, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'fencing':
    'Professional fence installer building a tall commercial chain-link security fence with barbed wire top, post hole digger and fence stretcher tools, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'flooring':
    'Professional flooring installer laying hardwood planks in a spacious commercial office, knee pads and pneumatic nailer, beautiful wood grain pattern taking shape, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'foundation':
    'Professional foundation contractor repairing a commercial building foundation with hydraulic piers, exposed foundation wall with crack repair in progress, structural reinforcement, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'framing':
    'Professional framing crew raising wall frames on a new residential construction site, stud walls being tilted up, carpenters with nail guns and hard hats, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'garage':
    'Professional contractor building a detached garage structure with framing and roof trusses, new garage construction in progress on a residential property, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'general-contractor':
    'Professional general contractor overseeing a large construction site with multiple trades working, clipboard and blueprints in hand, hard hat and safety vest, bustling job site, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'glass-glazing':
    'Professional glazier installing a large commercial storefront glass panel with suction cups and precision tools, curtain wall system, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'gutters':
    'Professional gutter installer mounting seamless aluminum gutters on a commercial building, gutter machine and ladder, downspout installation, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'handyman':
    'Professional handyman with a well-organized tool belt performing general home repairs, fixing a door and doing minor electrical work in a residential setting, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'heavy-civil':
    'Large heavy civil engineering construction project with earth-moving equipment building a highway overpass, cranes and heavy machinery, massive scale infrastructure, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'hvac':
    'Professional HVAC technician installing a large commercial rooftop air conditioning unit, ductwork and refrigerant lines visible, professional tools and gauges, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'industrial-construction':
    'Large industrial facility under construction with steel beams and heavy equipment, manufacturing plant or warehouse being built, industrial scale construction, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'insulation':
    'Professional insulation contractor installing spray foam insulation in a commercial building wall cavity, protective gear and spray equipment, energy efficiency upgrade, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'interior-design':
    'Professional interior designer reviewing fabric swatches and material samples in a modern design studio, mood boards and color palettes on display, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'kitchen-remodeling':
    'Professional contractor installing custom kitchen cabinets and a large quartz island in a modern kitchen renovation, open-concept layout taking shape, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'landscaping':
    'Professional landscaping crew installing a commercial hardscape with pavers, retaining walls, and irrigation system, mature plantings and design features, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'masonry':
    'Professional mason laying brick on a commercial building facade, scaffolding and mortar, precise brickwork pattern, skilled craftsmanship, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'new-housing':
    'New residential housing development under construction with multiple homes in various stages of framing and finishing, active subdivision construction site, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'painting':
    'Professional commercial painter spraying a large office interior with airless spray equipment, crisp masking tape lines, fresh coat of paint being applied, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'pipeline':
    'Professional pipeline construction crew welding large-diameter steel pipe in an open trench, pipe-laying equipment and welding sparks, energy infrastructure project, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'plumbing':
    'Professional plumber installing copper pipes and a commercial water heater in a mechanical room, organized pipework and fittings, professional tools, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'power-lines':
    'Professional lineworker installing high-voltage power lines on a utility pole, bucket truck and safety equipment, electrical transmission infrastructure, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'residential-construction':
    'New residential home under construction showing framing and roof structure, lumber and building materials on site, single-family home being built, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'residential-remodelers':
    'Professional remodeling contractor renovating a residential living space, open walls showing new framing and updated wiring, home transformation in progress, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'roofing':
    'Professional roofing crew installing architectural shingles on a large commercial building, aerial perspective showing organized roofing materials, safety harnesses, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'security-systems':
    'Professional security system installer mounting surveillance cameras and access control panels on a commercial building, wiring and network equipment, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'septic':
    'Professional septic system contractor installing a large concrete septic tank in an excavated pit, backhoe and plumbing connections, residential property, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'siding':
    'Professional siding contractor installing vinyl siding on a large residential home exterior, scaffolding and precise alignment, house wrap visible underneath, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'site-preparation':
    'Professional site preparation crew grading and compacting land for new construction, bulldozer and grader equipment, survey stakes and level ground, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'solar':
    'Professional solar panel installation team mounting photovoltaic panels on a commercial rooftop, racking system and inverter equipment, clean energy installation, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'specialty-trade':
    'Professional specialty trade contractor performing precision work on a commercial construction site, specialized tools and equipment, skilled craftsmanship, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'structural-steel':
    'Professional ironworker connecting structural steel beams on a high-rise construction site, bolting and welding steel framing, crane lifting beams, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'swimming-pools':
    'Professional pool contractor building a commercial swimming pool with rebar framework and gunite shell, pool equipment and plumbing, excavated pool site, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'tile':
    'Professional tile installer setting large-format porcelain tiles on a commercial bathroom floor, thinset mortar and spacers, precise tile layout pattern, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'waste-management':
    'Professional waste management operation with heavy equipment at a modern waste processing facility, organized recycling and disposal, commercial waste trucks, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'water-sewer':
    'Professional utility contractor installing large-diameter water main pipes in a deep trench, pipe bedding and backfill equipment, municipal infrastructure project, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'waterproofing':
    'Professional waterproofing contractor applying membrane coating to a commercial building foundation wall, spray equipment and drainage board, below-grade waterproofing, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'welding':
    'Professional welder performing structural welding on a steel fabrication project, bright welding arc and protective helmet, sparks and precision metalwork, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',

  'well-drilling':
    'Professional well drilling rig boring a deep water well on a rural property, tall drilling mast and pipe sections, mud circulation system, photorealistic, high quality, bright natural lighting, 16:9 aspect ratio, no text or logos',
};
