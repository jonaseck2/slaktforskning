import { test, expect } from '@playwright/test';

test.describe('Wall Chart', () => {
  test('wall chart tab appears in reports view', async ({ page }) => {
    // Navigate to reports
    await page.goto('/#/reports');
    await page.waitForSelector('.reports-view');

    // Check that the Wall Chart filter chip exists
    const wallChartChip = page.locator('.chip', { hasText: /Wall Chart|Väggplansch/ });
    await expect(wallChartChip).toBeVisible();
  });
});
