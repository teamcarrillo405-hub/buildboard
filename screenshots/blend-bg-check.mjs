import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('http://localhost:5173');

  // Wait 4 seconds for logos to load
  await page.waitForTimeout(4000);

  // Scroll to y:400 to get the Top 25 General Contractors card row in frame
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(500);

  // Take a cropped screenshot of the card row area
  await page.screenshot({
    path: 'C:/Users/glcar/constructflix/screenshots/blend-bg-check.png',
    clip: { x: 0, y: 0, width: 1440, height: 900 }
  });

  console.log('Screenshot saved to C:/Users/glcar/constructflix/screenshots/blend-bg-check.png');
  await browser.close();
})();
