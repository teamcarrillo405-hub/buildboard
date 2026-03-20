-- Migration 002: Ad system tables + seed data

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  accent_color TEXT,
  logo_path TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_slots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id TEXT PRIMARY KEY,
  sponsor_id TEXT REFERENCES sponsors(id),
  eyebrow TEXT,
  headline TEXT NOT NULL,
  body TEXT,
  cta_label TEXT NOT NULL,
  cta_url TEXT NOT NULL,
  carousel_images TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_assignments (
  id TEXT PRIMARY KEY,
  slot_id TEXT REFERENCES ad_slots(id),
  creative_id TEXT REFERENCES ad_creatives(id),
  sponsor_id TEXT REFERENCES sponsors(id),
  is_active INTEGER DEFAULT 1,
  assigned_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_events (
  id TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES ad_assignments(id),
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  occurred_at TEXT DEFAULT (datetime('now'))
);

-- Seed: three ad slots
INSERT OR IGNORE INTO ad_slots (id, name, label, description) VALUES
  ('slot-profile-sky',  'profile_skyscraper', 'Profile Page — Left Column', '540px wide · full height · sticky'),
  ('slot-search-side',  'search_sidebar',     'Search Results — Filter Sidebar', '240px wide · compact card'),
  ('slot-home-banner',  'homepage_banner',    'Homepage — Between Sections', 'Full width · horizontal strip');

-- Seed: WCB sponsor
INSERT OR IGNORE INTO sponsors (id, name, website, accent_color, logo_path, is_active, created_at) VALUES
  ('sponsor-wcb', 'West Coast Batteries', 'https://wcbatteries.com', '#fdc500', 'logos/wcb.svg', 1, datetime('now'));

-- Seed: WCB creative
INSERT OR IGNORE INTO ad_creatives (id, sponsor_id, eyebrow, headline, body, cta_label, cta_url, carousel_images, is_active, created_at) VALUES
  ('creative-wcb-1', 'sponsor-wcb',
   'Power Built to Last',
   'Batteries for the Job Site',
   'Contractors & fleet operators trust WCB for same-day battery delivery across the West Coast.',
   'Shop Now →',
   'https://wcbatteries.com',
   '[{"src":"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=80","label":"Trucks & Commercial Vehicles"},{"src":"https://wcbatteries.com/cdn/shop/files/wcb-category-rail.webp","label":"Rail"},{"src":"https://wcbatteries.com/cdn/shop/files/wcb-category-marine.webp","label":"Marine"},{"src":"https://wcbatteries.com/cdn/shop/files/wcb-category-eletric-vehicles.webp","label":"Golf Carts & Fleet"},{"src":"https://wcbatteries.com/cdn/shop/files/wcb-category-power-supplies.webp","label":"Power & UPS"},{"src":"https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=1600&q=80","label":"ATVs & Off-Road"}]',
   1, datetime('now'));

-- Seed: assign WCB to profile skyscraper and search sidebar slots
INSERT OR IGNORE INTO ad_assignments (id, slot_id, creative_id, sponsor_id, is_active, assigned_at) VALUES
  ('assign-wcb-sky',  'slot-profile-sky',  'creative-wcb-1', 'sponsor-wcb', 1, datetime('now')),
  ('assign-wcb-side', 'slot-search-side',  'creative-wcb-1', 'sponsor-wcb', 1, datetime('now'));
