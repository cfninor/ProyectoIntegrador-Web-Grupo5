import { expect, test } from '@playwright/test';

test('el portal carga en español con la marca visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'es-CO');
  await expect(page.getByText('Solventa', { exact: true })).toBeVisible();
});
