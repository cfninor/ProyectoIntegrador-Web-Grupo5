import { expect, Page, Route, test } from '@playwright/test';

// SOLV-WEB-20 «Autorizar consulta de datos» (SOLVENTAG5-65) con el BFF simulado por page.route.

const SOLICITUD_ID = '3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f';

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
        datos: [
          { codigo: 'COMPORTAMIENTO_PAGO', entidades: ['ENTIDADES_FINANZAS_ABIERTAS'] },
          { codigo: 'ESTABILIDAD_INGRESOS', entidades: ['ENTIDADES_FINANZAS_ABIERTAS'] },
        ],
      },
      {
        fuente: 'OPEN_DATA',
        datos: [
          { codigo: 'SOCIODEMOGRAFICA_TERRITORIAL', entidades: ['DANE'] },
          { codigo: 'SALUD_ACTUARIAL_AGREGADA', entidades: ['MINSALUD'] },
          { codigo: 'INMUEBLE_UBICACION', entidades: ['IGAC'] },
        ],
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

// El portal (localhost:4200) y el BFF (localhost:8010) son orígenes distintos: el BFF simulado
// responde también la verificación previa de CORS.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};

async function responder(route: Route, cuerpo: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
  } else {
    await route.fulfill({ status: 200, headers: CORS, json: cuerpo });
  }
}

/** Simula el BFF: la consulta de la solicitud y, si se indica, la respuesta a la decisión. */
async function simularBff(
  page: Page,
  solicitud: object,
  resultadoDecision?: object,
): Promise<unknown[]> {
  const decisiones: unknown[] = [];
  await page.route(`**/v1/solicitudes-autorizacion/${SOLICITUD_ID}`, (route) =>
    responder(route, solicitud),
  );
  await page.route(`**/v1/solicitudes-autorizacion/${SOLICITUD_ID}/decision`, (route) => {
    if (route.request().method() === 'POST') {
      decisiones.push(route.request().postDataJSON());
    }
    return responder(route, resultadoDecision);
  });
  return decisiones;
}

test('el cliente autoriza la consulta de sus datos', async ({ page }) => {
  const decisiones = await simularBff(page, PENDIENTE, {
    solicitudId: SOLICITUD_ID,
    estado: 'AUTORIZADA',
  });

  await page.goto(`/autorizar/${SOLICITUD_ID}`);

  await expect(
    page.getByRole('heading', { level: 1, name: 'Autorizar la consulta de tus datos' }),
  ).toBeVisible();
  await expect(
    page.getByText('Solicitud enviada por Laura Gómez, de Solventa, el 09/10/2026 a las 09:30'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open Finance' })).toBeVisible();
  await expect(page.getByText('La autorización dura 12 meses')).toBeVisible();

  const autorizar = page.getByRole('button', { name: 'Autorizar', exact: true });
  await expect(autorizar).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Autorizo a Solventa a consultar mis datos/ }).check();
  await autorizar.click();

  const titulo = page.getByRole('heading', { name: 'Autorizaste la consulta de tus datos' });
  await expect(titulo).toBeFocused();
  await expect(page.getByRole('status').getByText('Autorizada', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Tu asesor ya puede ver tu autorización y continuar con tu cotización'),
  ).toBeVisible();
  expect(decisiones).toEqual([
    { decision: 'AUTORIZAR', aceptaPolitica: true, versionPolitica: 'v1' },
  ]);
});

test('el cliente no autoriza la consulta de sus datos', async ({ page }) => {
  const decisiones = await simularBff(page, PENDIENTE, {
    solicitudId: SOLICITUD_ID,
    estado: 'NO_AUTORIZADA',
  });

  await page.goto(`/autorizar/${SOLICITUD_ID}`);
  await page.getByRole('button', { name: 'No autorizar' }).click();

  await expect(
    page.getByRole('heading', { name: 'No autorizaste la consulta de tus datos' }),
  ).toBeFocused();
  await expect(page.getByText('No autorizada', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'La cotización personalizada no continúa; tu asesor puede enviarte una nueva solicitud.',
    ),
  ).toBeVisible();
  expect(decisiones).toEqual([
    { decision: 'NO_AUTORIZAR', aceptaPolitica: false, versionPolitica: 'v1' },
  ]);
});

test('una solicitud ya respondida muestra su estado y no el formulario', async ({ page }) => {
  await simularBff(page, { ...PENDIENTE, estado: 'AUTORIZADA' });

  await page.goto(`/autorizar/${SOLICITUD_ID}`);

  await expect(
    page.getByRole('heading', { name: 'Esta solicitud ya fue respondida' }),
  ).toBeVisible();
  await expect(page.getByText('Autorizada', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Autorizar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});
