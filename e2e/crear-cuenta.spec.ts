import { expect, Page, Route, test } from '@playwright/test';

import { API, CognitoSimulado, preferirIngles } from './cognito-simulado';

// Crear cuenta del cliente (SOLVENTAG5-207, CA8, D20 y D21) con Cognito simulado (SignUp,
// ConfirmSignUp, ResendConfirmationCode y el ingreso SRP) y `POST /v1/cuenta` del BFF simulado.

const CORREO = 'maria@correo.com';
const CONTRASENA = 'Clave-Segura-1';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const DATOS = {
  documento: { tipo: 'CC', numero: '1020304050' },
  nombre: { nombres: 'María Fernanda', apellidos: 'López Rojas' },
  celular: '3001234567',
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST',
  'access-control-allow-headers': 'Authorization, Content-Type',
};

const IDIOMAS = {
  es: {
    registrarse: 'Regístrate como cliente',
    tipoDocumento: 'Tipo de documento',
    documento: 'Documento de identidad',
    nombres: 'Nombres',
    apellidos: 'Apellidos',
    celular: 'Celular',
    correo: 'Correo',
    contrasena: 'Contraseña',
    confirmacion: 'Confirma tu contraseña',
    continuar: 'Continuar',
    tituloCodigo: 'Confirma tu correo',
    tituloDatos: 'Tus datos',
    codigo: 'Código',
    confirmar: 'Confirmar',
    reenviar: 'Reenviar código',
    reenviado: 'Te enviamos un código nuevo.',
    codigoErrado: 'El código no es correcto.',
    noEnlazable:
      'No pudimos crear tu cuenta con esos datos. Si ya te registraste en la app, usa el mismo correo; si no, comunícate con tu asesor.',
    bienvenida: 'Hola de nuevo, María Fernanda López Rojas.',
    rol: 'Cliente',
  },
  en: {
    registrarse: 'Sign up as a customer',
    tipoDocumento: 'Document type',
    documento: 'ID document',
    nombres: 'First names',
    apellidos: 'Last names',
    celular: 'Mobile phone',
    correo: 'Email',
    contrasena: 'Password',
    confirmacion: 'Confirm your password',
    continuar: 'Continue',
    tituloCodigo: 'Confirm your email',
    tituloDatos: 'Your details',
    codigo: 'Code',
    confirmar: 'Confirm',
    reenviar: 'Resend code',
    reenviado: 'We sent you a new code.',
    codigoErrado: 'The code is incorrect.',
    noEnlazable:
      "We couldn't create your account with those details. If you already signed up in the app, use the same email; otherwise, contact your advisor.",
    bienvenida: 'Welcome back, María Fernanda López Rojas.',
    rol: 'Customer',
  },
};
type Textos = (typeof IDIOMAS)['es'];

interface Bff {
  cuerpos: unknown[];
  autorizaciones: (string | undefined)[];
}

/**
 * `POST /v1/cuenta` del BFF: con 201 o 200, como el BFF, deja la cuenta en el grupo CLIENTE con
 * sus atributos (D21); con 409, no cambia nada.
 */
async function simularBff(page: Page, cognito: CognitoSimulado, estado: 200 | 201 | 409) {
  const bff: Bff = { cuerpos: [], autorizaciones: [] };
  await page.route(`${API}/v1/cuenta`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    bff.cuerpos.push(route.request().postDataJSON());
    bff.autorizaciones.push(route.request().headers()['authorization']);
    if (estado === 409) {
      await route.fulfill({
        status: 409,
        headers: CORS,
        json: { codigo: 'CUENTA_NO_ENLAZABLE', mensaje: 'No se pudo enlazar la cuenta' },
      });
      return;
    }
    cognito.registrarCliente(CORREO, {
      name: 'María Fernanda López Rojas',
      'custom:cliente_id': CLIENTE_ID,
      'custom:doc_enmascarado': 'CC ••••4050',
    });
    await route.fulfill({
      status: estado,
      headers: CORS,
      json: { clienteId: CLIENTE_ID, registro: estado === 201 ? 'CREADO' : 'ENLAZADO' },
    });
  });
  return bff;
}

/** Desde SOLV-WEB-01, «Regístrate como cliente» y «Tus datos». */
async function llenarDatos(page: Page, t: Textos): Promise<void> {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: t.registrarse }).click();
  await expect(page).toHaveURL('/crear-cuenta');
  await expect(page.getByLabel(t.tipoDocumento)).toHaveValue('CC');
  await page.getByLabel(t.documento).fill(DATOS.documento.numero);
  await page.getByLabel(t.nombres).fill(DATOS.nombre.nombres);
  await page.getByLabel(t.apellidos).fill(DATOS.nombre.apellidos);
  await page.getByLabel(t.celular).fill(DATOS.celular);
  await page.getByLabel(t.correo).fill(CORREO);
  await page.getByLabel(t.contrasena, { exact: true }).fill(CONTRASENA);
  await page.getByLabel(t.confirmacion).fill(CONTRASENA);
  await page.getByRole('button', { name: t.continuar }).click();
  await expect(page.getByRole('heading', { name: t.tituloCodigo })).toBeVisible();
}

async function confirmar(page: Page, t: Textos, codigo: string): Promise<void> {
  await page.getByLabel(t.codigo).fill(codigo);
  await page.getByRole('button', { name: t.confirmar }).click();
}

for (const [idioma, t] of Object.entries(IDIOMAS)) {
  test.describe(`crear cuenta (${idioma})`, () => {
    let cognito: CognitoSimulado;

    test.beforeEach(async ({ page }) => {
      if (idioma === 'en') {
        await preferirIngles(page);
      }
      cognito = new CognitoSimulado();
      await cognito.instalar(page);
    });

    test('un cliente nuevo crea su cuenta y su registro (201), y entra a su portal', async ({
      page,
    }) => {
      const bff = await simularBff(page, cognito, 201);

      await llenarDatos(page, t);
      await expect(page.getByText(CORREO)).toBeVisible();
      await confirmar(page, t, cognito.codigo);

      await expect(page).toHaveURL('/cliente');
      await expect(page.getByRole('main')).toContainText(t.bienvenida);
      await expect(page.getByText(t.rol, { exact: true })).toBeVisible();
      expect(bff.cuerpos).toEqual([DATOS]);
      expect(bff.autorizaciones[0]).toMatch(/^Bearer /);
      // D21: registrar, confirmar, ingresar con SRP y, después de POST /v1/cuenta, renovar.
      expect(cognito.operaciones()).toEqual([
        'SignUp',
        'ConfirmSignUp',
        'InitiateAuth',
        'RespondToAuthChallenge',
        'GetTokensFromRefreshToken',
      ]);
      const registro = cognito.llamadas[0].cuerpo;
      expect(registro['Username']).toBe(CORREO);
      expect(registro['UserAttributes']).toEqual([{ Name: 'email', Value: CORREO }]);
    });

    test('un cliente de la app crea su cuenta y queda enlazado a su registro (200)', async ({
      page,
    }) => {
      const bff = await simularBff(page, cognito, 200);

      await llenarDatos(page, t);
      await confirmar(page, t, cognito.codigo);

      await expect(page).toHaveURL('/cliente');
      await expect(page.getByRole('main')).toContainText(t.bienvenida);
      expect(bff.cuerpos).toEqual([DATOS]);
    });

    test('si el BFF no puede enlazar la cuenta (409), el mensaje genérico y sigue en «Tus datos»', async ({
      page,
    }) => {
      await simularBff(page, cognito, 409);

      await llenarDatos(page, t);
      await confirmar(page, t, cognito.codigo);

      await expect(page.getByText(t.noEnlazable)).toBeVisible();
      await expect(page).toHaveURL('/crear-cuenta');
      await expect(page.getByRole('heading', { name: t.tituloDatos })).toBeVisible();
      await expect(page.getByLabel(t.correo)).toHaveValue(CORREO);
      await expect(page.getByLabel(t.contrasena, { exact: true })).toHaveCount(0);
    });

    test('con el código errado, su mensaje; con «Reenviar código» y el código correcto, sigue', async ({
      page,
    }) => {
      await simularBff(page, cognito, 201);

      await llenarDatos(page, t);
      await confirmar(page, t, '000000');

      await expect(page.getByText(t.codigoErrado)).toBeVisible();
      await expect(page).toHaveURL('/crear-cuenta');

      await page.getByRole('button', { name: t.reenviar }).click();
      await expect(page.getByRole('status')).toHaveText(t.reenviado);
      expect(cognito.operaciones()).toContain('ResendConfirmationCode');

      await page.getByLabel(t.codigo).clear();
      await confirmar(page, t, cognito.codigo);
      await expect(page).toHaveURL('/cliente');
    });
  });
}
