import { expect, Page, Route, test } from '@playwright/test';

import { FIRMA_FIRMADA } from '../src/testing/fixtures-firma';
import {
  POLIZA_EMITIDA,
  POLIZA_GENERADA,
  POLIZA_ID,
  SOLICITUD_ID_POLIZA,
} from '../src/testing/fixtures-poliza';

// Emisión de la póliza (SOLVENTAG5-58) con el BFF simulado por page.route: el asesor emite desde
// la tarjeta de firma de SOLV-WEB-10 con la firma FIRMADA y ve la confirmación de SOLV-WEB-11;
// el cliente ve la suya; y un caso en inglés.

const COTIZACION_ID = 'c-1';
const SESIONES = {
  asesor: { usuario: { id: 'asesor-prueba', nombre: 'Asesor de prueba' }, rol: 'ASESOR' },
  cliente: {
    usuario: { id: 'cliente-prueba', nombre: 'Cliente de prueba' },
    rol: 'CLIENTE',
    clienteId: POLIZA_GENERADA.clienteId,
    documentoEnmascarado: 'CC ••••5678',
  },
} as const;
type Actor = keyof typeof SESIONES;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
  'access-control-expose-headers': 'Content-Disposition',
};

const rutaFirma = (actor: Actor) =>
  `/${actor}/cotizar/oferta/${COTIZACION_ID}/firma?solicitudId=${SOLICITUD_ID_POLIZA}`;
const rutaEmision = (actor: Actor) =>
  `/${actor}/cotizar/oferta/${COTIZACION_ID}/emision?solicitudId=${SOLICITUD_ID_POLIZA}`;

/**
 * El BFF de la póliza firmada: generar y consultar responden la póliza PENDIENTE_FIRMA hasta que se
 * emite y la VIGENTE después; la firma está FIRMADA; emitir responde 201 la primera vez y 200
 * después. Anota cada petición como «MÉTODO ruta».
 */
async function simularBff(page: Page, actor: Actor, emitida = false): Promise<string[]> {
  const peticiones: string[] = [];
  let vigente = emitida;
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
    const clave = `${peticion.method()} ${new URL(peticion.url()).pathname}`;
    peticiones.push(clave);
    const responder = (status: number, json: unknown) =>
      route.fulfill({ status, headers: CORS, json });
    const poliza = () => (vigente ? POLIZA_EMITIDA : POLIZA_GENERADA);
    switch (clave) {
      case `POST /v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`:
        return responder(200, poliza());
      case `GET /v1/polizas/${POLIZA_ID}/firma`:
        return responder(200, FIRMA_FIRMADA);
      case `POST /v1/polizas/${POLIZA_ID}/emision`: {
        const estado = vigente ? 200 : 201;
        vigente = true;
        return responder(estado, POLIZA_EMITIDA);
      }
      case `GET /v1/polizas/${POLIZA_ID}/documento`:
        return route.fulfill({
          status: 200,
          headers: {
            ...CORS,
            'content-type': 'application/pdf',
            'content-disposition': `attachment; filename="poliza-${POLIZA_ID}.pdf"`,
          },
          body: '%PDF-1.3\n%%EOF\n',
        });
      default:
        return responder(404, {});
    }
  });
  return peticiones;
}

test.describe('en español', () => {
  test('el asesor emite desde la firma FIRMADA y ve la confirmación de SOLV-WEB-11', async ({
    page,
  }) => {
    const peticiones = await simularBff(page, 'asesor');

    await page.goto(rutaFirma('asesor'));
    const tarjeta = page.getByRole('region', { name: 'Firma electrónica' });
    await expect(tarjeta.getByText('Firmado', { exact: true })).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Emitir póliza' }).click();

    await expect(page).toHaveURL(rutaEmision('asesor'));
    const titulo = page.getByRole('heading', {
      level: 2,
      name: 'La póliza del cliente fue emitida',
    });
    await expect(titulo).toBeVisible();
    await expect(titulo).toBeFocused();
    await expect(page.getByRole('img', { name: 'Póliza emitida' })).toBeVisible();
    await expect(page.getByText('SV-VH-2026-004821')).toBeVisible();
    await expect(page.getByText('06/12/2026 por $ 70.000')).toBeVisible();
    await expect(page.getByRole('article', { name: 'Comprobante de pago' })).toContainText(
      'VISA •••• 4242',
    );

    // «Ver póliza» entrega el PDF firmado.
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ver póliza' }).click();
    expect((await descarga).suggestedFilename()).toBe(`poliza-${POLIZA_ID}.pdf`);

    // De vuelta en la firma, la póliza ya está emitida: «Ver confirmación».
    await page.goto(rutaFirma('asesor'));
    await tarjeta.getByRole('link', { name: 'Ver confirmación' }).click();
    await expect(page).toHaveURL(rutaEmision('asesor'));
    expect(peticiones.filter((p) => p === `POST /v1/polizas/${POLIZA_ID}/emision`)).toHaveLength(1);
  });

  test('el cliente ve la confirmación de su póliza emitida', async ({ page }) => {
    await simularBff(page, 'cliente', true);

    await page.goto(rutaEmision('cliente'));

    await expect(
      page.getByRole('heading', { level: 2, name: '¡Tu póliza fue emitida!' }),
    ).toBeFocused();
    await expect(
      page.getByText('Te enviamos la póliza, el certificado de firma y el comprobante de pago.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nueva cotización' })).toHaveAttribute(
      'href',
      '/cliente/cotizar',
    );
    await expect(page.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute(
      'href',
      '/cliente',
    );
  });
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('el asesor emite y ve la confirmación en inglés', async ({ page }) => {
    await simularBff(page, 'asesor');

    await page.goto(rutaFirma('asesor'));
    await page
      .getByRole('region', { name: 'Electronic signature' })
      .getByRole('button', { name: 'Issue policy' })
      .click();

    await expect(
      page.getByRole('heading', { level: 2, name: "The client's policy was issued" }),
    ).toBeFocused();
    await expect(page.getByText('Dec 6, 2026 for $70,000')).toBeVisible();
  });
});
