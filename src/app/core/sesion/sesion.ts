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

/**
 * Da la sesión actual (D11). La implementación es intercambiable: hoy es la simulada de
 * `config.json`; un inicio de sesión real solo cambia el proveedor, no las pantallas, las rutas
 * ni el menú.
 */
export interface ServicioSesion {
  /** La sesión actual, o null si no hay. */
  actual(): Sesion | null;
}

export const SERVICIO_SESION = new InjectionToken<ServicioSesion>('SERVICIO_SESION');

export function esRol(valor: unknown): valor is Rol {
  return (ROLES as readonly unknown[]).includes(valor);
}
