-- Migration 001: Add real-data fields for Yelp + CSLB ingestion
-- Safe to run multiple times: the migration runner checks for column existence first.

ALTER TABLE companies ADD COLUMN latitude REAL;
ALTER TABLE companies ADD COLUMN longitude REAL;
ALTER TABLE companies ADD COLUMN yelpId TEXT;
ALTER TABLE companies ADD COLUMN yelpUrl TEXT;
ALTER TABLE companies ADD COLUMN imageUrl TEXT;
ALTER TABLE companies ADD COLUMN priceRange TEXT;
ALTER TABLE companies ADD COLUMN subCategory TEXT;
ALTER TABLE companies ADD COLUMN specialties TEXT;
ALTER TABLE companies ADD COLUMN yearsInBusiness INTEGER;
ALTER TABLE companies ADD COLUMN licenseStatus TEXT;
ALTER TABLE companies ADD COLUMN licenseType TEXT;
ALTER TABLE companies ADD COLUMN licenseExpiry TEXT;
ALTER TABLE companies ADD COLUMN bondAmount REAL;
ALTER TABLE companies ADD COLUMN insuranceVerified INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN backgroundCheck INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN responseTime TEXT;
ALTER TABLE companies ADD COLUMN dataSource TEXT DEFAULT 'manual';
ALTER TABLE companies ADD COLUMN lastUpdated TEXT;

-- Indexes for dedup and geo queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_yelp_id
  ON companies(yelpId) WHERE yelpId IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_lat_lng
  ON companies(latitude, longitude) WHERE latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_data_source
  ON companies(dataSource);
