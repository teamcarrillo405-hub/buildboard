const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  const height = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate((h) => window.scrollTo(0, h), height);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'footer-check.png' });
  await browser.close();
  console.log('height:', height);
})();
