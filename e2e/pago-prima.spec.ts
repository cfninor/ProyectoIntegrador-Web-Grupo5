import { expect, Page, Route, test } from '@playwright/test';

import { NO_EMITIBLE, POLIZA_GENERADA, POLIZA_ID } from '../src/testing/fixtures-poliza';
import { ACEPTADA, SOLICITUD_ID } from '../src/testing/fixtures-resultado';

// SOLV-WEB-09, el pago de la primera prima (SOLVENTAG5-74): se llega desde «Continuar al pago»
// de la suscripción aceptada, la tarjeta se tokeniza directo contra la pasarela simulada (ADR
// 0004 D8, nunca por el BFF) y un pago APROBADO continúa a la firma (D17).

const COTIZACION_ID = 'c-1';
const RUTA_SUSCRIPCION = `/cliente/cotizar/oferta/${COTIZACION_ID}/suscripcion?solicitudId=${SOLICITUD_ID}`;
const RUTA_PAGO = (actor: string) =>
  `/${actor}/cotizar/oferta/${COTIZACION_ID}/pago?solicitudId=${SOLICITUD_ID}`;
const SESIONES = {
  asesor: { usuario: { id: 'asesor-prueba', nombre: 'Asesor de prueba' }, rol: 'ASESOR' },
  cliente: {
    usuario: { id: 'cliente-prueba', nombre: 'Cliente de prueba' },
    rol: 'CLIENTE',
    clienteId: POLIZA_GENERADA.clienteId,
    documentoEnmascarado: 'CC ••••5678',
  },
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type, Idempotency-Key',
};

interface Respuesta {
  status?: number;
  json?: unknown;
}

/** El BFF y la pasarela simulada del pago. `cobros`: cada POST de cobro recibe la siguiente. */
async function simularBackend(
  page: Page,
  actor: 'asesor' | 'cliente',
  opciones: { generar: Respuesta; cobros?: readonly Respuesta[] },
): Promise<{ claves: (string | null)[]; cuerpos: unknown[] }> {
  const claves: (string | null)[] = [];
  const cuerpos: unknown[] = [];
  let cobros = 0;
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: {
        apiBaseUrl: 'http://localhost:8010',
        pasarelaUrl: 'http://localhost:8005',
        sesionSimulada: SESIONES[actor],
      },
    }),
  );
  await page.route('http://localhost:8010/**', (route: Route) => {
    const peticion = route.request();
    if (peticion.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    const ruta = new URL(peticion.url()).pathname;
    const responder = (r: Respuesta) =>
      route.fulfill({ status: r.status ?? 200, headers: CORS, json: r.json });
    if (ruta === `/v1/solicitudes-suscripcion/${SOLICITUD_ID}/poliza`) {
      return responder(opciones.generar);
    }
    if (ruta === `/v1/polizas/${POLIZA_ID}/cobro`) {
      claves.push(peticion.headers()['idempotency-key'] ?? null);
      cuerpos.push(JSON.parse(peticion.postData() ?? '{}'));
      const lista = opciones.cobros ?? [{ status: 201, json: { estado: 'APROBADO' } }];
      const respuesta = lista[Math.min(cobros, lista.length - 1)];
      cobros += 1;
      return responder(respuesta);
    }
    if (ruta === `/v1/solicitudes-suscripcion/${SOLICITUD_ID}`) {
      return responder({ json: ACEPTADA });
    }
    return route.fulfill({ status: 404, headers: CORS, json: {} });
  });
  await page.route('http://localhost:8005/**', (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: { token: 'tok-1', marca: 'VISA', ultimos4: '4242', vencimiento: '09/28' },
    });
  });
  return { claves, cuerpos };
}

async function pagarConTarjeta(page: Page) {
  await page.getByLabel('Número de tarjeta').fill('4111111111111111');
  await page.getByLabel('Vencimiento (MM/AA)').fill('09/28');
  await page.getByRole('button', { name: /^Pagar/ }).click();
}

test.describe('en español', () => {
  test('desde la suscripción aceptada, paga y continúa a la firma', async ({ page }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { status: 201, json: POLIZA_GENERADA },
      cobros: [{ status: 201, json: { estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' } }],
    });

    await page.goto(RUTA_SUSCRIPCION);
    await page.getByRole('link', { name: 'Continuar al pago' }).click();
    await expect(page).toHaveURL(RUTA_PAGO('cliente'));
    await expect(
      page.getByRole('heading', { level: 2, name: 'Pago de tu primera prima' }),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Pasos de la contratación' }).getByText('Pago'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pagar/ })).toHaveText('Pagar $ 70.000');

    await pagarConTarjeta(page);

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    await expect(page.getByText('VISA •••• 4242')).toBeVisible();
    expect(backend.claves).toHaveLength(1);
    expect(backend.claves[0]).toBeTruthy();
    expect(backend.cuerpos).toEqual([{ medioPago: 'TARJETA', token: 'tok-1' }]);

    await page.getByRole('link', { name: 'Continuar a la firma' }).click();
    await expect(page).toHaveURL(
      `/cliente/cotizar/oferta/${COTIZACION_ID}/firma?solicitudId=${SOLICITUD_ID}`,
    );
  });

  test('un pago rechazado deja intentar con otro medio, con una clave nueva', async ({ page }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [
        { status: 201, json: { estado: 'RECHAZADO' } },
        { status: 201, json: { estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' } },
      ],
    });

    await page.goto(RUTA_PAGO('cliente'));
    await pagarConTarjeta(page);

    await expect(page.getByText(/La pasarela rechazó el pago/)).toBeVisible();
    await page.getByRole('button', { name: 'Intentar con otro medio' }).click();
    await pagarConTarjeta(page);

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(backend.claves).toHaveLength(2);
    expect(backend.claves[0]).not.toBe(backend.claves[1]);
  });

  test('procesando: vuelve a consultar con la misma clave hasta ver la decisión', async ({
    page,
  }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [
        { status: 201, json: { estado: 'PROCESANDO' } },
        { status: 201, json: { estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' } },
      ],
    });

    await page.goto(RUTA_PAGO('cliente'));
    await pagarConTarjeta(page);

    await expect(page.getByText(/Tu pago se está procesando/)).toBeVisible();
    await page.getByRole('button', { name: 'Volver a consultar' }).click();

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(backend.claves[0]).toBe(backend.claves[1]);
    expect(backend.cuerpos[0]).toEqual(backend.cuerpos[1]);
  });

  test('una solicitud en revisión no deja pagar', async ({ page }) => {
    await simularBackend(page, 'cliente', {
      generar: { status: 409, json: NO_EMITIBLE.EN_REVISION },
    });

    await page.goto(RUTA_PAGO('cliente'));

    await expect(page.getByText(/La solicitud está en revisión/)).toBeVisible();
    await page.getByRole('link', { name: 'Volver a la suscripción' }).click();
    await expect(page).toHaveURL(RUTA_SUSCRIPCION);
  });

  test('al recargar con un pago en curso, lo reanuda sin pedir la tarjeta otra vez', async ({
    page,
  }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [
        { status: 201, json: { estado: 'PROCESANDO' } },
        { status: 201, json: { estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' } },
      ],
    });
    await page.goto(RUTA_PAGO('cliente'));
    await pagarConTarjeta(page);
    await expect(page.getByText(/Tu pago se está procesando/)).toBeVisible();

    await page.reload();

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(backend.claves[0]).toBe(backend.claves[1]);
  });
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('paga y ve «Your payment was approved»', async ({ page }) => {
    await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [{ status: 201, json: { estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' } }],
    });

    await page.goto(RUTA_PAGO('cliente'));
    await page.getByLabel('Card number').fill('4111111111111111');
    await page.getByLabel('Expiration (MM/YY)').fill('09/28');
    await page.getByRole('button', { name: /^Pay/ }).click();

    await expect(page.getByText('Your payment was approved.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue to signature' })).toBeVisible();
  });
});
