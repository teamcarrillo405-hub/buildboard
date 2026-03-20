# Summary: 06-01 — Profile Editing Backend

## What was built
- Profile editing API for verified businesses (PUT /api/profile/:id)
- Presigned R2 upload URLs for direct client-to-R2 file uploads
- company_media table for tracking uploaded photos and videos
- Media CRUD endpoints (create, list, delete)
- ProfileAPI frontend client with uploadFile helper

## Key decisions
- Presigned URLs bypass Vercel's 4.5MB body limit — client uploads directly to R2
- Editable field whitelist prevents modification of structural/admin-only fields
- Verification check is inline (not middleware) for clearer error messages
- Media limits: 20 photos (10MB each), 5 videos (100MB each)
- No R2 deletion on media remove — orphan cleanup is a v2 concern

## Files created
- server/services/media.ts
- server/routes/profile.ts

## Files modified
- server/services/r2.ts — added getPresignedUploadUrl
- server/index.ts — mount profile router, ensureMediaTable on startup
- src/api/types.ts — added MediaRecord interface
- src/api/api.ts — added ProfileAPI
