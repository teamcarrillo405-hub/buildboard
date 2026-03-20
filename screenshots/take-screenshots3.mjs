import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = __dirname;

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log('Waiting 4 seconds for logos to load...');
  await page.waitForTimeout(4000);

  // From the logged coordinates:
  // Top 25 General Contractors h2 is at y=653, section wraps from ~629-942
  // Featured Subcontractors h2 is at y=967, section ~967-1270
  // Top 25 Electricians h2 is at y=1488, section ~1464-1777
  // Top 25 Plumbers h2 is at y=1802, section ~1802-2112

  // Screenshot Top 25 GC section
  const gc = path.join(OUTPUT_DIR, 'section-top25-gc.png');
  await page.screenshot({
    path: gc,
    clip: { x: 0, y: 620, width: 1440, height: 330 },
  });
  console.log(`GC section: ${gc}`);

  // Screenshot Featured Subcontractors section
  const featured = path.join(OUTPUT_DIR, 'section-featured-sub.png');
  await page.screenshot({
    path: featured,
    clip: { x: 0, y: 955, width: 1440, height: 330 },
  });
  console.log(`Featured sub section: ${featured}`);

  // Screenshot Top 25 Electricians section
  const elec = path.join(OUTPUT_DIR, 'section-top25-electricians.png');
  await page.screenshot({
    path: elec,
    clip: { x: 0, y: 1455, width: 1440, height: 330 },
  });
  console.log(`Electricians section: ${elec}`);

  // Screenshot Top 25 Plumbers section
  const plumb = path.join(OUTPUT_DIR, 'section-top25-plumbers.png');
  await page.screenshot({
    path: plumb,
    clip: { x: 0, y: 1790, width: 1440, height: 330 },
  });
  console.log(`Plumbers section: ${plumb}`);

  // Screenshot Top 25 Roofing
  const roof = path.join(OUTPUT_DIR, 'section-top25-roofing.png');
  await page.screenshot({
    path: roof,
    clip: { x: 0, y: 2105, width: 1440, height: 330 },
  });
  console.log(`Roofing section: ${roof}`);

  await browser.close();
  console.log('Done.');
}

takeScreenshots().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
