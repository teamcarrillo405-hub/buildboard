# Summary: 06-02 — Profile Editing UI

## What was built
- EditProfile page at /company/:id/edit with full form editing
- MediaUploader component with drag-and-drop file uploads to R2
- MediaGallery component for displaying and managing uploaded media
- Portfolio photo grid on public company profiles
- Edit Profile button for verified users, Upgrade CTA for non-verified
- Lazy-loaded EditProfile route for code splitting

## Key decisions
- Upload flow: client gets presigned URL from server, uploads directly to R2
- Services editor uses tag/chip pattern matching the search filter chips
- Toggle switches for boolean fields (emergency service, free estimate)
- Success toast auto-dismisses after 3 seconds
- Portfolio section only renders when media exists (no empty state on public profile)

## Files created
- src/pages/EditProfile.tsx
- src/components/MediaUploader.tsx
- src/components/MediaGallery.tsx

## Files modified
- src/pages/CompanyProfile.tsx — portfolio grid + edit/upgrade CTA in sidebar
- src/App.tsx — /company/:id/edit route
