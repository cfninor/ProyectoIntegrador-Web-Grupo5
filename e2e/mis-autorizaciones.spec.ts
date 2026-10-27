import { expect, Page, Route, test } from '@playwright/test';

import { preferirIngles } from './cognito-simulado';

// «Mis autorizaciones» del Portal Clientes (SOLVENTAG5-84), con el BFF simulado por page.route:
// los consentimientos del cliente de la sesión, en español y en inglés.

const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const SESION_CLIENTE = {
  usuario: { id: 'cliente-local', nombre: 'Laura Gómez Pardo' },
  rol: 'CLIENTE',
  clienteId: CLIENTE_ID,
  documentoEnmascarado: 'CC ••••5678',
};
const FINALIDAD =
  'Para calcular tu perfil de riesgo y el precio personalizado de tu seguro de vida hipotecario';
const VIGENTE = {
  consentimientoId: '7c6e5d4b-3a2f-4e1d-9c8b-0a1f2e3d4c5b',
  estado: 'VIGENTE',
  alcance: ['COMPORTAMIENTO_PAGO', 'ESTABILIDAD_INGRESOS'],
  finalidad: 'PERFILAMIENTO_VIDA_HIPOTECARIO',
  destinatario: 'SOLVENTA',
  versionCatalogo: 'v1',
  versionPolitica: 'v1',
  fechaOtorga: '2026-10-09T15:02:11Z',
  fechaVencimiento: '2027-10-09T15:02:11Z',
};
const REVOCADO = {
  ...VIGENTE,
  consentimientoId: '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b',
  estado: 'REVOCADO',
  fechaOtorga: '2026-03-02T14:00:00Z',
  fechaVencimiento: '2027-03-02T14:00:00Z',
  fechaRevoca: '2026-06-15T16:30:00Z',
};
const VENCIDO = {
  ...VIGENTE,
  consentimientoId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  estado: 'VENCIDO',
  fechaOtorga: '2025-01-20T13:00:00Z',
  fechaVencimiento: '2026-01-20T13:00:00Z',
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};

async function responder(route: Route, status: number, json?: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
  } else {
    await route.fulfill({ status, headers: CORS, json });
  }
}

/** Simula el BFF web con los consentimientos del cliente. Devuelve cuántas consultas recibió. */
async function simularBff(page: Page, consentimientos: object[]): Promise<{ consultas: number }> {
  const contador = { consultas: 0 };
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESION_CLIENTE },
    }),
  );
  await page.route(`**/v1/clientes/${CLIENTE_ID}/consentimientos`, (route) => {
    if (route.request().method() === 'GET') {
      contador.consultas += 1;
    }
    return responder(route, 200, { clienteId: CLIENTE_ID, consentimientos });
  });
  return contador;
}

test('CA1: el cliente abre «Mis autorizaciones» desde el menú y ve sus vigentes', async ({
  page,
}) => {
  const bff = await simularBff(page, [VIGENTE]);

  await page.goto('/cliente');
  await page
    .getByRole('navigation', { name: 'Menú principal' })
    .getByRole('link', { name: 'Mis autorizaciones' })
    .click();

  await expect(page).toHaveURL('/cliente/autorizaciones');
  await expect(page).toHaveTitle('Mis autorizaciones · Solventa');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis autorizaciones' })).toBeVisible();
  const tarjeta = page
    .getByRole('region', { name: 'Vigentes' })
    .getByRole('article', { name: FINALIDAD });
  await expect(tarjeta.getByText('Vigente')).toBeVisible();
  await expect(tarjeta.getByText('Solventa', { exact: true })).toBeVisible();
  await expect(tarjeta.getByText('09/10/2026')).toBeVisible();
  await expect(tarjeta.getByText('09/10/2027')).toBeVisible();
  await expect(tarjeta.getByRole('listitem')).toHaveText([
    'Comportamiento de pago y endeudamiento',
    'Estabilidad de ingresos',
  ]);
  expect(bff.consultas).toBe(1);
});

test('CA2: los revocados y los vencidos se muestran aparte de los vigentes', async ({ page }) => {
  await simularBff(page, [VIGENTE, REVOCADO, VENCIDO]);

  await page.goto('/cliente/autorizaciones');

  await expect(page.getByRole('region', { name: 'Vigentes' }).getByRole('article')).toHaveCount(1);
  const historial = page.getByRole('region', { name: 'Revocadas y vencidas' });
  const tarjetas = historial.getByRole('article');
  await expect(tarjetas).toHaveCount(2);
  await expect(tarjetas.nth(0).getByText('Revocada', { exact: true })).toBeVisible();
  await expect(tarjetas.nth(0).getByText('15/06/2026')).toBeVisible();
  await expect(tarjetas.nth(1).getByText('Vencida', { exact: true })).toBeVisible();
  await expect(tarjetas.nth(1).getByText('20/01/2026')).toBeVisible();
});

test('CA1 en inglés', async ({ page }) => {
  await simularBff(page, [VIGENTE]);
  await preferirIngles(page);

  await page.goto('/cliente/autorizaciones');

  await expect(page).toHaveTitle('My authorizations · Solventa');
  const vigentes = page.getByRole('region', { name: 'Active' });
  await expect(vigentes.getByText('Oct 9, 2026')).toBeVisible();
  await expect(vigentes.getByText('Oct 9, 2027')).toBeVisible();
});
