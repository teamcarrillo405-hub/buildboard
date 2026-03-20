# Research: Phase 6 — Business Profiles

## Requirements
- PROF-01: Verified business can edit services, hours, contact info
- PROF-02: Verified business can upload portfolio photos (R2 presigned URLs)
- PROF-03: Verified business can upload videos (R2 presigned URLs)
- PROF-04: Profile changes visible immediately after save
- PROF-05: Non-verified businesses see read-only profile + "Upgrade to edit" CTA

## Architecture Decisions

### Business Ownership Model (v1 Simplification)
No `company_owners` table. Instead:
- Any authenticated + verified user can edit the company profile they navigate to
- The edit endpoint checks: `requireAuth` + `verificationStatus IN ('verified', 'hcc_member')`
- This is intentionally permissive for v1 — HCC trusts their verified members
- v2 would add a `company_claims` table with approval workflow

### Presigned URL Upload Pattern
**Problem**: Vercel serverless functions have a 4.5MB request body limit. Portfolio photos/videos exceed this.
**Solution**: Presigned PUT URLs — server generates a time-limited URL, client uploads directly to R2.

Flow:
1. Client: `POST /api/profile/:id/upload-url` with `{ filename, contentType, fileSize }`
2. Server: validates auth + verification, generates presigned PUT URL (15-min expiry)
3. Client: `PUT <presignedUrl>` with raw file body + Content-Type header
4. Client: `POST /api/profile/:id/media` to register the uploaded file in the database
5. Server: saves R2 key + metadata to `company_media` table

### R2 Presigned URLs
- Requires `@aws-sdk/s3-request-presigner` package (not yet installed)
- Use `getSignedUrl(r2Client, new PutObjectCommand(...), { expiresIn: 900 })`
- Key pattern: `profiles/{companyId}/{uuid}.{ext}` for photos, `profiles/{companyId}/videos/{uuid}.{ext}` for videos

### Editable Fields
From the existing schema, the fields a verified business should edit:
- `phone`, `email`, `website` (contact info)
- `services` (JSON array of strings)
- `hours` (JSON object or string)
- `address`, `zipCode` (location)
- `warranty`, `emergencyService`, `freeEstimate` (service details)

Fields that should NOT be editable by the business:
- `businessName`, `category`, `state`, `city` (structural — admin only)
- `rating`, `reviewCount` (from data/Google)
- `verificationStatus` (admin only)

### Media Storage Schema
New `company_media` table:
```sql
CREATE TABLE IF NOT EXISTS company_media (
  id TEXT PRIMARY KEY,
  companyId TEXT NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL,         -- 'photo' | 'video'
  r2Key TEXT NOT NULL,        -- R2 object key
  url TEXT NOT NULL,          -- Public CDN URL
  filename TEXT,              -- Original filename
  fileSize INTEGER,           -- Bytes
  sortOrder INTEGER DEFAULT 0,
  uploadedBy INTEGER,         -- userId from auth
  createdAt TEXT DEFAULT (datetime('now'))
);
```

### File Constraints
- Photos: max 10MB, accept image/jpeg, image/png, image/webp
- Videos: max 100MB, accept video/mp4, video/webm
- Max 20 photos per company, max 5 videos per company
