import { expect, Page, Route, test } from '@playwright/test';

// Oferta personalizada (SOLVENTAG5-49) del asesor y del cliente, con el BFF simulado por
// page.route: ver la oferta desde la cotización con el precio explicado y la cobertura (CA1),
// continuar a la suscripción o descartar sin guardar nada (CA2), recotizar la oferta vencida
// (CA3), en español y en inglés.

const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const COTIZACION_ID = '5d2c8b1a-4e3f-4a6b-9c7d-8e1f2a3b4c5d';
const RUTA_OFERTA = (actor: string) => `/${actor}/cotizar/oferta/${COTIZACION_ID}`;
const SESION_ASESOR = { usuario: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' }, rol: 'ASESOR' };
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
const PERFIL = {
  perfilId: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  version: 1,
  score: 720,
  nivel: 'BAJO',
  senales: { comportamientoPago: 88, estabilidadIngresos: 76, ubicacion: 70, endeudamiento: 55 },
  calculadoEn: '2026-10-14T15:00:00Z',
  vigenteHasta: '2026-10-15T15:00:00Z',
};
const COTIZACION = {
  cotizacionId: COTIZACION_ID,
  ramo: 'VIDA_HIPOTECARIO',
  datosBien: DATOS_BIEN,
  clienteId: CLIENTE_ID,
  prima: 148500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  fechaCotizacion: '2026-10-14T15:00:00Z',
  vigenteHasta: '2026-10-21T15:00:00Z',
  estado: 'VIGENTE',
  calculadaSinPerfil: false,
  perfil: PERFIL,
};
const VENCIDA = { ...COTIZACION, estado: 'VENCIDA' };
const SIN_PERFIL = {
  ...COTIZACION,
  prima: 170000,
  calculadaSinPerfil: true,
  motivoSinPerfil: 'SIN_CONSENTIMIENTO',
  perfil: undefined,
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};

interface Bff {
  /** Cotización que devuelve la consulta de la oferta; null responde 404. */
  oferta: object | null;
  peticiones: { metodo: string; ruta: string; cuerpo?: unknown }[];
}

async function responder(route: Route, status: number, json?: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
  } else {
    await route.fulfill({ status, headers: CORS, json });
  }
}

/** Simula el BFF web del actor y anota cada petición que recibe. */
async function simularBff(
  page: Page,
  actor: 'asesor' | 'cliente',
  oferta: object | null = COTIZACION,
): Promise<Bff> {
  const bff: Bff = { oferta, peticiones: [] };
  const anotar = (route: Route) => {
    const peticion = route.request();
    if (peticion.method() !== 'OPTIONS') {
      bff.peticiones.push({
        metodo: peticion.method(),
        ruta: new URL(peticion.url()).pathname,
        ...(peticion.method() === 'POST' ? { cuerpo: peticion.postDataJSON() } : {}),
      });
    }
  };
  const sesion = actor === 'asesor' ? SESION_ASESOR : SESION_CLIENTE;
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: sesion } }),
  );
  await page.route('**/v1/clientes/busqueda', (route) => {
    anotar(route);
    return responder(route, 200, {
      clienteId: CLIENTE_ID,
      nombres: 'Laura',
      apellidos: 'Gómez Pardo',
      documentoEnmascarado: 'CC ••••5678',
    });
  });
  await page.route(`**/v1/clientes/${CLIENTE_ID}/autorizacion-datos`, (route) =>
    responder(route, 200, {
      clienteId: CLIENTE_ID,
      estado: 'AUTORIZADA',
      fechaEstado: '2026-10-09T15:02:11Z',
    }),
  );
  await page.route('**/v1/cotizaciones', (route) => {
    anotar(route);
    return responder(route, 201, COTIZACION);
  });
  await page.route('**/v1/cotizaciones/*', (route) => {
    anotar(route);
    return bff.oferta
      ? responder(route, 200, bff.oferta)
      : responder(route, 404, { codigo: 'COTIZACION_NO_ENCONTRADA', detalle: 'x' });
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

test('el cliente cotiza, ve la oferta con el precio explicado y continúa a la suscripción', async ({
  page,
}) => {
  const bff = await simularBff(page, 'cliente');

  await page.goto('/cliente/cotizar');
  await llenarCredito(page, CAMPOS_ES);
  await page.getByRole('button', { name: 'Calcular cotización' }).click();
  await page.getByRole('button', { name: 'Ver la oferta' }).click();

  // CA1: la prima, el score y las señales del perfil, y el resumen de la cobertura.
  await expect(page).toHaveURL(RUTA_OFERTA('cliente'));
  await expect(page).toHaveTitle('Oferta personalizada · Solventa');
  await expect(page.getByRole('heading', { level: 1, name: 'Oferta personalizada' })).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu.getByRole('link', { name: 'Cotizar' })).toHaveAttribute('aria-current', 'page');

  const prima = page.getByRole('region', { name: 'Prima mensual' });
  await expect(prima.getByText('$ 148.500')).toBeVisible();
  await expect(prima.getByRole('img', { name: 'Score 720 de 850' })).toBeVisible();
  await expect(prima.getByText('Riesgo bajo')).toBeVisible();
  await expect(prima.getByText('Oferta válida hasta el 21/10/2026')).toBeVisible();

  const perfil = page.getByRole('region', { name: 'Por qué recibiste este precio' });
  await expect(perfil.getByText('Perfil vigente · 14/10/2026 10:00')).toBeVisible();
  await expect(perfil.getByRole('listitem')).toHaveText([
    /Comportamiento de pago\s*Muy bueno/,
    /Estabilidad de ingresos\s*Alta/,
    /Ubicación del inmueble\s*Riesgo bajo/,
    /Endeudamiento actual\s*Medio/,
  ]);

  const cobertura = page.getByRole('region', { name: 'Resumen de la cobertura' });
  await expect(cobertura.getByRole('definition')).toHaveText([
    'Vida hipotecario',
    'Saldo del crédito',
    '$ 280.000.000',
    'Mensual',
    '15 años',
    'Banco de Ejemplo',
  ]);

  // CA2: continuar lleva al paso 2, Suscripción, sin enviar nada más al BFF.
  await cobertura.getByRole('button', { name: 'Continuar a la contratación' }).click();

  await expect(page).toHaveURL(`${RUTA_OFERTA('cliente')}/suscripcion`);
  await expect(page).toHaveTitle('Suscripción · Solventa');
  await expect(page.getByRole('heading', { name: 'La suscripción llega pronto' })).toBeVisible();
  expect(bff.peticiones.map(({ metodo, ruta }) => `${metodo} ${ruta}`)).toEqual([
    'POST /v1/cotizaciones',
    `GET /v1/cotizaciones/${COTIZACION_ID}`,
  ]);

  await page.getByRole('link', { name: 'Volver a la oferta' }).click();
  await expect(page).toHaveURL(RUTA_OFERTA('cliente'));
});

test('el asesor ve la oferta del cliente y la envía a suscripción', async ({ page }) => {
  await simularBff(page, 'asesor');

  await page.goto('/asesor/cotizar');
  await page.getByLabel('Documento de identidad').fill('1020305678');
  await page.getByLabel('Documento de identidad').press('Tab');
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Laura Gómez Pardo');
  await llenarCredito(page, CAMPOS_ES);
  await page.getByRole('button', { name: 'Calcular cotización' }).click();
  await page.getByRole('button', { name: 'Ver la oferta' }).click();

  await expect(page).toHaveURL(RUTA_OFERTA('asesor'));
  await expect(
    page.getByRole('region', { name: 'Por qué el cliente recibió este precio' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'El cliente acepta · enviar a suscripción' }).click();

  await expect(page).toHaveURL(`${RUTA_OFERTA('asesor')}/suscripcion`);
  await expect(page.getByText('El cliente aceptó la oferta.')).toBeVisible();
});

test('descartar la oferta vuelve al tablero sin guardar nada (CA2)', async ({ page }) => {
  const bff = await simularBff(page, 'asesor');

  await page.goto(RUTA_OFERTA('asesor'));
  await page.getByRole('button', { name: 'Descartar oferta' }).click();

  await expect(page).toHaveURL('/asesor');
  await expect(page.getByRole('heading', { level: 1, name: 'Tablero' })).toBeVisible();
  expect(bff.peticiones).toEqual([{ metodo: 'GET', ruta: `/v1/cotizaciones/${COTIZACION_ID}` }]);
});

test('ajustar datos vuelve al cotizador del asesor con el cliente y el crédito llenos', async ({
  page,
}) => {
  const bff = await simularBff(page, 'asesor');

  await page.goto('/asesor/cotizar');
  await page.getByLabel('Documento de identidad').fill('1020305678');
  await page.getByLabel('Documento de identidad').press('Tab');
  await llenarCredito(page, CAMPOS_ES);
  await page.getByRole('button', { name: 'Calcular cotización' }).click();
  await page.getByRole('button', { name: 'Ver la oferta' }).click();
  await page.getByRole('button', { name: 'Ajustar datos' }).click();

  await expect(page).toHaveURL('/asesor/cotizar');
  await expect(page.getByLabel('Documento de identidad')).toHaveValue('1020305678');
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Laura Gómez Pardo');
  await expect(page.getByLabel('Monto del crédito (COP)')).toHaveValue('280.000.000');
  await expect(page.getByLabel('Plazo (años)')).toHaveValue('15');
  await expect(page.getByLabel('Ciudad del inmueble')).toHaveValue('Bogotá D.C.');
  await expect(page.getByLabel('Entidad acreedora')).toHaveValue('Banco de Ejemplo');
  // Volvió a buscar al cliente con el mismo documento.
  expect(bff.peticiones.filter((p) => p.ruta === '/v1/clientes/busqueda')).toHaveLength(2);
});

test('la oferta vencida no se puede continuar y se recotiza con los mismos datos (CA3)', async ({
  page,
}) => {
  const bff = await simularBff(page, 'cliente', VENCIDA);

  await page.goto(RUTA_OFERTA('cliente'));

  await expect(page.getByRole('alert')).toHaveText(
    'Esta oferta venció el 21/10/2026. Recotiza para obtener una prima vigente.',
  );
  await expect(page.getByText('Oferta vencida el 21/10/2026')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar a la contratación' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Descartar oferta' })).toBeVisible();

  await page.getByRole('button', { name: 'Recotizar' }).click();

  await expect(page).toHaveURL('/cliente/cotizar');
  await expect(page.getByLabel('Monto del crédito (COP)')).toHaveValue('280.000.000');
  await page.getByRole('button', { name: 'Calcular cotización' }).click();

  await expect(
    page.getByRole('region', { name: 'Prima estimada' }).getByText('$ 148.500'),
  ).toBeVisible();
  expect(bff.peticiones.at(-1)).toEqual({
    metodo: 'POST',
    ruta: '/v1/cotizaciones',
    cuerpo: { ramo: 'VIDA_HIPOTECARIO', datosBien: DATOS_BIEN, clienteId: CLIENTE_ID },
  });
});

test('sin perfil de riesgo, la oferta explica que usa el valor por defecto', async ({ page }) => {
  await simularBff(page, 'cliente', SIN_PERFIL);

  await page.goto(RUTA_OFERTA('cliente'));

  const perfil = page.getByRole('region', { name: 'Por qué recibiste este precio' });
  await expect(perfil.getByText('Sin perfil de riesgo')).toBeVisible();
  await expect(
    perfil.getByText(
      'Calculada sin tu perfil de riesgo porque no tienes una autorización vigente.',
    ),
  ).toBeVisible();
  await expect(
    perfil.getByText(
      'La prima usa el valor por defecto del seguro, sin descuentos ni recargos por perfil.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Prima mensual' }).getByRole('img')).toHaveCount(0);
});

test('si la oferta no existe lo indica y permite volver a cotizar', async ({ page }) => {
  await simularBff(page, 'cliente', null);

  await page.goto(RUTA_OFERTA('cliente'));

  await expect(page.getByText('No encontramos esta oferta.')).toBeVisible();
  await page.getByRole('link', { name: 'Volver a cotizar' }).click();
  await expect(page).toHaveURL('/cliente/cotizar');
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('el cliente ve la oferta en inglés y continúa a la suscripción', async ({ page }) => {
    await simularBff(page, 'cliente');

    await page.goto('/cliente/cotizar');
    await llenarCredito(page, CAMPOS_EN);
    await page.getByRole('button', { name: 'Calculate quote' }).click();
    await page.getByRole('button', { name: 'View the offer' }).click();

    await expect(page).toHaveTitle('Personalized offer · Solventa');
    const prima = page.getByRole('region', { name: 'Monthly premium' });
    await expect(prima.getByText('$148,500')).toBeVisible();
    await expect(prima.getByRole('img', { name: 'Score 720 out of 850' })).toBeVisible();
    await expect(prima.getByText('Offer valid until Oct 21, 2026')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Why you got this price' }).getByRole('listitem').first(),
    ).toHaveText(/Payment behavior\s*Very good/);
    await expect(
      page.getByRole('region', { name: 'Coverage summary' }).getByRole('definition'),
    ).toHaveText([
      'Mortgage life',
      'Loan balance',
      '$280,000,000',
      'Monthly',
      '15 years',
      'Banco de Ejemplo',
    ]);

    await page.getByRole('button', { name: 'Continue with the purchase' }).click();

    await expect(page).toHaveTitle('Underwriting · Solventa');
    await expect(page.getByRole('heading', { name: 'Underwriting is coming soon' })).toBeVisible();
  });

  test('la oferta vencida, en inglés', async ({ page }) => {
    await simularBff(page, 'cliente', VENCIDA);

    await page.goto(RUTA_OFERTA('cliente'));

    await expect(page.getByRole('alert')).toHaveText(
      'This offer expired on Oct 21, 2026. Get a new quote for a current premium.',
    );
    await page.getByRole('button', { name: 'Get a new quote' }).click();
    await expect(page).toHaveURL('/cliente/cotizar');
    await expect(page.getByLabel('Loan amount (COP)')).toHaveValue('280,000,000');
  });
});
