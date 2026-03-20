const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3500);
  // Scroll to the HCC banner area
  await page.evaluate(() => window.scrollTo(0, 850));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'hcc-section.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await browser.close();
  console.log('done');
})();
