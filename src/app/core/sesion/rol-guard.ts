import { inject } from '@angular/core';
import { CanActivateFn, RedirectFunction, Router } from '@angular/router';

import { tableroDe } from './roles';
import { Rol, SERVICIO_SESION } from './sesion';

/** Pantalla de ingreso, SOLV-WEB-01 (D10 de la SOLVENTAG5-207). */
export const RUTA_INGRESAR = '/ingresar';
/** Crear cuenta del cliente: también termina el registro de una cuenta sin grupo (R2). */
export const RUTA_CREAR_CUENTA = '/crear-cuenta';

/**
 * Deja entrar al portal solo con el rol indicado. Con otro rol lleva al tablero de su portal. Sin
 * sesión lleva a `/ingresar?volver=<ruta>`, y la cuenta de un cliente sin registrar, a crear
 * cuenta.
 */
export function rolGuard(rol: Rol): CanActivateFn {
  return (_ruta, estado) => {
    const servicio = inject(SERVICIO_SESION);
    const router = inject(Router);
    const sesion = servicio.actual();
    if (sesion?.rol === rol) {
      return true;
    }
    if (sesion) {
      return router.parseUrl(tableroDe(sesion.rol));
    }
    if (servicio.cuentaSinRegistrar()) {
      return router.parseUrl(RUTA_CREAR_CUENTA);
    }
    return router.createUrlTree([RUTA_INGRESAR], { queryParams: { volver: estado.url } });
  };
}

/** La raíz lleva al tablero del rol de la sesión; sin sesión, a `/ingresar`. */
export const redirigirAlPortal: RedirectFunction = () => {
  const servicio = inject(SERVICIO_SESION);
  const sesion = servicio.actual();
  if (sesion) {
    return tableroDe(sesion.rol);
  }
  return servicio.cuentaSinRegistrar() ? RUTA_CREAR_CUENTA : RUTA_INGRESAR;
};

/** Quien ya tiene sesión no vuelve a ingresar: va a su tablero. */
export const ingresarGuard: CanActivateFn = () => {
  const servicio = inject(SERVICIO_SESION);
  const router = inject(Router);
  const sesion = servicio.actual();
  if (sesion) {
    return router.parseUrl(tableroDe(sesion.rol));
  }
  return servicio.cuentaSinRegistrar() ? router.parseUrl(RUTA_CREAR_CUENTA) : true;
};

/** Un cliente ya registrado, o cualquier otro rol, no crea cuenta: va a su tablero. */
export const crearCuentaGuard: CanActivateFn = () => {
  const sesion = inject(SERVICIO_SESION).actual();
  return sesion ? inject(Router).parseUrl(tableroDe(sesion.rol)) : true;
};
