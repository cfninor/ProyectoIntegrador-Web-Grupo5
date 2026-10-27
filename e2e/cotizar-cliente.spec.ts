import { expect, Page, Route, test } from '@playwright/test';

// Cotización del cliente en el Portal Clientes (SOLVENTAG5-132, parte 7), con el BFF simulado
// por page.route: datos y clienteId de la sesión (CA4), caja de autorización (D17) y cotización,
// en español y en inglés.

const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const SESION_CLIENTE = {
  usuario: { id: 'cliente-local', nombre: 'Laura Gómez Pardo' },
  rol: 'CLIENTE',
  clienteId: CLIENTE_ID,
  documentoEnmascarado: 'CC ••••5678',
};
const DATOS_BIEN = {
  montoCredito: 280000000,
  plazoAnios: 15,
  ciudadInmueble: 'Bogotá D.C.',
  entidadAcreedora: 'Banco de Ejemplo',
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

/** Simula el BFF web: el estado de la autorización y la cotización. Devuelve los cuerpos enviados. */
async function simularBff(
  page: Page,
  autorizacion: { estado: string; fechaEstado?: string },
): Promise<unknown[]> {
  const cotizaciones: unknown[] = [];
  const sinPerfil = autorizacion.estado !== 'AUTORIZADA';
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESION_CLIENTE },
    }),
  );
  await page.route(`**/v1/clientes/${CLIENTE_ID}/autorizacion-datos`, (route) =>
    responder(route, 200, { clienteId: CLIENTE_ID, ...autorizacion }),
  );
  await page.route('**/v1/cotizaciones', (route) => {
    if (route.request().method() === 'POST') {
      cotizaciones.push(route.request().postDataJSON());
    }
    return responder(route, 201, {
      cotizacionId: '5d2c8b1a-4e3f-4a6b-9c7d-8e1f2a3b4c5d',
      ramo: 'VIDA_HIPOTECARIO',
      datosBien: DATOS_BIEN,
      clienteId: CLIENTE_ID,
      prima: 148500,
      moneda: 'COP',
      periodicidad: 'MENSUAL',
      fechaCotizacion: '2026-10-14T15:00:00Z',
      vigenteHasta: '2026-10-21T15:00:00Z',
      estado: 'VIGENTE',
      calculadaSinPerfil: sinPerfil,
      ...(sinPerfil ? { motivoSinPerfil: 'SIN_CONSENTIMIENTO' } : {}),
    });
  });
  return cotizaciones;
}

async function llenarCredito(page: Page, etiquetas: string[]): Promise<void> {
  const valores = ['280000000', '15', 'Bogotá D.C.', 'Banco de Ejemplo'];
  for (const [i, etiqueta] of etiquetas.entries()) {
    await page.getByLabel(etiqueta).fill(valores[i]);
  }
}

const CAMPOS_ES = [
  'Monto del crédito (COP)',
  'Plazo (años)',
  'Ciudad del inmueble',
  'Entidad acreedora',
];
const CAMPOS_EN = ['Loan amount (COP)', 'Term (years)', 'Property city', 'Lender'];

test('el cliente entra desde su tablero y cotiza con sus datos de la sesión', async ({ page }) => {
  const cotizaciones = await simularBff(page, {
    estado: 'AUTORIZADA',
    fechaEstado: '2026-10-09T15:02:11Z',
  });

  await page.goto('/cliente');
  await page.getByRole('link', { name: 'Nueva cotización' }).click();

  await expect(page).toHaveURL('/cliente/cotizar');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Cotizar seguro de vida hipotecario' }),
  ).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu.getByRole('link')).toHaveText(['Tablero', 'Cotizar', 'Mis autorizaciones']);
  await expect(menu.getByRole('link', { name: 'Cotizar' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Laura Gómez Pardo');
  await expect(page.getByLabel('Documento de identidad')).toHaveValue('CC ••••5678');
  await expect(page.getByLabel('Documento de identidad')).not.toBeEditable();
  await expect(
    page.getByText(
      'Tu autorización para consultar tus datos de Open Finance y Open Data está vigente desde el 09/10/2026.',
    ),
  ).toBeVisible();

  await llenarCredito(page, CAMPOS_ES);
  await page.getByRole('button', { name: 'Calcular cotización' }).click();

  const panel = page.getByRole('region', { name: 'Prima estimada' });
  await expect(panel.getByText('$ 148.500')).toBeVisible();
  expect(cotizaciones).toEqual([
    { ramo: 'VIDA_HIPOTECARIO', datosBien: DATOS_BIEN, clienteId: CLIENTE_ID },
  ]);
});

test('sin autorización vigente el cliente igual cotiza, sin su perfil', async ({ page }) => {
  await simularBff(page, { estado: 'REVOCADA', fechaEstado: '2026-10-10T15:00:00Z' });

  await page.goto('/cliente/cotizar');
  await expect(
    page.getByText(
      'No tienes una autorización vigente: calcularemos la prima sin tu perfil de riesgo.',
    ),
  ).toBeVisible();
  await llenarCredito(page, CAMPOS_ES);
  await page.getByRole('button', { name: 'Calcular cotización' }).click();

  await expect(
    page.getByText('Calculada sin tu perfil de riesgo porque no tienes una autorización vigente.'),
  ).toBeVisible();
});

test('el cliente no abre el cotizador del asesor', async ({ page }) => {
  await simularBff(page, { estado: 'AUTORIZADA' });

  await page.goto('/asesor/cotizar');

  await expect(page).toHaveURL('/cliente');
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('el cliente cotiza en inglés, con montos y fechas de Estados Unidos', async ({ page }) => {
    await simularBff(page, { estado: 'AUTORIZADA', fechaEstado: '2026-10-09T15:02:11Z' });

    await page.goto('/cliente');
    await page.getByRole('link', { name: 'New quote' }).click();

    await expect(page).toHaveTitle('Mortgage life insurance quote · Solventa');
    await expect(page.getByLabel('Full name')).toHaveValue('Laura Gómez Pardo');
    await expect(
      page.getByText(
        'Your authorization to access your Open Finance and Open Data information has been active since Oct 9, 2026.',
      ),
    ).toBeVisible();

    await llenarCredito(page, CAMPOS_EN);
    await page.getByRole('button', { name: 'Calculate quote' }).click();

    const panel = page.getByRole('region', { name: 'Estimated premium' });
    await expect(panel.getByText('$148,500')).toBeVisible();
    await expect(panel.getByText('Offer valid until Oct 21, 2026')).toBeVisible();
  });

  test('sin autorización vigente, en inglés', async ({ page }) => {
    await simularBff(page, { estado: 'SIN_SOLICITAR' });

    await page.goto('/cliente/cotizar');

    await expect(
      page.getByText(
        "You don't have an active authorization: we'll calculate the premium without your risk profile.",
      ),
    ).toBeVisible();
    await llenarCredito(page, CAMPOS_EN);
    await expect(page.getByRole('button', { name: 'Calculate quote' })).toBeEnabled();
  });
});
