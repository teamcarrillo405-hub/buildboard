import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sqlite } from '../db.js';
import { parseRow } from '../helpers/parseRow.js';
import { getVerificationStatus } from '../services/verification.js';
import { getPresignedUploadUrl, getPublicUrl } from '../services/r2.js';
import { addMedia, getMedia, deleteMedia, countMedia } from '../services/media.js';

const router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fields that a verified business owner may update on their own profile. */
const EDITABLE_FIELDS = new Set([
  'phone', 'email', 'website', 'address', 'zipCode',
  'services', 'hours', 'warranty', 'emergencyService', 'freeEstimate',
]);

/** Map validated content types to safe file extensions (never trust user-supplied filenames). */
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const PHOTO_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const VIDEO_CONTENT_TYPES = new Set(['video/mp4', 'video/webm']);

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;   // 10 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;  // 100 MB

const PHOTO_LIMIT = 20;
const VIDEO_LIMIT = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inline verification check — not middleware so error messages are explicit.
 */
function checkEditAccess(
  req: Request,
  companyId: string,
): { allowed: boolean; reason?: string } {
  if (!req.user) return { allowed: false, reason: 'Authentication required' };
  const status = getVerificationStatus(companyId);
  if (status === 'unverified') {
    return { allowed: false, reason: 'Verification required to edit profiles' };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// PUT /profile/:id — update editable fields
// ---------------------------------------------------------------------------

router.put('/profile/:id', requireAuth, (req: Request, res: Response): void => {
  const companyId = req.params.id;

  const access = checkEditAccess(req, companyId);
  if (!access.allowed) {
    res.status(403).json({ error: access.reason });
    return;
  }

  const body = req.body as Record<string, unknown>;

  // Filter to only whitelisted keys
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (EDITABLE_FIELDS.has(key)) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No editable fields provided' });
    return;
  }

  // Coerce field types
  if ('services' in updates) {
    updates['services'] = JSON.stringify(updates['services']);
  }
  if ('hours' in updates) {
    updates['hours'] = JSON.stringify(updates['hours']);
  }
  if ('emergencyService' in updates) {
    updates['emergencyService'] = updates['emergencyService'] ? 1 : 0;
  }
  if ('freeEstimate' in updates) {
    updates['freeEstimate'] = updates['freeEstimate'] ? 1 : 0;
  }

  // Build SET clause using only known-safe column names (no dynamic interpolation)
  const FIELD_TO_COLUMN: Record<string, string> = {
    phone: 'phone', email: 'email', website: 'website',
    address: 'address', zipCode: 'zipCode', services: 'services',
    hours: 'hours', warranty: 'warranty',
    emergencyService: 'emergencyService', freeEstimate: 'freeEstimate',
  };
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const [field, value] of Object.entries(updates)) {
    const col = FIELD_TO_COLUMN[field];
    if (col) {
      setClauses.push(`${col} = ?`);
      values.push(value);
    }
  }
  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }
  values.push(companyId);
  const result = sqlite
    .prepare(`UPDATE companies SET ${setClauses.join(', ')} WHERE id = ?`)
    .run(...values);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }

  const updated = sqlite
    .prepare(`SELECT * FROM companies WHERE id = ?`)
    .get(companyId);

  res.json(parseRow(updated as Parameters<typeof parseRow>[0]));
});

// ---------------------------------------------------------------------------
// POST /profile/:id/upload-url — generate presigned R2 upload URL
// ---------------------------------------------------------------------------

router.post('/profile/:id/upload-url', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const companyId = req.params.id;

  const access = checkEditAccess(req, companyId);
  if (!access.allowed) {
    res.status(403).json({ error: access.reason });
    return;
  }

  const { filename, contentType, fileSize } = req.body as {
    filename?: string;
    contentType?: string;
    fileSize?: number;
  };

  if (!filename || !contentType || fileSize === undefined) {
    res.status(400).json({ error: 'filename, contentType, and fileSize are required' });
    return;
  }

  const isPhoto = PHOTO_CONTENT_TYPES.has(contentType);
  const isVideo = VIDEO_CONTENT_TYPES.has(contentType);

  if (!isPhoto && !isVideo) {
    res.status(400).json({
      error: `Unsupported content type: ${contentType}. Allowed: image/jpeg, image/png, image/webp, video/mp4, video/webm`,
    });
    return;
  }

  const maxBytes = isPhoto ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (fileSize > maxBytes) {
    const label = isPhoto ? '10MB' : '100MB';
    res.status(400).json({ error: `File size exceeds the ${label} limit` });
    return;
  }

  // Derive extension from validated contentType — never trust user-supplied filename
  const ext = CONTENT_TYPE_EXTENSIONS[contentType] || '.bin';
  const key = `profiles/${companyId}/${randomUUID()}${ext}`;

  try {
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    res.json({ uploadUrl, key, publicUrl: getPublicUrl(key) });
  } catch (err) {
    console.error('[Profile] Failed to generate presigned URL:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// ---------------------------------------------------------------------------
// POST /profile/:id/media — register a completed upload
// ---------------------------------------------------------------------------

router.post('/profile/:id/media', requireAuth, (req: Request, res: Response): void => {
  const companyId = req.params.id;

  const access = checkEditAccess(req, companyId);
  if (!access.allowed) {
    res.status(403).json({ error: access.reason });
    return;
  }

  const { key, type, filename, fileSize } = req.body as {
    key?: string;
    type?: 'photo' | 'video';
    filename?: string;
    fileSize?: number;
  };

  if (!key || !type || !filename || fileSize === undefined) {
    res.status(400).json({ error: 'key, type, filename, and fileSize are required' });
    return;
  }

  if (type !== 'photo' && type !== 'video') {
    res.status(400).json({ error: 'type must be "photo" or "video"' });
    return;
  }

  // Enforce per-company media limits
  const currentCount = countMedia(companyId, type);
  const limit = type === 'photo' ? PHOTO_LIMIT : VIDEO_LIMIT;
  if (currentCount >= limit) {
    res.status(400).json({
      error: `${type === 'photo' ? 'Photo' : 'Video'} limit of ${limit} reached for this company`,
    });
    return;
  }

  const url = getPublicUrl(key);
  const uploadedBy = req.user?.userId ?? null;

  const record = addMedia(companyId, type, key, url, filename, fileSize, uploadedBy);
  res.status(201).json(record);
});

// ---------------------------------------------------------------------------
// GET /profile/:id/media — list media (public, no auth required)
// ---------------------------------------------------------------------------

router.get('/profile/:id/media', (req: Request, res: Response): void => {
  const companyId = req.params.id;
  const media = getMedia(companyId);
  res.json(media);
});

// ---------------------------------------------------------------------------
// DELETE /profile/:id/media/:mediaId — remove a media item
// ---------------------------------------------------------------------------

router.delete('/profile/:id/media/:mediaId', requireAuth, (req: Request, res: Response): void => {
  const { id: companyId, mediaId } = req.params;

  const access = checkEditAccess(req, companyId);
  if (!access.allowed) {
    res.status(403).json({ error: access.reason });
    return;
  }

  const removed = deleteMedia(mediaId, companyId);
  if (!removed) {
    res.status(404).json({ error: 'Media item not found' });
    return;
  }

  res.json({ success: true });
});

export default router;
