import { Rol } from './sesion';

/** Prefijo de ruta del portal de cada rol. */
export const PREFIJO_PORTAL: Record<Rol, string> = {
  ASESOR: 'asesor',
  CLIENTE: 'cliente',
  ANALISTA_RIESGO: 'riesgo',
  OPERACIONES: 'operaciones',
  SOCIO: 'socio',
};

/** Nombre del rol en la tarjeta del usuario. */
export const NOMBRE_ROL: Record<Rol, string> = {
  ASESOR: $localize`:@@rol.asesor:Asesor comercial`,
  CLIENTE: $localize`:@@rol.cliente:Cliente`,
  ANALISTA_RIESGO: $localize`:@@rol.analistaRiesgo:Analista de riesgo`,
  OPERACIONES: $localize`:@@rol.operaciones:Operaciones`,
  SOCIO: $localize`:@@rol.socio:Socio`,
};

/** Ruta del tablero del portal del rol. */
export function tableroDe(rol: Rol): string {
  return `/${PREFIJO_PORTAL[rol]}`;
}
