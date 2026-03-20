#!/usr/bin/env npx tsx
/**
 * importArcGIS.ts
 *
 * Imports contractor data from ArcGIS REST Feature Services.
 * Many cities publish permit and licensing data on ArcGIS Hub
 * instead of Socrata — this importer handles the ArcGIS REST API.
 *
 * Usage:
 *   npx tsx server/scripts/importArcGIS.ts [--dry-run] [--dataset <key>|all]
 *
 * ArcGIS REST API pattern:
 *   {serviceUrl}/FeatureServer/{layerId}/query
 *   ?where=1%3D1&outFields=*&f=json&resultRecordCount=2000&resultOffset=N
 *   &orderByFields=ObjectId+ASC
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const datasetArg = args.find(a => a === '--dataset')
  ? args[args.indexOf('--dataset') + 1]
  : 'all';

const DB_PATH = './server/constructflix.db';
const PAGE_SIZE = 2000;
const RATE_LIMIT_MS = 200;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ArcGISDataset {
  key: string;
  label: string;
  serviceUrl: string;   // Base FeatureServer URL (no layer ID)
  layerId: number;      // Usually 0
  where: string;        // SQL WHERE clause for filtering
  nameField: string;    // Attribute field with contractor/business name
  cityField?: string;
  stateField?: string;
  zipField?: string;
  addressField?: string;
  phoneField?: string;
  licenseField?: string;
  defaultState: string;
  defaultCity?: string;
  dataSource: string;
  objectIdField?: string; // default 'ObjectId'
  skipBusinessFilter?: boolean; // skip the isLikelyBusiness heuristic for datasets already scoped to businesses
  zipFromAddressField?: string; // parse zip from a combined address string field (e.g. "123 MAIN ST CITY MN 55401")
  pageSize?: number; // override global PAGE_SIZE (use smaller value for rate-limited services)
  rateLimitMs?: number; // override global RATE_LIMIT_MS per dataset
}

const DATASETS: ArcGISDataset[] = [
  {
    key: 'nashville',
    label: 'Nashville TN Building Permits',
    serviceUrl: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Building_Permits_Issued_2/FeatureServer',
    layerId: 0,
    where: "Contact IS NOT NULL AND Contact <> '' AND Contact <> 'N/A' AND Contact NOT LIKE '%SELF CONTRACTOR%' AND Contact NOT LIKE '%SELF-CONTRACTOR%'",
    nameField: 'Contact',
    cityField: 'City',
    stateField: 'State',
    zipField: 'ZIP',
    defaultState: 'TN',
    defaultCity: 'Nashville',
    dataSource: 'permits_nashville',
    objectIdField: 'ObjectId',
  },
  {
    key: 'columbus_oh',
    label: 'Columbus OH Building Permits',
    serviceUrl: 'https://services1.arcgis.com/9yy6msODkIBzkUXU/arcgis/rest/services/Building_Permits/FeatureServer',
    layerId: 0,
    where: "APPLICANT_BUS_NAME IS NOT NULL AND APPLICANT_BUS_NAME <> ''",
    nameField: 'APPLICANT_BUS_NAME',
    zipField: 'B1_SITUS_ZIP',
    defaultState: 'OH',
    defaultCity: 'Columbus',
    dataSource: 'permits_columbus_oh',
    objectIdField: 'OBJECTID',
    skipBusinessFilter: true,
  },
  {
    key: 'stpaul_mn',
    label: 'Saint Paul MN Approved Building Permits',
    serviceUrl: 'https://services1.arcgis.com/9meaaHE3uiba0zr8/arcgis/rest/services/Approved_Building_Permits/FeatureServer',
    layerId: 0,
    where: "CONTRACTORNAME IS NOT NULL AND CONTRACTORNAME <> ''",
    nameField: 'CONTRACTORNAME',
    zipFromAddressField: 'CONTRACTORADDRESS',
    defaultState: 'MN',
    defaultCity: 'Saint Paul',
    dataSource: 'permits_stpaul_mn',
    objectIdField: 'OBJECTID',
    skipBusinessFilter: true,
  },
  {
    key: 'raleigh_nc',
    label: 'Raleigh NC Building Permits',
    serviceUrl: 'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Building_Permits/FeatureServer',
    layerId: 0,
    where: "contractorcompanyname IS NOT NULL AND contractorcompanyname <> '' AND contractorzip IS NOT NULL AND contractorzip <> ''",
    nameField: 'contractorcompanyname',
    cityField: 'contractorcity',
    stateField: 'contractorstate',
    zipField: 'contractorzip',
    addressField: 'contractoraddress1',
    phoneField: 'contractorphone',
    licenseField: 'contractorlicnum',
    defaultState: 'NC',
    defaultCity: 'Raleigh',
    dataSource: 'permits_raleigh_nc',
    objectIdField: 'OBJECTID',
  },
  {
    key: 'nashville_contractors',
    label: 'Nashville TN Registered Professional Contractors',
    serviceUrl: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Registered_Professional_Contractors_view_2/FeatureServer',
    layerId: 0,
    where: "Company_Name IS NOT NULL AND Company_Name <> ''",
    nameField: 'Company_Name',
    cityField: 'City',
    stateField: 'ST',
    zipField: 'ZIP',
    phoneField: 'Phone',
    defaultState: 'TN',
    defaultCity: 'Nashville',
    dataSource: 'contractors_nashville_tn',
    objectIdField: 'ObjectId',
    skipBusinessFilter: true,
  },
  {
    key: 'nashville_trade',
    label: 'Nashville TN Trade Permits',
    serviceUrl: 'https://services2.arcgis.com/HdTo6HJqh92wn4D8/arcgis/rest/services/Trade_Permits_View/FeatureServer',
    layerId: 0,
    where: "Contact IS NOT NULL AND Contact <> '' AND Contact NOT LIKE '%SELF%' AND Contact NOT LIKE '%OWNER%'",
    nameField: 'Contact',
    cityField: 'City',
    stateField: 'State',
    zipField: 'Zip',
    defaultState: 'TN',
    defaultCity: 'Nashville',
    dataSource: 'permits_nashville_trade',
    objectIdField: 'OBJECTID',
    skipBusinessFilter: true,
  },
  {
    key: 'louisville_contractors',
    label: 'Louisville Metro KY Active Contractors',
    serviceUrl: 'https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/Louisville_Metro_KY_Active_Contractors/FeatureServer',
    layerId: 0,
    where: "FULLNAME IS NOT NULL AND FULLNAME <> ''",
    nameField: 'FULLNAME',
    cityField: 'CITY',
    stateField: 'STATE',
    zipField: 'ZIPCODE',
    addressField: 'ADDRESS1',
    phoneField: 'DAYTIMEPHONE',
    licenseField: 'LICENSENO',
    defaultState: 'KY',
    defaultCity: 'Louisville',
    dataSource: 'contractors_louisville_ky',
    objectIdField: 'ObjectId',
    skipBusinessFilter: true,
  },
  {
    key: 'louisville_permits',
    label: 'Louisville Metro KY Historical Building Permits',
    serviceUrl: 'https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/Louisville_Metro_KY_All_Permits_(Historical)/FeatureServer',
    layerId: 0,
    where: "CONTRACTOR IS NOT NULL AND CONTRACTOR <> '' AND CONTRACTOR <> 'NO CONTRACTOR' AND CONTRACTOR <> 'OWNER'",
    nameField: 'CONTRACTOR',
    cityField: 'CITY',
    stateField: 'STATE',
    zipField: 'ZIPCODE',
    defaultState: 'KY',
    defaultCity: 'Louisville',
    dataSource: 'permits_louisville_ky',
    objectIdField: 'ObjectId',
    skipBusinessFilter: true,
  },
  {
    key: 'minneapolis_permits',
    label: 'Minneapolis MN Construction Permits',
    serviceUrl: 'https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/CCS_Permits/FeatureServer',
    layerId: 0,
    where: "applicantName IS NOT NULL AND applicantName <> ''",
    nameField: 'applicantName',
    cityField: 'applicantCity',
    addressField: 'applicantAddress1',
    defaultState: 'MN',
    defaultCity: 'Minneapolis',
    dataSource: 'permits_minneapolis_mn',
    objectIdField: 'OBJECTID',
    pageSize: 500,       // services.arcgis.com rate-limits at ~6000 "units"/min; 500 records/query stays safe
    rateLimitMs: 6000,  // 6s between requests: 500 records × 10 req/min = 5000 units/min (under limit)
  },
  {
    key: 'charlotte_nc',
    label: 'Charlotte/Mecklenburg NC Building Permits',
    serviceUrl: 'https://meckgis.mecklenburgcountync.gov/server/rest/services/BuildingPermits/FeatureServer',
    layerId: 0,
    where: "ownname IS NOT NULL AND ownname <> '' AND ownzipcode IS NOT NULL AND ownzipcode > 10000",
    nameField: 'ownname',
    zipField: 'ownzipcode',
    defaultState: 'NC',
    defaultCity: 'Charlotte',
    dataSource: 'permits_charlotte_nc',
    objectIdField: 'OBJECTID',
    // ownname is the permit applicant (builder/developer) — apply business filter to exclude homeowners
    skipBusinessFilter: false,
  },
  {
    key: 'sacramento_issued',
    label: 'Sacramento CA Building Permits Issued Archive',
    serviceUrl: 'https://services5.arcgis.com/54falWtcpty3V47Z/ArcGIS/rest/services/BldgPermitIssued_Archive/FeatureServer',
    layerId: 0,
    where: "Contractor IS NOT NULL AND Contractor <> '' AND ZIP IS NOT NULL AND ZIP <> ''",
    nameField: 'Contractor',
    zipField: 'ZIP',
    defaultState: 'CA',
    defaultCity: 'Sacramento',
    dataSource: 'permits_sacramento_ca',
    objectIdField: 'OBJECTID',
    skipBusinessFilter: true,
  },
  {
    key: 'sacramento_applied',
    label: 'Sacramento CA Building Permits Applied Archive',
    serviceUrl: 'https://services5.arcgis.com/54falWtcpty3V47Z/ArcGIS/rest/services/BldgPermitApplied_Archive/FeatureServer',
    layerId: 0,
    where: "Contractor IS NOT NULL AND Contractor <> '' AND ZIP IS NOT NULL AND ZIP <> ''",
    nameField: 'Contractor',
    zipField: 'ZIP',
    defaultState: 'CA',
    defaultCity: 'Sacramento',
    dataSource: 'permits_sacramento_applied_ca',
    objectIdField: 'OBJECTID',
    skipBusinessFilter: true,
  },
  {
    key: 'sanjose_permits',
    label: 'San Jose CA Building Permits (Expired)',
    serviceUrl: 'https://geo.sanjoseca.gov/server/rest/services/PLN/PLN_PermitsAndComplaints/MapServer',
    layerId: 9,
    where: "CONTRACTOR IS NOT NULL AND CONTRACTOR <> ''",
    nameField: 'CONTRACTOR',
    zipFromAddressField: 'ADDRESS',
    defaultState: 'CA',
    defaultCity: 'San Jose',
    dataSource: 'permits_sanjose_ca',
    objectIdField: 'OBJECTID',
    skipBusinessFilter: true,
  },
  {
    key: 'detroit_trades',
    label: 'Detroit MI Trades Permits (BSEED)',
    serviceUrl: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/bseed_trades_permits/FeatureServer',
    layerId: 0,
    where: "contact_business_name IS NOT NULL AND contact_business_name <> ''",
    nameField: 'contact_business_name',
    addressField: 'contractor_address',
    zipField: 'zip_code',
    defaultState: 'MI',
    defaultCity: 'Detroit',
    dataSource: 'permits_detroit_trades',
    objectIdField: 'ObjectId',
    skipBusinessFilter: true,
  },
  {
    key: 'detroit_demolition',
    label: 'Detroit MI Demolition Permits (BSEED)',
    serviceUrl: 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/bseed_demolition_permits/FeatureServer',
    layerId: 0,
    where: "demolition_contractor IS NOT NULL AND demolition_contractor <> ''",
    nameField: 'demolition_contractor',
    addressField: 'demolition_contractor_address',
    zipField: 'zip_code',
    defaultState: 'MI',
    defaultCity: 'Detroit',
    dataSource: 'permits_detroit_demo',
    objectIdField: 'ObjectId',
    skipBusinessFilter: true,
  },
];

async function queryFeatureService(
  dataset: ArcGISDataset,
  offset: number,
): Promise<Record<string, any>[]> {
  const objectIdField = dataset.objectIdField || 'ObjectId';
  const effectivePageSize = dataset.pageSize ?? PAGE_SIZE;
  const params = new URLSearchParams({
    where: dataset.where,
    outFields: '*',
    f: 'json',
    resultRecordCount: String(effectivePageSize),
    resultOffset: String(offset),
    orderByFields: `${objectIdField} ASC`,
  });

  const url = `${dataset.serviceUrl}/${dataset.layerId}/query?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ArcGIS: ${(await resp.text()).slice(0, 200)}`);

  const data = await resp.json() as { features?: any[]; error?: any };
  if (data.error) throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`);

  return (data.features || []).map(f => f.attributes || {});
}

async function importDataset(
  cfg: ArcGISDataset,
  db: Database.Database,
): Promise<{ inserted: number; skipped: number }> {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO companies (
      id, businessName, city, state, zipCode, address,
      phone, licenseNumber, dataSource, lastUpdated
    ) VALUES (
      @id, @businessName, @city, @state, @zipCode, @address,
      @phone, @licenseNumber, @dataSource, @lastUpdated
    )
  `);

  const seen = new Set<string>();
  let inserted = 0, skipped = 0, totalFetched = 0;
  const now = new Date().toISOString();

  console.log(`\n[${cfg.key}] Starting import: ${cfg.label}`);

  const insertBatch = db.transaction((records: any[]) => {
    for (const r of records) {
      if (DRY_RUN) { inserted++; continue; }
      const res = insert.run(r);
      if (res.changes > 0) inserted++;
      else skipped++;
    }
  });

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      await sleep(cfg.rateLimitMs ?? RATE_LIMIT_MS);
      const page = await queryFeatureService(cfg, offset);
      if (page.length === 0) { hasMore = false; break; }

      const batch: any[] = [];

      for (const attrs of page) {
        totalFetched++;
        const name = (attrs[cfg.nameField] || '').toString().trim();
        if (!name || name.length < 2) continue;

        // Filter out individual person names (heuristic: no comma or INC/LLC/CORP etc.)
        // Nashville's Contact field sometimes has individual names like "John Smith"
        if (!cfg.skipBusinessFilter) {
          const isLikelyBusiness = /\b(LLC|INC|CORP|LTD|CO\b|COMPANY|SERVICES|CONSTRUCTION|CONTRACTORS?|GROUP|ENTERPRISES?|BUILDERS?|PLUMBING|ELECTRIC|ROOFING|HVAC|REMODELING|RESTORATION|MANAGEMENT|PROPERTIES|ASSOCIATES|PARTNERS)\b/i.test(name)
            || /^[A-Z0-9\s&,.'()-]{3,}$/.test(name) && name.length > 8; // all-caps = likely business
          if (!isLikelyBusiness) continue;
        }

        // Extract zip — either from a dedicated zip field or parsed from a combined address field
        let zip = '';
        if (cfg.zipFromAddressField) {
          const addrStr = (attrs[cfg.zipFromAddressField] || '').toString();
          const zipMatch = addrStr.match(/\b(\d{5})\b/);
          zip = zipMatch ? zipMatch[1] : '';
        } else {
          zip = (attrs[cfg.zipField || ''] || '').toString().replace(/\D/g, '').slice(0, 5);
        }
        const key = `${name.toLowerCase()}|${zip}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const city = (attrs[cfg.cityField || ''] || cfg.defaultCity || '').toString().trim();
        const state = (attrs[cfg.stateField || ''] || cfg.defaultState).toString().trim().toUpperCase().slice(0, 2);
        const address = (attrs[cfg.addressField || ''] || '').toString().trim();
        const phone = cfg.phoneField ? (attrs[cfg.phoneField] || '').toString().replace(/\D/g, '').slice(0, 10) || null : null;
        const licenseNumber = cfg.licenseField ? (attrs[cfg.licenseField] || '').toString().trim() || null : null;

        batch.push({
          id: `arcgis-${randomUUID()}`,
          businessName: name,
          city, state,
          zipCode: zip,
          address,
          phone,
          licenseNumber,
          dataSource: cfg.dataSource,
          lastUpdated: now,
        });
      }

      insertBatch(batch);
      offset += page.length;

      if (offset % 5000 === 0 || page.length < PAGE_SIZE) {
        console.log(`[${cfg.key}] ${totalFetched.toLocaleString()} fetched, ${inserted.toLocaleString()} unique inserted`);
      }

      // Stop only when the service returns nothing (offset exceeded total).
      // Using page.length < PAGE_SIZE would fail for services capped below PAGE_SIZE.
      if (page.length === 0) hasMore = false;

    } catch (err: any) {
      const msg = err.message || '';
      console.error(`[${cfg.key}] Error at offset ${offset}:`, msg);
      // For rate limit errors, wait longer and retry (don't advance offset)
      if (msg.includes('429') || msg.includes('Too many requests') || msg.includes('quota')) {
        console.log(`[${cfg.key}] Rate limited — waiting 75s before retry...`);
        await sleep(75000);
      } else {
        await sleep(2000);
        // on non-rate-limit error at offset 0 (likely bad URL/service), stop
        if (offset === 0) break;
      }
    }
  }

  console.log(`[${cfg.key}] Done. inserted=${inserted}, skipped=${skipped}`);
  return { inserted, skipped };
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const toRun = datasetArg === 'all'
    ? DATASETS
    : DATASETS.filter(d => d.key === datasetArg);

  if (toRun.length === 0) {
    console.error(`Dataset "${datasetArg}" not found. Available: ${DATASETS.map(d => d.key).join(', ')}`);
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════');
  console.log('  ArcGIS Contractor Import');
  console.log(`  Datasets: ${toRun.map(d => d.key).join(', ')}`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('════════════════════════════════════════════════');

  let totalInserted = 0;
  for (const cfg of toRun) {
    const { inserted } = await importDataset(cfg, db);
    totalInserted += inserted;
  }

  db.close();
  console.log('\n════════════════════════════════════════════════');
  console.log(`  Grand Total Inserted: ${totalInserted.toLocaleString()}`);
  console.log('════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
