import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import { RUTA_INGRESAR } from './rol-guard';
import { SERVICIO_SESION } from './sesion';

/**
 * D10 de la SOLVENTAG5-207: agrega `Authorization: Bearer <ID token>` solo a las llamadas a
 * `${apiBaseUrl}/v1/` y solo si hay sesión o una cuenta sin registrar (que llama a `POST
 * /v1/cuenta`). Un 401 del BFF cierra la sesión y lleva a `/ingresar?motivo=expirada`.
 */
export const interceptorToken: HttpInterceptorFn = (peticion, siguiente) => {
  const config = inject(APP_CONFIG);
  const sesion = inject(SERVICIO_SESION);
  const router = inject(Router);
  const conSesion = sesion.actual() !== null || sesion.cuentaSinRegistrar() !== null;
  if (!conSesion || !peticion.url.startsWith(`${config.apiBaseUrl}/v1/`)) {
    return siguiente(peticion);
  }
  return from(sesion.token()).pipe(
    switchMap((token) =>
      siguiente(
        token ? peticion.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : peticion,
      ),
    ),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        void sesion
          .cerrar('expirada')
          .then(() => router.navigate([RUTA_INGRESAR], { queryParams: { motivo: 'expirada' } }));
      }
      return throwError(() => error);
    }),
  );
};
