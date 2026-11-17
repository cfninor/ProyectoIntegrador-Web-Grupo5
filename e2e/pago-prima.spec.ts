import { expect, Page, Route, test } from '@playwright/test';

import { NO_EMITIBLE, POLIZA_GENERADA, POLIZA_ID } from '../src/testing/fixtures-poliza';
import { ACEPTADA, SOLICITUD_ID } from '../src/testing/fixtures-resultado';

// SOLV-WEB-09, el pago de la primera prima (SOLVENTAG5-74): se llega desde «Continuar al pago»
// de la suscripción aceptada, la tarjeta se tokeniza directo contra la pasarela simulada (ADR
// 0004 D8, nunca por el BFF) y un pago APROBADO continúa a la firma (D17). Desde la SOLVENTAG5-75,
// la pantalla consulta el cobro de la póliza antes del formulario (CA2), sigue un PROCESANDO con
// esa consulta y nunca cobra dos veces: doble clic, recarga o la póliza ya pagada (CA3, CA6).

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
  /** El BFF no responde: la conexión se corta. */
  sinRespuesta?: boolean;
}

const SIN_INTENTOS: Respuesta = {
  status: 404,
  json: { codigo: 'COBRO_NO_ENCONTRADO', detalle: 'La póliza todavía no tiene intentos de cobro.' },
};

/** La respuesta de la consulta del cobro con un solo intento, del pago dado. */
function cobroCon(pago: { estado: string; marca?: string; ultimos4?: string }): Respuesta {
  const completo = { pagoId: 'p-1', polizaId: POLIZA_ID, ...pago };
  return {
    json: {
      pago: completo,
      intentos: [{ pagoId: 'p-1', estado: pago.estado, canal: 'web', creadoEn: 'x' }],
    },
  };
}

const APROBADO = { estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' };

/**
 * El BFF y la pasarela simulada del pago. `cobros`: cada POST de cobro recibe la siguiente;
 * `consultas`: cada GET del cobro, la siguiente (por defecto, sin intentos).
 */
async function simularBackend(
  page: Page,
  actor: 'asesor' | 'cliente',
  opciones: {
    generar: Respuesta;
    cobros?: readonly Respuesta[];
    consultas?: readonly Respuesta[];
  },
): Promise<{ claves: (string | null)[]; cuerpos: unknown[]; consultas: () => number }> {
  const claves: (string | null)[] = [];
  const cuerpos: unknown[] = [];
  let cobros = 0;
  let consultas = 0;
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
    if (ruta === `/v1/polizas/${POLIZA_ID}/cobro` && peticion.method() === 'GET') {
      const lista = opciones.consultas ?? [SIN_INTENTOS];
      const respuesta = lista[Math.min(consultas, lista.length - 1)];
      consultas += 1;
      return responder(respuesta);
    }
    if (ruta === `/v1/polizas/${POLIZA_ID}/cobro`) {
      claves.push(peticion.headers()['idempotency-key'] ?? null);
      cuerpos.push(JSON.parse(peticion.postData() ?? '{}'));
      const lista = opciones.cobros ?? [{ status: 201, json: { estado: 'APROBADO' } }];
      const respuesta = lista[Math.min(cobros, lista.length - 1)];
      cobros += 1;
      return respuesta.sinRespuesta ? route.abort('connectionreset') : responder(respuesta);
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
  return { claves, cuerpos, consultas: () => consultas };
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

  test('procesando: la consulta lo resuelve APROBADO, sin reenviar el cobro', async ({ page }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [{ status: 201, json: { estado: 'PROCESANDO' } }],
      consultas: [SIN_INTENTOS, cobroCon(APROBADO)],
    });

    await page.goto(RUTA_PAGO('cliente'));
    await pagarConTarjeta(page);

    await expect(page.getByText(/Tu pago se está procesando/)).toBeVisible();
    await page.getByRole('button', { name: 'Consultar de nuevo' }).click();

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(backend.claves).toHaveLength(1);
    expect(backend.consultas()).toBe(2);
  });

  test('doble clic en «Pagar»: un solo cobro', async ({ page }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [{ status: 201, json: APROBADO }],
    });
    await page.goto(RUTA_PAGO('cliente'));
    await page.getByLabel('Número de tarjeta').fill('4111111111111111');
    await page.getByLabel('Vencimiento (MM/AA)').fill('09/28');

    await page.getByRole('button', { name: /^Pagar/ }).dblclick();

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(backend.claves).toHaveLength(1);
  });

  test('la póliza ya pagada por el otro canal: al entrar no hay formulario', async ({ page }) => {
    const backend = await simularBackend(page, 'asesor', {
      generar: { json: POLIZA_GENERADA },
      consultas: [cobroCon(APROBADO)],
    });

    await page.goto(RUTA_PAGO('asesor'));

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuar a la firma' })).toBeVisible();
    await expect(page.getByLabel('Número de tarjeta')).toHaveCount(0);
    expect(backend.claves).toHaveLength(0);
  });

  test('si el otro canal paga mientras tanto, el 200 del cobro muestra el pago existente', async ({
    page,
  }) => {
    const backend = await simularBackend(page, 'asesor', {
      generar: { json: POLIZA_GENERADA },
      cobros: [{ status: 200, json: APROBADO }],
    });
    await page.goto(RUTA_PAGO('asesor'));

    await pagarConTarjeta(page);

    await expect(page.getByText('Esta póliza ya tiene un pago.')).toBeVisible();
    await expect(page.getByText('Aprobado', { exact: true })).toBeVisible();
    await expect(page.getByText('Tu pago quedó aprobado.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Continuar a la firma' })).toBeVisible();
    expect(backend.claves).toHaveLength(1);
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

  test('al recargar durante el pago, muestra el resultado del intento original sin la tarjeta', async ({
    page,
  }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [{ status: 201, json: { estado: 'PROCESANDO' } }],
      consultas: [SIN_INTENTOS, cobroCon(APROBADO)],
    });
    await page.goto(RUTA_PAGO('cliente'));
    await pagarConTarjeta(page);
    await expect(page.getByText(/Tu pago se está procesando/)).toBeVisible();

    await page.reload();

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    await expect(page.getByLabel('Número de tarjeta')).toHaveCount(0);
    expect(backend.claves).toHaveLength(1); // la consulta lo resolvió: no se reenvió el cobro
  });

  test('si el cobro no llegó y se recarga, lo reenvía con la misma clave', async ({ page }) => {
    const backend = await simularBackend(page, 'cliente', {
      generar: { json: POLIZA_GENERADA },
      cobros: [{ sinRespuesta: true }, { status: 201, json: APROBADO }],
    });
    await page.goto(RUTA_PAGO('cliente'));
    await pagarConTarjeta(page);
    await expect(page.getByText(/No pudimos conectarnos para procesar el pago/)).toBeVisible();

    await page.reload();

    await expect(page.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(backend.claves).toHaveLength(2);
    expect(backend.claves[0]).toBe(backend.claves[1]);
    expect(backend.cuerpos[0]).toEqual(backend.cuerpos[1]);
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
