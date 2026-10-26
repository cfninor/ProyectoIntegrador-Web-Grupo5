import { expect, Page, Route, test } from '@playwright/test';

import { API, CLAVE_IDIOMA, CognitoSimulado, preferirIngles } from './cognito-simulado';

// SOLV-WEB-01 con Cognito simulado (SOLVENTAG5-207, parte 5): config.json trae `cognito`, Amplify
// hace el intercambio SRP contra el simulador y el portal arma la sesión con el ID token.

const CONTRASENA = 'Clave-Segura-1';
const ASESOR = 'asesor@solventa.example';
const CLIENTE = 'maria@correo.com';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST',
  'access-control-allow-headers': 'Authorization, Content-Type',
};

async function prepararCognito(page: Page): Promise<CognitoSimulado> {
  const cognito = new CognitoSimulado();
  cognito.agregar(ASESOR, 'ok', { name: 'Laura Gómez', 'cognito:groups': ['ASESOR'] });
  cognito.agregar(CLIENTE, 'ok', {
    name: 'María Fernanda López Rojas',
    'cognito:groups': ['CLIENTE'],
    'custom:cliente_id': CLIENTE_ID,
    'custom:doc_enmascarado': 'CC ••••4050',
  });
  cognito.agregar('errada@correo.com', 'credenciales');
  cognito.agregar('bloqueada@correo.com', 'bloqueo');
  await cognito.instalar(page);
  return cognito;
}

async function ingresar(page: Page, correo: string, etiquetas = ESPANOL): Promise<void> {
  await page.getByLabel(etiquetas.correo).fill(correo);
  await page.getByLabel(etiquetas.contrasena).fill(CONTRASENA);
  await page.getByRole('button', { name: etiquetas.continuar }).click();
}

const ESPANOL = { correo: 'Correo', contrasena: 'Contraseña', continuar: 'Continuar' };
const INGLES = { correo: 'Email', contrasena: 'Password', continuar: 'Continue' };

/** Las claves de sessionStorage y localStorage (sin la preferencia de idioma). */
async function almacenamiento(page: Page) {
  return page.evaluate((clave) => {
    const claves = (almacen: Storage) =>
      Array.from({ length: almacen.length }, (_, indice) => almacen.key(indice) as string);
    return {
      sesion: claves(sessionStorage),
      local: claves(localStorage).filter((llave) => llave !== clave),
    };
  }, CLAVE_IDIOMA);
}

test.describe('ingreso con Cognito', () => {
  test('el asesor ingresa con SRP a su portal, y los tokens quedan solo en sessionStorage', async ({
    page,
  }) => {
    const cognito = await prepararCognito(page);

    await page.goto('/');
    await expect(page).toHaveURL('/ingresar');
    await expect(page).toHaveTitle('Iniciar sesión · Solventa');
    await ingresar(page, ASESOR);

    await expect(page).toHaveURL('/asesor');
    await expect(page.getByRole('main')).toContainText('Hola de nuevo, Laura Gómez.');
    await expect(page.getByText('Asesor comercial')).toBeVisible();
    // SRP (D4): el reto y la firma; la contraseña no sale del navegador.
    expect(cognito.operaciones()).toEqual(['InitiateAuth', 'RespondToAuthChallenge']);
    expect(cognito.llamadas[0].cuerpo['AuthFlow']).toBe('USER_SRP_AUTH');
    const respuesta = cognito.llamadas[1].cuerpo['ChallengeResponses'] as Record<string, string>;
    expect(respuesta['PASSWORD_CLAIM_SIGNATURE']).toBeTruthy();
    expect(cognito.llamadas.some((llamada) => llamada.texto.includes(CONTRASENA))).toBe(false);
    // R10: nada de la sesión en localStorage.
    const { sesion, local } = await almacenamiento(page);
    expect(sesion.some((llave) => llave.endsWith('.idToken'))).toBe(true);
    expect(local).toEqual([]);
  });

  test('el cliente ingresa a su portal con su nombre', async ({ page }) => {
    await prepararCognito(page);

    await page.goto('/ingresar');
    await ingresar(page, CLIENTE);

    await expect(page).toHaveURL('/cliente');
    await expect(page.getByRole('main')).toContainText(
      'Hola de nuevo, María Fernanda López Rojas.',
    );
    await expect(page.getByText('Cliente', { exact: true })).toBeVisible();
  });

  test('sin sesión, una ruta del portal vuelve a ella después de ingresar (D10)', async ({
    page,
  }) => {
    await prepararCognito(page);

    await page.goto('/asesor/cotizar');
    await expect(page).toHaveURL('/ingresar?volver=%2Fasesor%2Fcotizar');
    await ingresar(page, ASESOR);

    await expect(page).toHaveURL('/asesor/cotizar');
  });

  test('las llamadas al BFF llevan el ID token (D5)', async ({ page }) => {
    await prepararCognito(page);
    const autorizaciones: (string | undefined)[] = [];
    await page.route(
      `${API}/v1/clientes/${CLIENTE_ID}/autorizacion-datos`,
      async (route: Route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({
            status: 204,
            headers: { ...CORS, 'access-control-allow-methods': 'GET' },
          });
          return;
        }
        autorizaciones.push(route.request().headers()['authorization']);
        await route.fulfill({ headers: CORS, json: { estado: 'SIN_SOLICITAR' } });
      },
    );

    await page.goto('/cliente/cotizar');
    await ingresar(page, CLIENTE);

    await expect(page).toHaveURL('/cliente/cotizar');
    await expect.poll(() => autorizaciones.length).toBeGreaterThan(0);
    expect(autorizaciones[0]).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  test('con la contraseña errada o un correo que no existe, el mismo mensaje genérico (CA2)', async ({
    page,
  }) => {
    await prepararCognito(page);
    await page.goto('/ingresar');

    for (const correo of ['errada@correo.com', 'no-existe@correo.com']) {
      await ingresar(page, correo);

      await expect(page.getByText('El correo o la contraseña no son correctos.')).toBeVisible();
      await expect(page).toHaveURL('/ingresar');
      await expect(page.getByLabel('Contraseña')).toHaveValue('');
    }
  });

  test('tras varios intentos, el aviso de bloqueo sin tiempo restante (CA2)', async ({ page }) => {
    await prepararCognito(page);
    await page.goto('/ingresar');

    await ingresar(page, 'bloqueada@correo.com');

    await expect(
      page.getByText('Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.'),
    ).toBeVisible();
  });

  test('«Cerrar sesión» revoca el refresco, borra los tokens y vuelve a pedir ingresar (CA5)', async ({
    page,
  }) => {
    const cognito = await prepararCognito(page);
    await page.goto('/ingresar');
    await ingresar(page, ASESOR);
    await expect(page).toHaveURL('/asesor');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL('/ingresar');
    await expect.poll(() => cognito.operaciones()).toContain('RevokeToken');
    expect((await almacenamiento(page)).sesion.some((llave) => llave.includes('Token'))).toBe(
      false,
    );
    await page.goto('/asesor');
    await expect(page).toHaveURL('/ingresar?volver=%2Fasesor');
  });

  test('por inactividad, a los 15 minutos se cierra la sesión del asesor con su aviso (CA5)', async ({
    page,
  }) => {
    await page.clock.install();
    const cognito = await prepararCognito(page);
    await page.goto('/ingresar');
    await ingresar(page, ASESOR);
    await expect(page).toHaveURL('/asesor');

    await page.clock.runFor('14:59');
    await expect(page).toHaveURL('/asesor');
    await page.clock.runFor('00:02');

    await expect(page).toHaveURL('/ingresar?motivo=inactividad');
    await expect(page.getByRole('status')).toHaveText('Tu sesión se cerró por inactividad.');
    expect(cognito.operaciones()).toContain('RevokeToken');
  });

  test('una cuenta sin confirmar recibe un código nuevo, lo confirma y termina su registro (D32)', async ({
    page,
  }) => {
    const cognito = await prepararCognito(page);
    cognito.agregar('nueva@correo.com', 'sinConfirmar');
    const cuerpos: unknown[] = [];
    await page.route(`${API}/v1/cuenta`, async (route: Route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS });
        return;
      }
      cuerpos.push(route.request().postDataJSON());
      cognito.registrarCliente('nueva@correo.com', {
        name: 'Ana Ruiz',
        'custom:cliente_id': CLIENTE_ID,
        'custom:doc_enmascarado': 'CC ••••1111',
      });
      await route.fulfill({
        status: 201,
        headers: CORS,
        json: { clienteId: CLIENTE_ID, registro: 'CREADO' },
      });
    });
    await page.goto('/ingresar');

    await ingresar(page, 'nueva@correo.com');

    await expect(page).toHaveURL('/crear-cuenta');
    await expect(page.getByRole('heading', { name: 'Confirma tu correo' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(
      'Tu correo aún no está confirmado. Te enviamos un código nuevo.',
    );
    await expect(page.getByText('nueva@correo.com')).toBeVisible();
    expect(cognito.operaciones()).toContain('ResendConfirmationCode');

    await page.getByLabel('Código').fill(cognito.codigo);
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
    await expect(page.getByLabel('Correo')).toHaveValue('nueva@correo.com');
    await expect(page.getByLabel('Correo')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Contraseña')).toHaveCount(0);
    await page.getByLabel('Documento de identidad').fill('10203040');
    await page.getByLabel('Nombres').fill('Ana');
    await page.getByLabel('Apellidos').fill('Ruiz');
    await page.getByLabel('Celular').fill('3001112233');
    await page.getByRole('button', { name: 'Terminar registro' }).click();

    await expect(page).toHaveURL('/cliente');
    await expect(page.getByRole('main')).toContainText('Hola de nuevo, Ana Ruiz.');
    expect(cuerpos).toEqual([
      {
        documento: { tipo: 'CC', numero: '10203040' },
        nombre: { nombres: 'Ana', apellidos: 'Ruiz' },
        celular: '3001112233',
      },
    ]);
  });
});

test.describe('ingreso con Cognito en inglés', () => {
  test.beforeEach(async ({ page }) => {
    await preferirIngles(page);
  });

  test('the advisor signs in to their portal', async ({ page }) => {
    await prepararCognito(page);

    await page.goto('/ingresar');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await ingresar(page, ASESOR, INGLES);

    await expect(page).toHaveURL('/asesor');
    await expect(page.getByRole('main')).toContainText('Welcome back, Laura Gómez.');
    await expect(page.getByText('Sales advisor')).toBeVisible();
  });

  test('the customer signs in to their portal', async ({ page }) => {
    await prepararCognito(page);

    await page.goto('/ingresar');
    await expect(page.getByRole('link', { name: 'Sign up as a customer' })).toBeVisible();
    await ingresar(page, CLIENTE, INGLES);

    await expect(page).toHaveURL('/cliente');
    await expect(page.getByText('Customer', { exact: true })).toBeVisible();
  });

  test('the generic message and the lockout notice', async ({ page }) => {
    await prepararCognito(page);
    await page.goto('/ingresar');

    await ingresar(page, 'errada@correo.com', INGLES);
    await expect(page.getByText('The email or password is incorrect.')).toBeVisible();

    await ingresar(page, 'bloqueada@correo.com', INGLES);
    await expect(
      page.getByText('Too many attempts. Wait a few minutes and try again.'),
    ).toBeVisible();
  });
});
