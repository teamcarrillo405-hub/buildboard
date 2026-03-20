#!/usr/bin/env npx tsx
/**
 * importSocrataContractors.ts
 *
 * Imports contractor records from miscellaneous Socrata open data portals
 * not covered by the major city permit importers.
 *
 * Datasets:
 *   dallas      — Dallas Active Contractors (www.dallasopendata.com / jhgk-eg9m)
 *   ny_registry — NY State Contractor Registry (data.ny.gov / i4jv-zkey)
 *   or_bcd      — Oregon BCD Active Licenses (data.oregon.gov / vhbr-cuaq)
 *
 * Usage:
 *   npx tsx server/scripts/importSocrataContractors.ts [--dry-run] [--dataset dallas|ny_registry|or_bcd|all]
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
const PAGE_SIZE = 1000;
const RATE_LIMIT_MS = 150;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface DatasetConfig {
  key: string;
  label: string;
  domain: string;
  datasetId: string;
  whereClause?: string;
  mapRecord: (raw: Record<string, string>) => {
    businessName: string;
    city: string;
    state: string;
    zipCode: string;
    address: string;
    phone: string | null;
    licenseNumber: string | null;
    dataSource: string;
  } | null;
}

const DATASETS: DatasetConfig[] = [
  {
    key: 'dallas',
    label: 'Dallas Active Contractors',
    domain: 'www.dallasopendata.com',
    datasetId: 'jhgk-eg9m',
    mapRecord(raw) {
      const name = (raw.contractor || '').trim();
      if (!name || name.length < 2) return null;
      // city_state format: "DALLAS ,TX 75252"
      const csz = (raw.city_state || '').trim();
      const cszMatch = csz.match(/^(.+),\s*([A-Z]{2})\s+(\d{5})/);
      const city = cszMatch ? cszMatch[1].trim() : 'Dallas';
      const state = cszMatch ? cszMatch[2] : 'TX';
      const zip = cszMatch ? cszMatch[3] : '';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: (raw.address || '').trim(),
        phone: (raw.phone || '').replace(/\D/g, '').slice(0, 10) || null,
        licenseNumber: null,
        dataSource: 'license_dallas',
      };
    },
  },
  {
    key: 'ny_registry',
    label: 'NY State Contractor Registry',
    domain: 'data.ny.gov',
    datasetId: 'i4jv-zkey',
    whereClause: "status='Active'",
    mapRecord(raw) {
      const name = (raw.business_name || raw.dba_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: (raw.state || 'NY').trim().toUpperCase(),
        zipCode: zip,
        address: (raw.address || '').trim(),
        phone: (raw.phone || '').replace(/\D/g, '').slice(0, 10) || null,
        licenseNumber: (raw.certificate_number || '').trim() || null,
        dataSource: 'license_ny_registry',
      };
    },
  },
  {
    key: 'or_bcd',
    label: 'Oregon BCD Active Licenses',
    domain: 'data.oregon.gov',
    datasetId: 'vhbr-cuaq',
    whereClause: "lic_status='Active'",
    mapRecord(raw) {
      const name = (raw.full_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zipcode || '').replace(/\D/g, '').slice(0, 5);
      const state = (raw.state || '').trim().toUpperCase();
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: state || 'OR',
        zipCode: zip,
        address: (raw.addr1 || '').trim(),
        phone: null,
        licenseNumber: (raw.licnbr || '').trim() || null,
        dataSource: 'license_or_bcd',
      };
    },
  },
  {
    key: 'ct_hic',
    label: 'CT Home Improvement Contractor Licenses',
    domain: 'data.ct.gov',
    datasetId: '5r9m-qgni',
    whereClause: "active=1",
    mapRecord(raw) {
      const name = (raw.name || raw.dba || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: (raw.state || 'CT').trim().toUpperCase(),
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: (raw.fullcredentialcode || '').trim() || null,
        dataSource: 'license_ct_hic',
      };
    },
  },
  {
    key: 'honolulu',
    label: 'Honolulu Building Permits (Contractors)',
    domain: 'data.honolulu.gov',
    datasetId: '4vab-c87q',
    whereClause: "contractor IS NOT NULL AND contractor != '' AND contractor != 'NONE'",
    mapRecord(raw) {
      // Contractor field format: "COMPANY NAME\n123 Address / State Lic: CTXXXXX / ID: YYYYYYY / PH: (808) xxx-xxxx"
      const raw_contractor = (raw.contractor || '').trim();
      if (!raw_contractor || raw_contractor === 'NONE') return null;

      const lines = raw_contractor.split(/\n/).map(l => l.trim()).filter(Boolean);
      const name = lines[0]?.replace(/\s*c\/o:.*$/i, '').trim();
      if (!name || name.length < 2) return null;

      // Extract address (second line before " / State Lic:")
      const addrLine = lines[1] || '';
      const address = addrLine.split('/')[0].trim();

      // Extract phone from "PH: (808) xxx-xxxx"
      const phoneMatch = raw_contractor.match(/PH:\s*\((\d{3})\)\s*(\d{3})-(\d{4})/);
      const phone = phoneMatch ? `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}` : null;

      // Extract license number
      const licMatch = raw_contractor.match(/State Lic:\s*([A-Z0-9]+)/);
      const licenseNumber = licMatch ? licMatch[1] : null;

      // Address field has "1234 STREET ST Honolulu / Neighborhood ZIPCODE"
      const addrStr = (raw.address || '').trim();
      const zipMatch = addrStr.match(/(\d{5})$/);
      const zip = zipMatch ? zipMatch[1] : '';

      return {
        businessName: name,
        city: 'Honolulu',
        state: 'HI',
        zipCode: zip,
        address: address,
        phone,
        licenseNumber,
        dataSource: 'permits_honolulu',
      };
    },
  },
  {
    key: 'san_diego',
    label: 'San Diego County Building Permits - Contractors',
    domain: 'internal-sandiegocounty.data.socrata.com',
    datasetId: '76h4-nnmj',
    whereClause: "contractorcompan IS NOT NULL AND contractorcompan != ''",
    mapRecord(raw) {
      const name = (raw.contractorcompan || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.contractorzip || '').replace(/\D/g, '').slice(0, 5);
      const phone = (raw.contractorphone || '').replace(/[^\d]/g, '').slice(0, 10) || null;
      return {
        businessName: name,
        city: (raw.contractorcity || 'San Diego').trim(),
        state: (raw.contractorstate || 'CA').trim().toUpperCase(),
        zipCode: zip,
        address: (raw.contractoraddress1 || '').trim(),
        phone,
        licenseNumber: (raw.contractorlicnum || '').trim() || null,
        dataSource: 'permits_san_diego',
      };
    },
  },
  {
    key: 'seattle_trade',
    label: 'Seattle Trade Permits (Contractors)',
    domain: 'cos-data.seattle.gov',
    datasetId: 'c87v-5hwh',
    whereClause: "contractorcompanyname IS NOT NULL AND contractorcompanyname != ''",
    mapRecord(raw) {
      const name = (raw.contractorcompanyname || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.originalzip || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: (raw.originalcity || 'Seattle').trim(),
        state: (raw.originalstate || 'WA').trim().toUpperCase(),
        zipCode: zip,
        address: (raw.originaladdress1 || '').trim(),
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_seattle',
      };
    },
  },
  {
    key: 'gainesville',
    label: 'Gainesville FL Building Permits',
    domain: 'data.cityofgainesville.org',
    datasetId: 'p798-x3nx',
    whereClause: "contractor IS NOT NULL",
    mapRecord(raw) {
      // Use business name if available, fall back to contractor individual name
      const name = ((raw.business || '').trim() || (raw.contractor || '').trim());
      if (!name || name.length < 2) return null;
      const zip = (raw.zipcode || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: (raw.city || 'Gainesville').trim(),
        state: (raw.state || 'FL').trim().toUpperCase(),
        zipCode: zip,
        address: (raw.address || '').trim(),
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_gainesville',
      };
    },
  },
  {
    key: 'or_ccb',
    label: 'Oregon CCB Active Contractor Licenses',
    domain: 'data.oregon.gov',
    datasetId: 'g77e-6bhs',
    mapRecord(raw) {
      const name = (raw.full_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      const phone = (raw.phone_number || '').replace(/\D/g, '').slice(0, 10) || null;
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: (raw.state || 'OR').trim().toUpperCase(),
        zipCode: zip,
        address: (raw.address || '').trim(),
        phone,
        licenseNumber: (raw.license_number || '').trim() || null,
        dataSource: 'license_or_ccb',
      };
    },
  },
  {
    key: 'il_roofing',
    label: 'Illinois Roofing Contractor Licenses',
    domain: 'illinois-edp.data.socrata.com',
    datasetId: 'pzzh-kp68',
    whereClause: "license_type='ROOFING CONTRACTOR' AND license_status='ACTIVE' AND business='Y'",
    mapRecord(raw) {
      const name = (raw.business_name || raw.businessdba || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: (raw.state || 'IL').trim().toUpperCase(),
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: (raw.license_number || '').trim() || null,
        dataSource: 'license_il_roofing',
      };
    },
  },
  {
    key: 'wa_li',
    label: 'Washington State L&I Contractor Licenses',
    domain: 'data.wa.gov',
    datasetId: 'm8qx-ubtq',
    whereClause: "contractorlicensestatus='ACTIVE'",
    mapRecord(raw) {
      const name = (raw.businessname || '').trim().replace(/^!/, '');
      if (!name || name.length < 2) return null;
      const zip = (raw.zip || '').replace(/\D/g, '').slice(0, 5);
      const phone = (raw.phonenumber || '').replace(/\D/g, '').slice(0, 10) || null;
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: (raw.state || 'WA').trim().toUpperCase(),
        zipCode: zip,
        address: (raw.address1 || '').trim(),
        phone,
        licenseNumber: (raw.contractorlicensenumber || '').trim() || null,
        dataSource: 'license_wa_li',
      };
    },
  },
  {
    key: 'marin_co',
    label: 'Marin County CA Building Permits',
    domain: 'data.marincounty.gov',
    datasetId: 'mkbn-caye',
    whereClause: "contractor IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractor || '').trim();
      if (!name || name.length < 2) return null;
      // contractor_address format: "123 MAIN ST, CITY, STATE ZIP"
      const addrRaw = (raw.contractor_address || '').trim();
      const addrParts = addrRaw.split(',').map((s: string) => s.trim());
      const address = addrParts[0] || '';
      const cityPart = addrParts[1] || '';
      const stateZip = (addrParts[2] || '').trim();
      const stateMatch = stateZip.match(/^([A-Z]{2})\s+(\d{5})/);
      const state = stateMatch ? stateMatch[1] : 'CA';
      const zip = stateMatch ? stateMatch[2] : (raw.zip || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: cityPart || 'Marin',
        state,
        zipCode: zip,
        address,
        phone: null,
        licenseNumber: (raw.contractor_license || '').trim() || null,
        dataSource: 'permits_marin_co',
      };
    },
  },
  {
    key: 'kc_permits',
    label: 'Kansas City MO Building Permits 2010-2019',
    domain: 'data.kcmo.org',
    datasetId: 'jnga-5v37',
    whereClause: "applicant_name IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.applicant_name || '').trim();
      if (!name || name.length < 2) return null;
      // zip is job site zip (best proxy for contractor work area)
      const zip = (raw.zip || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: 'Kansas City',
        state: 'MO',
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_kc',
      };
    },
  },
  {
    key: 'kc_permits_2020',
    label: 'Kansas City MO Building Permits 2020+',
    domain: 'data.kcmo.org',
    datasetId: 'cwrz-29jm',
    whereClause: "applicant_name IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.applicant_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.originalzip || raw.zip || '').replace(/\D/g, '').slice(0, 5);
      return {
        businessName: name,
        city: 'Kansas City',
        state: 'MO',
        zipCode: zip,
        address: (raw.originaladdress1 || '').trim(),
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_kc_2020',
      };
    },
  },
  {
    key: 'cincinnati',
    label: 'Cincinnati OH Building Permit Contacts',
    domain: 'data.cincinnati-oh.gov',
    datasetId: 'vmk6-gy84',
    whereClause: "name IS NOT NULL AND zip IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip || '').replace(/\D/g, '').slice(0, 5);
      // address_2 format: "CINCINNATI OH" or "COVINGTON KY"
      const addr2 = (raw.address_2 || '').trim();
      const addr2Parts = addr2.split(/\s+/);
      const state = addr2Parts.length >= 2 ? addr2Parts[addr2Parts.length - 1].toUpperCase() : 'OH';
      const city = addr2Parts.length >= 2 ? addr2Parts.slice(0, -1).join(' ') : 'Cincinnati';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: (raw.address_1 || '').trim(),
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_cincinnati',
      };
    },
  },
  {
    key: 'cambridge_ma',
    label: 'Cambridge MA Building Permits',
    domain: 'data.cambridgema.gov',
    datasetId: 'qu2z-8suj',
    whereClause: "firm_name IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.firm_name || '').trim();
      if (!name || name.length < 2) return null;
      // full_address: "123 Main St, Cambridge, MA 02139"
      const addr = (raw.full_address || '').trim();
      const zipMatch = addr.match(/(\d{5})(-\d{4})?$/);
      const zip = zipMatch ? zipMatch[1] : '';
      const stateMatch = addr.match(/,\s*([A-Z]{2})\s+\d{5}/);
      const state = stateMatch ? stateMatch[1] : 'MA';
      const cityMatch = addr.match(/,\s*([^,]+),\s*[A-Z]{2}\s+\d{5}/);
      const city = cityMatch ? cityMatch[1].trim() : 'Cambridge';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: addr.split(',')[0]?.trim() || '',
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_cambridge_ma',
      };
    },
  },
  {
    key: 'nyc_dob_now',
    label: 'NYC DOB NOW Build Permits',
    domain: 'data.cityofnewyork.us',
    datasetId: 'rbx6-tga4',
    whereClause: "applicant_business_name IS NOT NULL",
    mapRecord(raw) {
      // Extract applicant business (contractor) — primary
      const name = (raw.applicant_business_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      // Borough → city mapping
      const boroughCity: Record<string, string> = {
        'MANHATTAN': 'New York', 'BROOKLYN': 'Brooklyn',
        'QUEENS': 'Queens', 'BRONX': 'Bronx', 'STATEN ISLAND': 'Staten Island',
      };
      const city = boroughCity[(raw.borough || '').toUpperCase()] || (raw.borough || 'New York');
      return {
        businessName: name,
        city,
        state: 'NY',
        zipCode: zip,
        address: (raw.applicant_business_address || '').trim(),
        phone: null,
        licenseNumber: (raw.applicant_license || '').trim() || null,
        dataSource: 'permits_nyc_now',
      };
    },
  },
  {
    key: 'mesa_az',
    label: 'Mesa AZ Building Permits (Contractors)',
    domain: 'citydata.mesaaz.gov',
    datasetId: 'dzpk-hxfb',
    whereClause: "contractor_name IS NOT NULL AND contractor_zip IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractor_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.contractor_zip || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const phone = (raw.contractor_phone || '').replace(/\D/g, '').slice(0, 10) || null;
      const email = (raw.contractor_email || '').trim().toLowerCase() || null;
      return {
        businessName: name,
        city: (raw.contractor_city || 'Mesa').trim(),
        state: (raw.contractor_state || 'AZ').trim().toUpperCase(),
        zipCode: zip,
        address: (raw.contractor_address || '').trim(),
        phone,
        licenseNumber: (raw.contractor_license || '').trim() || null,
        dataSource: 'permits_mesa_az',
      };
    },
  },
  {
    key: 'san_diego_co',
    label: 'San Diego County Building Permits (v2)',
    domain: 'internal-sandiegocounty.data.socrata.com',
    datasetId: 'dyzh-7eat',
    whereClause: "CONTRACTOR_NAME IS NOT NULL AND ZIP_CODE IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractor_name || raw.CONTRACTOR_NAME || '').trim();
      if (!name || name.length < 2) return null;
      // ZIP_CODE is permit site zip — also parse contractor_address for contractor zip
      const addrRaw = (raw.contractor_address || raw.CONTRACTOR_ADDRESS || '').trim();
      const addrZipMatch = addrRaw.match(/\b(\d{5})\b/g);
      const zip = addrZipMatch ? addrZipMatch[addrZipMatch.length - 1] : (raw.zip_code || raw.ZIP_CODE || '').replace(/\D/g, '').slice(0, 5);
      const phone = (raw.contractor_phone || raw.CONTRACTOR_PHONE || '').replace(/\D/g, '').slice(0, 10) || null;
      // Extract city/state from address: "6056 EAST BASELINE ROAD #155, MESA, AZ 85206"
      const csMatch = addrRaw.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}/);
      const city = csMatch ? csMatch[1].trim() : 'San Diego';
      const state = csMatch ? csMatch[2] : 'CA';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: addrRaw.split(',')[0]?.trim() || '',
        phone,
        licenseNumber: null,
        dataSource: 'permits_san_diego_co',
      };
    },
  },
  {
    key: 'austin_tx',
    label: 'Austin TX Issued Construction Permits',
    domain: 'datahub.austintexas.gov',
    datasetId: '3syk-w9eu',
    whereClause: "contractor_company_name IS NOT NULL AND contractor_zip IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractor_company_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.contractor_zip || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const phone = (raw.contractor_phone || '').replace(/\D/g, '').slice(0, 10) || null;
      return {
        businessName: name,
        city: (raw.contractor_city || 'Austin').trim(),
        state: 'TX',
        zipCode: zip,
        address: (raw.contractor_address2 || '').trim(),
        phone,
        licenseNumber: null,
        dataSource: 'permits_austin_tx',
      };
    },
  },
  {
    key: 'orlando_fl',
    label: 'Orlando FL Building Permit Applications',
    domain: 'data.cityoforlando.net',
    datasetId: 'ryhf-m453',
    whereClause: "contractor_name IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractor_name || '').trim();
      if (!name || name.length < 2) return null;
      // contractor_address format: "5448 HOFFNER AVE,#101,ORLANDO, FL 32812"
      const addrRaw = (raw.contractor_address || '').trim();
      const zipMatch = addrRaw.match(/(\d{5})(-\d{4})?$/);
      const zip = zipMatch ? zipMatch[1] : '';
      const stateMatch = addrRaw.match(/,\s*([A-Z]{2})\s+\d{5}/);
      const state = stateMatch ? stateMatch[1] : 'FL';
      const cityMatch = addrRaw.match(/,\s*([^,]+),\s*[A-Z]{2}\s+\d{5}/);
      const city = cityMatch ? cityMatch[1].trim() : 'Orlando';
      const phone = (raw.contractor_phone_number || '').replace(/\D/g, '').slice(0, 10) || null;
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: addrRaw.split(',')[0]?.trim() || '',
        phone,
        licenseNumber: null,
        dataSource: 'permits_orlando_fl',
      };
    },
  },
  {
    key: 'nola_permits',
    label: 'New Orleans Building Permits (Contractors)',
    domain: 'data.nola.gov',
    datasetId: '72f9-bi28',
    whereClause: "ContractorCompanyName IS NOT NULL AND OriginalZip IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractorcompanyname || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.originalzip || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      return {
        businessName: name,
        city: 'New Orleans',
        state: (raw.contractorstatelic || 'LA').trim().toUpperCase().slice(0, 2),
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: (raw.contractorlicnum || '').trim() || null,
        dataSource: 'permits_nola',
      };
    },
  },
  {
    key: 'dallas_permits',
    label: 'Dallas TX Building Permits (Contractor Field)',
    domain: 'www.dallasopendata.com',
    datasetId: 'e7gq-4sah',
    whereClause: "contractor IS NOT NULL AND contractor != ''",
    mapRecord(raw) {
      // contractor format: "COMPANY NAME 123 ADDR ST, CITY, TX 75000 (214) 555-1234"
      const full = (raw.contractor || '').trim();
      if (!full || full.length < 5) return null;

      // Extract phone at end
      const phoneMatch = full.match(/\((\d{3})\)\s*(\d{3})-(\d{4})\s*$/);
      const phone = phoneMatch ? `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}` : null;
      const withoutPhone = phone ? full.slice(0, full.lastIndexOf('(')).trim() : full;

      // Extract last 5-digit zip
      const zipMatch = withoutPhone.match(/\b(\d{5})\b[^,]*$/);
      if (!zipMatch) return null;
      const zip = zipMatch[1];

      // Extract state (2 uppercase letters before zip)
      const stateMatch = withoutPhone.match(/,\s*([A-Z]{2})\s+\d{5}/);
      const state = stateMatch ? stateMatch[1] : 'TX';

      // Extract city (between last comma and state)
      const cityMatch = withoutPhone.match(/,\s*([^,]+),\s*[A-Z]{2}\s+\d{5}/);
      const city = cityMatch ? cityMatch[1].trim() : 'Dallas';

      // Name = everything before the first digit (address starts with number)
      const nameMatch = withoutPhone.match(/^(.*?)\s+(?=\d)/);
      const name = nameMatch ? nameMatch[1].trim() : withoutPhone.split(',')[0].trim();
      if (!name || name.length < 2) return null;

      // Filter out non-business entries
      if (/^(OWNER|SELF|NONE|N\/A|NA|NO CONTRACTOR)$/i.test(name)) return null;

      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: '',
        phone,
        licenseNumber: null,
        dataSource: 'permits_dallas_tx',
      };
    },
  },
  {
    key: 'little_rock_ar',
    label: 'Little Rock AR Building Permits (Contractor)',
    domain: 'data.littlerock.gov',
    datasetId: 'mkfu-qap3',
    whereClause: "contractor IS NOT NULL AND contractor != '' AND contractor != 'OWNER' AND contractor != 'OWNER-BUILDER' AND propertyzip IS NOT NULL AND propertyzip != ''",
    mapRecord(raw) {
      const name = (raw.contractor || '').trim();
      if (!name || name.length < 2) return null;
      if (/^(OWNER|SELF|N\/A|NA|NONE|NO CONTRACTOR)$/i.test(name)) return null;
      const zip = (raw.propertyzip || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      return {
        businessName: name,
        city: (raw.propertycity || 'Little Rock').trim(),
        state: (raw.propertystate || 'AR').trim().toUpperCase(),
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: (raw.licensenumber || '').trim() || null,
        dataSource: 'permits_little_rock_ar',
      };
    },
  },
  {
    key: 'dallas_building',
    label: 'Dallas TX Building Permits',
    domain: 'www.dallasopendata.com',
    datasetId: 'e7gq-4sah',
    whereClause: "contractor IS NOT NULL",
    mapRecord(raw) {
      const contractorBlob = (raw.contractor || '').trim();
      if (!contractorBlob) return null;
      // Extract name: everything before first digit (street number starts address portion)
      const nameMatch = contractorBlob.match(/^([^0-9]+)/);
      const name = nameMatch ? nameMatch[1].trim().replace(/\s*[,/\\]+\s*$/, '').trim() : '';
      if (!name || name.length < 2) return null;
      // Use project zip if valid, else parse from blob
      const projectZip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      const blobZipMatch = contractorBlob.match(/\b(\d{5})\b/);
      const zip = (projectZip && projectZip !== '00000') ? projectZip : (blobZipMatch ? blobZipMatch[1] : '');
      if (!zip) return null;
      return {
        businessName: name,
        city: 'Dallas',
        state: 'TX',
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_dallas_building',
      };
    },
  },
  {
    key: 'collin_tx',
    label: 'Collin County TX Building Permits (CAD)',
    domain: 'data.texas.gov',
    datasetId: '82ee-gbj5',
    whereClause: "permitbuildername IS NOT NULL AND permitbuildername != 'NONE GIVEN' AND situszip IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.permitbuildername || '').trim();
      if (!name || name.length < 2 || name.toUpperCase() === 'NONE GIVEN') return null;
      const zip = (raw.situszip || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const city = (raw.situscity || '').trim();
      return {
        businessName: name,
        city,
        state: 'TX',
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_collin_tx',
      };
    },
  },
  {
    key: 'ct_hic',
    label: 'Connecticut Home Improvement Contractors',
    domain: 'data.ct.gov',
    datasetId: '5r9m-qgni',
    whereClause: "businessname IS NOT NULL AND businessname != '' AND zip IS NOT NULL",
    mapRecord(raw) {
      // Use businessname for companies; dba for sole proprietors with a trade name
      const name = (raw.businessname || raw.dba || '').trim();
      if (!name || name.length < 2) return null;
      // zip is 9-digit format like "060102809" — take first 5
      const zip = (raw.zip || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: (raw.state || 'CT').trim().toUpperCase().slice(0, 2) || 'CT',
        zipCode: zip,
        address: '',
        phone: null,
        licenseNumber: (raw.credentialnumber || '').trim() || null,
        dataSource: 'license_ct_hic',
      };
    },
  },
  {
    key: 'iowa_contractors',
    label: 'Iowa Active Construction Contractor Registrations',
    domain: 'mydata.iowa.gov',
    datasetId: 'dpf3-iz94',
    mapRecord(raw) {
      const name = (raw.business_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      return {
        businessName: name,
        city: (raw.city || '').trim(),
        state: (raw.state || 'IA').trim().toUpperCase().slice(0, 2) || 'IA',
        zipCode: zip,
        address: (raw.address_1 || '').trim(),
        phone: (raw.phone || '').replace(/\D/g, '').slice(0, 10) || null,
        licenseNumber: (raw.registration_number || '').trim() || null,
        dataSource: 'license_ia',
      };
    },
  },
  {
    key: 'sf_permits',
    label: 'San Francisco Building Permits (Contractors)',
    domain: 'data.sfgov.org',
    datasetId: 'cw8k-gwb7',
    whereClause: "role='contractor' AND firm_name IS NOT NULL AND firm_name != '' AND firm_zipcode IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.firm_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.firm_zipcode || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const city = (raw.firm_city || 'San Francisco').trim();
      const state = (raw.firm_state || 'CA').trim().toUpperCase().slice(0, 2) || 'CA';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: (raw.firm_address || '').trim(),
        phone: null,
        licenseNumber: (raw.license1 || '').trim() || null,
        dataSource: 'permits_sf_ca',
      };
    },
  },
  {
    key: 'la_commercial',
    label: 'Los Angeles Commercial Building & Safety Permits',
    domain: 'data.lacity.org',
    datasetId: 'y4zb-t59m',
    whereClause: "contractors_business_name IS NOT NULL AND contractors_business_name != '' AND zip_code IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractors_business_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const city = (raw.contractor_city || 'Los Angeles').trim();
      const state = (raw.contractor_state || 'CA').trim().toUpperCase().slice(0, 2) || 'CA';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: (raw.contractor_address || '').trim(),
        phone: null,
        licenseNumber: (raw.license || '').trim() || null,
        dataSource: 'permits_la_commercial',
      };
    },
  },
  {
    key: 'seattle_permits',
    label: 'Seattle WA Building Permits',
    domain: 'data.seattle.gov',
    datasetId: '76t5-zqzr',
    whereClause: "ContractorCompanyName IS NOT NULL AND OriginalZip IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractorcompanyname || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.originalzip || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const city = (raw.originalcity || 'Seattle').trim();
      const state = (raw.originalstate || 'WA').trim().toUpperCase().slice(0, 2) || 'WA';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: (raw.originaladdress1 || '').trim(),
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_seattle_wa',
      };
    },
  },
  {
    key: 'la_electrical',
    label: 'Los Angeles Electrical Permits',
    domain: 'data.lacity.org',
    datasetId: 'y3c3-hqwu',
    whereClause: "contractors_business_name IS NOT NULL AND contractors_business_name != '' AND zip_code IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractors_business_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const city = (raw.contractor_city || 'Los Angeles').trim();
      const state = (raw.contractor_state || 'CA').trim().toUpperCase().slice(0, 2) || 'CA';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: (raw.contractor_address || '').trim(),
        phone: null,
        licenseNumber: (raw.license || '').trim() || null,
        dataSource: 'permits_la_electrical',
      };
    },
  },
  {
    key: 'la_building',
    label: 'Los Angeles Building Permits',
    domain: 'data.lacity.org',
    datasetId: 'xnhu-aczu',
    whereClause: "contractors_business_name IS NOT NULL AND contractors_business_name != '' AND zip_code IS NOT NULL",
    mapRecord(raw) {
      const name = (raw.contractors_business_name || '').trim();
      if (!name || name.length < 2) return null;
      const zip = (raw.zip_code || '').replace(/\D/g, '').slice(0, 5);
      if (!zip) return null;
      const city = (raw.contractor_city || 'Los Angeles').trim();
      const state = (raw.contractor_state || 'CA').trim().toUpperCase().slice(0, 2) || 'CA';
      return {
        businessName: name,
        city,
        state,
        zipCode: zip,
        address: (raw.contractor_address || '').trim(),
        phone: null,
        licenseNumber: (raw.license || '').trim() || null,
        dataSource: 'permits_la_building',
      };
    },
  },
  {
    key: 'somerville_ma',
    label: 'Somerville MA Permits and Licenses',
    domain: 'data.somervillema.gov',
    datasetId: 'nneb-s3f7',
    whereClause: "contractor_company IS NOT NULL AND contractor_company != ''",
    mapRecord(raw) {
      const name = (raw.contractor_company || '').trim();
      if (!name || name.length < 2) return null;
      // application_address: "50 SPRING ST, SOMERVILLE MASSACHUSETTS 02143"
      const addr = (raw.application_address || '').trim();
      const zipMatch = addr.match(/(\d{5})$/);
      const zip = zipMatch ? zipMatch[1] : '';
      return {
        businessName: name,
        city: 'Somerville',
        state: 'MA',
        zipCode: zip,
        address: addr.split(',')[0]?.trim() || '',
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_somerville_ma',
      };
    },
  },
  {
    key: 'baton_rouge',
    label: 'Baton Rouge EBR Building Permits',
    domain: 'data.brla.gov',
    datasetId: '7fq7-8j7r',
    whereClause: "contractorname IS NOT NULL AND contractorname != 'N/A' AND contractorname != ''",
    mapRecord(raw) {
      const name = (raw.contractorname || '').trim();
      if (!name || name.length < 2 || name === 'N/A') return null;
      // contractoraddress format: "123 STREET, CITY, LA 70000" or ", , LA"
      const addrRaw = (raw.contractoraddress || '').trim();
      const addrParts = addrRaw.split(',').map((s: string) => s.trim());
      const address = addrParts[0] || '';
      // zip from address field of permit: "123 STREET BATON ROUGE LA 70811"
      const zipMatch = (raw.address || '').match(/(\d{5})$/);
      const zip = zipMatch ? zipMatch[1] : '';
      return {
        businessName: name,
        city: (raw.city1 || 'Baton Rouge').trim(),
        state: (raw.state1 || 'LA').trim().toUpperCase(),
        zipCode: zip,
        address,
        phone: null,
        licenseNumber: null,
        dataSource: 'permits_baton_rouge',
      };
    },
  },
];

async function fetchPage(domain: string, datasetId: string, offset: number, whereClause?: string): Promise<Record<string, string>[]> {
  const params = new URLSearchParams({
    '$limit': String(PAGE_SIZE),
    '$offset': String(offset),
  });
  if (whereClause) params.set('$where', whereClause);

  const url = `https://${domain}/resource/${datasetId}.json?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${domain}/${datasetId}: ${(await resp.text()).slice(0, 200)}`);
  return resp.json() as Promise<Record<string, string>[]>;
}

async function importDataset(cfg: DatasetConfig, db: Database.Database): Promise<{ inserted: number; skipped: number; errors: number }> {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO companies (
      id, businessName, city, state, zipCode, address,
      phone, licenseNumber, dataSource, lastUpdated
    ) VALUES (
      @id, @businessName, @city, @state, @zipCode, @address,
      @phone, @licenseNumber, @dataSource, @lastUpdated
    )
  `);

  const insertBatch = db.transaction((records: any[]) => {
    for (const r of records) {
      if (DRY_RUN) continue;
      insert.run(r);
    }
  });

  const seen = new Set<string>();
  let offset = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const now = new Date().toISOString();

  console.log(`\n[${cfg.key}] Starting: ${cfg.label}`);

  while (true) {
    try {
      await sleep(RATE_LIMIT_MS);
      const page = await fetchPage(cfg.domain, cfg.datasetId, offset, cfg.whereClause);
      if (page.length === 0) break;

      const batch: any[] = [];
      for (const raw of page) {
        try {
          const rec = cfg.mapRecord(raw);
          if (!rec) { skipped++; continue; }

          const key = `${rec.businessName.toLowerCase()}|${rec.zipCode}|${rec.dataSource}`;
          if (seen.has(key)) { skipped++; continue; }
          seen.add(key);

          batch.push({
            id: randomUUID(),
            ...rec,
            lastUpdated: now,
          });
          inserted++;
        } catch (e) {
          errors++;
        }
      }

      insertBatch(batch);
      offset += PAGE_SIZE;

      if (offset % 5000 === 0 || page.length < PAGE_SIZE) {
        console.log(`[${cfg.key}] ${offset.toLocaleString()} fetched, ${inserted.toLocaleString()} unique${DRY_RUN ? ' (dry)' : ' inserted'}`);
      }

      if (page.length < PAGE_SIZE) break;
    } catch (err) {
      console.error(`[${cfg.key}] Error at offset ${offset}:`, (err as Error).message);
      errors++;
      break;
    }
  }

  return { inserted, skipped, errors };
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const datasetsToRun = datasetArg === 'all'
    ? DATASETS
    : DATASETS.filter(d => d.key === datasetArg);

  if (datasetsToRun.length === 0) {
    console.error(`Unknown dataset: ${datasetArg}. Available: ${DATASETS.map(d => d.key).join(', ')}, all`);
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════');
  console.log('  Socrata Contractor Datasets Import');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Datasets: ${datasetsToRun.map(d => d.key).join(', ')}`);
  console.log('════════════════════════════════════════════════');

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const cfg of datasetsToRun) {
    const { inserted, skipped, errors } = await importDataset(cfg, db);
    totalInserted += inserted;
    totalSkipped += skipped;
    console.log(`\n  ${cfg.label}: ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped, ${errors} errors`);
  }

  db.close();

  console.log('\n════════════════════════════════════════════════');
  console.log('  Import Complete');
  console.log(`  Total inserted : ${totalInserted.toLocaleString()}`);
  console.log(`  Total skipped  : ${totalSkipped.toLocaleString()}`);
  if (DRY_RUN) console.log('  ⚠ DRY RUN — no changes written');
  console.log('════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('[socrataContractors] Fatal:', err);
  process.exit(1);
});
