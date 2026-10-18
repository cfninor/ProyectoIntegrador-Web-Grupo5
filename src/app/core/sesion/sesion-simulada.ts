import { Injectable, Provider, inject } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';
import { SERVICIO_SESION, ServicioSesion, Sesion, esRol } from './sesion';

/**
 * Sesión simulada (D11): la lee de `sesionSimulada` en `config.json`. Aplica en local y en todos
 * los ambientes (DEV, QA y PROD) mientras no haya inicio de sesión real. Lee la configuración en
 * cada consulta porque `config.json` se carga al iniciar la aplicación.
 */
@Injectable()
export class SesionSimulada implements ServicioSesion {
  private readonly config = inject(APP_CONFIG);

  actual(): Sesion | null {
    const sesion = this.config.sesionSimulada;
    // Un rol que el portal no conoce no abre ningún portal: es como no tener sesión.
    return sesion && esRol(sesion.rol) ? sesion : null;
  }
}

export function provideSesionSimulada(): Provider {
  return { provide: SERVICIO_SESION, useClass: SesionSimulada };
}
