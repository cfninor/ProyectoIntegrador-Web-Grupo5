import { expect, Page, test } from '@playwright/test';

// Base del portal (SOLVENTAG5-132, parte 3): sesión simulada de config.json, rutas por rol,
// layouts y menú. Cada prueba fija su propio config.json con page.route.

const SESION_ASESOR = {
  usuario: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' },
  rol: 'ASESOR',
};
const SESION_CLIENTE = {
  usuario: { id: 'cliente-local', nombre: 'Laura Gómez Pardo' },
  rol: 'CLIENTE',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  documentoEnmascarado: 'CC ••••5678',
};

async function usarSesion(page: Page, sesionSimulada?: object): Promise<void> {
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada } }),
  );
}

test('el asesor entra a su tablero con su menú y su tarjeta', async ({ page }) => {
  await usarSesion(page, SESION_ASESOR);

  await page.goto('/');

  await expect(page).toHaveURL('/asesor');
  await expect(page).toHaveTitle('Tablero · Solventa');
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu.getByRole('link')).toHaveText(['Tablero', 'Cotizar']);
  await expect(menu.getByRole('link', { name: 'Tablero' })).toHaveAttribute('aria-current', 'page');
  const migas = page.getByRole('navigation', { name: 'Ruta de navegación' });
  await expect(migas.getByRole('listitem')).toHaveText(['Solventa', 'Tablero']);
  await expect(page.getByRole('heading', { level: 1, name: 'Tablero' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Hola de nuevo, Ana Sofía Reyes.');
  await expect(page.getByText('AS', { exact: true })).toBeVisible();
  await expect(page.getByText('Asesor comercial')).toBeVisible();
});

test('el cliente entra a su portal y no al del asesor', async ({ page }) => {
  await usarSesion(page, SESION_CLIENTE);

  await page.goto('/asesor');

  await expect(page).toHaveURL('/cliente');
  await expect(page.getByRole('main')).toContainText('Hola de nuevo, Laura Gómez Pardo.');
  await expect(page.getByText('Cliente', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Tablero' }).click();
  await expect(page).toHaveURL('/cliente');
});

test('sin sesión, un portal lleva a la página no encontrada del layout público', async ({
  page,
}) => {
  await usarSesion(page);

  await page.goto('/asesor');

  await expect(page).toHaveURL('/no-encontrada');
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toHaveCount(0);
});

test('en una pantalla angosta el menú se pliega y se abre con su botón', async ({ page }) => {
  await usarSesion(page, SESION_ASESOR);
  await page.setViewportSize({ width: 390, height: 800 });

  await page.goto('/asesor');

  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  const boton = page.getByRole('button', { name: 'Menú' });
  await expect(menu).toBeHidden();
  await expect(boton).toHaveAttribute('aria-expanded', 'false');

  await boton.click();
  await expect(menu).toBeVisible();
  await expect(boton).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('en una pantalla ancha el menú siempre se ve y no hay botón para plegarlo', async ({
  page,
}) => {
  await usarSesion(page, SESION_ASESOR);

  await page.goto('/asesor');

  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menú' })).toBeHidden();
});

test('SOLV-WEB-20 abre en el layout público, con la marca y sin menú', async ({ page }) => {
  await usarSesion(page, SESION_ASESOR);
  // Sin BFF: la página muestra su error de carga, dentro del layout público.
  await page.route('**/v1/solicitudes-autorizacion/**', (route) => route.abort());

  await page.goto('/autorizar/3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f');

  await expect(page.getByRole('banner')).toContainText('Solventa');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Autorizar la consulta de tus datos' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toHaveCount(0);
});
