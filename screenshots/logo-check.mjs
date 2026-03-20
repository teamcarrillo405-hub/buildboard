import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  console.log('Waiting 4 seconds for logos to load...');
  await page.waitForTimeout(4000);

  // Scroll down slightly to ensure the first card section is visible
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(500);

  // Try to find the first horizontal scroll section of ranked cards
  const cardSection = await page.$('.ranked-section, [class*="ranked"], [class*="card-row"], [class*="horizontal-scroll"], section');

  const screenshotPath = 'C:/Users/glcar/constructflix/screenshots/logo-check.png';

  if (cardSection) {
    console.log('Found card section element, screenshotting it...');
    await cardSection.screenshot({ path: screenshotPath });
  } else {
    // Fallback: capture a region around y=150-800 where cards typically appear
    console.log('No specific card section found, using clip region...');
    await page.screenshot({
      path: screenshotPath,
      clip: { x: 0, y: 150, width: 1400, height: 650 }
    });
  }

  console.log('Screenshot saved to:', screenshotPath);
  await browser.close();
})();
