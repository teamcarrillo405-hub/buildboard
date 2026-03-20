import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = __dirname;

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Set a desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Extra wait for external logo images to load
  console.log('Waiting 4 seconds for logos to load...');
  await page.waitForTimeout(4000);

  // Full-page screenshot
  const fullPagePath = path.join(OUTPUT_DIR, 'homepage-full.png');
  await page.screenshot({ path: fullPagePath, fullPage: true });
  console.log(`Full-page screenshot saved: ${fullPagePath}`);

  // Try to locate the first card grid section
  // Common selectors to try
  const cardGridSelectors = [
    '[data-testid="card-grid"]',
    '.card-grid',
    '.ranked-cards',
    '[class*="grid"]',
    '[class*="card"]',
    'section',
    'main',
  ];

  let cardGridElement = null;
  for (const selector of cardGridSelectors) {
    const el = await page.$(selector);
    if (el) {
      const box = await el.boundingBox();
      if (box && box.width > 100 && box.height > 100) {
        cardGridElement = el;
        console.log(`Found card grid with selector: ${selector}, box: ${JSON.stringify(box)}`);
        break;
      }
    }
  }

  if (cardGridElement) {
    const cardGridPath = path.join(OUTPUT_DIR, 'card-grid-zoom.png');
    await cardGridElement.screenshot({ path: cardGridPath });
    console.log(`Card grid screenshot saved: ${cardGridPath}`);
  } else {
    // Fallback: screenshot the viewport area (top portion of page)
    const fallbackPath = path.join(OUTPUT_DIR, 'card-grid-zoom.png');
    await page.screenshot({
      path: fallbackPath,
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    console.log(`Fallback card area screenshot saved: ${fallbackPath}`);
  }

  // Also try to get all card elements and screenshot the first few
  const cards = await page.$$('[class*="card"], [class*="Card"], article, li');
  console.log(`Found ${cards.length} potential card elements on page`);

  if (cards.length > 0) {
    // Screenshot the bounding box that covers the first ~6 cards
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    const limit = Math.min(6, cards.length);
    for (let i = 0; i < limit; i++) {
      const box = await cards[i].boundingBox();
      if (box) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }
    }
    if (maxX > minX && maxY > minY) {
      const cardsPath = path.join(OUTPUT_DIR, 'first-cards-zoom.png');
      await page.screenshot({
        path: cardsPath,
        clip: {
          x: Math.max(0, minX - 16),
          y: Math.max(0, minY - 16),
          width: Math.min(1440, maxX - minX + 32),
          height: Math.min(3000, maxY - minY + 32),
        },
      });
      console.log(`First cards screenshot saved: ${cardsPath}`);
    }
  }

  await browser.close();
  console.log('Done.');
}

takeScreenshots().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
