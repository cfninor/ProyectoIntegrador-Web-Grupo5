import { tableroDe } from './roles';
import { Rol } from './sesion';

/**
 * R11 de la SOLVENTAG5-207: a dónde lleva el ingreso. `volver` solo se usa si es una ruta interna
 * (una sola `/` al inicio, sin `//`, sin esquema ni dominio, sin `\`, sin `.` ni `..`) dentro del
 * portal del rol; si no, el tablero del rol.
 */
export function destinoAlIngresar(volver: string | null | undefined, rol: Rol): string {
  const tablero = tableroDe(rol);
  if (!volver || !esRutaInterna(volver)) {
    return tablero;
  }
  const ruta = volver.split(/[?#]/)[0];
  return ruta === tablero || ruta.startsWith(`${tablero}/`) ? volver : tablero;
}

function esRutaInterna(volver: string): boolean {
  if (!volver.startsWith('/') || volver.includes('//') || volver.includes('\\')) {
    return false;
  }
  // Ni caracteres de control (un navegador los quita y `/\t/dominio` se vuelve `//dominio`)...
  if ([...volver].some((caracter) => caracter.charCodeAt(0) < 0x20)) {
    return false;
  }
  // ...ni segmentos que suban de nivel y salgan del portal.
  return !volver
    .split(/[?#]/)[0]
    .split('/')
    .some((segmento) => segmento === '.' || segmento === '..');
}
