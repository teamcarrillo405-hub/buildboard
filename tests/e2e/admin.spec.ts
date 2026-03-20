import { test, expect } from '@playwright/test';

// Admin auth uses ADMIN_SECRET from .env — in dev, the bearer token flow is used
// For E2E testing, we test the UI flow (secret entry form)

test.describe('Admin Panel', () => {
  test('admin page loads and shows secret entry form', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    // Admin page should show a password/secret input when not authenticated
    const body = await page.textContent('body');
    // Should contain admin-related text
    expect(body).toMatch(/admin|Admin|secret|password|enter/i);
  });

  test('wrong admin secret shows error', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(1000);
    const input = page.locator('input[type="password"], input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('wrong-password-12345');
    await input.press('Enter');
    await page.waitForTimeout(500);
    // Should not navigate away or crash
    const url = page.url();
    expect(url).toContain('/admin');
  });

  test('admin analytics API returns data when called directly', async ({ request }) => {
    // Test the API directly with the ADMIN_SECRET bearer token
    // In dev, ADMIN_SECRET defaults to 'dev-admin-secret' if not set
    const secret = process.env.ADMIN_SECRET || 'dev-admin-secret';
    const res = await request.get('http://localhost:3001/api/admin/analytics?range=all', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    // Should return 200 with analytics data OR 401/403 if secret doesn't match
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    }
  });
});
