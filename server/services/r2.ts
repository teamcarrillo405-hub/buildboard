/**
 * Cloudflare R2 client for CDN-backed image storage.
 *
 * Uses the S3-compatible API via @aws-sdk/client-s3 v3.
 * Reference: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 *
 * Required environment variables:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---------------------------------------------------------------------------
// Environment validation (warn but do not throw -- allow server to start)
// ---------------------------------------------------------------------------
const R2_REQUIRED_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const;

const missingR2Vars = R2_REQUIRED_VARS.filter((v) => !process.env[v]);
if (missingR2Vars.length > 0) {
  console.warn(
    `[R2] Warning: Missing environment variables: ${missingR2Vars.join(', ')}. R2 uploads will not work until these are set.`
  );
}

// ---------------------------------------------------------------------------
// R2 Client
// ---------------------------------------------------------------------------
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID ?? 'MISSING'}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? '';
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a file to R2 and return its public CDN URL.
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return getPublicUrl(key);
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Get the public CDN URL for an R2 object.
 */
export function getPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

// ---------------------------------------------------------------------------
// Existence check (for resume support)
// ---------------------------------------------------------------------------

/**
 * Check if a key already exists in R2.
 * Returns true if the object exists, false otherwise.
 */
export async function existsInR2(key: string): Promise<boolean> {
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Presigned upload URLs (client-to-R2 direct uploads)
// ---------------------------------------------------------------------------

/**
 * Generate a presigned PUT URL so the client can upload directly to R2,
 * bypassing the server's request size limit.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client, command, { expiresIn });
}
