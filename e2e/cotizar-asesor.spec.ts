import { expect, Page, Route, test } from '@playwright/test';

// SOLV-WEB-05 «Cotizar seguro de vida hipotecario» del asesor (SOLVENTAG5-132, parte 6), con el
// BFF simulado por page.route: búsqueda de cliente (D2, D15), estado y solicitud de la
// autorización (D4, D17) y cotización (CA1 a CA5), en español y en inglés.

const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const SESION_ASESOR = { usuario: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' }, rol: 'ASESOR' };
const ENCONTRADO = {
  clienteId: CLIENTE_ID,
  nombres: 'Laura',
  apellidos: 'Gómez Pardo',
  documentoEnmascarado: 'CC ••••5678',
};
const COTIZACION = {
  cotizacionId: '5d2c8b1a-4e3f-4a6b-9c7d-8e1f2a3b4c5d',
  ramo: 'VIDA_HIPOTECARIO',
  datosBien: {
    montoCredito: 280000000,
    plazoAnios: 15,
    ciudadInmueble: 'Bogotá D.C.',
    entidadAcreedora: 'Banco de Ejemplo',
  },
  clienteId: CLIENTE_ID,
  prima: 148500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  fechaCotizacion: '2026-10-14T15:00:00Z',
  vigenteHasta: '2026-10-21T15:00:00Z',
  estado: 'VIGENTE',
  calculadaSinPerfil: false,
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};

interface Bff {
  /** Estado de la autorización que responde la consulta; se puede cambiar durante la prueba. */
  estado: { estado: string; fechaEstado?: string };
  /** Código con que responde la próxima cotización (después, 201). */
  codigoCotizar: number;
  peticiones: { ruta: string; cuerpo: unknown }[];
}

async function responder(route: Route, status: number, json?: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
  } else {
    await route.fulfill({ status, headers: CORS, json });
  }
}

/** Simula el BFF web y guarda los cuerpos que recibe. */
async function simularBff(page: Page, estado: Bff['estado']): Promise<Bff> {
  const bff: Bff = { estado, codigoCotizar: 201, peticiones: [] };
  const anotar = (route: Route) => {
    if (route.request().method() === 'POST') {
      bff.peticiones.push({
        ruta: new URL(route.request().url()).pathname,
        cuerpo: route.request().postDataJSON(),
      });
    }
  };
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESION_ASESOR } }),
  );
  await page.route('**/v1/clientes/busqueda', (route) => {
    anotar(route);
    const { numeroDocumento } = (route.request().postDataJSON() ?? {}) as {
      numeroDocumento?: string;
    };
    return numeroDocumento === '99999999'
      ? responder(route, 404, { codigo: 'CLIENTE_NO_ENCONTRADO', detalle: 'x' })
      : responder(route, 200, ENCONTRADO);
  });
  await page.route(`**/v1/clientes/${CLIENTE_ID}/autorizacion-datos`, (route) =>
    responder(route, 200, { clienteId: CLIENTE_ID, ...bff.estado }),
  );
  await page.route(`**/v1/clientes/${CLIENTE_ID}/solicitudes-autorizacion`, (route) => {
    anotar(route);
    bff.estado = { estado: 'ESPERANDO_CLIENTE', fechaEstado: '2026-10-14T15:00:00Z' };
    return responder(route, 201, {
      solicitudId: '3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f',
      estado: 'PENDIENTE',
      fechaSolicitud: '2026-10-14T15:00:00Z',
      envios: 1,
      reenviada: false,
      enlace: 'http://localhost:4200/autorizar/3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f',
    });
  });
  await page.route('**/v1/cotizaciones', (route) => {
    anotar(route);
    const codigo = bff.codigoCotizar;
    bff.codigoCotizar = 201;
    return codigo === 201
      ? responder(route, 201, COTIZACION)
      : responder(route, codigo, { codigo: 'NUCLEO_NO_DISPONIBLE', detalle: 'x' });
  });
  return bff;
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

test('el asesor entra desde el tablero, busca al cliente autorizado y cotiza', async ({ page }) => {
  const bff = await simularBff(page, { estado: 'AUTORIZADA', fechaEstado: '2026-10-09T15:02:11Z' });

  await page.goto('/asesor');
  await page.getByRole('link', { name: 'Nueva cotización' }).click();

  await expect(page).toHaveURL('/asesor/cotizar');
  await expect(page).toHaveTitle('Cotizar seguro de vida hipotecario · Solventa');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Cotizar seguro de vida hipotecario' }),
  ).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu.getByRole('link', { name: 'Cotizar' })).toHaveAttribute('aria-current', 'page');

  await page.getByLabel('Documento de identidad').fill('1020305678');
  await page.getByLabel('Documento de identidad').press('Tab');
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Laura Gómez Pardo');
  await expect(
    page.getByText(
      'El cliente autorizó la consulta de sus datos de Open Finance y Open Data el 09/10/2026 a las 10:02.',
    ),
  ).toBeVisible();

  await llenarCredito(page, CAMPOS_ES);
  await page.getByRole('button', { name: 'Calcular cotización' }).click();

  const panel = page.getByRole('region', { name: 'Prima estimada' });
  await expect(panel.getByText('$ 148.500')).toBeVisible();
  await expect(panel.getByText('Oferta válida hasta el 21/10/2026')).toBeVisible();
  expect(bff.peticiones).toEqual([
    {
      ruta: '/v1/clientes/busqueda',
      cuerpo: { tipoDocumento: 'CC', numeroDocumento: '1020305678' },
    },
    {
      ruta: '/v1/cotizaciones',
      cuerpo: { ramo: 'VIDA_HIPOTECARIO', datosBien: COTIZACION.datosBien, clienteId: CLIENTE_ID },
    },
  ]);
});

test('sin autorización no se calcula; el asesor la pide con sus datos de la sesión', async ({
  page,
}) => {
  const bff = await simularBff(page, { estado: 'SIN_SOLICITAR' });

  await page.goto('/asesor/cotizar');
  await page.getByLabel('Documento de identidad').fill('1020305678');
  await page.getByLabel('Documento de identidad').press('Enter');
  await llenarCredito(page, CAMPOS_ES);

  await expect(page.getByRole('button', { name: 'Calcular cotización' })).toBeDisabled();
  await expect(
    page.getByText('Para calcular, el cliente debe autorizar la consulta de sus datos.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Pedir autorización' }).click();

  await expect(
    page.getByText('Le enviamos al cliente la solicitud de autorización.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reenviar solicitud' })).toBeVisible();
  expect(bff.peticiones.at(-1)).toEqual({
    ruta: `/v1/clientes/${CLIENTE_ID}/solicitudes-autorizacion`,
    cuerpo: { asesor: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' } },
  });
});

test('si el cliente no existe lo indica bajo el documento', async ({ page }) => {
  await simularBff(page, { estado: 'AUTORIZADA' });

  await page.goto('/asesor/cotizar');
  await page.getByLabel('Documento de identidad').fill('99999999');
  await page.getByLabel('Documento de identidad').press('Tab');

  await expect(page.getByText('No encontramos un cliente con ese documento.')).toBeVisible();
  await expect(page.getByLabel('Nombre completo')).toHaveValue('');
});

test('si el servicio de cotización falla, conserva los datos y permite reintentar (CA5)', async ({
  page,
}) => {
  const bff = await simularBff(page, { estado: 'AUTORIZADA' });
  bff.codigoCotizar = 503;

  await page.goto('/asesor/cotizar');
  await page.getByLabel('Documento de identidad').fill('1020305678');
  await page.getByLabel('Documento de identidad').press('Tab');
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Laura Gómez Pardo');
  await llenarCredito(page, CAMPOS_ES);
  await page.getByRole('button', { name: 'Calcular cotización' }).click();

  await expect(page.getByRole('alert')).toContainText('No pudimos calcular la cotización.');
  await expect(page.getByLabel('Monto del crédito (COP)')).toHaveValue('280.000.000');
  await expect(page.getByLabel('Entidad acreedora')).toHaveValue('Banco de Ejemplo');

  await page.getByRole('button', { name: 'Reintentar' }).click();

  await expect(page.getByRole('region', { name: 'Prima estimada' })).toContainText('$ 148.500');
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('el asesor cotiza en inglés, con montos y fechas de Estados Unidos', async ({ page }) => {
    await simularBff(page, { estado: 'AUTORIZADA', fechaEstado: '2026-10-09T15:02:11Z' });

    await page.goto('/asesor');
    await page.getByRole('link', { name: 'New quote' }).click();

    await expect(page).toHaveTitle('Mortgage life insurance quote · Solventa');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mortgage life insurance quote' }),
    ).toBeVisible();
    await page.getByLabel('ID document').fill('1020305678');
    await page.getByLabel('ID document').press('Tab');
    await expect(
      page.getByText(
        'The customer authorized access to their Open Finance and Open Data information on Oct 9, 2026 at 10:02 AM.',
      ),
    ).toBeVisible();

    await llenarCredito(page, CAMPOS_EN);
    await page.getByRole('button', { name: 'Calculate quote' }).click();

    const panel = page.getByRole('region', { name: 'Estimated premium' });
    await expect(panel.getByText('$148,500')).toBeVisible();
    await expect(panel.getByText('15 years')).toBeVisible();
    await expect(panel.getByText('Offer valid until Oct 21, 2026')).toBeVisible();
  });

  test('pedir la autorización en inglés', async ({ page }) => {
    await simularBff(page, { estado: 'VENCIDA', fechaEstado: '2026-10-01T15:00:00Z' });

    await page.goto('/asesor/cotizar');
    await page.getByLabel('ID document').fill('1020305678');
    await page.getByLabel('ID document').press('Tab');
    await expect(page.getByText("The customer's authorization expired.")).toBeVisible();

    await page.getByRole('button', { name: 'Request authorization' }).click();

    await expect(
      page.getByText('We sent the authorization request to the customer.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend request' })).toBeVisible();
  });
});
