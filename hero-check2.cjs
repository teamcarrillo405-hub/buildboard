const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'hero-check2.png', clip: { x: 250, y: 80, width: 940, height: 720 } });
  await browser.close();
  console.log('done');
})();
