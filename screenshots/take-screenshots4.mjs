import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = __dirname;

async function screenshotSection(page, label, scrollY, sectionHeight) {
  // Scroll so the section is in the viewport
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page.waitForTimeout(300);

  // After scroll, the section should start at y=0 in the viewport
  const filename = path.join(OUTPUT_DIR, `section-${label}.png`);
  await page.screenshot({
    path: filename,
    clip: { x: 0, y: 0, width: 1440, height: Math.min(sectionHeight, 900) },
  });
  console.log(`Saved: ${filename}`);
  return filename;
}

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log('Waiting 4 seconds for logos to load...');
  await page.waitForTimeout(4000);

  // Known Y positions from previous run:
  // Top 25 GC: section starts ~629, heading at 653
  // Featured Sub: section starts ~967, heading at 967
  // Top 25 Electricians: section starts ~1464, heading at 1488
  // Top 25 Plumbers: section starts ~1802, heading at 1802
  // Top 25 Roofing: section starts ~2117, heading at 2117

  // Scroll to each section top (minus a little padding) and screenshot
  await screenshotSection(page, 'top25-gc', 615, 330);
  await screenshotSection(page, 'featured-sub', 955, 330);
  await screenshotSection(page, 'top25-electricians', 1452, 330);
  await screenshotSection(page, 'top25-plumbers', 1788, 330);
  await screenshotSection(page, 'top25-roofing', 2103, 330);

  await browser.close();
  console.log('Done.');
}

takeScreenshots().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
