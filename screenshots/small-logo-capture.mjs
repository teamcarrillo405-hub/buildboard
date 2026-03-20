import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

console.log('Navigating to http://localhost:5173...');
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

// Wait 5 seconds for logos to fully load and onLoad handlers to fire
console.log('Waiting 5 seconds for logos to load...');
await page.waitForTimeout(5000);

// Scroll to y:300 to get past the hero
await page.evaluate(() => window.scrollTo(0, 300));
await page.waitForTimeout(500);

// Screenshot 1: cards visible after hero
console.log('Taking screenshot 1 (y:300)...');
await page.screenshot({
  path: 'C:/Users/glcar/constructflix/screenshots/small-logo-fix.png',
  fullPage: false,
});

// Scroll further down to capture more card rows
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(500);

// Screenshot 2: more card rows
console.log('Taking screenshot 2 (y:1200)...');
await page.screenshot({
  path: 'C:/Users/glcar/constructflix/screenshots/small-logo-fix-2.png',
  fullPage: false,
});

console.log('Done.');
await browser.close();
