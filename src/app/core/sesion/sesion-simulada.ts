import { Injectable, Provider, inject } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import {
  ResultadoCuenta,
  ResultadoIngreso,
  ResultadoRegistro,
  SERVICIO_SESION,
  ServicioSesion,
  Sesion,
  esRol,
} from './sesion';

const NO_DISPONIBLE = { tipo: 'error', error: 'NO_DISPONIBLE' } as const;

/**
 * Sesión simulada (D11 de la SOLVENTAG5-132): la lee de `sesionSimulada` en `config.json`, que
 * solo trae el ambiente local (D9 de la SOLVENTAG5-207). Lee la configuración en cada consulta
 * porque `config.json` se carga al iniciar la aplicación.
 *
 * Sin `sesionSimulada` es la sesión vacía: nunca hay sesión e ingresar responde `SIN_CONEXION`.
 * Crear cuenta no está disponible sin Cognito.
 */
@Injectable()
export class SesionSimulada implements ServicioSesion {
  private readonly config = inject(APP_CONFIG);
  /** «Cerrar sesión» la quita hasta que se recargue la página o se vuelva a ingresar. */
  private cerrada = false;

  actual(): Sesion | null {
    return this.cerrada ? null : this.deConfig();
  }

  restaurar(): Promise<void> {
    // Nada que restaurar: la sesión sale de config.json en cada consulta.
    return Promise.resolve();
  }

  /** Con cualquier credencial: el ambiente local no tiene usuarios. */
  iniciar(): Promise<ResultadoIngreso> {
    const sesion = this.deConfig();
    if (!sesion) {
      return Promise.resolve({ tipo: 'error', error: 'SIN_CONEXION' });
    }
    this.cerrada = false;
    return Promise.resolve({ tipo: 'sesion', sesion });
  }

  cerrar(): Promise<void> {
    this.cerrada = true;
    return Promise.resolve();
  }

  /** Sin tokens: el BFF local atiende con su propio usuario simulado (R7). */
  token(): Promise<string | null> {
    return Promise.resolve(null);
  }

  cuentaSinRegistrar(): string | null {
    return null;
  }

  correoPorConfirmar(): string | null {
    return null;
  }

  puedeCrearCuenta(): boolean {
    return false;
  }

  registrar(): Promise<ResultadoCuenta> {
    return Promise.resolve(NO_DISPONIBLE);
  }

  confirmar(): Promise<ResultadoCuenta> {
    return Promise.resolve(NO_DISPONIBLE);
  }

  reenviarCodigo(): Promise<ResultadoCuenta> {
    return Promise.resolve(NO_DISPONIBLE);
  }

  completarRegistro(): Promise<ResultadoRegistro> {
    return Promise.resolve(NO_DISPONIBLE);
  }

  private deConfig(): Sesion | null {
    const sesion = this.config.sesionSimulada;
    // Un rol que el portal no conoce no abre ningún portal: es como no tener sesión.
    return sesion && esRol(sesion.rol) ? sesion : null;
  }
}

export function provideSesionSimulada(): Provider {
  return { provide: SERVICIO_SESION, useClass: SesionSimulada };
}
