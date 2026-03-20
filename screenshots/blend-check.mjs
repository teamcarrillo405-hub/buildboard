import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto('http://localhost:5173');

// Wait 4 seconds for logos to load
await page.waitForTimeout(4000);

// Scroll to y:100 to show Top 25 General Contractors section
await page.evaluate(() => window.scrollTo(0, 100));
await page.waitForTimeout(500);

// Find the Top 25 General Contractors section and screenshot the first card row
const section = await page.$('section, .section, [class*="section"]');

// Take a screenshot of the viewport area showing the card row
await page.screenshot({
  path: 'C:/Users/glcar/constructflix/screenshots/blend-check.png',
  clip: {
    x: 0,
    y: 0,
    width: 1400,
    height: 900
  }
});

console.log('Screenshot saved to C:/Users/glcar/constructflix/screenshots/blend-check.png');
await browser.close();
