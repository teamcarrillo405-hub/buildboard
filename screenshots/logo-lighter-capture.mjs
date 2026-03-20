import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto('http://localhost:5173');
await page.waitForTimeout(4000);

await page.evaluate(() => window.scrollTo(0, 300));
await page.waitForTimeout(500);

await page.screenshot({
  path: 'C:/Users/glcar/constructflix/screenshots/logo-lighter.png',
  clip: { x: 0, y: 250, width: 1400, height: 500 }
});

await browser.close();
console.log('Done');
