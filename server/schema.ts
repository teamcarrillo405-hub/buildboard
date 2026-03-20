import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  businessName: text('businessName').notNull(),
  category: text('category').default('General Contractor'),
  location: text('location'),
  state: text('state'),
  city: text('city'),
  address: text('address'),
  zipCode: text('zipCode'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  licenseNumber: text('licenseNumber'),
  rating: real('rating').default(0),
  reviewCount: integer('reviewCount').default(0),
  hours: text('hours'),
  services: text('services'),
  certifications: text('certifications'),
  emergencyService: integer('emergencyService', { mode: 'boolean' }),
  freeEstimate: integer('freeEstimate', { mode: 'boolean' }),
  warranty: text('warranty'),
  verificationStatus: text('verificationStatus').default('unverified'),
  // ---------------------------------------------------------------------------
  // Real-data fields (Phase B/C data ingestion — Yelp + CSLB)
  // ---------------------------------------------------------------------------
  latitude: real('latitude'),
  longitude: real('longitude'),
  yelpId: text('yelpId'),
  yelpUrl: text('yelpUrl'),
  imageUrl: text('imageUrl'),
  priceRange: text('priceRange'),       // "$" | "$$" | "$$$" | "$$$$"
  subCategory: text('subCategory'),
  specialties: text('specialties'),     // JSON array
  yearsInBusiness: integer('yearsInBusiness'),
  licenseStatus: text('licenseStatus'), // "active" | "expired" | "suspended"
  licenseType: text('licenseType'),
  licenseExpiry: text('licenseExpiry'), // ISO date string
  bondAmount: real('bondAmount'),
  insuranceVerified: integer('insuranceVerified', { mode: 'boolean' }),
  backgroundCheck: integer('backgroundCheck', { mode: 'boolean' }),
  responseTime: text('responseTime'),
  dataSource: text('dataSource').default('manual'), // "yelp" | "cslb" | "manual"
  lastUpdated: text('lastUpdated'),     // ISO timestamp
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

// Google Places cache -- stores place_id only (allowed indefinitely per Google TOS)
// IMPORTANT: Do NOT add columns for reviews, hours, photos, or any other content.
// Google TOS prohibits caching all content except place_id.
export const googlePlacesCache = sqliteTable('google_places_cache', {
  companyId: text('companyId').primaryKey().references(() => companies.id),
  placeId: text('placeId').notNull(),
  matchConfidence: real('matchConfidence'), // 0-1 scale
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  lastAccessedAt: integer('lastAccessedAt', { mode: 'timestamp' }).notNull(),
});

export type GooglePlacesCache = typeof googlePlacesCache.$inferSelect;

export const sponsors = sqliteTable('sponsors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  website: text('website'),
  accentColor: text('accent_color'),
  logoPath: text('logo_path'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at'),
});

export const adSlots = sqliteTable('ad_slots', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  label: text('label'),
  description: text('description'),
});

export const adCreatives = sqliteTable('ad_creatives', {
  id: text('id').primaryKey(),
  sponsorId: text('sponsor_id').references(() => sponsors.id),
  eyebrow: text('eyebrow'),
  headline: text('headline').notNull(),
  body: text('body'),
  ctaLabel: text('cta_label').notNull(),
  ctaUrl: text('cta_url').notNull(),
  carouselImages: text('carousel_images'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at'),
});

export const adAssignments = sqliteTable('ad_assignments', {
  id: text('id').primaryKey(),
  slotId: text('slot_id').references(() => adSlots.id),
  creativeId: text('creative_id').references(() => adCreatives.id),
  sponsorId: text('sponsor_id').references(() => sponsors.id),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  assignedAt: text('assigned_at'),
});

export const adEvents = sqliteTable('ad_events', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').references(() => adAssignments.id),
  eventType: text('event_type').notNull(),
  ipHash: text('ip_hash'),
  occurredAt: text('occurred_at'),
});

export type Sponsor = typeof sponsors.$inferSelect;
export type AdSlot = typeof adSlots.$inferSelect;
export type AdCreative = typeof adCreatives.$inferSelect;
export type AdAssignment = typeof adAssignments.$inferSelect;
export type AdEvent = typeof adEvents.$inferSelect;
