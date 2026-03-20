const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 860));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'card-closeup.png', clip: { x: 50, y: 40, width: 700, height: 200 } });
  await browser.close();
  console.log('done');
})();
