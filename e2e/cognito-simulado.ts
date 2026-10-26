import { Page, Route } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';

// Cognito simulado para los E2E de ingreso y crear cuenta (SOLVENTAG5-207, parte 5). Responde en
// https://cognito-idp.us-east-1.amazonaws.com/ lo que Amplify v6 le pide al user pool, con el
// intercambio SRP completo: InitiateAuth da el reto PASSWORD_VERIFIER y Amplify calcula la firma
// en el navegador. El simulador no puede verificar esa firma (la contraseña no sale del
// navegador): el resultado del ingreso lo decide el `resultado` de cada usuario.

export const COGNITO = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_E2EPrueba',
  clienteId: 'cliente-portal-e2e',
};
export const API = 'http://localhost:8010';
export const CLAVE_IDIOMA = 'solventa.idioma';

const URL_COGNITO = 'https://cognito-idp.us-east-1.amazonaws.com/';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': '*',
};

/** Lo que responde Cognito al ingresar con ese correo. */
export type Resultado = 'ok' | 'credenciales' | 'bloqueo' | 'sinConfirmar';

export interface UsuarioCognito {
  sub: string;
  correo: string;
  resultado: Resultado;
  /** Claims del ID token además de los de Cognito (`name`, `cognito:groups`, `custom:…`). */
  claims: Record<string, unknown>;
}

export interface LlamadaCognito {
  operacion: string;
  cuerpo: Record<string, unknown>;
  texto: string;
}

function base64url(datos: object): string {
  return Buffer.from(JSON.stringify(datos)).toString('base64url');
}

/** Un JWT sin firma válida: Amplify solo lo decodifica, la firma la valida el BFF. */
function jwt(payload: Record<string, unknown>): string {
  return `${base64url({ alg: 'RS256', kid: 'e2e' })}.${base64url(payload)}.${randomBytes(16).toString('base64url')}`;
}

export class CognitoSimulado {
  readonly llamadas: LlamadaCognito[] = [];
  /** El código que Cognito «envía» al correo. */
  codigo = '123456';
  private readonly usuarios = new Map<string, UsuarioCognito>();

  /** Un usuario del user pool. Con `grupo`, el rol del portal (D2). */
  agregar(correo: string, resultado: Resultado, claims: Record<string, unknown> = {}): void {
    this.usuarios.set(correo.toLowerCase(), { sub: randomUUID(), correo, resultado, claims });
  }

  /** Lo que hace el BFF en `POST /v1/cuenta` (D21): el grupo CLIENTE y los atributos. */
  registrarCliente(correo: string, claims: Record<string, unknown>): void {
    const usuario = this.usuario(correo);
    usuario.claims = { ...usuario.claims, 'cognito:groups': ['CLIENTE'], ...claims };
  }

  operaciones(): string[] {
    return this.llamadas.map((llamada) => llamada.operacion);
  }

  async instalar(page: Page): Promise<void> {
    await page.route('**/config.json', (route) =>
      route.fulfill({ json: { apiBaseUrl: API, cognito: COGNITO } }),
    );
    await page.route(URL_COGNITO, (route) => this.responder(route));
  }

  private usuario(correo: string): UsuarioCognito {
    const usuario = this.usuarios.get(correo.toLowerCase());
    if (!usuario) {
      throw new Error(`El usuario ${correo} no está en el Cognito simulado`);
    }
    return usuario;
  }

  private porSub(sub: string): UsuarioCognito | undefined {
    return [...this.usuarios.values()].find((usuario) => usuario.sub === sub);
  }

  private async responder(route: Route): Promise<void> {
    const peticion = route.request();
    if (peticion.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const operacion = (peticion.headers()['x-amz-target'] ?? '').split('.').pop() ?? '';
    const texto = peticion.postData() ?? '{}';
    const cuerpo = JSON.parse(texto) as Record<string, unknown>;
    this.llamadas.push({ operacion, cuerpo, texto });
    const [estado, respuesta] = this.atender(operacion, cuerpo);
    await route.fulfill({
      status: estado,
      headers: { ...CORS, 'content-type': 'application/x-amz-json-1.1' },
      body: JSON.stringify(respuesta),
    });
  }

  private atender(operacion: string, cuerpo: Record<string, unknown>): [number, object] {
    const parametros = (cuerpo['AuthParameters'] ?? cuerpo['ChallengeResponses'] ?? {}) as Record<
      string,
      string
    >;
    switch (operacion) {
      case 'InitiateAuth':
        return this.iniciar(parametros['USERNAME']);
      case 'RespondToAuthChallenge':
        return this.verificar(parametros['USERNAME']);
      case 'GetTokensFromRefreshToken':
        return this.renovar(String(cuerpo['RefreshToken']));
      case 'RevokeToken':
        return [200, {}];
      case 'SignUp':
        return this.registrar(String(cuerpo['Username']));
      case 'ConfirmSignUp':
        return this.confirmar(String(cuerpo['Username']), String(cuerpo['ConfirmationCode']));
      case 'ResendConfirmationCode':
        return [200, { CodeDeliveryDetails: this.entrega(String(cuerpo['Username'])) }];
      default:
        return error('InvalidParameterException', `Operación no simulada: ${operacion}`);
    }
  }

  /** Paso 1 de SRP: el reto PASSWORD_VERIFIER con B, la sal y el bloque secreto. */
  private iniciar(correo: string): [number, object] {
    const usuario = this.usuarios.get(correo.toLowerCase());
    // Con prevent_user_existence_errors, un correo que no existe también recibe el reto.
    const sub = usuario?.sub ?? randomUUID();
    return [
      200,
      {
        ChallengeName: 'PASSWORD_VERIFIER',
        ChallengeParameters: {
          SALT: randomBytes(16).toString('hex'),
          SECRET_BLOCK: randomBytes(64).toString('base64'),
          SRP_B: `f${randomBytes(383).toString('hex')}`,
          USERNAME: sub,
          USER_ID_FOR_SRP: sub,
        },
      },
    ];
  }

  /** Paso 2 de SRP: Cognito verificaría la firma; aquí decide el resultado del usuario. */
  private verificar(sub: string): [number, object] {
    const usuario = this.porSub(sub);
    switch (usuario?.resultado) {
      case 'ok':
        return [200, { AuthenticationResult: this.tokens(usuario), ChallengeParameters: {} }];
      case 'bloqueo':
        return error('NotAuthorizedException', 'Password attempts exceeded');
      case 'sinConfirmar':
        return error('UserNotConfirmedException', 'User is not confirmed.');
      default:
        return error('NotAuthorizedException', 'Incorrect username or password.');
    }
  }

  private renovar(refresco: string): [number, object] {
    const usuario = this.porSub(refresco.split('.')[0]);
    if (!usuario) {
      return error('NotAuthorizedException', 'Invalid Refresh Token');
    }
    const { RefreshToken: _refresco, ...tokens } = this.tokens(usuario);
    return [200, { AuthenticationResult: tokens }];
  }

  private registrar(correo: string): [number, object] {
    if (this.usuarios.has(correo.toLowerCase())) {
      return error('UsernameExistsException', 'An account with the given email already exists.');
    }
    this.agregar(correo, 'sinConfirmar');
    return [
      200,
      {
        UserConfirmed: false,
        UserSub: this.usuario(correo).sub,
        CodeDeliveryDetails: this.entrega(correo),
      },
    ];
  }

  private confirmar(correo: string, codigo: string): [number, object] {
    if (codigo !== this.codigo) {
      return error(
        'CodeMismatchException',
        'Invalid verification code provided, please try again.',
      );
    }
    this.usuario(correo).resultado = 'ok';
    return [200, {}];
  }

  private entrega(correo: string): object {
    return { AttributeName: 'email', DeliveryMedium: 'EMAIL', Destination: `${correo[0]}***` };
  }

  private tokens(usuario: UsuarioCognito) {
    const ahora = Math.floor(Date.now() / 1000);
    const comunes = {
      sub: usuario.sub,
      iss: `https://cognito-idp.${COGNITO.region}.amazonaws.com/${COGNITO.userPoolId}`,
      iat: ahora,
      auth_time: ahora,
      exp: ahora + 15 * 60,
    };
    return {
      IdToken: jwt({
        ...comunes,
        aud: COGNITO.clienteId,
        token_use: 'id',
        email: usuario.correo,
        email_verified: true,
        ...usuario.claims,
      }),
      AccessToken: jwt({
        ...comunes,
        client_id: COGNITO.clienteId,
        token_use: 'access',
        username: usuario.sub,
        jti: randomUUID(),
        // Con origin_jti el token es revocable: «Cerrar sesión» llama a RevokeToken (R10).
        origin_jti: randomUUID(),
      }),
      // El sub va en el token de refresco para saber a quién renovar.
      RefreshToken: `${usuario.sub}.${randomBytes(16).toString('hex')}`,
      ExpiresIn: 900,
      TokenType: 'Bearer',
    };
  }
}

function error(tipo: string, mensaje: string): [number, object] {
  return [400, { __type: tipo, message: mensaje }];
}

/** Guarda la preferencia de inglés antes de abrir la página, solo si todavía no hay una. */
export async function preferirIngles(page: Page): Promise<void> {
  await page.addInitScript((clave) => {
    if (!localStorage.getItem(clave)) {
      localStorage.setItem(clave, 'en-US');
    }
  }, CLAVE_IDIOMA);
}
