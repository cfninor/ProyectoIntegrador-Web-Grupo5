import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Amplify } from 'aws-amplify';
import * as auth from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { sessionStorage } from 'aws-amplify/utils';

import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DatosCuenta } from './sesion';
import { SesionCognito, errorIngreso, sesionDesdeClaims } from './sesion-cognito';

// Amplify v6 simulado: ninguna prueba llama a Cognito.
jest.mock('aws-amplify', () => ({ Amplify: { configure: jest.fn() } }));
jest.mock('aws-amplify/auth', () => ({
  confirmSignUp: jest.fn(),
  fetchAuthSession: jest.fn(),
  resendSignUpCode: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  signUp: jest.fn(),
}));
jest.mock('aws-amplify/auth/cognito', () => ({
  cognitoUserPoolsTokenProvider: { setKeyValueStorage: jest.fn() },
}));
jest.mock('aws-amplify/utils', () => ({ sessionStorage: { nombre: 'sessionStorage' } }));

const amplify = jest.mocked(auth);
const CONFIG: AppConfig = {
  apiBaseUrl: 'http://bff.prueba',
  cognito: { region: 'us-east-1', userPoolId: 'us-east-1_Prueba', clienteId: 'cliente-portal' },
};
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const DATOS: DatosCuenta = {
  documento: { tipo: 'CC', numero: '1020304050' },
  nombre: { nombres: 'María Fernanda', apellidos: 'López Rojas' },
  celular: '3001234567',
};

type Claims = Record<string, unknown>;

const ASESOR: Claims = {
  sub: 'sub-asesor',
  name: 'Laura Gómez',
  email: 'asesor@solventa.example',
  email_verified: true,
  'cognito:groups': ['ASESOR'],
};
const CLIENTE: Claims = {
  sub: 'sub-cliente',
  name: 'María Fernanda López Rojas',
  email: 'maria@correo.com',
  email_verified: true,
  'cognito:groups': ['CLIENTE'],
  'custom:cliente_id': CLIENTE_ID,
  'custom:doc_enmascarado': 'CC ••••4050',
};
const SIN_GRUPO: Claims = { sub: 'sub-nuevo', email: 'maria@correo.com', email_verified: true };

/** Lo que devuelve `fetchAuthSession` con un ID token de esos claims, o sin tokens. */
function conTokens(claims?: Claims) {
  const tokens = claims
    ? { idToken: { payload: claims, toString: () => `token-de-${String(claims['sub'])}` } }
    : undefined;
  return { tokens } as unknown as Awaited<ReturnType<typeof auth.fetchAuthSession>>;
}

/** Los claims sin la llave indicada. */
function sin(claims: Claims, llave: string): Claims {
  return Object.fromEntries(Object.entries(claims).filter(([clave]) => clave !== llave));
}

function errorDe(name: string, message = name): Error {
  return Object.assign(new Error(message), { name });
}

const INGRESADO = { isSignedIn: true, nextStep: { signInStep: 'DONE' } } as Awaited<
  ReturnType<typeof auth.signIn>
>;

function servicio(config: AppConfig = CONFIG) {
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: config },
      provideHttpClient(),
      provideHttpClientTesting(),
      SesionCognito,
    ],
  });
  return TestBed.inject(SesionCognito);
}

/** Responde la llamada a `POST /v1/cuenta` cuando llega. */
async function responderCuenta(cuerpo: object | null, estado = 201): Promise<void> {
  const http = TestBed.inject(HttpTestingController);
  await new Promise((resolver) => setTimeout(resolver));
  const peticion = http.expectOne('http://bff.prueba/v1/cuenta');
  expect(peticion.request.method).toBe('POST');
  expect(peticion.request.body).toEqual(DATOS);
  peticion.flush(cuerpo, { status: estado, statusText: 'x' });
}

beforeEach(() => {
  jest.resetAllMocks();
  amplify.signIn.mockResolvedValue(INGRESADO);
  amplify.fetchAuthSession.mockResolvedValue(conTokens(ASESOR));
});

describe('SesionCognito · Amplify', () => {
  it('configura el user pool del ambiente y guarda los tokens en sessionStorage', async () => {
    await servicio().restaurar();

    expect(Amplify.configure).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: 'us-east-1_Prueba',
          userPoolClientId: 'cliente-portal',
          loginWith: { email: true },
        },
      },
    });
    expect(cognitoUserPoolsTokenProvider.setKeyValueStorage).toHaveBeenCalledWith(sessionStorage);
  });

  it('configura Amplify una sola vez', async () => {
    const sesion = servicio();

    await sesion.restaurar();
    await sesion.iniciar('asesor@solventa.example', 'clave');
    await sesion.token();

    expect(Amplify.configure).toHaveBeenCalledTimes(1);
  });

  it('puede crear cuentas', () => {
    expect(servicio().puedeCrearCuenta()).toBe(true);
  });
});

describe('SesionCognito · restaurar al arrancar', () => {
  it('restaura la sesión que Amplify dejó en sessionStorage', async () => {
    const sesion = servicio();

    await sesion.restaurar();

    expect(amplify.fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: false });
    expect(sesion.actual()).toEqual({
      usuario: { id: 'sub-asesor', nombre: 'Laura Gómez' },
      rol: 'ASESOR',
    });
  });

  it('sin tokens no hay sesión y no se llama a signOut', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens());
    const sesion = servicio();

    await sesion.restaurar();

    expect(sesion.actual()).toBeNull();
    expect(amplify.signOut).not.toHaveBeenCalled();
  });

  it('un usuario sin portal (R2) no queda con sus tokens', async () => {
    amplify.fetchAuthSession.mockResolvedValue(
      conTokens({ ...ASESOR, 'cognito:groups': ['ADMIN'] }),
    );
    const sesion = servicio();

    await sesion.restaurar();

    expect(sesion.actual()).toBeNull();
    expect(amplify.signOut).toHaveBeenCalled();
  });

  it('restaura la cuenta de un cliente sin registrar', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();

    await sesion.restaurar();

    expect(sesion.actual()).toBeNull();
    expect(sesion.cuentaSinRegistrar()).toBe('maria@correo.com');
  });

  it('si Cognito no responde, arranca sin sesión', async () => {
    amplify.fetchAuthSession.mockRejectedValue(errorDe('NetworkError'));
    const sesion = servicio();

    await sesion.restaurar();

    expect(sesion.actual()).toBeNull();
    expect(sesion.cuentaSinRegistrar()).toBeNull();
  });
});

describe('SesionCognito · iniciar', () => {
  it('ingresa con SRP y arma la sesión del ID token', async () => {
    const resultado = await servicio().iniciar('asesor@solventa.example', 'Clave-Segura-1');

    expect(amplify.signIn).toHaveBeenCalledWith({
      username: 'asesor@solventa.example',
      password: 'Clave-Segura-1',
    });
    expect(resultado).toEqual({
      tipo: 'sesion',
      sesion: { usuario: { id: 'sub-asesor', nombre: 'Laura Gómez' }, rol: 'ASESOR' },
    });
  });

  it('arma la sesión del cliente con su clienteId y su documento enmascarado', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(CLIENTE));
    const sesion = servicio();

    await sesion.iniciar('maria@correo.com', 'clave');

    expect(sesion.actual()).toEqual({
      usuario: { id: 'sub-cliente', nombre: 'María Fernanda López Rojas' },
      rol: 'CLIENTE',
      clienteId: CLIENTE_ID,
      documentoEnmascarado: 'CC ••••4050',
    });
  });

  it.each<[string, Error, string]>([
    [
      'correo o contraseña incorrectos',
      errorDe('NotAuthorizedException', 'Incorrect username or password.'),
      'CREDENCIALES',
    ],
    ['usuario que no existe', errorDe('UserNotFoundException'), 'CREDENCIALES'],
    ['cuenta sin confirmar', errorDe('UserNotConfirmedException'), 'CREDENCIALES'],
    [
      'bloqueo temporal',
      errorDe('NotAuthorizedException', 'Password attempts exceeded'),
      'BLOQUEO',
    ],
    ['demasiadas peticiones', errorDe('TooManyRequestsException'), 'BLOQUEO'],
    ['sin conexión', errorDe('NetworkError', 'Failed to fetch'), 'SIN_CONEXION'],
    ['error de Cognito', errorDe('InternalErrorException'), 'SIN_CONEXION'],
  ])('%s → %s (R9)', async (_caso, error, esperado) => {
    amplify.signIn.mockRejectedValue(error);
    const sesion = servicio();

    expect(await sesion.iniciar('a@b.co', 'clave')).toEqual({ tipo: 'error', error: esperado });
    expect(sesion.actual()).toBeNull();
  });

  it('si ya había una sesión de Amplify, la cierra e ingresa con las credenciales nuevas', async () => {
    amplify.signIn
      .mockRejectedValueOnce(errorDe('UserAlreadyAuthenticatedException'))
      .mockResolvedValueOnce(INGRESADO);

    const resultado = await servicio().iniciar('asesor@solventa.example', 'clave');

    expect(amplify.signOut).toHaveBeenCalledTimes(1);
    expect(amplify.signIn).toHaveBeenCalledTimes(2);
    expect(resultado.tipo).toBe('sesion');
  });

  it('un paso que el portal no maneja no da sesión', async () => {
    amplify.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_UP' },
    } as Awaited<ReturnType<typeof auth.signIn>>);
    const sesion = servicio();

    expect(await sesion.iniciar('a@b.co', 'clave')).toEqual({
      tipo: 'error',
      error: 'CREDENCIALES',
    });
    expect(sesion.actual()).toBeNull();
  });

  it('un usuario sin rol válido (R2) recibe SIN_PORTAL y su sesión se cierra', async () => {
    amplify.fetchAuthSession.mockResolvedValue(
      conTokens({ ...ASESOR, 'cognito:groups': ['ASESOR', 'SOCIO'] }),
    );
    const sesion = servicio();

    expect(await sesion.iniciar('a@b.co', 'clave')).toEqual({ tipo: 'error', error: 'SIN_PORTAL' });
    expect(amplify.signOut).toHaveBeenCalled();
    expect(sesion.actual()).toBeNull();
  });

  it('sin el ID token después de ingresar no hay sesión', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens());

    expect(await servicio().iniciar('a@b.co', 'clave')).toEqual({
      tipo: 'error',
      error: 'SIN_CONEXION',
    });
  });

  it('una cuenta sin registrar que vuelve a ingresar queda como tal, sin sesión de portal', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();

    const resultado = await sesion.iniciar('maria@correo.com', 'clave');

    expect(resultado).toEqual({ tipo: 'sinRegistrar', correo: 'maria@correo.com' });
    expect(sesion.actual()).toBeNull();
    expect(sesion.cuentaSinRegistrar()).toBe('maria@correo.com');
    expect(amplify.signOut).not.toHaveBeenCalled();
  });
});

describe('SesionCognito · cerrar y token', () => {
  it('cerrar llama a signOut, que revoca el refresco, y quita la sesión', async () => {
    const sesion = servicio();
    await sesion.iniciar('asesor@solventa.example', 'clave');

    await sesion.cerrar('inactividad');

    expect(amplify.signOut).toHaveBeenCalledWith();
    expect(sesion.actual()).toBeNull();
  });

  it('sin conexión, cerrar igual quita la sesión', async () => {
    amplify.signOut.mockRejectedValue(errorDe('NetworkError'));
    const sesion = servicio();
    await sesion.iniciar('asesor@solventa.example', 'clave');

    await sesion.cerrar();

    expect(sesion.actual()).toBeNull();
  });

  it('token da el ID token vigente, que Amplify renueva si hace falta', async () => {
    const sesion = servicio();
    await sesion.iniciar('asesor@solventa.example', 'clave');
    amplify.fetchAuthSession.mockClear();

    expect(await sesion.token()).toBe('token-de-sub-asesor');
    expect(amplify.fetchAuthSession).toHaveBeenCalledWith();
  });

  it('token también sirve a la cuenta sin registrar, que llama a POST /v1/cuenta', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();
    await sesion.iniciar('maria@correo.com', 'clave');

    expect(await sesion.token()).toBe('token-de-sub-nuevo');
  });

  it('sin sesión, token es null y no llama a Amplify', async () => {
    expect(await servicio().token()).toBeNull();
    expect(amplify.fetchAuthSession).not.toHaveBeenCalled();
  });

  it('si no se puede renovar, token es null', async () => {
    const sesion = servicio();
    await sesion.iniciar('asesor@solventa.example', 'clave');
    amplify.fetchAuthSession.mockRejectedValue(errorDe('NotAuthorizedException'));

    expect(await sesion.token()).toBeNull();
  });
});

describe('SesionCognito · crear cuenta (D21)', () => {
  it('registra con el correo y la contraseña: Cognito envía el código', async () => {
    const resultado = await servicio().registrar('maria@correo.com', 'Clave-Segura-1');

    expect(amplify.signUp).toHaveBeenCalledWith({
      username: 'maria@correo.com',
      password: 'Clave-Segura-1',
      options: { userAttributes: { email: 'maria@correo.com' } },
    });
    expect(resultado).toEqual({ tipo: 'ok' });
  });

  it.each<[string, string]>([
    ['UsernameExistsException', 'CORREO_EXISTE'],
    ['InvalidPasswordException', 'CONTRASENA_INVALIDA'],
    ['LimitExceededException', 'DEMASIADOS_INTENTOS'],
    ['NetworkError', 'SIN_CONEXION'],
  ])('registrar con %s → %s (R13)', async (nombre, esperado) => {
    amplify.signUp.mockRejectedValue(errorDe(nombre));

    expect(await servicio().registrar('maria@correo.com', 'clave')).toEqual({
      tipo: 'error',
      error: esperado,
    });
  });

  it('confirmar ingresa con las credenciales de registrar, sin autoSignIn, y las borra', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();
    await sesion.registrar('maria@correo.com', 'Clave-Segura-1');

    const resultado = await sesion.confirmar('maria@correo.com', '123456');

    expect(amplify.confirmSignUp).toHaveBeenCalledWith({
      username: 'maria@correo.com',
      confirmationCode: '123456',
    });
    expect(amplify.signIn).toHaveBeenCalledWith({
      username: 'maria@correo.com',
      password: 'Clave-Segura-1',
    });
    expect(resultado).toEqual({ tipo: 'ok' });
    expect(sesion.cuentaSinRegistrar()).toBe('maria@correo.com');

    amplify.signIn.mockClear();
    await sesion.confirmar('maria@correo.com', '123456');
    expect(amplify.signIn).not.toHaveBeenCalled();
  });

  it('sin credenciales en memoria, confirmar solo confirma', async () => {
    const sesion = servicio();

    expect(await sesion.confirmar('maria@correo.com', '123456')).toEqual({ tipo: 'ok' });
    expect(amplify.signIn).not.toHaveBeenCalled();
    expect(sesion.cuentaSinRegistrar()).toBeNull();
  });

  it('con las credenciales de otro correo, confirmar no ingresa', async () => {
    const sesion = servicio();
    await sesion.registrar('otra@correo.com', 'clave');

    await sesion.confirmar('maria@correo.com', '123456');

    expect(amplify.signIn).not.toHaveBeenCalled();
  });

  it('si el ingreso después de confirmar falla, responde SIN_CONEXION', async () => {
    const sesion = servicio();
    await sesion.registrar('maria@correo.com', 'clave');
    amplify.signIn.mockRejectedValue(errorDe('NetworkError'));

    expect(await sesion.confirmar('maria@correo.com', '123456')).toEqual({
      tipo: 'error',
      error: 'SIN_CONEXION',
    });
  });

  it.each<[string, string]>([
    ['CodeMismatchException', 'CODIGO_ERRADO'],
    ['ExpiredCodeException', 'CODIGO_VENCIDO'],
    ['TooManyFailedAttemptsException', 'DEMASIADOS_INTENTOS'],
  ])('confirmar con %s → %s (R13)', async (nombre, esperado) => {
    amplify.confirmSignUp.mockRejectedValue(errorDe(nombre));

    expect(await servicio().confirmar('maria@correo.com', '000000')).toEqual({
      tipo: 'error',
      error: esperado,
    });
  });

  it('reenvía el código', async () => {
    expect(await servicio().reenviarCodigo('maria@correo.com')).toEqual({ tipo: 'ok' });
    expect(amplify.resendSignUpCode).toHaveBeenCalledWith({ username: 'maria@correo.com' });
  });

  it('reenviar con demasiados intentos → DEMASIADOS_INTENTOS', async () => {
    amplify.resendSignUpCode.mockRejectedValue(errorDe('LimitExceededException'));

    expect(await servicio().reenviarCodigo('maria@correo.com')).toEqual({
      tipo: 'error',
      error: 'DEMASIADOS_INTENTOS',
    });
  });

  it('completar envía los datos a POST /v1/cuenta, renueva los tokens y deja la sesión del cliente', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();
    await sesion.iniciar('maria@correo.com', 'clave');
    amplify.fetchAuthSession.mockResolvedValue(conTokens(CLIENTE));

    const completado = sesion.completarRegistro(DATOS);
    await responderCuenta({ clienteId: CLIENTE_ID, registro: 'CREADO' });
    const resultado = await completado;

    expect(amplify.fetchAuthSession).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(resultado).toEqual({ tipo: 'sesion', sesion: sesion.actual() });
    expect(sesion.actual()?.clienteId).toBe(CLIENTE_ID);
    expect(sesion.cuentaSinRegistrar()).toBeNull();
  });

  it('crear cuenta completo: registrar, confirmar, ingresar, completar y renovar', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();

    expect(await sesion.registrar('maria@correo.com', 'Clave-Segura-1')).toEqual({ tipo: 'ok' });
    expect(await sesion.confirmar('maria@correo.com', '123456')).toEqual({ tipo: 'ok' });
    expect(sesion.cuentaSinRegistrar()).toBe('maria@correo.com');
    amplify.fetchAuthSession.mockResolvedValue(conTokens(CLIENTE));
    const completado = sesion.completarRegistro(DATOS);
    await responderCuenta({ clienteId: CLIENTE_ID, registro: 'ENLAZADO' }, 200);

    expect((await completado).tipo).toBe('sesion');
    expect(sesion.actual()?.rol).toBe('CLIENTE');
  });

  it.each<[number, object | null, object]>([
    [409, { codigo: 'CUENTA_NO_ENLAZABLE', detalle: 'x' }, { error: 'CUENTA_NO_ENLAZABLE' }],
    [
      422,
      { detail: [{ loc: ['body', 'celular'], msg: 'String should match', type: 'x' }] },
      {
        error: 'VALIDACION',
        detalle: [{ loc: ['body', 'celular'], msg: 'String should match', type: 'x' }],
      },
    ],
    [422, null, { error: 'VALIDACION', detalle: [] }],
    [503, { codigo: 'IDENTIDAD_NO_DISPONIBLE', detalle: 'x' }, { error: 'SIN_CONEXION' }],
  ])('completar con %s del BFF → %j (R13)', async (estado, cuerpo, esperado) => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();
    await sesion.iniciar('maria@correo.com', 'clave');

    const completado = sesion.completarRegistro(DATOS);
    await responderCuenta(cuerpo, estado);

    expect(await completado).toEqual({ tipo: 'error', ...esperado });
    expect(sesion.cuentaSinRegistrar()).toBe('maria@correo.com');
  });

  it('completar sin conexión con el BFF → SIN_CONEXION', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();
    await sesion.iniciar('maria@correo.com', 'clave');

    const completado = sesion.completarRegistro(DATOS);
    await new Promise((resolver) => setTimeout(resolver));
    TestBed.inject(HttpTestingController)
      .expectOne('http://bff.prueba/v1/cuenta')
      .error(new ProgressEvent('error'));

    expect(await completado).toEqual({ tipo: 'error', error: 'SIN_CONEXION' });
  });

  it('si el token renovado todavía no trae el grupo, completar responde SIN_CONEXION', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();
    await sesion.iniciar('maria@correo.com', 'clave');

    const completado = sesion.completarRegistro(DATOS);
    await responderCuenta({ clienteId: CLIENTE_ID, registro: 'CREADO' });

    expect(await completado).toEqual({ tipo: 'error', error: 'SIN_CONEXION' });
  });

  it('si la renovación falla, completar responde SIN_CONEXION', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens(SIN_GRUPO));
    const sesion = servicio();
    await sesion.iniciar('maria@correo.com', 'clave');
    amplify.fetchAuthSession.mockRejectedValue(errorDe('NetworkError'));

    const completado = sesion.completarRegistro(DATOS);
    await responderCuenta({ clienteId: CLIENTE_ID, registro: 'CREADO' });

    expect(await completado).toEqual({ tipo: 'error', error: 'SIN_CONEXION' });
  });

  it('completar sin haber ingresado no está disponible y no llama al BFF', async () => {
    const sesion = servicio();

    expect(await sesion.completarRegistro(DATOS)).toEqual({
      tipo: 'error',
      error: 'NO_DISPONIBLE',
    });
    TestBed.inject(HttpTestingController).expectNone('http://bff.prueba/v1/cuenta');
  });
});

describe('sesionDesdeClaims (R2)', () => {
  it.each(['ASESOR', 'ANALISTA_RIESGO', 'OPERACIONES', 'SOCIO'])(
    'con el rol %s arma su sesión',
    (rol) => {
      expect(sesionDesdeClaims({ ...ASESOR, 'cognito:groups': [rol] })).toEqual({
        tipo: 'sesion',
        sesion: { usuario: { id: 'sub-asesor', nombre: 'Laura Gómez' }, rol },
      });
    },
  );

  it('sin name, el nombre es el correo', () => {
    expect(sesionDesdeClaims(sin(ASESOR, 'name'))).toMatchObject({
      sesion: { usuario: { nombre: 'asesor@solventa.example' } },
    });
  });

  it('el cliente sin documento enmascarado igual tiene sesión', () => {
    expect(sesionDesdeClaims(sin(CLIENTE, 'custom:doc_enmascarado'))).toEqual({
      tipo: 'sesion',
      sesion: {
        usuario: { id: 'sub-cliente', nombre: 'María Fernanda López Rojas' },
        rol: 'CLIENTE',
        clienteId: CLIENTE_ID,
      },
    });
  });

  it.each<[string, Claims]>([
    ['dos grupos', { ...ASESOR, 'cognito:groups': ['ASESOR', 'CLIENTE'] }],
    ['un grupo que no es rol', { ...ASESOR, 'cognito:groups': ['ADMIN'] }],
    ['grupos que no son una lista', { ...ASESOR, 'cognito:groups': 'ASESOR' }],
    ['CLIENTE sin custom:cliente_id', { ...CLIENTE, 'custom:cliente_id': undefined }],
    ['CLIENTE con custom:cliente_id vacío', { ...CLIENTE, 'custom:cliente_id': ' ' }],
    ['sin grupo y con el correo sin verificar', { ...SIN_GRUPO, email_verified: false }],
    ['sin grupo y sin correo', { sub: 'x', email_verified: true }],
  ])('%s → SIN_PORTAL', (_caso, claims) => {
    expect(sesionDesdeClaims(claims)).toEqual({ tipo: 'error', error: 'SIN_PORTAL' });
  });

  it.each([true, 'true'])('sin grupo y con email_verified %p es una cuenta sin registrar', (v) => {
    expect(sesionDesdeClaims({ ...SIN_GRUPO, email_verified: v })).toEqual({
      tipo: 'sinRegistrar',
      correo: 'maria@correo.com',
    });
  });

  it('cognito:groups vacío también es una cuenta sin registrar', () => {
    expect(sesionDesdeClaims({ ...SIN_GRUPO, 'cognito:groups': [] }).tipo).toBe('sinRegistrar');
  });
});

describe('errorIngreso', () => {
  it('algo que no es un error de Cognito es SIN_CONEXION', () => {
    expect(errorIngreso('falló')).toBe('SIN_CONEXION');
  });
});

describe('SesionCognito · bordes', () => {
  it('sin cognito en config.json no configura Amplify', async () => {
    await servicio({ apiBaseUrl: '' }).restaurar();

    expect(Amplify.configure).not.toHaveBeenCalled();
  });

  it('si Amplify no tiene ID token, token es null', async () => {
    const sesion = servicio();
    await sesion.iniciar('asesor@solventa.example', 'clave');
    amplify.fetchAuthSession.mockResolvedValue(conTokens());

    expect(await sesion.token()).toBeNull();
  });

  it('si después de confirmar la cuenta no tiene portal, confirmar responde SIN_CONEXION', async () => {
    amplify.fetchAuthSession.mockResolvedValue(conTokens({ ...SIN_GRUPO, email_verified: false }));
    const sesion = servicio();
    await sesion.registrar('maria@correo.com', 'clave');

    expect(await sesion.confirmar('maria@correo.com', '123456')).toEqual({
      tipo: 'error',
      error: 'SIN_CONEXION',
    });
    expect(amplify.signOut).toHaveBeenCalled();
  });
});
