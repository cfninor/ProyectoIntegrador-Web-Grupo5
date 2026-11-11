import { expect, Page, Route, test } from '@playwright/test';

import {
  DOCUMENTO_PARA_FIRMAR,
  FIRMA_ABIERTA,
  FIRMA_ENVIADA,
  FIRMA_FIRMADA,
  FIRMA_ID,
  FIRMA_PENDIENTE_ENVIO,
} from '../src/testing/fixtures-firma';
import { POLIZA_GENERADA, POLIZA_ID, SOLICITUD_ID_POLIZA } from '../src/testing/fixtures-poliza';

// Firma electrónica de la póliza (SOLVENTAG5-57) con el BFF simulado por page.route: el asesor
// envía el enlace desde SOLV-WEB-10, el cliente abre la página pública, se equivoca una vez de
// código y firma, y el seguimiento del asesor muestra «Firmado».

const COTIZACION_ID = 'c-1';
const RUTA_FIRMA = `/asesor/cotizar/oferta/${COTIZACION_ID}/firma?solicitudId=${SOLICITUD_ID_POLIZA}`;
const RUTA_PUBLICA = `/firmar/${FIRMA_ID}`;
const CODIGO = '042817';
const SESION_ASESOR = {
  usuario: { id: 'asesor-prueba', nombre: 'Asesor de prueba' },
  rol: 'ASESOR',
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'Content-Type',
};

type Estado = 'SIN_FIRMA' | 'ENVIADA' | 'ABIERTA' | 'FIRMADA';

/**
 * El BFF de la firma, con su estado: pedirla la deja ENVIADA (responde PENDIENTE_ENVIO, como el
 * 201 del contrato), abrir el enlace la deja ABIERTA y el código correcto la deja FIRMADA. Cualquier
 * otro código responde 409 CODIGO_INVALIDO. Anota cada petición como «MÉTODO ruta».
 */
async function simularBff(page: Page): Promise<{ peticiones: string[]; codigos: string[] }> {
  const peticiones: string[] = [];
  const codigos: string[] = [];
  let estado: Estado = 'SIN_FIRMA';
  const firmas: Record<Exclude<Estado, 'SIN_FIRMA'>, object> = {
    ENVIADA: FIRMA_ENVIADA,
    ABIERTA: FIRMA_ABIERTA,
    FIRMADA: FIRMA_FIRMADA,
  };
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESION_ASESOR },
    }),
  );
  await page.route('http://localhost:8010/**', (route: Route) => {
    const peticion = route.request();
    if (peticion.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    const ruta = new URL(peticion.url()).pathname;
    const clave = `${peticion.method()} ${ruta}`;
    peticiones.push(clave);
    const responder = (status: number, json: unknown) =>
      route.fulfill({ status, headers: CORS, json });
    switch (clave) {
      case `POST /v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`:
        return responder(200, POLIZA_GENERADA);
      case `GET /v1/polizas/${POLIZA_ID}/firma`:
        return estado === 'SIN_FIRMA'
          ? responder(404, { codigo: 'FIRMA_NO_ENCONTRADA', detalle: 'Sin firma.' })
          : responder(200, firmas[estado]);
      case `POST /v1/polizas/${POLIZA_ID}/firma`:
        estado = 'ENVIADA';
        return responder(201, FIRMA_PENDIENTE_ENVIO);
      case `GET /v1/firmas/${FIRMA_ID}`:
        if (estado === 'ENVIADA') {
          estado = 'ABIERTA';
        }
        return responder(200, { ...DOCUMENTO_PARA_FIRMAR, estado });
      case `POST /v1/firmas/${FIRMA_ID}/validacion`: {
        const { codigo } = peticion.postDataJSON() as { codigo: string };
        codigos.push(codigo);
        if (codigo !== CODIGO) {
          return responder(409, {
            codigo: 'CODIGO_INVALIDO',
            detalle: 'El código no es correcto.',
            intentosRestantes: 4,
          });
        }
        estado = 'FIRMADA';
        return responder(200, FIRMA_FIRMADA);
      }
      default:
        return responder(404, {});
    }
  });
  return { peticiones, codigos };
}

test.describe('en español', () => {
  test('el asesor envía el enlace, el cliente se equivoca una vez y firma, y el seguimiento dice «Firmado»', async ({
    page,
  }) => {
    const { peticiones, codigos } = await simularBff(page);

    // El asesor, en SOLV-WEB-10: la póliza no tiene firma.
    await page.goto(RUTA_FIRMA);
    const tarjeta = page.getByRole('region', { name: 'Firma electrónica' });
    await expect(tarjeta.getByText(/El cliente recibirá por correo y por SMS/)).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Enviar enlace de firma' }).click();
    await expect(tarjeta.getByText('Esperando firma', { exact: true })).toBeVisible();
    await expect(tarjeta.getByText('El enlace vence el 09/11/2026 a las 10:02.')).toBeVisible();

    // El cliente abre el enlace público, sin sesión.
    await page.goto(RUTA_PUBLICA);
    await expect(page.getByRole('heading', { level: 1, name: 'Firma tu póliza' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Resumen de tu póliza' })).toBeVisible();
    const campo = page.getByLabel('Código de firma');
    await expect(campo).toHaveAttribute('autocomplete', 'one-time-code');

    await campo.fill('111111');
    await page.getByRole('button', { name: 'Firmar' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'El código no es correcto. Te quedan 4 intentos.',
    );
    await expect(campo).toHaveAttribute('aria-invalid', 'true');

    await campo.fill(CODIGO);
    await campo.press('Enter');
    const titulo = page.getByRole('heading', { level: 2, name: 'Firmaste tu póliza' });
    await expect(titulo).toBeVisible();
    await expect(titulo).toBeFocused();
    const certificado = page.getByRole('article', { name: 'Certificado de firma electrónica' });
    await expect(certificado).toContainText('203.0.113.24');
    expect(codigos).toEqual(['111111', CODIGO]);

    // De vuelta en SOLV-WEB-10: «Firmado», los hitos con su hora y el certificado.
    await page.goto(RUTA_FIRMA);
    await expect(tarjeta.getByText('Firmado', { exact: true })).toBeVisible();
    const hitos = tarjeta.getByRole('list', { name: 'Seguimiento de la firma' });
    await expect(hitos.getByRole('listitem')).toHaveText([
      /Documento generado\s+14\/10\/2026 a las 11:32/,
      /Enlace enviado\s+06\/11\/2026 a las 10:02/,
      /Enlace abierto\s+06\/11\/2026 a las 10:20/,
      /Documento firmado\s+06\/11\/2026 a las 10:23/,
    ]);
    await expect(
      tarjeta.getByRole('article', { name: 'Certificado de firma electrónica' }),
    ).toBeVisible();
    await expect(tarjeta.getByRole('button', { name: 'Reenviar enlace' })).toHaveCount(0);

    // La página pública no manda el token del asesor a las rutas del enlace: el BFF las atiende
    // sin sesión (lo comprueba la parte 5). Aquí basta con que se llamaron.
    expect(peticiones).toContain(`GET /v1/firmas/${FIRMA_ID}`);
    expect(peticiones.filter((p) => p === `POST /v1/firmas/${FIRMA_ID}/validacion`)).toHaveLength(
      2,
    );
  });

  test('un enlace que no existe lo dice', async ({ page }) => {
    await simularBff(page);

    await page.goto('/firmar/no-existe');

    await expect(page.getByRole('heading', { name: 'No encontramos este enlace' })).toBeVisible();
  });
});

test.describe('en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));
  });

  test('el asesor envía el enlace y el cliente firma desde la página pública', async ({ page }) => {
    await simularBff(page);

    await page.goto(RUTA_FIRMA);
    const tarjeta = page.getByRole('region', { name: 'Electronic signature' });
    await tarjeta.getByRole('button', { name: 'Send signature link' }).click();
    await expect(tarjeta.getByText('Awaiting signature', { exact: true })).toBeVisible();

    await page.goto(RUTA_PUBLICA);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign your policy' })).toBeVisible();
    await expect(page.getByText('The link expires on Nov 9, 2026 at 10:02 AM.')).toBeVisible();
    await page.getByLabel('Signature code').fill(CODIGO);
    await page.getByRole('button', { name: 'Sign' }).click();

    await expect(page.getByRole('heading', { name: 'You signed your policy' })).toBeVisible();
  });
});
