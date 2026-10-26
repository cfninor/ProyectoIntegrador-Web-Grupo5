import { InjectionToken } from '@angular/core';

/** Perfiles del portal: un solo inicio de sesión lleva a cada uno a su portal. */
export const ROLES = ['ASESOR', 'CLIENTE', 'ANALISTA_RIESGO', 'OPERACIONES', 'SOCIO'] as const;

export type Rol = (typeof ROLES)[number];

export interface Usuario {
  id: string;
  nombre: string;
}

export interface Sesion {
  usuario: Usuario;
  rol: Rol;
  /** Solo para el rol CLIENTE: el id del cliente registrado. */
  clienteId?: string;
  /** Solo para el rol CLIENTE: su documento enmascarado, por ejemplo `CC ••••5678`. */
  documentoEnmascarado?: string;
}

/** Por qué se cerró la sesión sin que el usuario lo pidiera (R9 de la SOLVENTAG5-207). */
export type MotivoCierre = 'inactividad' | 'expirada';

/**
 * Errores del ingreso, uno por mensaje de R9. `SIN_CONFIRMAR` es una cuenta creada sin confirmar
 * el correo (D32): el portal pidió un código nuevo y lleva al paso «Código» de crear cuenta.
 */
export type ErrorIngreso =
  'CREDENCIALES' | 'BLOQUEO' | 'SIN_CONEXION' | 'SIN_PORTAL' | 'SIN_CONFIRMAR';

/**
 * Resultado de ingresar: la sesión de un portal, la cuenta de un cliente que todavía no termina su
 * registro (sin grupo, R2) o el error.
 */
export type ResultadoIngreso =
  | { tipo: 'sesion'; sesion: Sesion }
  | { tipo: 'sinRegistrar'; correo: string }
  | { tipo: 'error'; error: ErrorIngreso };

/** Errores de crear cuenta, uno por mensaje de R13, más `NO_DISPONIBLE` sin Cognito. */
export type ErrorCuenta =
  | 'CORREO_EXISTE'
  | 'CONTRASENA_INVALIDA'
  | 'CODIGO_ERRADO'
  | 'CODIGO_VENCIDO'
  | 'DEMASIADOS_INTENTOS'
  | 'CUENTA_NO_ENLAZABLE'
  | 'VALIDACION'
  | 'SIN_CONEXION'
  | 'NO_DISPONIBLE';

/** Un campo que el BFF rechazó (422), con la forma de FastAPI: `loc` lleva la ruta del campo. */
export interface DetalleValidacion {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export type ResultadoCuenta =
  { tipo: 'ok' } | { tipo: 'error'; error: ErrorCuenta; detalle?: DetalleValidacion[] };

export type ResultadoRegistro =
  | { tipo: 'sesion'; sesion: Sesion }
  | { tipo: 'error'; error: ErrorCuenta; detalle?: DetalleValidacion[] };

export type TipoDocumento = 'CC' | 'CE' | 'PA' | 'PPT';

/** Cuerpo de `registrarCuentaCliente` (`POST /v1/cuenta`): el correo sale del token. */
export interface DatosCuenta {
  documento: { tipo: TipoDocumento; numero: string };
  nombre: { nombres: string; apellidos: string };
  celular: string;
}

/**
 * La sesión del portal (D11 de la SOLVENTAG5-132 y D4 de la SOLVENTAG5-207). La implementación
 * se elige por `config.json`: Cognito si trae `cognito`, si no la simulada. Las pantallas, las
 * rutas y el menú solo usan esta interfaz.
 */
export interface ServicioSesion {
  /** La sesión actual, o null si no hay. Una cuenta sin registrar no tiene sesión. */
  actual(): Sesion | null;
  /** Restaura la sesión guardada al arrancar la aplicación, después de cargar `config.json`. */
  restaurar(): Promise<void>;
  iniciar(correo: string, contrasena: string): Promise<ResultadoIngreso>;
  /** Cierra la sesión: revoca el token de refresco y borra los tokens. */
  cerrar(motivo?: MotivoCierre): Promise<void>;
  /** El ID token vigente, renovado si hace falta, o null. */
  token(): Promise<string | null>;
  /** El correo de la cuenta de un cliente sin registrar (R2), o null. */
  cuentaSinRegistrar(): string | null;
  /**
   * El correo de una cuenta creada en esta pestaña que falta confirmar con el código, al registrarla
   * o al ingresar con ella (D32), o null. Sus credenciales quedan en memoria para ingresar al
   * confirmar.
   */
  correoPorConfirmar(): string | null;
  /** Si el portal puede crear cuentas de cliente: solo con Cognito. */
  puedeCrearCuenta(): boolean;
  /** Crea la cuenta en Cognito, que envía un código al correo (D21). */
  registrar(correo: string, contrasena: string): Promise<ResultadoCuenta>;
  /** Confirma el correo con el código e ingresa con las credenciales que tiene en memoria. */
  confirmar(correo: string, codigo: string): Promise<ResultadoCuenta>;
  reenviarCodigo(correo: string): Promise<ResultadoCuenta>;
  /** Envía los datos a `POST /v1/cuenta`, renueva los tokens y deja la sesión del cliente. */
  completarRegistro(datos: DatosCuenta): Promise<ResultadoRegistro>;
}

export const SERVICIO_SESION = new InjectionToken<ServicioSesion>('SERVICIO_SESION');

export function esRol(valor: unknown): valor is Rol {
  return (ROLES as readonly unknown[]).includes(valor);
}
