const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.scrollTo(0, 3928 - 200));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'cta-section.png' });
  await browser.close();
  console.log('done');
})();
