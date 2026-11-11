import { test, expect } from '@playwright/test';

test.describe('WiniSort End-to-End UI & PWA Verification', () => {
  test('renders initial workspace, media pool tray, starter destinations, sample import, sorting, and theme toggle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ws-brand-title')).toContainText('WiniSort');
    await expect(page.locator('.ws-tray-heading')).toContainText('Your files, ready to find their place.');

    // Verify starter destinations exist
    await expect(page.locator('[data-destination-id]').first()).toBeVisible();

    // Load sample media pack and sort active item
    await page.click('#btn-pool-load-sample-files');
    await expect(page.locator('#ws-active-media-card')).toBeVisible();

    // Click first destination card to sort active file
    await page.locator('[data-destination-id]').first().click();
    await expect(page.locator('.ws-toast').first()).toBeVisible();

    // Toggle dark mode
    await page.click('#btn-toolbar-theme');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
