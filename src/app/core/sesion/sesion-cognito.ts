import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import {
  DatosCuenta,
  DetalleValidacion,
  ErrorCuenta,
  ErrorIngreso,
  ResultadoCuenta,
  ResultadoIngreso,
  ResultadoRegistro,
  ServicioSesion,
  Sesion,
  esRol,
} from './sesion';

type Amplify = typeof import('./amplify');

/** Claims del ID token de Cognito que lee el portal («Modelo de datos» de la SOLVENTAG5-207). */
type Claims = Record<string, unknown>;

/**
 * La sesión, la cuenta sin registrar o el error `SIN_PORTAL` que corresponde a los claims del ID
 * token (R2): exactamente un grupo que sea un rol, y CLIENTE con `custom:cliente_id`. Sin ningún
 * grupo y con el correo verificado, es un cliente que no ha terminado su registro.
 */
export function sesionDesdeClaims(claims: Claims): ResultadoIngreso {
  const grupos = claims['cognito:groups'] ?? [];
  const correo = typeof claims['email'] === 'string' ? claims['email'] : '';
  const verificado = claims['email_verified'] === true || claims['email_verified'] === 'true';
  if (Array.isArray(grupos) && grupos.length === 0 && correo && verificado) {
    return { tipo: 'sinRegistrar', correo };
  }
  const [rol] = Array.isArray(grupos) ? grupos : [];
  const clienteId = texto(claims['custom:cliente_id']);
  if (!Array.isArray(grupos) || grupos.length !== 1 || !esRol(rol)) {
    return { tipo: 'error', error: 'SIN_PORTAL' };
  }
  if (rol === 'CLIENTE' && !clienteId) {
    return { tipo: 'error', error: 'SIN_PORTAL' };
  }
  const sesion: Sesion = {
    usuario: { id: String(claims['sub']), nombre: texto(claims['name']) ?? correo },
    rol,
  };
  if (rol === 'CLIENTE') {
    sesion.clienteId = clienteId;
    const documento = texto(claims['custom:doc_enmascarado']);
    if (documento) {
      sesion.documentoEnmascarado = documento;
    }
  }
  return { tipo: 'sesion', sesion };
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() ? valor : undefined;
}

function nombreError(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

/** R9: Cognito no dice si el usuario existe (`prevent_user_existence_errors`). */
export function errorIngreso(error: unknown): ErrorIngreso {
  const nombre = nombreError(error);
  if (nombre === 'NotAuthorizedException' && /attempts exceeded/i.test((error as Error).message)) {
    return 'BLOQUEO';
  }
  if (nombre === 'LimitExceededException' || nombre === 'TooManyRequestsException') {
    return 'BLOQUEO';
  }
  if (
    [
      'NotAuthorizedException',
      'UserNotFoundException',
      'UserNotConfirmedException',
      'PasswordResetRequiredException',
    ].includes(nombre)
  ) {
    return 'CREDENCIALES';
  }
  return 'SIN_CONEXION';
}

const ERRORES_CUENTA: Record<string, ErrorCuenta> = {
  UsernameExistsException: 'CORREO_EXISTE',
  InvalidPasswordException: 'CONTRASENA_INVALIDA',
  CodeMismatchException: 'CODIGO_ERRADO',
  ExpiredCodeException: 'CODIGO_VENCIDO',
  LimitExceededException: 'DEMASIADOS_INTENTOS',
  TooManyRequestsException: 'DEMASIADOS_INTENTOS',
  TooManyFailedAttemptsException: 'DEMASIADOS_INTENTOS',
};

/** R13: los errores de Cognito al registrar, confirmar o reenviar el código. */
export function errorCuenta(error: unknown): ResultadoCuenta {
  return { tipo: 'error', error: ERRORES_CUENTA[nombreError(error)] ?? 'SIN_CONEXION' };
}

/** R13: las respuestas del BFF en `POST /v1/cuenta`. */
function errorRegistro(error: unknown): ResultadoRegistro {
  if (error instanceof HttpErrorResponse && error.status === 409) {
    return { tipo: 'error', error: 'CUENTA_NO_ENLAZABLE' };
  }
  if (error instanceof HttpErrorResponse && error.status === 422) {
    const detalle = (error.error as { detail?: DetalleValidacion[] } | null)?.detail;
    return { tipo: 'error', error: 'VALIDACION', detalle: Array.isArray(detalle) ? detalle : [] };
  }
  return { tipo: 'error', error: 'SIN_CONEXION' };
}

interface Credenciales {
  correo: string;
  contrasena: string;
}

/**
 * Sesión con el user pool de Cognito del ambiente (SOLVENTAG5-207, D4 y D21), con Amplify v6:
 * SRP, tokens en `sessionStorage` y renovación con el token de refresco. Amplify se carga la
 * primera vez que se usa.
 */
@Injectable()
export class SesionCognito implements ServicioSesion {
  private readonly config = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);

  private amplify?: Promise<Amplify>;
  private sesion: Sesion | null = null;
  private sinRegistrar: string | null = null;
  /** Solo entre `registrar` y `confirmar`, para ingresar sin depender de `autoSignIn`. */
  private credenciales: Credenciales | null = null;

  actual(): Sesion | null {
    return this.sesion;
  }

  cuentaSinRegistrar(): string | null {
    return this.sinRegistrar;
  }

  puedeCrearCuenta(): boolean {
    return true;
  }

  /** La sesión que dejó Amplify en `sessionStorage`, si sigue vigente o se puede renovar. */
  async restaurar(): Promise<void> {
    try {
      const resultado = await this.leerSesion(await this.cargar(), false);
      // Sin tokens no hay nada que cerrar; un usuario sin portal (R2) no se queda con los suyos.
      if (resultado.tipo === 'error' && resultado.error === 'SIN_PORTAL') {
        await this.cerrar();
      }
    } catch {
      this.olvidar();
    }
  }

  async iniciar(correo: string, contrasena: string): Promise<ResultadoIngreso> {
    try {
      return await this.ingresar(await this.cargar(), correo, contrasena);
    } catch (error) {
      return { tipo: 'error', error: errorIngreso(error) };
    }
  }

  async cerrar(): Promise<void> {
    this.olvidar();
    try {
      // Revoca el token de refresco en Cognito y borra los tokens de sessionStorage.
      await (await this.cargar()).signOut();
    } catch {
      // Sin conexión los tokens igual se dejan de usar: el portal ya no tiene sesión.
    }
  }

  async token(): Promise<string | null> {
    if (!this.sesion && !this.sinRegistrar) {
      return null;
    }
    try {
      const { tokens } = await (await this.cargar()).fetchAuthSession();
      return tokens?.idToken?.toString() ?? null;
    } catch {
      return null;
    }
  }

  async registrar(correo: string, contrasena: string): Promise<ResultadoCuenta> {
    try {
      await (
        await this.cargar()
      ).signUp({
        username: correo,
        password: contrasena,
        options: { userAttributes: { email: correo } },
      });
      this.credenciales = { correo, contrasena };
      return { tipo: 'ok' };
    } catch (error) {
      return errorCuenta(error);
    }
  }

  /**
   * Confirma el correo e ingresa con las credenciales de `registrar`, que se borran al terminar.
   * Si no las tiene (por ejemplo, se recargó la página), solo confirma: el cliente ingresa después.
   */
  async confirmar(correo: string, codigo: string): Promise<ResultadoCuenta> {
    try {
      const amplify = await this.cargar();
      await amplify.confirmSignUp({ username: correo, confirmationCode: codigo });
      const credenciales = this.credenciales;
      this.credenciales = null;
      if (credenciales?.correo === correo) {
        const ingreso = await this.ingresar(amplify, correo, credenciales.contrasena);
        if (ingreso.tipo === 'error') {
          return { tipo: 'error', error: 'SIN_CONEXION' };
        }
      }
      return { tipo: 'ok' };
    } catch (error) {
      return errorCuenta(error);
    }
  }

  async reenviarCodigo(correo: string): Promise<ResultadoCuenta> {
    try {
      await (await this.cargar()).resendSignUpCode({ username: correo });
      return { tipo: 'ok' };
    } catch (error) {
      return errorCuenta(error);
    }
  }

  /**
   * `POST /v1/cuenta` con el token de la cuenta (lo agrega el interceptor), y después renueva los
   * tokens para tomar el grupo CLIENTE y los atributos que escribió el BFF (D21).
   */
  async completarRegistro(datos: DatosCuenta): Promise<ResultadoRegistro> {
    if (!this.sinRegistrar && !this.sesion) {
      return { tipo: 'error', error: 'NO_DISPONIBLE' };
    }
    try {
      await firstValueFrom(this.http.post(`${this.config.apiBaseUrl}/v1/cuenta`, datos));
    } catch (error) {
      return errorRegistro(error);
    }
    try {
      const resultado = await this.leerSesion(await this.cargar(), true);
      return resultado.tipo === 'sesion' ? resultado : { tipo: 'error', error: 'SIN_CONEXION' };
    } catch {
      return { tipo: 'error', error: 'SIN_CONEXION' };
    }
  }

  private cargar(): Promise<Amplify> {
    const cognito = this.config.cognito;
    this.amplify ??= import('./amplify').then((amplify) => {
      if (cognito) {
        amplify.configurar(cognito);
      }
      return amplify;
    });
    return this.amplify;
  }

  private async ingresar(
    amplify: Amplify,
    correo: string,
    contrasena: string,
  ): Promise<ResultadoIngreso> {
    const credenciales = { username: correo, password: contrasena };
    let salida: Awaited<ReturnType<Amplify['signIn']>>;
    try {
      salida = await amplify.signIn(credenciales);
    } catch (error) {
      if (nombreError(error) !== 'UserAlreadyAuthenticatedException') {
        throw error;
      }
      // Quedó otra sesión de Amplify en la pestaña: se cierra y se ingresa con las nuevas.
      await amplify.signOut();
      salida = await amplify.signIn(credenciales);
    }
    if (!salida.isSignedIn) {
      // Un paso que el portal no maneja (por ejemplo, confirmar el registro): no hay sesión.
      return { tipo: 'error', error: 'CREDENCIALES' };
    }
    const resultado = await this.leerSesion(amplify, false);
    if (resultado.tipo === 'error') {
      await this.cerrar();
    }
    return resultado;
  }

  /** Lee el ID token (renovado si `forzar`) y deja la sesión o la cuenta sin registrar. */
  private async leerSesion(amplify: Amplify, forzar: boolean): Promise<ResultadoIngreso> {
    const { tokens } = await amplify.fetchAuthSession({ forceRefresh: forzar });
    const claims = tokens?.idToken?.payload;
    this.olvidar();
    if (!claims) {
      return { tipo: 'error', error: 'SIN_CONEXION' };
    }
    const resultado = sesionDesdeClaims(claims);
    if (resultado.tipo === 'sesion') {
      this.sesion = resultado.sesion;
    } else if (resultado.tipo === 'sinRegistrar') {
      this.sinRegistrar = resultado.correo;
    }
    return resultado;
  }

  private olvidar(): void {
    this.sesion = null;
    this.sinRegistrar = null;
  }
}
