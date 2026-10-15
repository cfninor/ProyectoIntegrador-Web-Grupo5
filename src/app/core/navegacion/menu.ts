import { tableroDe } from '../sesion/roles';
import { Rol } from '../sesion/sesion';
import { NombreIcono } from './icono';

/** Una opción del menú lateral: su ruta, su ícono y su texto con id de i18n. */
export interface OpcionMenu {
  ruta: string;
  icono: NombreIcono;
  texto: string;
  /** true si la opción solo está activa en su ruta exacta (el tablero es la raíz del portal). */
  exacta: boolean;
}

function tablero(rol: Rol): OpcionMenu {
  return {
    ruta: tableroDe(rol),
    icono: 'cuadricula',
    texto: $localize`:@@menu.tablero:Tablero`,
    exacta: true,
  };
}

/** Cotizar un seguro (SOLVENTAG5-132): SOLV-WEB-05 para el asesor y la del cliente. */
function cotizar(rol: Rol): OpcionMenu {
  return {
    ruta: `${tableroDe(rol)}/cotizar`,
    icono: 'documento',
    texto: $localize`:@@menu.cotizar:Cotizar`,
    exacta: false,
  };
}

/**
 * Opciones del menú de cada rol. Una pantalla nueva agrega aquí su opción y su ruta dentro del
 * grupo de su rol en `app.routes.ts`; no toca los layouts.
 */
export const MENU: Record<Rol, readonly OpcionMenu[]> = {
  ASESOR: [tablero('ASESOR'), cotizar('ASESOR')],
  CLIENTE: [tablero('CLIENTE'), cotizar('CLIENTE')],
  ANALISTA_RIESGO: [tablero('ANALISTA_RIESGO')],
  OPERACIONES: [tablero('OPERACIONES')],
  SOCIO: [tablero('SOCIO')],
};
