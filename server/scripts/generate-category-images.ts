#!/usr/bin/env npx tsx
/**
 * Batch category image generation script for BuildBoard.
 *
 * Generates AI images for each category group using Imagen 4 Fast
 * and uploads them to Cloudflare R2.
 *
 * Usage:
 *   npx tsx server/scripts/generate-category-images.ts
 *   npx tsx server/scripts/generate-category-images.ts --dry-run
 *   npx tsx server/scripts/generate-category-images.ts --slug plumbing
 *   npx tsx server/scripts/generate-category-images.ts --slug plumbing --dry-run
 *
 * Environment variables required:
 *   GEMINI_API_KEY          - Google AI Studio API key for Imagen 4 Fast
 *   R2_ACCOUNT_ID           - Cloudflare account ID
 *   R2_ACCESS_KEY_ID        - R2 API token access key
 *   R2_SECRET_ACCESS_KEY    - R2 API token secret key
 *   R2_BUCKET_NAME          - R2 bucket name (e.g., 'buildboard-images')
 *   R2_PUBLIC_URL           - R2 public URL (e.g., 'https://images.buildboard.com')
 */

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { IMAGE_SLUGS, CATEGORY_PROMPTS } from '../data/category-map.js';
import { uploadToR2, existsInR2 } from '../services/r2.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getOption(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const DRY_RUN = getFlag('dry-run');
const SINGLE_SLUG = getOption('slug');
const VARIATIONS_PER_SLUG = 5;
const DELAY_MS = 1000; // 1 second between API calls to respect rate limits

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------
function validateEnvironment(): string[] {
  const required: Record<string, string> = {
    GEMINI_API_KEY: 'Google AI Studio -> Get API Key (https://aistudio.google.com/apikey)',
    R2_ACCOUNT_ID: 'Cloudflare Dashboard -> R2 -> Overview (Account ID in sidebar)',
    R2_ACCESS_KEY_ID: 'Cloudflare Dashboard -> R2 -> Manage R2 API Tokens -> Create API Token',
    R2_SECRET_ACCESS_KEY: 'Cloudflare Dashboard -> R2 -> Manage R2 API Tokens (shown once)',
    R2_BUCKET_NAME: 'Cloudflare Dashboard -> R2 -> Create Bucket (e.g., buildboard-images)',
    R2_PUBLIC_URL: 'Cloudflare Dashboard -> R2 -> Bucket Settings -> Public Access',
  };

  const missing: string[] = [];
  for (const [key, source] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`  ${key} - ${source}`);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Main generation logic
// ---------------------------------------------------------------------------
interface GenerationResult {
  slug: string;
  variation: number;
  key: string;
  status: 'uploaded' | 'skipped' | 'failed';
  error?: string;
  url?: string;
}

async function generateAndUploadImage(
  ai: GoogleGenAI,
  slug: string,
  variation: number,
  prompt: string,
  progress: string
): Promise<GenerationResult> {
  const key = `categories/${slug}/${variation}.webp`;

  // Resume support: check if already exists in R2
  try {
    const exists = await existsInR2(key);
    if (exists) {
      console.log(`${progress} Skipped (exists): ${key}`);
      return { slug, variation, key, status: 'skipped' };
    }
  } catch {
    // If HeadObject fails (e.g., no R2 credentials), proceed with generation
  }

  try {
    // Generate image with Imagen 4 Fast
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-fast-generate-001',
      prompt,
      config: { numberOfImages: 1 },
    });

    if (
      !response.generatedImages ||
      response.generatedImages.length === 0 ||
      !response.generatedImages[0].image?.imageBytes
    ) {
      throw new Error('No image data returned from Imagen API');
    }

    const imageData = response.generatedImages[0].image.imageBytes;
    const rawBuffer = Buffer.from(imageData, 'base64');

    // Optimize with sharp: resize to 800x450 (16:9) and convert to WebP
    const optimized = await sharp(rawBuffer)
      .resize(800, 450, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    // Upload to R2
    const url = await uploadToR2(key, optimized, 'image/webp');

    console.log(`${progress} Uploaded: ${key} (${(optimized.length / 1024).toFixed(1)}KB)`);
    return { slug, variation, key, status: 'uploaded', url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${progress} FAILED: ${key} - ${message}`);
    return { slug, variation, key, status: 'failed', error: message };
  }
}

async function main() {
  console.log('=== BuildBoard Category Image Generator ===\n');

  // Determine which slugs to process
  let slugsToProcess: string[];
  if (SINGLE_SLUG) {
    if (!IMAGE_SLUGS.includes(SINGLE_SLUG)) {
      console.error(`Error: Unknown slug "${SINGLE_SLUG}".`);
      console.error(`Available slugs (${IMAGE_SLUGS.length}):`);
      IMAGE_SLUGS.forEach((s) => console.error(`  - ${s}`));
      process.exit(1);
    }
    slugsToProcess = [SINGLE_SLUG];
  } else {
    slugsToProcess = IMAGE_SLUGS;
  }

  const totalImages = slugsToProcess.length * VARIATIONS_PER_SLUG;
  console.log(`Slugs: ${slugsToProcess.length}`);
  console.log(`Variations per slug: ${VARIATIONS_PER_SLUG}`);
  console.log(`Total images: ${totalImages}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no API calls)' : 'LIVE'}\n`);

  // --- Dry run: list what would be generated ---
  if (DRY_RUN) {
    let imageNum = 0;
    for (const slug of slugsToProcess) {
      const prompt = CATEGORY_PROMPTS[slug];
      console.log(`[${slug}]`);
      console.log(`  Prompt: "${prompt?.substring(0, 80)}..."`);
      for (let v = 1; v <= VARIATIONS_PER_SLUG; v++) {
        imageNum++;
        console.log(`  [${imageNum}/${totalImages}] categories/${slug}/${v}.webp`);
      }
      console.log('');
    }
    console.log(`\nDry run complete. ${totalImages} images would be generated.`);
    console.log(`Estimated cost: $${(totalImages * 0.02).toFixed(2)} (Imagen 4 Fast @ $0.02/image)`);
    process.exit(0);
  }

  // --- Live mode: validate environment ---
  const missingVars = validateEnvironment();
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:\n');
    missingVars.forEach((m) => console.error(m));
    console.error('\nSet these in your .env file and try again.');
    process.exit(1);
  }

  // Initialize Gemini client
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const results: GenerationResult[] = [];
  let imageNum = 0;
  const startTime = Date.now();

  // Process slugs sequentially to avoid rate limits
  for (const slug of slugsToProcess) {
    const prompt = CATEGORY_PROMPTS[slug];
    if (!prompt) {
      console.error(`Warning: No prompt found for slug "${slug}". Skipping.`);
      continue;
    }

    console.log(`\n--- ${slug} ---`);

    // Generate 5 variations sequentially
    for (let v = 1; v <= VARIATIONS_PER_SLUG; v++) {
      imageNum++;
      const progress = `[${imageNum}/${totalImages}]`;

      const result = await generateAndUploadImage(ai, slug, v, prompt, progress);
      results.push(result);

      // Delay between API calls to respect rate limits
      if (result.status !== 'skipped' && imageNum < totalImages) {
        await sleep(DELAY_MS);
      }
    }
  }

  // --- Summary ---
  const elapsed = Date.now() - startTime;
  const uploaded = results.filter((r) => r.status === 'uploaded').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed');

  console.log('\n=== Generation Complete ===');
  console.log(`Duration: ${formatDuration(elapsed)}`);
  console.log(`Uploaded: ${uploaded}/${totalImages}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Estimated cost: $${(uploaded * 0.02).toFixed(2)}`);

  if (failed.length > 0) {
    console.log('\nFailed images:');
    failed.forEach((f) => {
      console.log(`  - ${f.key}: ${f.error}`);
    });
    console.log('\nRe-run the script to retry failed images (existing ones will be skipped).');
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
