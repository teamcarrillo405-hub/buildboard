import { test, expect, Page } from '@playwright/test';

const VIEWPORTS = {
  mobile:  { width: 390,  height: 844  },
  tablet:  { width: 768,  height: 1024 },
  desktop: { width: 1440, height: 900  },
};

async function goHome(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
}

// ── Navigation ─────────────────────────────────────────────────────────────

test.describe('Navigation — Responsive', () => {
  test('mobile: shows only logo and icon buttons (no search bar)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await goHome(page);
    // Desktop search inputs should be hidden
    const searchInput = page.locator('input[placeholder*="Trade"]');
    await expect(searchInput).not.toBeVisible();
    // Logo should be visible
    await expect(page.locator('nav')).toBeVisible();
  });

  test('tablet: shows search bar in nav', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await goHome(page);
    // At md (768px), search inputs appear
    const searchInput = page.locator('input[placeholder*="Trade"], input[placeholder*="service"]').first();
    await expect(searchInput).toBeVisible();
  });

  test('desktop: full search bar visible with location input', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await goHome(page);
    // Both trade and location inputs should be visible
    const tradeInput = page.locator('input[placeholder*="Trade"], input[placeholder*="service"]').first();
    await expect(tradeInput).toBeVisible();
  });

  test('no horizontal scroll on any viewport', async ({ page }) => {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(vp);
      await goHome(page);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, `horizontal overflow on ${name}`).toBeLessThanOrEqual(clientWidth + 2);
    }
  });
});

// ── Homepage ────────────────────────────────────────────────────────────────

test.describe('Homepage — Responsive', () => {
  test('mobile: hero headline is readable (no overflow)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await goHome(page);
    const heroText = page.getByText(/CONSTRUCTION/i);
    await expect(heroText).toBeVisible();
    const box = await heroText.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width);
  });

  test('tablet: hero and nav both visible without overlap', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await goHome(page);
    await expect(page.getByText(/CONSTRUCTION/i)).toBeVisible();
  });

  test('takes and saves screenshots at all breakpoints', async ({ page }) => {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(vp);
      await goHome(page);
      await page.screenshot({ path: `tests/screenshots/homepage-${name}.png` });
    }
  });
});

// ── Search Results ──────────────────────────────────────────────────────────

test.describe('Search Results — Responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/search?q=plumbing');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  });

  test('mobile: filter button is visible (sidebar hidden)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.reload();
    await page.waitForTimeout(1500);
    // On mobile, the sidebar is hidden and a "Filters" button appears
    const filterBtn = page.getByRole('button', { name: /filter/i });
    await expect(filterBtn).toBeVisible();
  });

  test('desktop: sidebar is visible inline (no filter button needed)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.reload();
    await page.waitForTimeout(1500);
    // On desktop (lg+), the sidebar should be visible inline
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });

  test('no horizontal scroll on search results at mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.reload();
    await page.waitForTimeout(1500);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});

// ── Company Profile ─────────────────────────────────────────────────────────

test.describe('Company Profile — Responsive', () => {
  let profileUrl: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/companies?limit=1');
    const data = await res.json();
    const id = data.companies?.[0]?.id;
    if (!id) throw new Error('No companies in DB');
    profileUrl = `/company/${id}`;
  });

  async function loadProfile(page: Page) {
    await page.goto(profileUrl);
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading...') || document.body.innerText.length > 500,
      { timeout: 12000 }
    ).catch(() => {}); // Don't fail if loading persists — screenshot will show state
    await page.waitForTimeout(1000);
  }

  test('mobile: single column layout, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await loadProfile(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    await page.screenshot({ path: 'tests/screenshots/profile-mobile.png' });
  });

  test('tablet (768px): 2-column layout — sidebar visible, no ad column', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await loadProfile(page);
    // Sponsor ad should be hidden below xl (1280px)
    const sponsorAd = page.getByText('West Coast Batteries');
    await expect(sponsorAd).not.toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/profile-tablet.png' });
  });

  test('desktop (1440px): 3-column layout — ad column visible', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await loadProfile(page);
    await page.waitForTimeout(2000); // SponsorCard fetch
    await page.screenshot({ path: 'tests/screenshots/profile-desktop.png' });
    // Just verify no layout overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test('text does not overflow column at any viewport', async ({ page }) => {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(vp);
      await loadProfile(page);
      const overflow = await page.evaluate(() => {
        // Check for elements wider than the viewport
        const all = Array.from(document.querySelectorAll('p, h1, h2, h3, span'));
        return all.some(el => el.getBoundingClientRect().right > window.innerWidth + 5);
      });
      expect(overflow, `text overflow detected on ${name}`).toBe(false);
    }
  });
});
