import { expect, test } from '@playwright/test';

test('el portal carga en español y lleva al tablero del rol de la sesión', async ({ page }) => {
  // public/config.json trae una sesión simulada de rol ASESOR para el desarrollo local.
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'es-CO');
  await expect(page).toHaveURL('/asesor');
  await expect(page.getByRole('heading', { level: 1, name: 'Tablero' })).toBeVisible();
});
