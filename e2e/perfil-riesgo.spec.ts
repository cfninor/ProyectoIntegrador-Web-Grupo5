import { expect, Page, Route, test } from '@playwright/test';

const SOLICITUD_ID = '8e3b1f6a-2c4d-4e5f-9a7b-1c2d3e4f5a6b';
const SESION_ANALISTA = {
  usuario: { id: 'analista-004', nombre: 'Martín Ospina' },
  rol: 'ANALISTA_RIESGO',
};
const CON_PERFIL = {
  solicitudId: SOLICITUD_ID,
  cotizacionId: '5d2c8b1a-4e3f-4a6b-9c7d-8e1f2a3b4c5d',
  origen: 'PERFIL',
  perfil: {
    perfilId: '2a4b6c8d-1e3f-4a5b-8c7d-9e0f1a2b3c4d',
    version: 3,
    score: 640,
    nivel: 'MEDIO',
    senales: { comportamientoPago: 72, estabilidadIngresos: 65, ubicacion: 80, endeudamiento: 31 },
    calculadoEn: '2026-10-13T14:43:00Z',
    vigenteHasta: '2026-10-14T14:43:00Z',
  },
};
const SIN_PERFIL = {
  solicitudId: SOLICITUD_ID,
  cotizacionId: '8f1e2d3c-4b5a-4c6d-9e7f-0a1b2c3d4e5f',
  origen: 'VALOR_POR_DEFECTO',
  motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET',
  'access-control-allow-headers': 'Content-Type',
};

async function simularBff(page: Page, status: number, json: object): Promise<string[]> {
  const consultas: string[] = [];
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESION_ANALISTA },
    }),
  );
  await page.route('**/v1/solicitudes-suscripcion/*/perfil-riesgo', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    consultas.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status, headers: CORS, json });
  });
  return consultas;
}

test('el analista de riesgo consulta el perfil con que se cotizó una solicitud', async ({
  page,
}) => {
  const consultas = await simularBff(page, 200, CON_PERFIL);

  await page.goto('/riesgo');
  await page.getByRole('link', { name: 'Perfil de riesgo' }).click();
  await expect(page).toHaveURL('/riesgo/perfil-riesgo');
  await page.getByLabel('Id de la solicitud de suscripción').fill(SOLICITUD_ID);
  await page.getByRole('button', { name: 'Consultar' }).click();

  await expect(page).toHaveURL(`/riesgo/perfil-riesgo/${SOLICITUD_ID}`);
  const resultado = page.getByRole('region', { name: 'Perfil con que se cotizó' });
  await expect(resultado.getByText('Perfil del cliente · versión 3')).toBeVisible();
  await expect(resultado.getByText('640 de 850')).toBeVisible();
  await expect(resultado.getByText('Riesgo medio')).toBeVisible();
  await expect(resultado.getByRole('listitem')).toHaveCount(4);
  expect(consultas).toEqual([`/v1/solicitudes-suscripcion/${SOLICITUD_ID}/perfil-riesgo`]);
});

test('sin perfil, la consulta indica el valor por defecto y su motivo', async ({ page }) => {
  await simularBff(page, 200, SIN_PERFIL);

  await page.goto(`/riesgo/perfil-riesgo/${SOLICITUD_ID}`);

  const resultado = page.getByRole('region', { name: 'Perfil con que se cotizó' });
  await expect(resultado.getByText('Valor por defecto', { exact: true })).toBeVisible();
  await expect(resultado.getByText(/no estuvo disponible a tiempo/)).toBeVisible();
});

test('una solicitud que no existe lo dice', async ({ page }) => {
  await simularBff(page, 404, { codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA', detalle: 'x' });

  await page.goto(`/riesgo/perfil-riesgo/${SOLICITUD_ID}`);

  await expect(
    page.getByText('No encontramos una solicitud de suscripción con ese id.'),
  ).toBeVisible();
});

test('en inglés, la consulta muestra el perfil traducido', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  await simularBff(page, 200, CON_PERFIL);

  await page.goto(`/riesgo/perfil-riesgo/${SOLICITUD_ID}`);

  const resultado = page.getByRole('region', { name: 'Profile used for the quote' });
  await expect(resultado.getByText('Customer profile · version 3')).toBeVisible();
  await expect(resultado.getByText('640 out of 850')).toBeVisible();
});
