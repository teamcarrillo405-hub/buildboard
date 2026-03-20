const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(800);
  const cards = await page.$$('.group');
  const card = cards[3];
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'popup-state.png' });
  await browser.close();
  console.log('done');
})();
