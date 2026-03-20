import { test, expect } from '@playwright/test';

// Get a real company ID from the API before tests
let companyId: string;

test.beforeAll(async ({ request }) => {
  const res = await request.get('http://localhost:3001/api/companies?limit=1');
  const data = await res.json();
  companyId = data.companies?.[0]?.id;
  if (!companyId) throw new Error('No companies in DB — seed data missing');
});

test.describe('Company Profile Page', () => {
  test('profile page loads with company name', async ({ page }) => {
    await page.goto(`/company/${companyId}`);
    await page.waitForLoadState('domcontentloaded');
    // Wait for company data to load
    await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), { timeout: 10000 });
    // Should show business name somewhere in the page
    const heading = page.locator('h1, h2').first();
    await expect(heading).not.toBeEmpty();
  });

  test('About section is present', async ({ page }) => {
    await page.goto(`/company/${companyId}`);
    await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), { timeout: 10000 });
    await expect(page.getByText('ABOUT')).toBeVisible();
  });

  test('Contact section is present', async ({ page }) => {
    await page.goto(`/company/${companyId}`);
    await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), { timeout: 10000 });
    await expect(page.getByText('CONTACT')).toBeVisible();
  });

  test('WCB sponsor ad loads in skyscraper slot', async ({ page }) => {
    // Only visible on desktop (xl: breakpoint 1280px+)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/company/${companyId}`);
    await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), { timeout: 10000 });
    await page.waitForTimeout(2000); // Allow SponsorCard to fetch
    await expect(page.getByText('West Coast Batteries')).toBeVisible();
    await expect(page.getByText('Batteries for the Job Site')).toBeVisible();
  });

  test('SHOP NOW button is clickable (does not throw)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/company/${companyId}`);
    await page.waitForTimeout(3000);
    const shopBtn = page.getByRole('button', { name: /SHOP NOW/i });
    if (await shopBtn.isVisible()) {
      // Intercept new tab navigation — we just want to verify no JS error
      page.on('popup', popup => popup.close());
      await shopBtn.click();
    }
  });
});
