const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.scrollTo(0, 1509 - 100));
  await page.waitForTimeout(500);
  // Full viewport screenshot
  await page.screenshot({ path: 'header-closeup.png' });
  await browser.close();
  console.log('done');
})();
