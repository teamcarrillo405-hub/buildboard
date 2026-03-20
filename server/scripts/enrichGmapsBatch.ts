#!/usr/bin/env npx tsx
/**
 * Bulk Google Maps enrichment pipeline for BuildBoard/ConstructFlix.
 *
 * Launches Apify `lukaskrivka/google-maps-with-contact-details` runs for the
 * top 200 US cities in the DB (ranked by number of businesses lacking contact
 * data), downloads results, and pipes them through gmapsEnrich to fill in
 * phone, website, and email fields.
 *
 * Features:
 *   - Controlled concurrency (CONCURRENCY parallel Apify runs)
 *   - Persistent progress file — safe to kill and resume
 *   - Per-city JSON saved to server/data/gmaps/
 *   - Live log to logs/gmaps_enrich.log
 *   - Cost tracker (estimated $0.01/result)
 *
 * Usage:
 *   npx tsx server/scripts/enrichGmapsBatch.ts
 *   npx tsx server/scripts/enrichGmapsBatch.ts --dry-run   (skip DB writes)
 *   npx tsx server/scripts/enrichGmapsBatch.ts --resume    (skip completed cities)
 */

import fs from 'fs';
import path from 'path';
import { runGmapsEnrich, type GmapsPlace } from '../pipelines/gmapsEnrich.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const APIFY_TOKEN   = process.env.APIFY_TOKEN ?? '';
const ACTOR_ID      = 'lukaskrivka~google-maps-with-contact-details';
const CONCURRENCY   = 2;          // parallel Apify runs (conservative to avoid memory/rate issues)
const MAX_PER_TERM  = 80;         // Google Maps results per search term
const POLL_MS       = 20_000;     // poll run status every 20s
const RUN_TIMEOUT   = 20 * 60;    // 20 min max per run (seconds)
const MAX_CITIES    = parseInt(process.argv.find(a => a.startsWith('--max-cities='))?.split('=')[1] ?? '0') || Infinity;

const SEARCH_TERMS  = [
  'general contractor',
  'construction company',
  'roofing contractor',
  'plumber',
  'electrician',
];

const DB_PATH       = './server/constructflix.db';
const DATA_DIR      = './server/data/gmaps';
const LOG_FILE      = './logs/gmaps_enrich.log';
const PROGRESS_FILE = './logs/gmaps_enrich_progress.json';

const DRY_RUN       = process.argv.includes('--dry-run');
const RESUME        = true; // Always resume — safe to kill and restart

// ---------------------------------------------------------------------------
// Top 200 cities (ranked by # businesses without website)
// ---------------------------------------------------------------------------

const CITIES: Array<{ city: string; state: string; location: string }> = [
  { city: 'New York',          state: 'NY', location: 'New York, NY, USA' },
  { city: 'Brooklyn',          state: 'NY', location: 'Brooklyn, NY, USA' },
  { city: 'Queens',            state: 'NY', location: 'Queens, NY, USA' },
  { city: 'Columbus',          state: 'OH', location: 'Columbus, OH, USA' },
  { city: 'Charlotte',         state: 'NC', location: 'Charlotte, NC, USA' },
  { city: 'Seattle',           state: 'WA', location: 'Seattle, WA, USA' },
  { city: 'Honolulu',          state: 'HI', location: 'Honolulu, HI, USA' },
  { city: 'Sacramento',        state: 'CA', location: 'Sacramento, CA, USA' },
  { city: 'Bronx',             state: 'NY', location: 'Bronx, NY, USA' },
  { city: 'Los Angeles',       state: 'CA', location: 'Los Angeles, CA, USA' },
  { city: 'Kansas City',       state: 'MO', location: 'Kansas City, MO, USA' },
  { city: 'New Orleans',       state: 'LA', location: 'New Orleans, LA, USA' },
  { city: 'Dallas',            state: 'TX', location: 'Dallas, TX, USA' },
  { city: 'Louisville',        state: 'KY', location: 'Louisville, KY, USA' },
  { city: 'Staten Island',     state: 'NY', location: 'Staten Island, NY, USA' },
  { city: 'Cincinnati',        state: 'OH', location: 'Cincinnati, OH, USA' },
  { city: 'Baton Rouge',       state: 'LA', location: 'Baton Rouge, LA, USA' },
  { city: 'San Jose',          state: 'CA', location: 'San Jose, CA, USA' },
  { city: 'Chicago',           state: 'IL', location: 'Chicago, IL, USA' },
  { city: 'Saint Paul',        state: 'MN', location: 'Saint Paul, MN, USA' },
  { city: 'Detroit',           state: 'MI', location: 'Detroit, MI, USA' },
  { city: 'Orlando',           state: 'FL', location: 'Orlando, FL, USA' },
  { city: 'Miami',             state: 'FL', location: 'Miami, FL, USA' },
  { city: 'Portland',          state: 'OR', location: 'Portland, OR, USA' },
  { city: 'Nashville',         state: 'TN', location: 'Nashville, TN, USA' },
  { city: 'Austin',            state: 'TX', location: 'Austin, TX, USA' },
  { city: 'Vancouver',         state: 'WA', location: 'Vancouver, WA, USA' },
  { city: 'San Diego',         state: 'CA', location: 'San Diego, CA, USA' },
  { city: 'Little Rock',       state: 'AR', location: 'Little Rock, AR, USA' },
  { city: 'Philadelphia',      state: 'PA', location: 'Philadelphia, PA, USA' },
  { city: 'Tampa',             state: 'FL', location: 'Tampa, FL, USA' },
  { city: 'Spokane',           state: 'WA', location: 'Spokane, WA, USA' },
  { city: 'Jacksonville',      state: 'FL', location: 'Jacksonville, FL, USA' },
  { city: 'Gainesville',       state: 'FL', location: 'Gainesville, FL, USA' },
  { city: 'Washington',        state: 'DC', location: 'Washington, DC, USA' },
  { city: 'Tacoma',            state: 'WA', location: 'Tacoma, WA, USA' },
  { city: 'Naples',            state: 'FL', location: 'Naples, FL, USA' },
  { city: 'Salem',             state: 'OR', location: 'Salem, OR, USA' },
  { city: 'Cambridge',         state: 'MA', location: 'Cambridge, MA, USA' },
  { city: 'Stamford',          state: 'CT', location: 'Stamford, CT, USA' },
  { city: 'Bend',              state: 'OR', location: 'Bend, OR, USA' },
  { city: 'McKinney',          state: 'TX', location: 'McKinney, TX, USA' },
  { city: 'Everett',           state: 'WA', location: 'Everett, WA, USA' },
  { city: 'Bridgeport',        state: 'CT', location: 'Bridgeport, CT, USA' },
  { city: 'Sarasota',          state: 'FL', location: 'Sarasota, FL, USA' },
  { city: 'Riverside',         state: 'CA', location: 'Riverside, CA, USA' },
  { city: 'Phoenix',           state: 'AZ', location: 'Phoenix, AZ, USA' },
  { city: 'Fort Myers',        state: 'FL', location: 'Fort Myers, FL, USA' },
  { city: 'San Francisco',     state: 'CA', location: 'San Francisco, CA, USA' },
  { city: 'Irvine',            state: 'CA', location: 'Irvine, CA, USA' },
  { city: 'Danbury',           state: 'CT', location: 'Danbury, CT, USA' },
  { city: 'Minneapolis',       state: 'MN', location: 'Minneapolis, MN, USA' },
  { city: 'Long Beach',        state: 'CA', location: 'Long Beach, CA, USA' },
  { city: 'Waterbury',         state: 'CT', location: 'Waterbury, CT, USA' },
  { city: 'Escondido',         state: 'CA', location: 'Escondido, CA, USA' },
  { city: 'Eugene',            state: 'OR', location: 'Eugene, OR, USA' },
  { city: 'Boca Raton',        state: 'FL', location: 'Boca Raton, FL, USA' },
  { city: 'Beaverton',         state: 'OR', location: 'Beaverton, OR, USA' },
  { city: 'Renton',            state: 'WA', location: 'Renton, WA, USA' },
  { city: 'Plano',             state: 'TX', location: 'Plano, TX, USA' },
  { city: 'Fort Lauderdale',   state: 'FL', location: 'Fort Lauderdale, FL, USA' },
  { city: 'Olympia',           state: 'WA', location: 'Olympia, WA, USA' },
  { city: 'Puyallup',          state: 'WA', location: 'Puyallup, WA, USA' },
  { city: 'Santa Ana',         state: 'CA', location: 'Santa Ana, CA, USA' },
  { city: 'Kennewick',         state: 'WA', location: 'Kennewick, WA, USA' },
  { city: 'Bellingham',        state: 'WA', location: 'Bellingham, WA, USA' },
  { city: 'Raleigh',           state: 'NC', location: 'Raleigh, NC, USA' },
  { city: 'Lynnwood',          state: 'WA', location: 'Lynnwood, WA, USA' },
  { city: 'Pasadena',          state: 'CA', location: 'Pasadena, CA, USA' },
  { city: 'Mesa',              state: 'AZ', location: 'Mesa, AZ, USA' },
  { city: 'West Palm Beach',   state: 'FL', location: 'West Palm Beach, FL, USA' },
  { city: 'Winter Park',       state: 'FL', location: 'Winter Park, FL, USA' },
  { city: 'Federal Way',       state: 'WA', location: 'Federal Way, WA, USA' },
  { city: 'Frisco',            state: 'TX', location: 'Frisco, TX, USA' },
  { city: 'Bakersfield',       state: 'CA', location: 'Bakersfield, CA, USA' },
  { city: 'Huntington Beach',  state: 'CA', location: 'Huntington Beach, CA, USA' },
  { city: 'Bellevue',          state: 'WA', location: 'Bellevue, WA, USA' },
  { city: 'Santa Clarita',     state: 'CA', location: 'Santa Clarita, CA, USA' },
  { city: 'Santa Monica',      state: 'CA', location: 'Santa Monica, CA, USA' },
  { city: 'Pasco',             state: 'WA', location: 'Pasco, WA, USA' },
  { city: 'Wylie',             state: 'TX', location: 'Wylie, TX, USA' },
  { city: 'Ontario',           state: 'CA', location: 'Ontario, CA, USA' },
  { city: 'Hartford',          state: 'CT', location: 'Hartford, CT, USA' },
  { city: 'Downey',            state: 'CA', location: 'Downey, CA, USA' },
  { city: 'Yakima',            state: 'WA', location: 'Yakima, WA, USA' },
  { city: 'Oregon City',       state: 'OR', location: 'Oregon City, OR, USA' },
  { city: 'Rancho Cucamonga',  state: 'CA', location: 'Rancho Cucamonga, CA, USA' },
  { city: 'Fresno',            state: 'CA', location: 'Fresno, CA, USA' },
  { city: 'New Haven',         state: 'CT', location: 'New Haven, CT, USA' },
  { city: 'Houston',           state: 'TX', location: 'Houston, TX, USA' },
  { city: 'St. Petersburg',    state: 'FL', location: 'St. Petersburg, FL, USA' },
  { city: 'Clearwater',        state: 'FL', location: 'Clearwater, FL, USA' },
  { city: 'Bradenton',         state: 'FL', location: 'Bradenton, FL, USA' },
  { city: 'Gresham',           state: 'OR', location: 'Gresham, OR, USA' },
  { city: 'Fullerton',         state: 'CA', location: 'Fullerton, CA, USA' },
  { city: 'Temecula',          state: 'CA', location: 'Temecula, CA, USA' },
  { city: 'Lakeland',          state: 'FL', location: 'Lakeland, FL, USA' },
  { city: 'Medford',           state: 'OR', location: 'Medford, OR, USA' },
  { city: 'Bothell',           state: 'WA', location: 'Bothell, WA, USA' },
  { city: 'Vista',             state: 'CA', location: 'Vista, CA, USA' },
  { city: 'Tallahassee',       state: 'FL', location: 'Tallahassee, FL, USA' },
  { city: 'Ocala',             state: 'FL', location: 'Ocala, FL, USA' },
  { city: 'Kissimmee',         state: 'FL', location: 'Kissimmee, FL, USA' },
  { city: 'Marysville',        state: 'WA', location: 'Marysville, WA, USA' },
  { city: 'Milford',           state: 'CT', location: 'Milford, CT, USA' },
  { city: 'Bristol',           state: 'CT', location: 'Bristol, CT, USA' },
  { city: 'Meriden',           state: 'CT', location: 'Meriden, CT, USA' },
  { city: 'Redmond',           state: 'OR', location: 'Redmond, OR, USA' },
  { city: 'Tucson',            state: 'AZ', location: 'Tucson, AZ, USA' },
  { city: 'Pompano Beach',     state: 'FL', location: 'Pompano Beach, FL, USA' },
  { city: 'Sanford',           state: 'FL', location: 'Sanford, FL, USA' },
  { city: 'Palmdale',          state: 'CA', location: 'Palmdale, CA, USA' },
  { city: 'Fairfield',         state: 'CT', location: 'Fairfield, CT, USA' },
  { city: 'Stratford',         state: 'CT', location: 'Stratford, CT, USA' },
  { city: 'Santa Rosa',        state: 'CA', location: 'Santa Rosa, CA, USA' },
  { city: 'Hialeah',           state: 'FL', location: 'Hialeah, FL, USA' },
  { city: 'Apopka',            state: 'FL', location: 'Apopka, FL, USA' },
  { city: 'Pensacola',         state: 'FL', location: 'Pensacola, FL, USA' },
  { city: 'Thousand Oaks',     state: 'CA', location: 'Thousand Oaks, CA, USA' },
  { city: 'Spokane Valley',    state: 'WA', location: 'Spokane Valley, WA, USA' },
  { city: 'Grants Pass',       state: 'OR', location: 'Grants Pass, OR, USA' },
  { city: 'New Britain',       state: 'CT', location: 'New Britain, CT, USA' },
  { city: 'Kirkland',          state: 'WA', location: 'Kirkland, WA, USA' },
  { city: 'Garden Grove',      state: 'CA', location: 'Garden Grove, CA, USA' },
  { city: 'Port St Lucie',     state: 'FL', location: 'Port St Lucie, FL, USA' },
  { city: 'Chula Vista',       state: 'CA', location: 'Chula Vista, CA, USA' },
  { city: 'Culver City',       state: 'CA', location: 'Culver City, CA, USA' },
  { city: 'Murrieta',          state: 'CA', location: 'Murrieta, CA, USA' },
  { city: 'Des Moines',        state: 'IA', location: 'Des Moines, IA, USA' },
  { city: 'Denver',            state: 'CO', location: 'Denver, CO, USA' },
  { city: 'Springfield',       state: 'OR', location: 'Springfield, OR, USA' },
  { city: 'Oceanside',         state: 'CA', location: 'Oceanside, CA, USA' },
  { city: 'Carlsbad',          state: 'CA', location: 'Carlsbad, CA, USA' },
  { city: 'San Antonio',       state: 'TX', location: 'San Antonio, TX, USA' },
  { city: 'Colorado Springs',  state: 'CO', location: 'Colorado Springs, CO, USA' },
  { city: 'Lancaster',         state: 'CA', location: 'Lancaster, CA, USA' },
  { city: 'Albuquerque',       state: 'NM', location: 'Albuquerque, NM, USA' },
  { city: 'Atlanta',           state: 'GA', location: 'Atlanta, GA, USA' },
  { city: 'Indianapolis',      state: 'IN', location: 'Indianapolis, IN, USA' },
  { city: 'Memphis',           state: 'TN', location: 'Memphis, TN, USA' },
  { city: 'Baltimore',         state: 'MD', location: 'Baltimore, MD, USA' },
  { city: 'Milwaukee',         state: 'WI', location: 'Milwaukee, WI, USA' },
  { city: 'El Paso',           state: 'TX', location: 'El Paso, TX, USA' },
  { city: 'Louisville',        state: 'KY', location: 'Louisville, KY, USA' },
  { city: 'Las Vegas',         state: 'NV', location: 'Las Vegas, NV, USA' },
  { city: 'Boston',            state: 'MA', location: 'Boston, MA, USA' },
  { city: 'Oklahoma City',     state: 'OK', location: 'Oklahoma City, OK, USA' },
  { city: 'Tucson',            state: 'AZ', location: 'Tucson, AZ, USA' },
  { city: 'Fresno',            state: 'CA', location: 'Fresno, CA, USA' },
  { city: 'Long Beach',        state: 'CA', location: 'Long Beach, CA, USA' },
  { city: 'Virginia Beach',    state: 'VA', location: 'Virginia Beach, VA, USA' },
  { city: 'Omaha',             state: 'NE', location: 'Omaha, NE, USA' },
  { city: 'Colorado Springs',  state: 'CO', location: 'Colorado Springs, CO, USA' },
  { city: 'Raleigh',           state: 'NC', location: 'Raleigh, NC, USA' },
  { city: 'Miami',             state: 'FL', location: 'Miami, FL, USA' },
  { city: 'Minneapolis',       state: 'MN', location: 'Minneapolis, MN, USA' },
  { city: 'Tulsa',             state: 'OK', location: 'Tulsa, OK, USA' },
  { city: 'Tampa',             state: 'FL', location: 'Tampa, FL, USA' },
  { city: 'Arlington',         state: 'TX', location: 'Arlington, TX, USA' },
  { city: 'New Orleans',       state: 'LA', location: 'New Orleans, LA, USA' },
  { city: 'Wichita',           state: 'KS', location: 'Wichita, KS, USA' },
  { city: 'Bakersfield',       state: 'CA', location: 'Bakersfield, CA, USA' },
  { city: 'Aurora',            state: 'CO', location: 'Aurora, CO, USA' },
  { city: 'Anaheim',           state: 'CA', location: 'Anaheim, CA, USA' },
  { city: 'Santa Ana',         state: 'CA', location: 'Santa Ana, CA, USA' },
  { city: 'Corpus Christi',    state: 'TX', location: 'Corpus Christi, TX, USA' },
  { city: 'Riverside',         state: 'CA', location: 'Riverside, CA, USA' },
  { city: 'Lexington',         state: 'KY', location: 'Lexington, KY, USA' },
  { city: 'St. Louis',         state: 'MO', location: 'St. Louis, MO, USA' },
  { city: 'Pittsburgh',        state: 'PA', location: 'Pittsburgh, PA, USA' },
  { city: 'Stockton',          state: 'CA', location: 'Stockton, CA, USA' },
  { city: 'Anchorage',         state: 'AK', location: 'Anchorage, AK, USA' },
  { city: 'Cincinnati',        state: 'OH', location: 'Cincinnati, OH, USA' },
  { city: 'St. Paul',          state: 'MN', location: 'St. Paul, MN, USA' },
  { city: 'Greensboro',        state: 'NC', location: 'Greensboro, NC, USA' },
  { city: 'Toledo',            state: 'OH', location: 'Toledo, OH, USA' },
  { city: 'Newark',            state: 'NJ', location: 'Newark, NJ, USA' },
  { city: 'Plano',             state: 'TX', location: 'Plano, TX, USA' },
  { city: 'Henderson',         state: 'NV', location: 'Henderson, NV, USA' },
  { city: 'Orlando',           state: 'FL', location: 'Orlando, FL, USA' },
  { city: 'Chandler',          state: 'AZ', location: 'Chandler, AZ, USA' },
  { city: 'Laredo',            state: 'TX', location: 'Laredo, TX, USA' },
  { city: 'Madison',           state: 'WI', location: 'Madison, WI, USA' },
  { city: 'Durham',            state: 'NC', location: 'Durham, NC, USA' },
  { city: 'Lubbock',           state: 'TX', location: 'Lubbock, TX, USA' },
  { city: 'Garland',           state: 'TX', location: 'Garland, TX, USA' },
  { city: 'Winston-Salem',     state: 'NC', location: 'Winston-Salem, NC, USA' },
  { city: 'Glendale',          state: 'AZ', location: 'Glendale, AZ, USA' },
  { city: 'Hialeah',           state: 'FL', location: 'Hialeah, FL, USA' },
  { city: 'Garland',           state: 'TX', location: 'Garland, TX, USA' },
  { city: 'Scottsdale',        state: 'AZ', location: 'Scottsdale, AZ, USA' },
  { city: 'Baton Rouge',       state: 'LA', location: 'Baton Rouge, LA, USA' },
  { city: 'Fremont',           state: 'CA', location: 'Fremont, CA, USA' },
  { city: 'Boise',             state: 'ID', location: 'Boise, ID, USA' },
  { city: 'Richmond',          state: 'VA', location: 'Richmond, VA, USA' },
  { city: 'Des Moines',        state: 'IA', location: 'Des Moines, IA, USA' },
  { city: 'Spokane',           state: 'WA', location: 'Spokane, WA, USA' },
  { city: 'Modesto',           state: 'CA', location: 'Modesto, CA, USA' },
  { city: 'Tacoma',            state: 'WA', location: 'Tacoma, WA, USA' },
  { city: 'Fontana',           state: 'CA', location: 'Fontana, CA, USA' },
  { city: 'Moreno Valley',     state: 'CA', location: 'Moreno Valley, CA, USA' },
  { city: 'Glendale',          state: 'CA', location: 'Glendale, CA, USA' },
  { city: 'Akron',             state: 'OH', location: 'Akron, OH, USA' },
  { city: 'Huntington Beach',  state: 'CA', location: 'Huntington Beach, CA, USA' },
  { city: 'Little Rock',       state: 'AR', location: 'Little Rock, AR, USA' },
  { city: 'Knoxville',         state: 'TN', location: 'Knoxville, TN, USA' },
  { city: 'Worcester',         state: 'MA', location: 'Worcester, MA, USA' },
  { city: 'Grand Rapids',      state: 'MI', location: 'Grand Rapids, MI, USA' },
  { city: 'Oxnard',            state: 'CA', location: 'Oxnard, CA, USA' },
  { city: 'Providence',        state: 'RI', location: 'Providence, RI, USA' },
  { city: 'Chattanooga',       state: 'TN', location: 'Chattanooga, TN, USA' },
  { city: 'Fort Wayne',        state: 'IN', location: 'Fort Wayne, IN, USA' },
  { city: 'Salt Lake City',    state: 'UT', location: 'Salt Lake City, UT, USA' },
  { city: 'Tempe',             state: 'AZ', location: 'Tempe, AZ, USA' },
];

// De-duplicate by location string
const seenLocations = new Set<string>();
const UNIQUE_CITIES = CITIES.filter(c => {
  const key = c.location;
  if (seenLocations.has(key)) return false;
  seenLocations.add(key);
  return true;
});

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

interface CityProgress {
  location: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  runId?: string;
  datasetId?: string;
  resultsCount?: number;
  matchedCount?: number;
  updatedPhone?: number;
  updatedWebsite?: number;
  updatedEmail?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

interface ProgressFile {
  startedAt: string;
  totalCities: number;
  completedCities: number;
  totalResults: number;
  totalMatched: number;
  totalUpdatedPhone: number;
  totalUpdatedWebsite: number;
  totalUpdatedEmail: number;
  estimatedCostUSD: number;
  cities: Record<string, CityProgress>;
}

function loadProgress(): ProgressFile {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    startedAt: new Date().toISOString(),
    totalCities: UNIQUE_CITIES.length,
    completedCities: 0,
    totalResults: 0,
    totalMatched: 0,
    totalUpdatedPhone: 0,
    totalUpdatedWebsite: 0,
    totalUpdatedEmail: 0,
    estimatedCostUSD: 0,
    cities: {},
  };
}

function saveProgress(p: ProgressFile) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ---------------------------------------------------------------------------
// Apify REST API helpers
// ---------------------------------------------------------------------------

async function launchRun(city: string, state: string, location: string): Promise<string> {
  const input = {
    searchStringsArray: SEARCH_TERMS,
    locationQuery: location,
    countryCode: 'us',
    maxCrawledPlacesPerSearch: MAX_PER_TERM,
    language: 'en',
    skipClosedPlaces: true,
  };

  const resp = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}&timeout=${RUN_TIMEOUT}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Launch failed ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  return data.data.id as string;
}

async function pollRun(runId: string): Promise<{ status: string; datasetId: string }> {
  const resp = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`,
  );
  if (!resp.ok) throw new Error(`Poll failed ${resp.status}`);
  const data = await resp.json();
  return {
    status: data.data.status as string,
    datasetId: data.data.defaultDatasetId as string,
  };
}

async function waitForRun(runId: string): Promise<string> {
  const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
  while (true) {
    const { status, datasetId } = await pollRun(runId);
    if (TERMINAL.has(status)) {
      if (status !== 'SUCCEEDED') throw new Error(`Run ${runId} ended with status ${status}`);
      return datasetId;
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

async function downloadDataset(datasetId: string): Promise<GmapsPlace[]> {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=true`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Dataset download failed ${resp.status}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

// ---------------------------------------------------------------------------
// Process a single city
// ---------------------------------------------------------------------------

async function processCity(
  entry: typeof UNIQUE_CITIES[0],
  progress: ProgressFile,
): Promise<void> {
  const key = entry.location;
  const cityProgress = progress.cities[key] ?? { location: key, status: 'pending' };

  if (RESUME && cityProgress.status === 'done') {
    log(`[SKIP] ${entry.city}, ${entry.state} — already done`);
    return;
  }

  cityProgress.status = 'running';
  cityProgress.startedAt = new Date().toISOString();
  progress.cities[key] = cityProgress;
  saveProgress(progress);

  try {
    log(`[START] ${entry.city}, ${entry.state}`);

    // 1. Launch Apify run
    const runId = await launchRun(entry.city, entry.state, entry.location);
    cityProgress.runId = runId;
    saveProgress(progress);
    log(`  ↳ runId=${runId}`);

    // 2. Wait for completion
    const datasetId = await waitForRun(runId);
    cityProgress.datasetId = datasetId;
    log(`  ↳ datasetId=${datasetId} — downloading...`);

    // 3. Download results
    const places = await downloadDataset(datasetId);
    cityProgress.resultsCount = places.length;
    log(`  ↳ ${places.length} results downloaded`);

    // 4. Save JSON
    const safeCity = entry.city.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const jsonFile = path.join(DATA_DIR, `${safeCity}_${entry.state.toLowerCase()}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(places, null, 2));

    // 5. Run DB enrichment
    if (!DRY_RUN && places.length > 0) {
      const stats = runGmapsEnrich(DB_PATH, places, { dryRun: false });
      cityProgress.matchedCount   = stats.matched;
      cityProgress.updatedPhone   = stats.updatedPhone;
      cityProgress.updatedWebsite = stats.updatedWebsite;
      cityProgress.updatedEmail   = stats.updatedEmail;

      progress.totalMatched       += stats.matched;
      progress.totalUpdatedPhone  += stats.updatedPhone;
      progress.totalUpdatedWebsite+= stats.updatedWebsite;
      progress.totalUpdatedEmail  += stats.updatedEmail;

      log(`  ↳ matched=${stats.matched} phone=${stats.updatedPhone} web=${stats.updatedWebsite} email=${stats.updatedEmail}`);
    }

    progress.totalResults       += places.length;
    progress.estimatedCostUSD   += places.length * 0.01;
    progress.completedCities    += 1;

    cityProgress.status     = 'done';
    cityProgress.finishedAt = new Date().toISOString();
    saveProgress(progress);

    log(`[DONE] ${entry.city}, ${entry.state} (${places.length} results, $${(places.length * 0.01).toFixed(2)})`);
  } catch (err: any) {
    cityProgress.status = 'failed';
    cityProgress.error  = err.message;
    cityProgress.finishedAt = new Date().toISOString();
    saveProgress(progress);
    log(`[FAIL] ${entry.city}, ${entry.state}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main — process UNIQUE_CITIES with controlled concurrency
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

  const progress = loadProgress();

  log('══════════════════════════════════════════════════════');
  log(`  Google Maps Enrichment — ${UNIQUE_CITIES.length} cities`);
  log(`  Concurrency: ${CONCURRENCY} | Results/term: ${MAX_PER_TERM} | Terms: ${SEARCH_TERMS.length}`);
  log(`  Estimated max cost: $${(UNIQUE_CITIES.length * SEARCH_TERMS.length * MAX_PER_TERM * 0.01).toFixed(0)}`);
  log(`  DRY_RUN: ${DRY_RUN} | RESUME: ${RESUME}`);
  log('══════════════════════════════════════════════════════');

  const citiesToProcess = MAX_CITIES < Infinity ? UNIQUE_CITIES.slice(0, MAX_CITIES) : UNIQUE_CITIES;
  log(`  Cities to process: ${citiesToProcess.length} (MAX_CITIES=${MAX_CITIES === Infinity ? 'all' : MAX_CITIES})`);
  const queue = [...citiesToProcess];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    // Fill up to CONCURRENCY slots
    while (queue.length > 0 && running.length < CONCURRENCY) {
      const entry = queue.shift()!;
      const p = processCity(entry, progress).then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }
    // Wait for any slot to free up
    if (running.length >= CONCURRENCY || queue.length === 0) {
      await Promise.race(running);
    }
  }

  log('══════════════════════════════════════════════════════');
  log('  ENRICHMENT COMPLETE');
  log(`  Cities processed:   ${progress.completedCities} / ${progress.totalCities}`);
  log(`  Total results:      ${progress.totalResults.toLocaleString()}`);
  log(`  Total matched:      ${progress.totalMatched.toLocaleString()}`);
  log(`    → Phone filled:   ${progress.totalUpdatedPhone.toLocaleString()}`);
  log(`    → Website filled: ${progress.totalUpdatedWebsite.toLocaleString()}`);
  log(`    → Email filled:   ${progress.totalUpdatedEmail.toLocaleString()}`);
  log(`  Est. cost:          $${progress.estimatedCostUSD.toFixed(2)}`);
  log('══════════════════════════════════════════════════════');
}

main().catch(err => {
  log(`[FATAL] ${err.message}`);
  process.exit(1);
});
