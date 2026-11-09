import { expect, Page, Route, test } from '@playwright/test';

// La bandeja de suscripción asistida (SOLVENTAG5-52), con el BFF simulado por page.route y los
// ejemplos del contrato 1.4.0. Los clientes son ficticios.

const SESION_ANALISTA = {
  usuario: { id: 'analista-004', nombre: 'Martín Ospina' },
  rol: 'ANALISTA_RIESGO',
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET',
  'access-control-allow-headers': 'Content-Type',
};
const SIN_PERFIL = {
  solicitudId: '9f1b3d5e-0c2e-4f4a-9b7d-1e3f5a7b9c1d',
  cotizacionId: '0a2c4e6f-1d3f-4a5b-8c8e-2f4a6b8c0d2e',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  cliente: {
    clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
    nombres: 'María Fernanda',
    apellidos: 'López Rojas',
    documentoEnmascarado: 'CC ••••5678',
  },
  cobertura: {
    ramo: 'VIDA_HIPOTECARIO',
    datosBien: {
      montoCredito: 200000000,
      plazoAnios: 20,
      ciudadInmueble: 'Bogotá',
      entidadAcreedora: 'Banco de Ejemplo',
    },
  },
  prima: 70000,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  canal: 'web',
  aceptadaEn: '2026-10-14T16:30:00Z',
  enRevisionDesde: '2026-10-14T16:30:01.090Z',
  motivo: 'REGLA_DE_REVISION',
  reglaAplicada: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
  reglasSinResolver: [
    {
      codigo: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
      tipo: 'PERFIL_REQUERIDO',
      efecto: 'REVISAR',
      parametros: {},
      senales: {
        origen: 'VALOR_POR_DEFECTO',
        motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
        perfilConsistente: true,
      },
      resultado: 'NO_CUMPLE',
      determinante: true,
    },
  ],
  registrosVerificables: true,
};
const MONTO_ALTO = {
  ...SIN_PERFIL,
  solicitudId: '4c6e8a0b-2d4f-4e6a-9c8e-3f5a7b9c1d3e',
  cotizacionId: '7e9a1c3e-5b7d-4f9b-8d1f-6a8c0e2a4b6c',
  clienteId: '2d4f6a8c-0e2a-4c4e-9a6c-8e0a2c4e6a8c',
  cliente: {
    clienteId: '2d4f6a8c-0e2a-4c4e-9a6c-8e0a2c4e6a8c',
    nombres: 'Carlos Andrés',
    apellidos: 'Peña Ruiz',
    documentoEnmascarado: 'CC ••••5120',
  },
  cobertura: {
    ramo: 'VIDA_HIPOTECARIO',
    datosBien: { ...SIN_PERFIL.cobertura.datosBien, montoCredito: 950000000 },
  },
  prima: 231900,
  aceptadaEn: '2026-10-15T14:05:00Z',
  enRevisionDesde: '2026-10-15T14:05:01.240Z',
  reglaAplicada: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
  reglasSinResolver: [
    {
      codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      tipo: 'DATO_BIEN_MAXIMO',
      efecto: 'REVISAR',
      parametros: { campo: 'montoCredito', maximo: 800000000 },
      senales: { montoCredito: 950000000 },
      resultado: 'NO_CUMPLE',
      determinante: true,
    },
  ],
};
const BANDEJA = { solicitudes: [SIN_PERFIL, MONTO_ALTO], total: 2, pagina: 1, tamano: 20 };

async function simularBff(page: Page, respuestas: Record<string, object>): Promise<string[]> {
  const consultas: string[] = [];
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESION_ANALISTA },
    }),
  );
  await page.route('**/v1/solicitudes-suscripcion/en-revision**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const url = new URL(route.request().url());
    consultas.push(url.search);
    const pagina = url.searchParams.get('pagina') ?? '1';
    await route.fulfill({ status: 200, headers: CORS, json: respuestas[pagina] });
  });
  return consultas;
}

test('el analista ve las solicitudes en revisión con su motivo', async ({ page }) => {
  const consultas = await simularBff(page, { '1': BANDEJA });

  await page.goto('/riesgo');
  await page.getByRole('link', { name: 'Bandeja de suscripción' }).click();

  await expect(page).toHaveURL('/riesgo/bandeja');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bandeja de suscripción asistida' }),
  ).toBeVisible();
  const filas = page.getByRole('table').getByRole('row');
  await expect(filas).toHaveCount(3);
  await expect(filas.nth(1)).toContainText('María Fernanda López Rojas');
  await expect(filas.nth(2)).toContainText(
    'Suma asegurada: $ 950.000.000 (límite: Máximo $ 800.000.000)',
  );
  await expect(page.getByText('Mostrando 1–2 de 2 solicitudes')).toBeVisible();
  await expect(page.getByText(/no avanza a cobro ni a emisión/)).toBeVisible();
  expect(consultas).toEqual(['?pagina=1&tamano=20']);
});

test('«Ver perfil» abre el perfil de riesgo de la solicitud', async ({ page }) => {
  await simularBff(page, { '1': BANDEJA });
  await page.route('**/v1/solicitudes-suscripcion/*/perfil-riesgo', (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      json: {
        solicitudId: MONTO_ALTO.solicitudId,
        cotizacionId: MONTO_ALTO.cotizacionId,
        origen: 'VALOR_POR_DEFECTO',
        motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
      },
    }),
  );

  await page.goto('/riesgo/bandeja');
  await page
    .getByRole('link', { name: 'Ver el perfil de riesgo de la solicitud 4c6e8a0b' })
    .click();

  await expect(page).toHaveURL(`/riesgo/perfil-riesgo/${MONTO_ALTO.solicitudId}`);
});

test('la bandeja pasa de página con «Siguiente» y «Anterior»', async ({ page }) => {
  const consultas = await simularBff(page, {
    '1': { ...BANDEJA, total: 21 },
    '2': { solicitudes: [MONTO_ALTO], total: 21, pagina: 2, tamano: 20 },
  });

  await page.goto('/riesgo/bandeja');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  await expect(page).toHaveURL('/riesgo/bandeja?pagina=2');
  await expect(page.getByText('Mostrando 21–21 de 21 solicitudes')).toBeVisible();
  await page.getByRole('button', { name: 'Anterior' }).click();

  await expect(page).toHaveURL('/riesgo/bandeja');
  // La URL cambia antes que la consulta de la página 1: esperar la tabla evita la carrera.
  await expect(page.getByText('Mostrando 1–2 de 21 solicitudes')).toBeVisible();
  expect(consultas).toEqual(['?pagina=1&tamano=20', '?pagina=2&tamano=20', '?pagina=1&tamano=20']);
});

test('sin solicitudes en revisión, la bandeja lo dice', async ({ page }) => {
  await simularBff(page, { '1': { solicitudes: [], total: 0, pagina: 1, tamano: 20 } });

  await page.goto('/riesgo/bandeja');

  await expect(
    page.getByText('No hay solicitudes esperando la revisión de un analista.'),
  ).toBeVisible();
});

test('la bandeja en inglés', async ({ page }) => {
  await simularBff(page, { '1': BANDEJA });
  await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));

  await page.goto('/riesgo/bandeja');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Assisted underwriting inbox' }),
  ).toBeVisible();
  await expect(page.getByRole('table').getByRole('row').nth(2)).toContainText('$950,000,000');
  await expect(page.getByText('Showing 1–2 of 2 applications')).toBeVisible();
});
