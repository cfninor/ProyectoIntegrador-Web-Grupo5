import { inject } from '@angular/core';
import { CanActivateFn, RedirectFunction, Router } from '@angular/router';

import { tableroDe } from './roles';
import { Rol, SERVICIO_SESION } from './sesion';

/** Cualquier ruta que no existe cae en la página no encontrada del layout público. */
export const RUTA_NO_ENCONTRADA = '/no-encontrada';

/**
 * Deja entrar al portal solo con el rol indicado. Sin sesión lleva a la página no encontrada; con
 * otro rol, al tablero del portal de ese rol.
 */
export function rolGuard(rol: Rol): CanActivateFn {
  return () => {
    const sesion = inject(SERVICIO_SESION).actual();
    if (sesion?.rol === rol) {
      return true;
    }
    const router = inject(Router);
    return router.parseUrl(sesion ? tableroDe(sesion.rol) : RUTA_NO_ENCONTRADA);
  };
}

/** La raíz lleva al tablero del portal del rol de la sesión; sin sesión, a la página no encontrada. */
export const redirigirAlPortal: RedirectFunction = () => {
  const sesion = inject(SERVICIO_SESION).actual();
  return sesion ? tableroDe(sesion.rol) : RUTA_NO_ENCONTRADA;
};
