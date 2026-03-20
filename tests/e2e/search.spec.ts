import { test, expect } from '@playwright/test';

test.describe('Search Flow', () => {
  test('typing in hero search and submitting navigates to /search', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    // Find the trade/service input in the hero
    const tradeInput = page.locator('input[placeholder*="Trade"], input[placeholder*="service"]').first();
    await tradeInput.fill('Plumbing');
    await tradeInput.press('Enter');
    await expect(page).toHaveURL(/\/search/);
  });

  test('search results page loads with results or empty state', async ({ page }) => {
    await page.goto('/search?q=plumbing');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    // Should show either results or "no results" message — not blank
    const body = await page.textContent('body');
    const hasContent = body && body.length > 200;
    expect(hasContent).toBe(true);
  });

  test('filter sidebar opens on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search?q=plumbing');
    await page.waitForTimeout(2000);
    const filterBtn = page.getByRole('button', { name: /filter/i });
    await expect(filterBtn).toBeVisible({ timeout: 5000 });
    await filterBtn.click();
    // Drawer should slide up
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/search-filter-drawer-mobile.png' });
  });

  test('back navigation from search returns to homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.goto('/search?q=roofing');
    await page.goBack();
    await expect(page).toHaveURL('/');
  });
});
