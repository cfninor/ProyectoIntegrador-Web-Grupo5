import { expect, Page, Route, test } from '@playwright/test';

import {
  ACEPTADA,
  AJUSTADA,
  EN_REVISION,
  ILEGIBLE,
  NO_VERIFICABLE,
  PENDIENTE,
  RECHAZADA,
  SOLICITUD_ID,
} from '../src/testing/fixtures-resultado';

// La tarjeta del resultado de suscripción (SOLVENTAG5-55, SOLV-WEB-07 y 08) en la página de la 51,
// con el BFF simulado por page.route: la misma respuesta que esa página ya consulta, sin otra llamada.

const COTIZACION_ID = 'c-1';
const RUTA = (actor: string) =>
  `/${actor}/cotizar/oferta/${COTIZACION_ID}/suscripcion?solicitudId=${SOLICITUD_ID}`;
const SESIONES = {
  asesor: { usuario: { id: 'asesor-prueba', nombre: 'Asesor de prueba' }, rol: 'ASESOR' },
  cliente: {
    usuario: { id: 'cliente-prueba', nombre: 'Cliente de prueba' },
    rol: 'CLIENTE',
    clienteId: PENDIENTE.clienteId,
    documentoEnmascarado: 'CC ••••5678',
  },
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};

/** Cada consulta recibe la siguiente respuesta de la lista, y la última se repite. */
async function simularBff(
  page: Page,
  actor: 'asesor' | 'cliente',
  respuestas: readonly { status?: number; json: unknown }[],
): Promise<{ consultas: () => number; otras: string[] }> {
  let consultas = 0;
  const otras: string[] = [];
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESIONES[actor] },
    }),
  );
  await page.route('http://localhost:8010/**', (route: Route) => {
    const peticion = route.request();
    if (peticion.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (new URL(peticion.url()).pathname !== `/v1/solicitudes-suscripcion/${SOLICITUD_ID}`) {
      otras.push(peticion.url());
      return route.fulfill({ status: 404, headers: CORS, json: {} });
    }
    const respuesta = respuestas[Math.min(consultas, respuestas.length - 1)];
    consultas += 1;
    return route.fulfill({
      status: respuesta.status ?? 200,
      headers: CORS,
      json: respuesta.json,
    });
  });
  return { consultas: () => consultas, otras };
}

test.describe('en español', () => {
  test('sin decisión dice el último estado, y al llegar la decisión muestra la tarjeta', async ({
    page,
  }) => {
    const bff = await simularBff(page, 'cliente', [{ json: PENDIENTE }, { json: ACEPTADA }]);

    await page.goto(RUTA('cliente'));

    await expect(page.getByText(/Este es el último estado conocido/)).toContainText(
      '14/10/2026 a las 11:30',
    );
    await expect(page.getByRole('heading', { name: 'Aprobamos tu solicitud' })).toBeVisible();
    await expect(page.getByText(/último estado conocido/)).toBeHidden();
    await expect(page.getByText('1,2 s')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Condiciones aprobadas' })).toBeVisible();
    await expect(
      page.getByRole('table', { name: /Reglas evaluadas, versión VIDA_HIPOTECARIO/ }),
    ).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Puntaje de riesgo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeDisabled();
    expect(bff.consultas()).toBe(2);
    expect(bff.otras).toEqual([]);
  });

  test('ajustada: la nueva prima y que el cliente debe aceptarla', async ({ page }) => {
    await simularBff(page, 'asesor', [{ json: AJUSTADA }]);

    await page.goto(RUTA('asesor'));

    await expect(
      page.getByRole('heading', { name: 'Solicitud aceptada con ajuste' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nueva prima: $ 109.200' })).toBeVisible();
    await expect(page.getByText(/El cliente debe aceptar la nueva prima/)).toBeVisible();
    await expect(page.getByText('Recargo del 20 %')).toBeVisible();
    await expect(
      page.getByRole('rowheader', { name: /Nivel de riesgo.*Determinante/ }),
    ).toBeVisible();
  });

  test('rechazada: el motivo, sin condiciones ni pago', async ({ page }) => {
    await simularBff(page, 'cliente', [{ json: RECHAZADA }]);

    await page.goto(RUTA('cliente'));

    await expect(
      page.getByText('No cumple una regla de rechazo: Puntaje de riesgo.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Condiciones aprobadas' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeHidden();
  });

  test('en revisión no es un error, y el asesor vuelve al tablero', async ({ page }) => {
    await simularBff(page, 'asesor', [{ json: EN_REVISION }]);

    await page.goto(RUTA('asesor'));

    await expect(page.getByText(/Esto no es un error/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Reglas por resolver' })).toContainText(
      'Perfil de riesgo',
    );
    await expect(page.getByText('Enviada a riesgo')).toBeVisible();
    await expect(page.getByText(/La decisión se verá en esta misma página/)).toContainText(
      'hasta 1 día hábil',
    );
    await expect(page.getByRole('link', { name: 'Volver a la oferta' })).toBeHidden();

    await page.getByRole('link', { name: 'Volver al tablero' }).click();
    await expect(page).toHaveURL('/asesor');
  });

  test('registro ilegible: el estado y el aviso, sin decisión', async ({ page }) => {
    await simularBff(page, 'cliente', [{ json: ILEGIBLE }]);

    await page.goto(RUTA('cliente'));

    await expect(page.getByText(/No pudimos verificar el registro/)).toBeVisible();
    await expect(page.getByRole('table')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeHidden();
  });

  test('registros no verificables: el aviso, con los datos', async ({ page }) => {
    await simularBff(page, 'cliente', [{ json: NO_VERIFICABLE }]);

    await page.goto(RUTA('cliente'));

    await expect(page.getByText(/No pudimos verificar el registro/)).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('una solicitud ajena o inexistente (404) lo dice', async ({ page }) => {
    await simularBff(page, 'asesor', [
      {
        status: 404,
        json: { codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA', detalle: 'No encontrada.' },
      },
    ]);

    await page.goto(RUTA('asesor'));

    await expect(
      page.getByRole('heading', { name: 'No encontramos esta solicitud de suscripción' }),
    ).toBeVisible();
  });
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('aceptada', async ({ page }) => {
    await simularBff(page, 'cliente', [{ json: ACEPTADA }]);

    await page.goto(RUTA('cliente'));

    await expect(page.getByRole('heading', { name: 'Approved conditions' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Risk score' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to payment' })).toBeDisabled();
  });

  test('en revisión', async ({ page }) => {
    await simularBff(page, 'cliente', [{ json: EN_REVISION }]);

    await page.goto(RUTA('cliente'));

    await expect(page.getByText(/This is not an error/)).toBeVisible();
    await expect(page.getByText(/up to 1 business day/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the dashboard' })).toBeVisible();
  });
});
