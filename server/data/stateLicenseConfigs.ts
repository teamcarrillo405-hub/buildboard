/**
 * State contractor licensing agency configurations.
 *
 * Each config describes how to fetch and parse a state's public contractor
 * license database. Two fetch modes are supported:
 *
 *   'csv'        — Direct download of a CSV/TSV file (bulk export).
 *                  TX, WA, OR, AZ all publish these as open data.
 *   'firecrawl'  — Paginated HTML scrape via FireCrawl for states that
 *                  only offer a web search UI (no bulk download).
 *
 * Column mapping uses the same "candidate header" approach as cslbSync.ts —
 * list several possible column name variants and we pick the first match.
 *
 * Sources confirmed via FireCrawl scrape (March 2026):
 *   TX  — https://data.texas.gov/api/views/7358-krk7/rows.csv (Socrata, ~600K rows)
 *   WA  — https://data.wa.gov/api/views/m8qx-ubtq/rows.csv (Socrata, ~80K rows)
 *   OR  — https://data.oregon.gov/api/views/4yhe-i4va/rows.csv (Socrata, ~40K rows)
 *   AZ  — https://roc.az.gov/sites/default/files/ROC_Active-Licenses.csv (direct)
 *   FL  — https://www.myfloridalicense.com/DBPR/ (FireCrawl — no bulk export)
 *   NC  — https://www.nclbgc.org/licensees.aspx (FireCrawl)
 *   CO  — https://apps.colorado.gov/dora/licensing/lookup (FireCrawl)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnKey =
  | 'licenseNumber'
  | 'businessName'
  | 'firstName'       // Individual licensees (CO DORA style: separate first/last name fields)
  | 'lastName'
  | 'dba'
  | 'address'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'cityStateZip'   // Combined "City, ST ZIP" field (TX TDLR style)
  | 'county'
  | 'phone'
  | 'email'
  | 'website'
  | 'licenseType'
  | 'licenseClass'
  | 'status'
  | 'issueDate'
  | 'expireDate'
  | 'bondAmount'
  | 'workersComp';

export interface StateConfig {
  stateCode: string;          // 'TX'
  stateName: string;          // 'Texas'
  agency: string;             // 'TDLR'
  agencyUrl: string;          // Agency homepage
  downloadUrl: string;        // CSV URL, dated URL template, or FireCrawl seed URL
  additionalUrls?: string[];  // Extra CSV URLs to download and concat (VA DPOR: separate file per class)
  datedUrlTemplate?: string;  // URL with {DATE} placeholder (YYYY-MM-DD), e.g. AZ ROC
  discoveryUrl?: string;      // Page to scrape for download link (e.g. AZ listing page)
  discoveryPattern?: string;  // Regex string to extract CSV filename/path from page HTML
  sessionUrl?: string;        // URL to GET first to establish a session cookie before downloading
                              // Required for ASP.NET portals that gate downloads behind anti-CSRF tokens.
                              // The downloader will GET this page, collect the Set-Cookie header,
                              // and attach those cookies to the subsequent CSV download request.
  httpHeaders?: Record<string, string>;  // Extra request headers (Referer, etc.)
  format: 'csv' | 'firecrawl';
  delimiter?: string;         // CSV delimiter, default ','
  encoding?: string;          // File encoding, default 'utf-8'
  skipRows?: number;          // Descriptor rows to skip before the real header row
  headerOverride?: string;    // Synthetic header line for files without headers (FL DBPR).
                              // When set, this string is used for column detection instead of
                              // the file's first data line, and ALL file lines are treated as data.
  columns: Partial<Record<ColumnKey, string[]>>;  // candidate header names per field
  licenseTypeFilter?: string[];                   // Only import these types (empty = all)
  licenseTypeToCategory: Record<string, string>;  // license type → BuildBoard category
  estimatedRecords: number;   // Rough count for progress reporting
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared category fallbacks
// ─────────────────────────────────────────────────────────────────────────────

const GENERIC_CONTRACTOR_CATEGORY: Record<string, string> = {
  'GENERAL': 'General Contractor',
  'GC': 'General Contractor',
  'GENERAL CONTRACTOR': 'General Contractor',
  'ELECTRICAL': 'Electrical',
  'ELECTRICIAN': 'Electrical',
  'PLUMBING': 'Plumbing',
  'PLUMBER': 'Plumbing',
  'HVAC': 'HVAC',
  'AIR CONDITIONING': 'HVAC',
  'MECHANICAL': 'HVAC',
  'ROOFING': 'Roofing',
  'PAINTING': 'Painting',
  'LANDSCAPING': 'Landscaping',
  'FLOORING': 'Flooring',
  'MASONRY': 'Masonry Contractors',
  'CONCRETE': 'Masonry Contractors',
  'FRAMING': 'Carpentry',
  'CARPENTRY': 'Carpentry',
  'DRYWALL': 'Drywall',
  'INSULATION': 'Insulation',
  'FENCING': 'Fencing',
  'WINDOWS': 'Windows & Doors',
  'SOLAR': 'Solar',
  'POOL': 'Pool Services',
  'DEMO': 'Demolition',
  'DEMOLITION': 'Demolition',
  'EXCAVATION': 'Demolition',
  'HANDYMAN': 'Handyman',
  'TREE': 'Tree Services',
  'IRRIGATION': 'Irrigation',
};

// ─────────────────────────────────────────────────────────────────────────────
// State configurations
// ─────────────────────────────────────────────────────────────────────────────

export const STATE_CONFIGS: Record<string, StateConfig> = {

  // ── Texas TDLR ─────────────────────────────────────────────────────────────
  // ~949K total licenses; we filter to construction-relevant trade types.
  // Socrata open data: https://data.texas.gov/dataset/TDLR-All-Licenses/7358-krk7
  //
  // Actual CSV headers (verified March 2026):
  //   LICENSE TYPE, LICENSE NUMBER, BUSINESS COUNTY, BUSINESS NAME,
  //   BUSINESS ADDRESS-LINE1, BUSINESS ADDRESS-LINE2,
  //   "BUSINESS CITY, STATE ZIP"  ← combined field, e.g. "Austin, TX 78701"
  //   BUSINESS TELEPHONE, LICENSE EXPIRATION DATE (MMDDCCYY), OWNER NAME, ...
  //
  // License types (relevant construction subset from 73 total):
  //   A/C Technician, A/C Contractor, A/C Refrigeration Contractor
  //   Apprentice Electrician, Journeyman Electrician, Master Electrician,
  //   Electrical Contractor, Residential Wireman
  //   Appliance Installer, Appliance Installation Contractor
  //   Elevator Contractor, Elevator Inspector
  TX: {
    stateCode: 'TX',
    stateName: 'Texas',
    agency: 'TDLR',
    agencyUrl: 'https://www.tdlr.texas.gov',
    downloadUrl: 'https://data.texas.gov/api/views/7358-krk7/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['LICENSE NUMBER', 'LIC NO', 'LICENSE_NUMBER', 'LICNO'],
      businessName:   ['BUSINESS NAME', 'LICENSEE NAME', 'FIRM NAME', 'NAME'],
      address:        ['BUSINESS ADDRESS-LINE1', 'ADDRESS'],
      cityStateZip:   ['BUSINESS CITY, STATE ZIP', 'CITY STATE ZIP'],  // combined field
      county:         ['BUSINESS COUNTY', 'COUNTY'],
      phone:          ['BUSINESS TELEPHONE', 'PHONE', 'PHONE NUMBER'],
      licenseType:    ['LICENSE TYPE', 'LIC TYPE', 'TYPE'],
      // TX TDLR has no STATUS column — all records in the export are active
      expireDate:     ['LICENSE EXPIRATION DATE (MMDDCCYY)', 'LICENSE EXPIRATION DATE', 'EXPIRATION DATE', 'EXPIRE DATE'],
    },
    // Use substring matching (includes) — actual types are full English names,
    // not short codes. Filter keeps A/C, Electrical, Elevator, Appliance, Plumbing.
    licenseTypeFilter: ['A/C', 'ELECTR', 'ELEVATOR', 'APPLIANCE', 'PLUMB'],
    licenseTypeToCategory: {
      // A/C & HVAC
      'A/C TECHNICIAN':               'HVAC',
      'A/C CONTRACTOR':               'HVAC',
      'A/C REFRIGERATION CONTRACTOR': 'HVAC',
      // Electrical
      'APPRENTICE ELECTRICIAN':       'Electrical',
      'JOURNEYMAN ELECTRICIAN':       'Electrical',
      'MASTER ELECTRICIAN':           'Electrical',
      'ELECTRICAL CONTRACTOR':        'Electrical',
      'RESIDENTIAL WIREMAN':          'Electrical',
      // Appliance (classify as HVAC — installation trade)
      'APPLIANCE INSTALLER':                  'HVAC',
      'APPLIANCE INSTALLATION CONTRACTOR':    'HVAC',
      // Elevator
      'ELEVATOR CONTRACTOR':          'General Contractor',
      'ELEVATOR INSPECTOR':           'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 550_000,  // filtered subset of 949K total
  },

  // ── Washington L&I ─────────────────────────────────────────────────────────
  // Open data portal: https://data.wa.gov/Labor/L-I-Contractor-License-Data-General/m8qx-ubtq
  //
  // Actual CSV headers (camelCase, verified March 2026):
  //   BusinessName, ContractorLicenseNumber, ContractorLicenseTypeCode,
  //   ContractorLicenseTypeCodeDesc, Address1, Address2, City, State, Zip,
  //   PhoneNumber, LicenseEffectiveDate, LicenseExpirationDate, BusinessTypeCode, ...
  WA: {
    stateCode: 'WA',
    stateName: 'Washington',
    agency: 'L&I',
    agencyUrl: 'https://lni.wa.gov',
    downloadUrl: 'https://data.wa.gov/api/views/m8qx-ubtq/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['CONTRACTORLICENSENUMBER', 'CONTLICNO', 'LICENSE NUMBER', 'UBI'],
      businessName:   ['BUSINESSNAME', 'BUSNAME', 'BUSINESS NAME', 'CONTRACTOR NAME'],
      address:        ['ADDRESS1', 'ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP', 'ZIPCODE', 'POSTAL CODE'],
      phone:          ['PHONENUMBER', 'PHONE', 'PHONE NUMBER'],
      licenseType:    ['CONTRACTORLICENSETYPECODE', 'CONTTYPE', 'LICENSE TYPE', 'CONTRACTOR TYPE'],
      licenseClass:   ['CONTRACTORLICENSETYPECODEDESC', 'CONTTYPE DESC', 'LICENSE TYPE DESC'],
      status:         ['CONTSTAT', 'STATUS', 'LICENSE STATUS'],
      issueDate:      ['LICENSEEFFECTIVEDATE', 'EFFECTIVEDATE', 'ISSUE DATE'],
      expireDate:     ['LICENSEEXPIRATIONDATE', 'EXPIRATIONDATE', 'EXPIRATION DATE', 'EXPIRE DATE'],
    },
    licenseTypeToCategory: {
      'CC': 'General Contractor',   // Construction Contractor
      'SC': 'General Contractor',   // Specialty Contractor
      'EL': 'Electrical',
      'PL': 'Plumbing',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 75_000,
  },

  // ── Oregon CCB ─────────────────────────────────────────────────────────────
  // Oregon CCB Active Licenses — updated daily
  // Dataset ID changed: 4yhe-i4va → g77e-6bhs (verified March 2026)
  //
  // Actual CSV headers (snake_case, 24 columns):
  //   license_number, license_type, related_key, related_type,
  //   county_code, county_name, lic_exp_date, orig_regis_date,
  //   bond_company, bond_amount, bond_exp_date, ins_company, ins_amount, ins_exp_date,
  //   full_name, address, city, state, zip_code, phone_number, fax_number,
  //   rmi_name, exempt_text, endorsement_text
  OR: {
    stateCode: 'OR',
    stateName: 'Oregon',
    agency: 'CCB',
    agencyUrl: 'https://www.oregon.gov/ccb',
    downloadUrl: 'https://data.oregon.gov/api/views/g77e-6bhs/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['LICENSE_NUMBER', 'LICENSE NUMBER', 'CCB LICENSE NUMBER', 'CCB #'],
      businessName:   ['FULL_NAME', 'FULL NAME', 'BUSINESS NAME', 'CONTRACTOR NAME'],
      address:        ['ADDRESS', 'STREET ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP_CODE', 'ZIP', 'ZIPCODE', 'POSTAL CODE'],
      county:         ['COUNTY_NAME', 'COUNTY'],
      phone:          ['PHONE_NUMBER', 'PHONE', 'PHONE NUMBER'],
      licenseType:    ['LICENSE_TYPE', 'CONTRACTOR TYPE', 'LICENSE TYPE', 'TYPE'],
      issueDate:      ['ORIG_REGIS_DATE', 'ISSUE DATE', 'EFFECTIVE DATE'],
      expireDate:     ['LIC_EXP_DATE', 'EXPIRATION DATE', 'EXPIRE DATE'],
      bondAmount:     ['BOND_AMOUNT', 'BOND AMT'],
    },
    // No status column — all records in this export are active licenses
    licenseTypeToCategory: {
      'GENERAL': 'General Contractor',
      'RESIDENTIAL GENERAL': 'General Contractor',
      'COMMERCIAL GENERAL': 'General Contractor',
      'SPECIALTY': 'General Contractor',
      'RESIDENTIAL SPECIALTY': 'General Contractor',
      'COMMERCIAL SPECIALTY': 'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 40_000,
  },

  // ── Arizona ROC ─────────────────────────────────────────────────────────────
  // ROC publishes weekly dated CSV snapshots. The sync discovers the current
  // URL by scraping the listing page (/posting-list) and regex-extracting the
  // "Dual" CSV link (covers both commercial + residential, ~35K records).
  //
  // Actual CSV headers (verified March 2026, "Dual" active licenses file):
  //   Row 1 (descriptor): "Current Active Dual Contractor Licenses - File created: ..."
  //   Row 2 (header): #, License No, Business Name, Doing Business As, Class,
  //                   Class Detail, Class Type, Address, City, State, Zip,
  //                   Qualifying Party, Issued Date, Expiration Date, Status
  //
  // "Dual" = licensed for both commercial and residential (largest file, ~35K records)
  AZ: {
    stateCode: 'AZ',
    stateName: 'Arizona',
    agency: 'ROC',
    agencyUrl: 'https://roc.az.gov',
    // Direct link to the most-recent weekly snapshot (updated as new files are posted).
    // Discovery via page-scrape returns 403 for raw Node HTTP; we use the Firecrawl-
    // verified URL directly. Update date component when AZ posts a new weekly file.
    downloadUrl: 'https://roc.az.gov/sites/default/files/ROC_Posting-List_Dual_2026-03-11.csv',
    httpHeaders: {
      'Referer': 'https://roc.az.gov/posting-list',
      'Accept': 'text/csv,text/plain,application/octet-stream,*/*',
    },
    format: 'csv',
    skipRows: 1,    // Skip the "Current Active Dual..." descriptor row before the header
    columns: {
      licenseNumber:  ['LICENSE NO', 'LICENSE NUMBER', 'LIC NO'],
      businessName:   ['BUSINESS NAME', 'FIRM NAME'],
      dba:            ['DOING BUSINESS AS', 'DBA'],
      licenseType:    ['CLASS'],           // Short code: "B", "CR-6", "C-11", etc.
      licenseClass:   ['CLASS DETAIL'],    // Full description: "General Commercial Contractor"
      address:        ['ADDRESS', 'MAILING ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP', 'ZIP CODE'],
      issueDate:      ['ISSUED DATE', 'ISSUE DATE'],
      expireDate:     ['EXPIRATION DATE', 'EXPIRE DATE'],
      status:         ['STATUS', 'LICENSE STATUS'],
    },
    licenseTypeToCategory: {
      'B':    'General Contractor',   // General Commercial
      'B-1':  'General Contractor',   // General Residential
      'A':    'General Contractor',   // General Engineering
      'KB':   'General Contractor',   // Dual General Commercial
      'KB-1': 'General Contractor',   // Dual General Residential
      'C-11': 'Electrical',
      'C-20': 'HVAC',
      'C-37': 'Plumbing',
      'C-36': 'Plumbing',
      'C-39': 'Roofing',
      'C-33': 'Painting',
      'C-54': 'Tile Installation',
      'C-53': 'Masonry Contractors',
      'L-67': 'Landscaping',
      'CR-6': 'Flooring',
      'CR-3': 'General Contractor',   // Awnings/canopies
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 35_000,
  },

  // ── North Carolina NCLBGC ──────────────────────────────────────────────────
  // No bulk download — FireCrawl paginates the license search.
  // NOTE: NC has no free bulk CSV. NCLBGC roster is email-request only (info@nclbgc.org).
  // NCBEEC (electrical) charges $50/CSV. NCLICENSING (plumbing) requires a web form request.
  // The original licensees.aspx URL is 404 — updated to working portal below.
  // This config is a placeholder; firecrawl scraping of the search portal is not yet implemented.
  NC: {
    stateCode: 'NC',
    stateName: 'North Carolina',
    agency: 'NCLBGC',
    agencyUrl: 'https://www.nclbgc.org',
    downloadUrl: 'https://portal.nclbgc.org/Public/Search',
    format: 'firecrawl',
    columns: {
      licenseNumber:  ['LICENSE NO', 'LICENSE NUMBER', 'LIC NO'],
      businessName:   ['BUSINESS NAME', 'LICENSEE'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP', 'ZIP CODE'],
      licenseType:    ['LICENSE TYPE', 'CLASSIFICATION'],
      status:         ['STATUS'],
      expireDate:     ['EXPIRATION DATE'],
    },
    licenseTypeToCategory: { ...GENERIC_CONTRACTOR_CATEGORY },
    estimatedRecords: 35_000,
  },

  // ── Massachusetts OCABR (HIC) ──────────────────────────────────────────────
  // MA Home Improvement Contractor registrations — OCABR
  // Direct CSV export endpoint. May return 503 during maintenance windows;
  // retry if it fails (Retry-After: 3600 header indicates temporary downtime).
  //
  // Known CSV headers (verified March 2026):
  //   REGISTRANT NAME, RESPONSIBLE INDIVIDUAL, LICENSE NUMBER,
  //   ADDRESS, EXPIRATION DATE, STATUS
  MA: {
    stateCode: 'MA',
    stateName: 'Massachusetts',
    agency: 'OCABR',
    agencyUrl: 'https://www.mass.gov/orgs/office-of-consumer-affairs-and-business-regulation',
    downloadUrl: 'https://services.oca.state.ma.us/hic/hicexport.aspx',
    format: 'csv',
    columns: {
      licenseNumber:  ['LICENSE NUMBER', 'LICENSE', 'REGISTRATION NUMBER', 'REG NUMBER'],
      businessName:   ['REGISTRANT NAME', 'BUSINESS NAME', 'NAME', 'COMPANY NAME'],
      address:        ['ADDRESS', 'ADDRESS 1', 'STREET'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP', 'ZIP CODE', 'ZIPCODE'],
      status:         ['STATUS'],
      expireDate:     ['EXPIRATION DATE', 'EXPIRE DATE', 'EXP DATE'],
    },
    licenseTypeToCategory: {
      'HOME IMPROVEMENT': 'General Contractor',
      'HIC': 'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 60_000,
  },

  // ── Illinois IDFPR ─────────────────────────────────────────────────────────
  // Socrata open data portal: https://data.illinois.gov/d/pzzh-kp68
  // Dataset: "Professional License Data" — construction-relevant types filtered.
  //
  // Actual CSV headers (verified March 2026):
  //   License Type, Description, License Number, License Status,
  //   Business Name, BusinessDBA, Original Issue Date, Effective Date,
  //   Expiration Date, City, State, Zip, County, ...
  //
  // Relevant license types (partial list from research):
  //   ROOFING, PLUMBER, ELECTRICIAN, HVAC, GENERAL CONTRACTOR,
  //   LEAKING UNDERGROUND STORAGE TANK, ELEVATOR CONTRACTOR, ...
  IL: {
    stateCode: 'IL',
    stateName: 'Illinois',
    agency: 'IDFPR',
    agencyUrl: 'https://idfpr.illinois.gov',
    downloadUrl: 'https://data.illinois.gov/api/views/pzzh-kp68/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['LICENSE NUMBER', 'LICENSE_NUMBER', 'LIC NUMBER'],
      businessName:   ['BUSINESS NAME', 'BUSINESSNAME', 'NAME'],
      dba:            ['BUSINESSDBA', 'DBA', 'DOING BUSINESS AS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP', 'ZIPCODE', 'ZIP CODE'],
      licenseType:    ['LICENSE TYPE', 'LICENSE_TYPE', 'TYPE'],
      status:         ['LICENSE STATUS', 'LICENSE_STATUS', 'STATUS'],
      issueDate:      ['ORIGINAL ISSUE DATE', 'EFFECTIVE DATE', 'ISSUE DATE'],
      expireDate:     ['EXPIRATION DATE', 'EXPIRE DATE'],
    },
    // IL covers all trades at state level; filter to construction-relevant
    licenseTypeFilter: [
      'ROOFING', 'PLUMB', 'ELECTRIC', 'HVAC', 'GENERAL CONTRACTOR',
      'STRUCTURAL', 'ELEVATOR', 'BOILER', 'SPRINKLER', 'PIPELINE',
    ],
    licenseTypeToCategory: {
      'ROOFING CONTRACTOR': 'Roofing',
      'PLUMBER': 'Plumbing',
      'PLUMBING CONTRACTOR': 'Plumbing',
      'ELECTRICIAN': 'Electrical',
      'ELECTRICAL CONTRACTOR': 'Electrical',
      'HVAC': 'HVAC',
      'HVAC CONTRACTOR': 'HVAC',
      'GENERAL CONTRACTOR': 'General Contractor',
      'STRUCTURAL ENGINEER': 'General Contractor',
      'ELEVATOR CONTRACTOR': 'General Contractor',
      'BOILER CONTRACTOR': 'HVAC',
      'FIRE SPRINKLER CONTRACTOR': 'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 80_000,
  },

  // ── Minnesota DLI ──────────────────────────────────────────────────────────
  // Nightly export from DLI (Dept of Labor & Industry) CCLD system.
  // URL: https://secure.doli.state.mn.us/ccld/data/MNDLILicRegCertExport_Contractor_Registrations.csv
  // Updated nightly; ~50K licensed contractors.
  //
  // Actual CSV headers (to be confirmed on first import):
  //   License Number, Business Name, DBA, Address, City, State, Zip,
  //   Phone, License Type, License Status, Issue Date, Expire Date, ...
  MN: {
    stateCode: 'MN',
    stateName: 'Minnesota',
    agency: 'DLI',
    agencyUrl: 'https://www.dli.mn.gov',
    downloadUrl: 'https://secure.doli.state.mn.us/ccld/data/MNDLILicRegCertExport_Contractor_Registrations.csv',
    format: 'csv',
    // Actual headers (verified March 2026):
    //   Bus_Pers, License_Type, License_Subtype, Name, DBA_Name, Addr1, Addr2,
    //   City, St, Zip, Phone_No, Email_Address, Lic_Number, Status,
    //   Orig_Date, Exp_Date, Enforcement_Action, Renewal_in_Progress
    columns: {
      licenseNumber:  ['LIC_NUMBER', 'LIC NUMBER', 'LICENSE NUMBER', 'REGISTRATION NUMBER'],
      businessName:   ['NAME', 'BUSINESS NAME', 'FIRM NAME', 'COMPANY NAME'],
      dba:            ['DBA_NAME', 'DBA NAME', 'DBA', 'DOING BUSINESS AS'],
      address:        ['ADDR1', 'ADDRESS', 'STREET ADDRESS', 'MAILING ADDRESS'],
      city:           ['CITY'],
      state:          ['ST', 'STATE'],
      zipCode:        ['ZIP', 'ZIP CODE', 'ZIPCODE', 'POSTAL CODE'],
      phone:          ['PHONE_NO', 'PHONE NO', 'PHONE', 'PHONE NUMBER', 'TELEPHONE'],
      licenseType:    ['LICENSE_TYPE', 'LICENSE TYPE', 'TYPE', 'REGISTRATION TYPE'],
      status:         ['STATUS', 'LICENSE STATUS'],
      issueDate:      ['ORIG_DATE', 'ORIG DATE', 'ISSUE DATE', 'ORIGINAL ISSUE DATE', 'EFFECTIVE DATE'],
      expireDate:     ['EXP_DATE', 'EXP DATE', 'EXPIRATION DATE', 'EXPIRE DATE'],
    },
    licenseTypeToCategory: {
      'RESIDENTIAL BUILDING CONTRACTOR': 'General Contractor',
      'RESIDENTIAL REMODELER': 'General Contractor',
      'RESIDENTIAL SPECIALTY CONTRACTOR': 'General Contractor',
      'COMMERCIAL BUILDING CONTRACTOR': 'General Contractor',
      'ELECTRICAL': 'Electrical',
      'PLUMBING': 'Plumbing',
      'MECHANICAL': 'HVAC',
      'ROOFING': 'Roofing',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 50_000,
  },

  // ── Connecticut DCP ────────────────────────────────────────────────────────
  // Socrata: data.ct.gov — Home Improvement Contractor Licenses (active + inactive)
  // Dataset ID: 5r9m-qgni  (~29MB, updated regularly)
  //
  // Actual CSV headers (verified March 2026):
  //   CredentialId, Name, Type, BusinessName, DBA, FullCredentialCode,
  //   CredentialType, CredentialNumber, CredentialSubCategory, Credential,
  //   Status, StatusReason, Active, IssueDate, EffectiveDate, ExpirationDate,
  //   City, State, Zip, RecordRefreshedOn
  //
  // CT only licenses Home Improvement Contractors at state level (all trades).
  CT: {
    stateCode: 'CT',
    stateName: 'Connecticut',
    agency: 'DCP',
    agencyUrl: 'https://portal.ct.gov/dcp',
    downloadUrl: 'https://data.ct.gov/api/views/5r9m-qgni/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['CREDENTIALNUMBER', 'CREDENTIAL NUMBER', 'FULLCREDENTIALCODE', 'LICENSE NUMBER'],
      businessName:   ['BUSINESSNAME', 'BUSINESS NAME', 'NAME'],
      dba:            ['DBA'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP', 'ZIPCODE', 'ZIP CODE'],
      licenseType:    ['CREDENTIALTYPE', 'CREDENTIAL TYPE', 'CREDENTIALSUBCATEGORY', 'LICENSE TYPE'],
      status:         ['STATUS', 'STATUSREASON', 'LICENSE STATUS'],
      issueDate:      ['ISSUEDATE', 'ISSUE DATE', 'EFFECTIVEDATE'],
      expireDate:     ['EXPIRATIONDATE', 'EXPIRATION DATE'],
    },
    licenseTypeToCategory: {
      'HOME IMPROVEMENT CONTRACTOR': 'General Contractor',
      'HIC': 'General Contractor',
      'ELECTRICAL': 'Electrical',
      'ELECTRICIAN': 'Electrical',
      'PLUMBING': 'Plumbing',
      'PLUMBER': 'Plumbing',
      'MECHANICAL': 'HVAC',
      'HVAC': 'HVAC',
      'ROOFING': 'Roofing',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 80_000,
  },

  // ── New York City DCA ──────────────────────────────────────────────────────
  // NYC Open Data: data.cityofnewyork.us — Home Improvement Contractor Licenses
  // Dataset ID: iz9v-cu29  (NYC DCA, ~50K active + historical records)
  // Note: NYC-only (not full NY state). NY state licenses via county/DOS.
  //
  // Actual CSV headers (verified March 2026):
  //   License Number, License Type, Expiration Date, Business Name,
  //   Building Number, Street1, Street2, City, State, ZIP Code,
  //   Contact Phone, Borough, Latitude, Longitude
  NYC: {
    stateCode: 'NY',
    stateName: 'New York',
    agency: 'NYC DCA',
    agencyUrl: 'https://www.nyc.gov/site/dca',
    downloadUrl: 'https://data.cityofnewyork.us/api/views/iz9v-cu29/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['LICENSE NUMBER', 'LIC NUMBER', 'LICENSE NO'],
      businessName:   ['BUSINESS NAME', 'NAME', 'COMPANY'],
      address:        ['BUILDING NUMBER', 'STREET1', 'ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP CODE', 'ZIP', 'ZIPCODE'],
      phone:          ['CONTACT PHONE', 'PHONE', 'PHONE NUMBER'],
      licenseType:    ['LICENSE TYPE', 'TYPE'],
      expireDate:     ['EXPIRATION DATE', 'EXPIRE DATE'],
    },
    licenseTypeToCategory: {
      'HOME IMPROVEMENT CONTRACTOR': 'General Contractor',
      'PREMISES': 'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 50_000,
  },

  // ── California CSLB ────────────────────────────────────────────────────────
  // Contractors State License Board — statewide master list (~242K active licenses).
  // Source: https://www.cslb.ca.gov/OnlineServices/DataPortal/ContractorList
  //
  // The download is gated behind an ASP.NET session anti-CSRF cookie
  // (__AntiXsrfTokenCSLB + TS01c60549).  A GET to ContractorList establishes
  // the cookie; then DownLoadFile.ashx?fName=MasterLicenseData&type=C streams
  // the full CSV.  The sessionUrl field triggers this first-GET behaviour in
  // the stateLicenseSync downloader.
  //
  // Actual CSV headers (verified March 2026, 51 columns):
  //   LicenseNo, LastUpdate, BusinessName, BUS-NAME-2, FullBusinessName,
  //   MailingAddress, City, State, County, ZIPCode, country, BusinessPhone,
  //   BusinessType, IssueDate, ReissueDate, ExpirationDate, InactivationDate,
  //   ReactivationDate, PendingSuspension, PendingClassRemoval, PendingClassReplace,
  //   PrimaryStatus, SecondaryStatus, Classifications(s), AsbestosReg,
  //   WorkersCompCoverageType, WCInsuranceCompany, WCPolicyNumber,
  //   WCEffectiveDate, WCExpirationDate, WCCancellationDate, WCSuspendDate,
  //   CBSuretyCompany, CBNumber, CBEffectiveDate, CBCancellationDate, CBAmount,
  //   WBSuretyCompany, WBNumber, WBEffectiveDate, WBCancellationDate, WBAmount,
  //   DBSuretyCompany, DBNumber, DBEffectiveDate, DBCancellationDate, DBAmount,
  //   DateRequired, DiscpCaseRegion, DBBondReason, DBCaseNo, NAME-TP-2
  //
  // PrimaryStatus values (verified): CLEAR, Contr Bond Susp, Work Comp Susp,
  //   Liab Ins Susp, Family Sup Susp, Judgement Susp, SOS Suspension, etc.
  //   All Master List records are active or expired-but-renewable per CSLB policy.
  //
  // Classifications(s) = pipe-separated class codes, e.g. "B| HAZ" or "C10| C20"
  // Top classes (sample of 16K rows): B=6639, C10=1906, C36=1237, C33=1168,
  //   A=976, C27=883, C20=848, C15=539, C54=453, C-8=399, C39=329, etc.
  CA: {
    stateCode: 'CA',
    stateName: 'California',
    agency: 'CSLB',
    agencyUrl: 'https://www.cslb.ca.gov',
    // A GET to sessionUrl establishes the __AntiXsrfTokenCSLB cookie that the
    // download endpoint requires.  The downloader calls this URL first, captures
    // the Set-Cookie headers, and forwards them on the actual CSV request.
    sessionUrl: 'https://www.cslb.ca.gov/OnlineServices/DataPortal/ContractorList',
    downloadUrl: 'https://www.cslb.ca.gov/OnlineServices/DataPortal/DownLoadFile.ashx?fName=MasterLicenseData&type=C',
    httpHeaders: {
      'Referer': 'https://www.cslb.ca.gov/OnlineServices/DataPortal/ContractorList',
    },
    format: 'csv',
    columns: {
      licenseNumber:  ['LICENSENO', 'LICENSE NO', 'LICENSE NUMBER', 'LIC NO'],
      businessName:   ['BUSINESSNAME', 'BUSINESS NAME', 'FULLBUSINESSNAME', 'FULL BUSINESS NAME'],
      dba:            ['BUS-NAME-2', 'NAME-TP-2', 'DBA'],
      address:        ['MAILINGADDRESS', 'MAILING ADDRESS', 'ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIPCODE', 'ZIP CODE', 'ZIP'],
      county:         ['COUNTY'],
      phone:          ['BUSINESSPHONE', 'BUSINESS PHONE', 'PHONE'],
      licenseType:    ['CLASSIFICATIONS(S)', 'CLASSIFICATION', 'CLASS'],
      status:         ['PRIMARYSTATUS', 'PRIMARY STATUS', 'STATUS'],
      issueDate:      ['ISSUEDATE', 'ISSUE DATE'],
      expireDate:     ['EXPIRATIONDATE', 'EXPIRATION DATE', 'EXPIRE DATE'],
      bondAmount:     ['CBAMOUNT', 'CB AMOUNT', 'BOND AMOUNT'],
      workersComp:    ['WORKERSCOMPLCOVERAGETYPE', 'WORKERSCOMPCOVERAGETYPE', 'WC COVERAGE TYPE'],
    },
    licenseTypeToCategory: {
      // Class A / B — General contractors (highest volume: B ~40% of all records)
      'A':    'General Contractor',   // General Engineering Contractor
      'B':    'General Contractor',   // General Building Contractor
      // Class C — Specialty trades (CSLB-defined codes, verified March 2026)
      'C-2':  'Insulation',           // Insulation and Acoustical
      'C-4':  'General Contractor',   // Boiler, Hot Water Heating and Steam Fitting
      'C-5':  'Carpentry',            // Framing and Rough Carpentry
      'C-6':  'Carpentry',            // Cabinet, Millwork and Finish Carpentry
      'C-7':  'Electrical',           // Low Voltage Systems
      'C-8':  'Masonry Contractors',  // Concrete
      'C-9':  'Drywall',              // Drywall
      'C10':  'Electrical',           // Electrical (highest-volume specialty)
      'C12':  'Masonry Contractors',  // Earthwork and Paving
      'C13':  'Fencing',              // Fencing
      'C15':  'Flooring',             // Flooring and Floor Covering
      'C16':  'General Contractor',   // Fire Protection (Sprinkler)
      'C17':  'Windows & Doors',      // Glazing
      'C20':  'HVAC',                 // Warm Air Heating, Ventilation, Air Conditioning
      'C21':  'Drywall',              // Drywall
      'C22':  'Demolition',           // Asbestos Abatement
      'C23':  'General Contractor',   // Ornamental Metal
      'C27':  'Landscaping',          // Landscaping
      'C28':  'General Contractor',   // Lock and Security Equipment
      'C29':  'Masonry Contractors',  // Masonry
      'C31':  'General Contractor',   // Construction Zone Traffic Control
      'C33':  'Painting',             // Painting and Decorating
      'C34':  'Plumbing',             // Pipeline
      'C35':  'Drywall',              // Lathing
      'C36':  'Plumbing',             // Plumbing
      'C38':  'HVAC',                 // Refrigeration
      'C39':  'Roofing',              // Roofing
      'C42':  'General Contractor',   // Sanitation System
      'C43':  'General Contractor',   // Sheet Metal
      'C45':  'General Contractor',   // Sign Installation
      'C46':  'Solar',                // Solar
      'C50':  'General Contractor',   // Reinforcing Steel
      'C51':  'General Contractor',   // Structural Steel
      'C53':  'Masonry Contractors',  // Masonry (alternate code)
      'C54':  'Tile Installation',    // Tile (Ceramic and Mosaic)
      'C57':  'General Contractor',   // Well Drilling
      'C60':  'General Contractor',   // Welding
      'C61':  'General Contractor',   // Limited Specialty
      // Class D — Subdiscipline specialties
      'D03':  'General Contractor',   // Awnings
      'D06':  'Fencing',              // Fences (maps to Fencing category)
      'D12':  'General Contractor',   // Synthetic Products
      'D21':  'General Contractor',   // Machinery and Pumps
      'D24':  'Roofing',              // Metal Roofing
      'D28':  'Masonry Contractors',  // Concrete Related Services
      'D34':  'General Contractor',   // Prefabricated Equipment
      'D35':  'General Contractor',   // Pool and Spa Maintenance
      'D42':  'Pool Services',        // Pool and Spa Service
      'D49':  'Tree Services',        // Tree Service
      'D52':  'Painting',             // Sign Painting and Lettering
      'D63':  'Windows & Doors',      // Door Dealer
      'D64':  'Windows & Doors',      // Window Covering
      // Specialty endorsements (appear as part of pipe-separated Classifications(s))
      'HAZ':  'Demolition',           // Hazardous Substance Removal
      'ASB':  'Demolition',           // Asbestos Certification
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 242_000,
  },

  // ── Florida DBPR ───────────────────────────────────────────────────────────
  // CILB (Construction Industry Licensing Board) under DBPR.
  // Direct CSV extract from DBPR public records portal — no header row.
  // Columns: Board#, OccCode, Name, DBA, ClassCode, Addr1, Addr2, Addr3,
  //          City, State, Zip, CountyCode, LicNum, PrimaryStatus,
  //          SecondaryStatus, OrigDate, EffDate, ExpDate, _, RenewalPeriod, AltLic#, _
  FL: {
    stateCode: 'FL',
    stateName: 'Florida',
    agency: 'DBPR/CILB',
    agencyUrl: 'https://www.myfloridalicense.com',
    downloadUrl: 'https://www2.myfloridalicense.com/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv',
    format: 'csv',
    // File has no header row — use synthetic header for positional column detection
    headerOverride: '"BOARD","OCCUPATION_CODE","LICENSEE_NAME","DBA","CLASS_CODE","ADDRESS1","ADDRESS2","ADDRESS3","CITY","STATE","ZIP","COUNTY_CODE","LICENSE_NUMBER","PRIMARY_STATUS","SECONDARY_STATUS","ORIGINAL_DATE","EFFECTIVE_DATE","EXPIRATION_DATE","BLANK1","RENEWAL_PERIOD","ALT_LICENSE_NUMBER","BLANK2"',
    columns: {
      businessName:   ['LICENSEE_NAME'],
      dba:            ['DBA'],
      address:        ['ADDRESS1'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP'],
      licenseNumber:  ['LICENSE_NUMBER', 'ALT_LICENSE_NUMBER'],
      licenseType:    ['OCCUPATION_CODE'],
      licenseClass:   ['CLASS_CODE'],
      status:         ['PRIMARY_STATUS'],
      issueDate:      ['ORIGINAL_DATE'],
      expireDate:     ['EXPIRATION_DATE'],
    },
    licenseTypeFilter: [],   // All records are construction — file is construction-only extract
    licenseTypeToCategory: {
      'CGC': 'General Contractor',     // Certified General Contractor
      'CBC': 'General Contractor',     // Certified Building Contractor
      'CCC': 'General Contractor',     // Certified Building Contractor
      'CRC': 'Roofing',               // Certified Roofing Contractor
      'CUC': 'General Contractor',     // Certified Underground Utility Contractor
      'CSC': 'General Contractor',     // Certified Specialty Contractor
      'CMC': 'HVAC',                   // Certified Mechanical Contractor
      'CAC': 'HVAC',                   // Certified A/C Contractor
      'CFC': 'Plumbing',              // Certified Plumbing Contractor
      'CPC': 'General Contractor',     // Certified Pollutant Storage Contractor
      'CPR': 'General Contractor',     // Registered Pollutant Storage Contractor
      'RBC': 'General Contractor',     // Registered Building Contractor
      'RGC': 'General Contractor',     // Registered General Contractor
      'RRC': 'Roofing',               // Registered Roofing Contractor
      'RSC': 'General Contractor',     // Registered Specialty Contractor
      'RMC': 'HVAC',                   // Registered Mechanical Contractor
      'RAC': 'HVAC',                   // Registered A/C Contractor
      'RFC': 'Plumbing',              // Registered Plumbing Contractor
      'EC':  'Electrical',            // Electrical Contractor
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 200_000,
  },

  // ── Colorado DORA ──────────────────────────────────────────────────────────
  // Socrata open data: data.colorado.gov dataset 7s5z-vewr
  // All DORA-licensed professionals; filter to construction trades.
  // ~200K+ total records; nightly updates.
  CO: {
    stateCode: 'CO',
    stateName: 'Colorado',
    agency: 'DORA',
    agencyUrl: 'https://dora.colorado.gov',
    // Bulk export returns Content-Length: 0 as of March 2026.
    // Use SODA API with $where filter for construction license types instead.
    // Types: JW=Journeyman Wireman(32K), ME=Master Electrician(13K), EC=Electrical Contractor(12K),
    //        JP=Journeyman Plumber(11K), MP=Master Plumber(9K), RW=Residential Wireman(6K)
    downloadUrl: "https://data.colorado.gov/resource/7s5z-vewr.csv?$limit=500000&$where=licensetype in('JW','ME','EC','JP','MP','RW','EL','GEN','RME','JPWP','MPWP')",
    format: 'csv',
    columns: {
      // SODA API returns lowercase headers; also include title-case for bulk CSV fallback
      licenseNumber:  ['licensenumber', 'LICENSENUMBER', 'LICENSE NUMBER'],
      businessName:   ['entityname', 'ENTITYNAME', 'ENTITY NAME', 'BUSINESS NAME'],
      firstName:      ['firstname', 'FIRSTNAME', 'FIRST NAME'],
      lastName:       ['lastname', 'LASTNAME', 'LAST NAME'],
      city:           ['city', 'CITY'],
      state:          ['state', 'STATE'],
      zipCode:        ['mailzipcode', 'MAILZIPCODE', 'ZIP', 'ZIPCODE'],
      licenseType:    ['licensetype', 'LICENSETYPE', 'LICENSE TYPE', 'LICENSEPREFIX'],
      licenseClass:   ['subcategory', 'SUBCATEGORY', 'specialty', 'SPECIALTY'],
      status:         ['licensestatusdescription', 'LICENSESTATUSDESCRIPTION', 'STATUS'],
      issueDate:      ['licensefirstissuedate', 'LICENSEFIRSTISSUEDATE', 'ISSUE DATE'],
      expireDate:     ['licenseexpirationdate', 'LICENSEEXPIRATIONDATE', 'EXPIRE DATE'],
    },
    // The SODA $where already filters; this is a safety net for bulk CSV mode
    licenseTypeFilter: [
      'JW', 'ME', 'EC', 'JP', 'MP', 'RW', 'EL', 'GEN', 'RME',
    ],
    licenseTypeToCategory: {
      'EL':  'Electrical',           // Electrician
      'EC':  'Electrical',           // Electrical Contractor
      'RME': 'Electrical',           // Responsible Master Electrician
      'RW':  'Electrical',           // Residential Wireman
      'ME':  'Electrical',           // Master Electrician
      'MP':  'Plumbing',             // Master Plumber
      'JP':  'Plumbing',             // Journeyman Plumber
      'JPWP': 'Plumbing',            // Journeyman Plumber with Permit
      'MPWP': 'Plumbing',            // Master Plumber with Permit
      'JW':  'Plumbing',             // Journeyman Worker
      'GEN': 'General Contractor',   // General license
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 50_000,  // Only construction subset of 1.5M total
  },

  // ── New Jersey DCA ──────────────────────────────────────────────────────
  // Division of Consumer Affairs — all professional/occupational licenses.
  // Socrata open data: https://data.nj.gov/dataset/Professional-Licenses/8anu-hsjm
  // ~900K total rows; we filter to construction-relevant types.
  // Includes phone, email, website fields.
  // ── New Jersey DCA ──────────────────────────────────────────────────────
  // NJ DCA business registrations (NOT professional licenses).
  // Socrata: https://data.nj.gov/dataset/8anu-hsjm
  // Actual headers: BUSINESS NAME, BUSINESS ADDRESS, BUSINESS CITY, BUSINESS STATE,
  //   BUSINESS ZIP, CONTACT NAME, PRIMARY PHONE, EMAIL ADDRESS,
  //   MAJOR FIELD OF OPERATION, COMMODITY DESCRIPTION
  // No license number column — we use a generated hash as identifier.
  NJ: {
    stateCode: 'NJ',
    stateName: 'New Jersey',
    agency: 'DCA',
    agencyUrl: 'https://www.njconsumeraffairs.gov',
    downloadUrl: 'https://data.nj.gov/api/views/8anu-hsjm/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      // No license number in this dataset — pipeline will auto-generate from name+zip
      businessName:   ['BUSINESS NAME'],
      address:        ['BUSINESS ADDRESS'],
      city:           ['BUSINESS CITY'],
      state:          ['BUSINESS STATE'],
      zipCode:        ['BUSINESS ZIP'],
      phone:          ['PRIMARY PHONE'],
      email:          ['EMAIL ADDRESS'],
      licenseType:    ['MAJOR FIELD OF OPERATION', 'COMMODITY DESCRIPTION'],
    },
    // Filter to construction-related fields of operation
    licenseTypeFilter: [
      'CONSTRUCT', 'PLUMB', 'ELECTR', 'HVAC', 'ROOFING', 'PAINTING',
      'MASONRY', 'CONCRETE', 'LANDSCAP', 'EXCAVAT', 'DEMOLIT',
      'CARPENT', 'FLOORING', 'INSULATION', 'FENCING', 'GENERAL CONTRACT',
      'HOME IMPROVEMENT', 'BUILDING', 'REMODEL', 'RENOVATION',
      'DRYWALL', 'SIDING', 'GUTTERS', 'PAVING', 'SOLAR',
    ],
    licenseTypeToCategory: {
      ...GENERIC_CONTRACTOR_CATEGORY,
      'CONSTRUCTION': 'General Contractor',
      'HOME IMPROVEMENT': 'General Contractor',
      'BUILDING': 'General Contractor',
      'REMODELING': 'General Contractor',
      'RENOVATION': 'General Contractor',
      'PAVING': 'Paving',
      'SIDING': 'Siding',
      'GUTTERS': 'Gutter Services',
    },
    estimatedRecords: 30_000,  // construction subset of larger business file
  },

  // ── Virginia DPOR ───────────────────────────────────────────────────────
  // Dept of Professional & Occupational Regulation — tab-delimited files.
  // Separate files per class: A (3.8K), B (8.7K), C (11.5K), Tradesman (30K).
  // Headers: BOARD  OCCUPATION  CERTIFICATE #  INDIVIDUAL NAME  BUSINESS NAME
  //   FIRST LINE ADDRESS  SECOND LINE ADDRESS  P O BOX #  CITY  STATE
  //   FIVE DIGIT ZIP CODE  ZIP CODE EXTENSION  PROVINCE  COUNTRY  POSTAL CODE
  //   EXPIRATION DATE  CERTIFICATION DATE  LICENSE RANK  LICENSE SPECIALTY  EMAILADDRESS
  VA: {
    stateCode: 'VA',
    stateName: 'Virginia',
    agency: 'DPOR',
    agencyUrl: 'https://www.dpor.virginia.gov',
    downloadUrl: 'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2701__crnt.txt',
    additionalUrls: [
      'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2705b__crnt.txt',
      'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2705c__crnt.txt',
      'https://www.dpor.virginia.gov/sites/default/files/Records%20and%20Documents/Regulant%20List/2710__crnt.txt',
    ],
    format: 'csv',
    delimiter: '\t',
    columns: {
      licenseNumber:  ['CERTIFICATE #', 'CERTIFICATE', 'LICENSE NUMBER'],
      businessName:   ['BUSINESS NAME', 'FIRM NAME'],
      firstName:      ['INDIVIDUAL NAME'],   // VA puts full name in one field
      address:        ['FIRST LINE ADDRESS', 'ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['FIVE DIGIT ZIP CODE', 'ZIP CODE', 'ZIP'],
      email:          ['EMAILADDRESS', 'EMAIL'],
      licenseType:    ['LICENSE RANK', 'OCCUPATION', 'BOARD'],
      licenseClass:   ['LICENSE SPECIALTY', 'SPECIALTY'],
      expireDate:     ['EXPIRATION DATE', 'EXPIRE DATE'],
      issueDate:      ['CERTIFICATION DATE', 'ISSUE DATE'],
    },
    licenseTypeFilter: [],   // All records are already construction-specific
    licenseTypeToCategory: {
      'A': 'General Contractor',
      'B': 'General Contractor',
      'C': 'General Contractor',
      'CBC': 'General Contractor',    // Commercial Building Contractor
      'RBC': 'General Contractor',    // Residential Building Contractor
      'ELE': 'Electrical',
      'PLB': 'Plumbing',
      'HVA': 'HVAC',
      'H/H': 'HVAC',                 // Heating/HVAC
      'EMC': 'Electrical',           // Elevator/Moving Stairway Contractor
      'CIC': 'General Contractor',   // Commercial Improvement Contractor
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 54_000,
  },

  // ── Iowa DIAL ───────────────────────────────────────────────────────────
  // Dept of Inspections, Appeals & Licensing — construction-specific!
  // Socrata: https://data.iowa.gov/Workforce/Active-Iowa-Construction-Contractor-Registrations/dpf3-iz94
  // Headers: Registration #, Primary Activity, Business Name, First Name, Last Name,
  //   Email Address, Address 1, Address 2, City, State, Zip Code, County, Phone,
  //   Issue Date, Expire Date
  // All records are active construction contractors — no filtering needed.
  IA: {
    stateCode: 'IA',
    stateName: 'Iowa',
    agency: 'DIAL',
    agencyUrl: 'https://dial.iowa.gov',
    downloadUrl: 'https://data.iowa.gov/api/views/dpf3-iz94/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['REGISTRATION #', 'REGISTRATION', 'LICENSE NUMBER'],
      businessName:   ['BUSINESS NAME'],
      firstName:      ['FIRST NAME'],
      lastName:       ['LAST NAME'],
      address:        ['ADDRESS 1', 'ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP CODE', 'ZIP'],
      county:         ['COUNTY'],
      phone:          ['PHONE'],
      email:          ['EMAIL ADDRESS', 'EMAIL'],
      licenseType:    ['PRIMARY ACTIVITY'],
      issueDate:      ['ISSUE DATE'],
      expireDate:     ['EXPIRE DATE'],
    },
    licenseTypeFilter: [],   // Already construction-only dataset
    licenseTypeToCategory: {
      '236115': 'General Contractor',   // New single-family residential
      '236116': 'General Contractor',   // New multifamily residential
      '236210': 'General Contractor',   // Industrial building construction
      '236220': 'General Contractor',   // Commercial building construction
      '238110': 'General Contractor',   // Poured concrete
      '238120': 'General Contractor',   // Structural steel
      '238130': 'Carpentry',            // Framing contractors
      '238140': 'Masonry Contractors',  // Masonry
      '238150': 'Carpentry',            // Glass/glazing
      '238160': 'Roofing',              // Roofing
      '238170': 'Siding',              // Siding
      '238190': 'General Contractor',   // Other foundation/exterior
      '238210': 'Electrical',           // Electrical
      '238220': 'Plumbing',             // Plumbing/HVAC
      '238290': 'General Contractor',   // Other building equipment
      '238310': 'Drywall',              // Drywall/insulation
      '238320': 'Painting',             // Painting/wall covering
      '238330': 'Flooring',             // Flooring
      '238340': 'Carpentry',            // Tile/terrazzo
      '238350': 'Carpentry',            // Finish carpentry
      '238390': 'General Contractor',   // Other building finishing
      '238910': 'General Contractor',   // Site preparation
      '238990': 'General Contractor',   // All other specialty trade
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 17_000,
  },

  // ── New York State DOL ──────────────────────────────────────────────────
  // NY State Contractor Registry (separate from NYC DCA already imported as license_ny).
  // Socrata: https://data.ny.gov/Government-Finance/Contractor-Registry-Certificate/i4jv-zkey
  // Headers: Certificate Number, Business Name, DBA Name, Business Type, Address, City,
  //   State, Zip Code, Phone, Issued Date, Expiration Date, Status, Workers Comp, Georeference
  // ~12.6K records, all are registered contractors.
  NYS: {
    stateCode: 'NY',
    stateName: 'New York',
    agency: 'DOL',
    agencyUrl: 'https://dol.ny.gov',
    downloadUrl: 'https://data.ny.gov/api/views/i4jv-zkey/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      licenseNumber:  ['CERTIFICATE NUMBER', 'CERTIFICATE', 'LICENSE NUMBER'],
      businessName:   ['BUSINESS NAME', 'NAME'],
      dba:            ['DBA NAME', 'DBA'],
      address:        ['ADDRESS', 'ADDRESS 1'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP CODE', 'ZIP'],
      phone:          ['PHONE'],
      licenseType:    ['BUSINESS TYPE'],
      status:         ['STATUS'],
      issueDate:      ['ISSUED DATE', 'ISSUE DATE'],
      expireDate:     ['EXPIRATION DATE', 'EXPIRE DATE'],
      workersComp:    ['BUSINESS HAS WORKERS COMPENSATION INSURANCE'],
    },
    licenseTypeFilter: [],   // All records are registered contractors
    licenseTypeToCategory: {
      'CORPORATION': 'General Contractor',
      'LLC': 'General Contractor',
      'SOLE PROPRIETOR': 'General Contractor',
      'PARTNERSHIP': 'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 12_000,
  },

  // ── Delaware DOR ────────────────────────────────────────────────────────
  // Division of Revenue — business license data.
  // Socrata: https://data.delaware.gov (view 5zy2-grhr)
  // SODA headers: business_name, trade_name, category, current_license_valid_from,
  //   current_license_valid_to, address_1, address_2, city, state, zip,
  //   license_number, geocoded_location
  // ~11K contractor records (RESIDENT CONTRACTOR + NON-RESIDENT CONTRACTOR)
  DE: {
    stateCode: 'DE',
    stateName: 'Delaware',
    agency: 'DOR',
    agencyUrl: 'https://revenue.delaware.gov',
    downloadUrl: "https://data.delaware.gov/resource/5zy2-grhr.csv?$limit=500000&$where=category in('RESIDENT CONTRACTOR','NON-RESIDENT CONTRACTOR')",
    format: 'csv',
    columns: {
      licenseNumber:  ['license_number', 'LICENSE_NUMBER', 'LICENSE NUMBER'],
      businessName:   ['business_name', 'BUSINESS_NAME', 'BUSINESS NAME'],
      dba:            ['trade_name', 'TRADE_NAME', 'TRADE NAME', 'DBA'],
      address:        ['address_1', 'ADDRESS_1', 'ADDRESS'],
      city:           ['city', 'CITY'],
      state:          ['state', 'STATE'],
      zipCode:        ['zip', 'ZIP', 'ZIP CODE'],
      licenseType:    ['category', 'CATEGORY'],
      issueDate:      ['current_license_valid_from', 'VALID FROM', 'ISSUE DATE'],
      expireDate:     ['current_license_valid_to', 'VALID TO', 'EXPIRE DATE'],
    },
    licenseTypeFilter: [],   // SODA $where already filters to contractors
    licenseTypeToCategory: {
      'RESIDENT CONTRACTOR': 'General Contractor',
      'NON-RESIDENT CONTRACTOR': 'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 11_000,
  },

  // ── Arkansas ACLB ───────────────────────────────────────────────────────
  // Arkansas Contractor Licensing Board — nightly CSV roster.
  // Direct download: http://aclb2.arkansas.gov/latestroster.csv
  // File has 2 skip rows (title line + blank line) before header row.
  // Headers: ID, CommResid, Name, DBA, Address, City, State, Zip, Email,
  //   Country, Phone, Restricted Projects Under 750000, Bid Limit, license,
  //   Div Comment, Exp, Class Desc, Spec, Style, Registration, Temporary, County, Officers
  // ~18.5K records, all construction contractors.
  AR: {
    stateCode: 'AR',
    stateName: 'Arkansas',
    agency: 'ACLB',
    agencyUrl: 'http://aclb2.arkansas.gov',
    downloadUrl: 'http://aclb2.arkansas.gov/latestroster.csv',
    format: 'csv',
    skipRows: 2,  // Title line + blank line before headers
    columns: {
      licenseNumber:  ['LICENSE', 'ID'],
      businessName:   ['NAME', 'BUSINESS NAME'],
      dba:            ['DBA'],
      address:        ['ADDRESS'],
      city:           ['CITY'],
      state:          ['STATE'],
      zipCode:        ['ZIP', 'ZIP CODE'],
      county:         ['COUNTY'],
      phone:          ['PHONE'],
      email:          ['EMAIL'],
      licenseType:    ['CLASS DESC', 'COMMRESID'],
      licenseClass:   ['SPEC'],
      expireDate:     ['EXP', 'EXPIRATION DATE'],
      bondAmount:     ['BID LIMIT'],
    },
    licenseTypeFilter: [],   // All records are construction contractors
    licenseTypeToCategory: {
      'C': 'General Contractor',       // Commercial
      'R': 'General Contractor',       // Residential
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 18_000,
  },

  // ── Vermont — DFS Licensing MasterList (Socrata, all construction trades) ──
  VT: {
    stateCode: 'VT',
    stateName: 'Vermont',
    agency: 'DFS',
    agencyUrl: 'https://firesafety.vermont.gov/',
    downloadUrl: 'https://data.vermont.gov/api/views/cy8e-89cz/rows.csv?accessType=DOWNLOAD',
    format: 'csv',
    columns: {
      firstName:      ['First Name', 'FIRST NAME', 'first_name'],
      lastName:       ['Last Name', 'LAST NAME', 'last_name'],
      address:        ['Street Address', 'STREET ADDRESS', 'street_address'],
      city:           ['City', 'CITY', 'city'],
      state:          ['State', 'STATE', 'state'],
      zipCode:        ['Zip Code', 'ZIP CODE', 'zip_code', 'ZIP'],
      licenseNumber:  ['License Number', 'LICENSE NUMBER', 'license_number'],
      expireDate:     ['License Exp Date', 'LICENSE EXP DATE', 'license_exp_date'],
      licenseType:    ['Type Desc', 'TYPE DESC', 'type_desc'],
      licenseClass:   ['Level Desc', 'LEVEL DESC', 'level_desc'],
    },
    licenseTypeFilter: [],   // All records are construction trades
    licenseTypeToCategory: {
      'Electrician':         'Electrical',
      'Plumber':             'Plumbing',
      'Gas Installer':       'HVAC',
      'Oil Installer':       'HVAC',
      'Boiler Inspector':    'HVAC',
      'Elevator Tradesman':  'General Contractor',
      'Elevator Inspector':  'General Contractor',
      'TQP':                 'Fire Protection',
      'Sprinkler Designer':  'Fire Protection',
      'Chimney Sweep':       'Chimney Services',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 5_000,
  },

  // ── Washington DC — DLCP Basic Business Licenses (ArcGIS Hub) ─────────
  // Department of Licensing and Consumer Protection — all business licenses.
  // ~258K total rows; we filter to construction-relevant categories.
  // Includes geographic coordinates, ward, ANC, etc.
  // ──────────────────────────────────────────────────────────────────────
  DC: {
    stateCode: 'DC',
    stateName: 'District of Columbia',
    agency: 'DLCP',
    agencyUrl: 'https://dlcp.dc.gov/',
    downloadUrl: 'https://hub.arcgis.com/api/v3/datasets/85bf98d3915f412c8a4de706f2d13513_0/downloads/data?format=csv&spatialRefId=4326&where=1%3D1',
    format: 'csv',
    columns: {
      businessName:   ['ENTITY_NAME', 'entity_name', 'BILLING_NAME'],
      address:        ['SITE_ADDRESS', 'site_address', 'BILLING_ADDRESS'],
      city:           ['CITY', 'city'],
      state:          ['STATE', 'state'],
      zipCode:        ['ZIP', 'zip'],
      licenseNumber:  ['CUSTOMER_NUMBER', 'customer_number'],
      licenseType:    ['LICENSECATEGORY', 'licensecategory', 'LICENSE_CATEGORY_TEXT'],
      status:         ['LICENSESTATUS', 'licensestatus'],
      issueDate:      ['LICENSE_ISSUE_DATE', 'license_issue_date'],
      expireDate:     ['LICENSE_END_DATE', 'license_end_date'],
    },
    // Filter to construction-related license categories
    licenseTypeFilter: [
      'CONTRACTOR', 'CONSTRUCTION', 'HOME IMPROVEMENT',
    ],
    licenseTypeToCategory: {
      'GENERAL CONTRACTOR/CONSTRUCTION MANAGER':  'General Contractor',
      'HOME IMPROVEMENT CONTRACTOR':              'General Contractor',
      'HOME IMPROVEMENT SALESPERSON':             'General Contractor',
      'CONTRACTOR AND CONSTRUCTION SERVICES':     'General Contractor',
      ...GENERIC_CONTRACTOR_CATEGORY,
    },
    estimatedRecords: 5_000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: look up best category for a raw license type string
// ─────────────────────────────────────────────────────────────────────────────

export function resolveCategory(
  rawType: string,
  config: StateConfig,
): string {
  const upper = rawType.toUpperCase().trim();

  // Handle pipe-separated classification codes (CSLB style: "B| HAZ", "C10| C36")
  // Try each code individually; return the category for the first recognized code.
  if (upper.includes('|')) {
    const codes = upper.split('|').map(c => c.trim()).filter(Boolean);
    for (const code of codes) {
      // Exact match on each code
      if (config.licenseTypeToCategory[code]) {
        return config.licenseTypeToCategory[code];
      }
    }
    // If no exact match per code, fall through to the standard logic below
    // using the first code as the representative type
    const firstCode = codes[0] ?? upper;
    if (config.licenseTypeToCategory[firstCode]) {
      return config.licenseTypeToCategory[firstCode];
    }
  }

  // Exact match first
  if (config.licenseTypeToCategory[upper]) {
    return config.licenseTypeToCategory[upper];
  }
  // Partial / contains match — deliberately conservative to avoid false positives
  // (e.g. "C10" should not match "C1" via includes).  We only allow the map key
  // to contain the rawType, not the other direction, for short codes (<= 4 chars).
  for (const [key, cat] of Object.entries(config.licenseTypeToCategory)) {
    const keyUpper = key.toUpperCase();
    if (upper === keyUpper) return cat;                           // exact (already handled above)
    if (upper.length > 4 && upper.includes(keyUpper)) return cat; // rawType contains key (long types only)
    if (keyUpper.length > 4 && keyUpper.includes(upper)) return cat; // key contains rawType (long keys only)
  }
  return 'General Contractor';
}
