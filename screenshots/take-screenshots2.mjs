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

  // Log all headings to find card section labels
  const headings = await page.$$eval('h2, h3, [class*="section"], [class*="Section"]', els =>
    els.map(el => ({ tag: el.tagName, text: el.textContent?.trim().substring(0, 80), y: el.getBoundingClientRect().y + window.scrollY }))
  );
  console.log('Headings/sections found:', JSON.stringify(headings, null, 2));

  // Screenshot the TOP 25 General Contractors section (first card row)
  // It appears around y=250 based on the full page screenshot
  const topContractorsPath = path.join(OUTPUT_DIR, 'top25-general-contractors.png');
  await page.screenshot({
    path: topContractorsPath,
    clip: { x: 0, y: 200, width: 1440, height: 280 },
  });
  console.log(`Top 25 GC section saved: ${topContractorsPath}`);

  // Screenshot featured subcontractors section (appears around y=480)
  const featuredPath = path.join(OUTPUT_DIR, 'featured-subcontractors.png');
  await page.screenshot({
    path: featuredPath,
    clip: { x: 0, y: 470, width: 1440, height: 250 },
  });
  console.log(`Featured subcontractors saved: ${featuredPath}`);

  // Screenshot at 2x zoom on just one card row using CDP
  // First, get the actual page coordinates of sections by scrolling and evaluating
  const sectionInfo = await page.evaluate(() => {
    // Find elements with ranked card-like structure
    const allEls = Array.from(document.querySelectorAll('*'));
    const results = [];
    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      if (text.includes('TOP 25') || text.includes('GENERAL CONTRACTORS') || text.includes('Top 25')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 50) {
          results.push({
            tag: el.tagName,
            className: el.className?.toString().substring(0, 100),
            text: text.substring(0, 60),
            top: rect.top + window.scrollY,
            height: rect.height,
            width: rect.width,
          });
        }
      }
    }
    return results.slice(0, 10);
  });
  console.log('Section elements:', JSON.stringify(sectionInfo, null, 2));

  // Screenshot the actual card images — get individual card logo areas
  const cardImgInfo = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map(img => ({
      src: img.src?.substring(0, 100),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      displayWidth: img.getBoundingClientRect().width,
      displayHeight: img.getBoundingClientRect().height,
      top: img.getBoundingClientRect().top + window.scrollY,
      left: img.getBoundingClientRect().left,
      complete: img.complete,
      alt: img.alt?.substring(0, 40),
    }));
  });
  console.log('Images on page:');
  cardImgInfo.forEach((img, i) => {
    console.log(`  [${i}] alt="${img.alt}" naturalSize=${img.naturalWidth}x${img.naturalHeight} displaySize=${Math.round(img.displayWidth)}x${Math.round(img.displayHeight)} top=${Math.round(img.top)} complete=${img.complete}`);
  });

  // Take a cropped screenshot of the first card row at full resolution
  // Based on the full page screenshot, the Top 25 GC row starts around y=210 (scaled)
  // Full page was captured at 1440px wide, page height appears to be ~4600px
  // Let's get page height
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = 900;
  console.log(`Page scroll height: ${pageHeight}, viewport: ${viewportHeight}`);

  // Screenshot card rows with proper coordinates
  // Top 25 GC section
  const gc1Path = path.join(OUTPUT_DIR, 'gc-cards-closeup.png');
  await page.screenshot({
    path: gc1Path,
    clip: { x: 0, y: 180, width: 1440, height: 260 },
  });
  console.log(`GC cards closeup saved: ${gc1Path}`);

  await browser.close();
  console.log('Done.');
}

takeScreenshots().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
