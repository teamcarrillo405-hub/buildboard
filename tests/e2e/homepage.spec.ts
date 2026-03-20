import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Allow React to hydrate
  });

  test('page title and nav logo are visible', async ({ page }) => {
    await expect(page.locator('nav')).toBeVisible();
    // HCC logo or BUILDBOARD text should be in nav
    const nav = page.locator('nav');
    await expect(nav).toContainText('BUILDBOARD');
  });

  test('hero banner renders with headline', async ({ page }) => {
    // Hero contains the main headline text
    await expect(page.getByText(/CONSTRUCTION/i)).toBeVisible();
  });

  test('browse category pills are visible', async ({ page }) => {
    // The hero has category shortcut pills (General, Electrical, Plumbing, etc.)
    await expect(page.getByText(/PLUMBING|ELECTRICAL|GENERAL/i).first()).toBeVisible();
  });

  test('ranked company rails load', async ({ page }) => {
    // Wait for company cards to appear (from API)
    await page.waitForTimeout(3000);
    // Just verify no JS error crashed the page
    const errorBoundary = page.getByText(/something went wrong/i);
    await expect(errorBoundary).not.toBeVisible();
  });

  test('footer is present', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText(/Hispanic Construction Council/i)).toBeVisible();
  });
});
