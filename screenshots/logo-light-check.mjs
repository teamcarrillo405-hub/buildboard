import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:5173');

  // Wait 4 seconds
  await page.waitForTimeout(4000);

  // Scroll to y:400 to show the Top 25 General Contractors row
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(500);

  await page.screenshot({
    path: 'C:/Users/glcar/constructflix/screenshots/logo-light-check.png',
    fullPage: false,
  });

  console.log('Screenshot saved to C:/Users/glcar/constructflix/screenshots/logo-light-check.png');
  await browser.close();
})();
