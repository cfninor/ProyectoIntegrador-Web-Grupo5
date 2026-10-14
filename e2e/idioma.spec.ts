import { expect, Page, Route, test } from '@playwright/test';

// Idioma español e inglés (SOLVENTAG5-132, parte 4, D12): un solo build, la traducción se carga
// al iniciar y el selector ES / EN guarda la preferencia y recarga. playwright.config.ts fija el
// navegador en es-CO; estas pruebas fijan el idioma antes de abrir la página.

const CLAVE_IDIOMA = 'solventa.idioma';
const SOLICITUD_ID = '3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f';
const SESION_ASESOR = { usuario: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' }, rol: 'ASESOR' };
const SESION_CLIENTE = {
  usuario: { id: 'cliente-local', nombre: 'Laura Gómez Pardo' },
  rol: 'CLIENTE',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  documentoEnmascarado: 'CC ••••5678',
};

const PENDIENTE = {
  solicitudId: SOLICITUD_ID,
  estado: 'PENDIENTE',
  asesor: { nombre: 'Laura Gómez' },
  fechaSolicitud: '2026-10-09T14:30:00Z',
  catalogo: {
    version: 'v1',
    fuentes: [
      {
        fuente: 'OPEN_FINANCE',
        datos: [{ codigo: 'COMPORTAMIENTO_PAGO', entidades: ['ENTIDADES_FINANZAS_ABIERTAS'] }],
      },
    ],
  },
  condiciones: {
    duracionMeses: 12,
    finalidad: 'PERFILAMIENTO_VIDA_HIPOTECARIO',
    destinatario: 'SOLVENTA',
    baseLegal: ['LEY_1581_2012', 'DECRETO_1297_2022'],
    versionPolitica: 'v1',
  },
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};

async function usarSesion(page: Page, sesionSimulada: object): Promise<void> {
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada } }),
  );
}

/** Guarda la preferencia antes de abrir la página, solo si todavía no hay una. */
async function preferirIngles(page: Page): Promise<void> {
  await page.addInitScript((clave) => {
    if (!localStorage.getItem(clave)) {
      localStorage.setItem(clave, 'en-US');
    }
  }, CLAVE_IDIOMA);
}

async function responder(route: Route, cuerpo: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
  } else {
    await route.fulfill({ status: 200, headers: CORS, json: cuerpo });
  }
}

test('el selector cambia el idioma del portal, lo guarda y cambia <html lang>', async ({
  page,
}) => {
  await usarSesion(page, SESION_ASESOR);
  await page.goto('/asesor');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-CO');
  await expect(page.getByRole('heading', { level: 1, name: 'Tablero' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Español' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page
    .getByRole('group', { name: 'Idioma' })
    .getByRole('button', { name: 'English' })
    .click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate((clave) => localStorage.getItem(clave), CLAVE_IDIOMA)).toBe('en-US');

  await page
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: 'Español' })
    .click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'es-CO');
  await expect(page.getByRole('heading', { level: 1, name: 'Tablero' })).toBeVisible();
});

test('con la preferencia guardada en inglés, el portal abre en inglés en cada visita', async ({
  page,
}) => {
  await usarSesion(page, SESION_ASESOR);
  await preferirIngles(page);

  await page.goto('/');
  await page.goto('/asesor');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page).toHaveTitle('Dashboard · Solventa');
});

test.describe('con el navegador en inglés y sin preferencia', () => {
  test.use({ locale: 'en-US' });

  test('el portal inicia en inglés', async ({ page }) => {
    await usarSesion(page, SESION_ASESOR);

    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  });
});

test('navegación del asesor en inglés', async ({ page }) => {
  await usarSesion(page, SESION_ASESOR);
  await preferirIngles(page);

  await page.goto('/');

  await expect(page).toHaveURL('/asesor');
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await expect(menu.getByRole('link')).toHaveText(['Dashboard', 'Quote']);
  await expect(menu.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const migas = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(migas.getByRole('listitem')).toHaveText(['Solventa', 'Dashboard']);
  await expect(page.getByRole('main')).toContainText('Welcome back, Ana Sofía Reyes.');
  await expect(page.getByText('Sales advisor')).toBeVisible();
});

test('navegación del cliente en inglés', async ({ page }) => {
  await usarSesion(page, SESION_CLIENTE);
  await preferirIngles(page);

  await page.goto('/asesor');

  await expect(page).toHaveURL('/cliente');
  await expect(page.getByRole('main')).toContainText('Welcome back, Laura Gómez Pardo.');
  await expect(page.getByText('Customer', { exact: true })).toBeVisible();
});

test('SOLV-WEB-20 en inglés: el cliente autoriza la consulta de sus datos', async ({ page }) => {
  await usarSesion(page, SESION_ASESOR);
  await preferirIngles(page);
  await page.route(`**/v1/solicitudes-autorizacion/${SOLICITUD_ID}`, (route) =>
    responder(route, PENDIENTE),
  );
  await page.route(`**/v1/solicitudes-autorizacion/${SOLICITUD_ID}/decision`, (route) =>
    responder(route, { solicitudId: SOLICITUD_ID, estado: 'AUTORIZADA' }),
  );

  await page.goto(`/autorizar/${SOLICITUD_ID}`);

  await expect(page).toHaveTitle('Authorize access to your data · Solventa');
  await expect(
    page.getByText('Request sent by Laura Gómez, from Solventa, on Oct 9, 2026 at 9:30 AM'),
  ).toBeVisible();
  await expect(page.getByText('The authorization lasts 12 months')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('group', { name: 'Language' })).toBeVisible();

  await page.getByRole('checkbox', { name: /^I authorize Solventa/ }).check();
  await page.getByRole('button', { name: 'Authorize', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'You authorized access to your data' }),
  ).toBeVisible();
});

test('SOLV-WEB-20 cambia de idioma con el selector del layout público', async ({ page }) => {
  await usarSesion(page, SESION_ASESOR);
  await page.route(`**/v1/solicitudes-autorizacion/${SOLICITUD_ID}`, (route) =>
    responder(route, PENDIENTE),
  );

  await page.goto(`/autorizar/${SOLICITUD_ID}`);
  await expect(page.getByText('La autorización dura 12 meses')).toBeVisible();

  await page.getByRole('button', { name: 'English' }).click();

  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page).toHaveURL(`/autorizar/${SOLICITUD_ID}`);
  await expect(page.getByText('The authorization lasts 12 months')).toBeVisible();
});
