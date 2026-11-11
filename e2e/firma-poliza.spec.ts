import { expect, Page, Route, test } from '@playwright/test';

import {
  NO_EMITIBLE,
  POLIZA_GENERADA,
  POLIZA_GENERANDO,
  POLIZA_ID,
  SOLICITUD_ID_POLIZA,
} from '../src/testing/fixtures-poliza';
import { AJUSTADA } from '../src/testing/fixtures-resultado';

// SOLV-WEB-10, la póliza para firma (SOLVENTAG5-56), con el BFF simulado por page.route. A la firma
// se llega por su ruta (D17), como lo hará «Continuar a la firma» del pago (SOLVENTAG5-74).

const COTIZACION_ID = 'c-1';
const RUTA_FIRMA = (actor: string) =>
  `/${actor}/cotizar/oferta/${COTIZACION_ID}/firma?solicitudId=${SOLICITUD_ID_POLIZA}`;
const RUTA_SUSCRIPCION = `/cliente/cotizar/oferta/${COTIZACION_ID}/suscripcion?solicitudId=${SOLICITUD_ID_POLIZA}`;
const SESIONES = {
  asesor: { usuario: { id: 'asesor-prueba', nombre: 'Asesor de prueba' }, rol: 'ASESOR' },
  cliente: {
    usuario: { id: 'cliente-prueba', nombre: 'Cliente de prueba' },
    rol: 'CLIENTE',
    clienteId: POLIZA_GENERANDO.clienteId,
    documentoEnmascarado: 'CC ••••5678',
  },
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};
const PDF = '%PDF-1.3\n% póliza de prueba\n%%EOF\n';

interface Respuesta {
  status?: number;
  json?: unknown;
}

/**
 * El BFF de la firma. `consultas`: cada GET de la póliza recibe la siguiente, y la última se repite.
 * Anota cada petición como «MÉTODO ruta».
 */
async function simularBff(
  page: Page,
  actor: 'asesor' | 'cliente',
  opciones: { generar: Respuesta; consultas?: readonly Respuesta[] },
): Promise<string[]> {
  const peticiones: string[] = [];
  let consultas = 0;
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
    const ruta = new URL(peticion.url()).pathname;
    peticiones.push(`${peticion.method()} ${ruta}`);
    const responder = (r: Respuesta) =>
      route.fulfill({ status: r.status ?? 200, headers: CORS, json: r.json });
    if (ruta === `/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`) {
      return responder(opciones.generar);
    }
    if (ruta === `/v1/polizas/${POLIZA_ID}`) {
      const lista = opciones.consultas ?? [{ json: POLIZA_GENERADA }];
      const respuesta = lista[Math.min(consultas, lista.length - 1)];
      consultas += 1;
      return responder(respuesta);
    }
    if (ruta === `/v1/polizas/${POLIZA_ID}/documento`) {
      return route.fulfill({
        status: 200,
        headers: {
          ...CORS,
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="poliza-${POLIZA_ID}.pdf"`,
          'cache-control': 'no-store',
        },
        body: PDF,
      });
    }
    if (ruta === `/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/aceptacion-prima`) {
      return responder({ json: { ...AJUSTADA, primaAjustadaAceptadaEn: '2026-10-14T16:31:05Z' } });
    }
    if (ruta === `/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}`) {
      return responder({ json: AJUSTADA });
    }
    return route.fulfill({ status: 404, headers: CORS, json: {} });
  });
  return peticiones;
}

test.describe('en español', () => {
  test('el cliente acepta la nueva prima y abre la vista previa hasta ver «Documento generado»', async ({
    page,
  }) => {
    const peticiones = await simularBff(page, 'cliente', {
      generar: { status: 201, json: POLIZA_GENERANDO },
      consultas: [{ json: POLIZA_GENERANDO }, { json: POLIZA_GENERADA }],
    });

    await page.goto(RUTA_SUSCRIPCION);
    await page.getByRole('button', { name: 'Aceptar nueva prima' }).click();
    await expect(page.getByText(/Aceptaste la nueva prima el 14\/10\/2026/)).toBeVisible();

    await page.goto(RUTA_FIRMA('cliente'));

    await expect(
      page.getByRole('heading', { level: 2, name: 'Tu póliza para firma' }),
    ).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Documento generado' }),
    ).toContainText('14/10/2026 a las 11:32');
    await expect(page.getByText('Generado', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Pasos de la contratación' }).getByText('Firma'),
    ).toBeVisible();
    const resumen = page.getByRole('article', { name: 'Resumen de tu póliza' });
    await expect(resumen).toContainText('María Fernanda Pérez Gómez');
    await expect(resumen).toContainText('$ 200.000.000');
    await expect(resumen).toContainText('Del 14/10/2026 al 14/10/2046');
    await expect(resumen.getByRole('list', { name: 'Coberturas' })).toContainText(
      'Fallecimiento del deudor',
    );
    await expect(resumen.getByRole('list', { name: 'Exclusiones' })).toContainText(
      'Actos de guerra o terrorismo',
    );
    expect(peticiones).toEqual([
      `GET /v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}`,
      `POST /v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/aceptacion-prima`,
      `POST /v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`,
      `GET /v1/polizas/${POLIZA_ID}`,
      `GET /v1/polizas/${POLIZA_ID}`,
      // Con el documento GENERADO, la tarjeta de la firma la consulta (SOLVENTAG5-57).
      `GET /v1/polizas/${POLIZA_ID}/firma`,
    ]);
  });

  test('descarga el PDF con su nombre', async ({ page }) => {
    await simularBff(page, 'cliente', { generar: { json: POLIZA_GENERADA } });

    await page.goto(RUTA_FIRMA('cliente'));
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar PDF' }).click();

    expect((await descarga).suggestedFilename()).toBe(`poliza-${POLIZA_ID}.pdf`);
  });

  test('al asesor, una ajustada sin aceptar se muestra con su motivo y no como error', async ({
    page,
  }) => {
    await simularBff(page, 'asesor', {
      generar: { status: 409, json: NO_EMITIBLE.PRIMA_AJUSTADA_SIN_ACEPTAR },
    });

    await page.goto(RUTA_FIRMA('asesor'));

    await expect(
      page.getByRole('heading', { name: 'El cliente no ha aceptado la nueva prima' }),
    ).toBeVisible();
    await expect(page.getByText('Nueva prima sin aceptar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeHidden();
    await page.getByRole('link', { name: 'Volver a la suscripción' }).click();
    await expect(page).toHaveURL(
      `/asesor/cotizar/oferta/${COTIZACION_ID}/suscripcion?solicitudId=${SOLICITUD_ID_POLIZA}`,
    );
  });

  test('una rechazada se muestra en rojo', async ({ page }) => {
    await simularBff(page, 'cliente', { generar: { status: 409, json: NO_EMITIBLE.RECHAZADA } });

    await page.goto(RUTA_FIRMA('cliente'));

    await expect(page.getByRole('heading', { name: 'No podemos generar tu póliza' })).toBeVisible();
    await expect(page.getByText('Rechazada', { exact: true })).toHaveClass(/chip-rojo/);
  });
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('la vista previa hasta «Document generated»', async ({ page }) => {
    await simularBff(page, 'cliente', {
      generar: { status: 201, json: POLIZA_GENERANDO },
      consultas: [{ json: POLIZA_GENERADA }],
    });

    await page.goto(RUTA_FIRMA('cliente'));

    await expect(page.getByRole('heading', { name: 'Your policy for signature' })).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Document generated' }),
    ).toContainText('Oct 14, 2026 at 11:32 AM');
    await expect(page.getByRole('article', { name: 'Your policy summary' })).toContainText(
      'From Oct 14, 2026 to Oct 14, 2046',
    );
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  });
});
