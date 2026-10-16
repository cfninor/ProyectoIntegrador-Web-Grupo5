import { Route, Routes } from '@angular/router';

import { datosPagina } from './core/layout/pagina';
import { PREFIJO_PORTAL } from './core/sesion/roles';
import { redirigirAlPortal, rolGuard } from './core/sesion/rol-guard';
import { Rol } from './core/sesion/sesion';
import type { Actor } from './features/cotizacion/formulario-cotizacion';

/** Tablero de cada portal: la raíz de su grupo de rutas. */
const tablero: Route = {
  path: '',
  title: $localize`:@@portal.tablero.tituloPestana:Tablero · Solventa`,
  data: datosPagina($localize`:@@portal.tablero.titulo:Tablero`),
  loadComponent: () => import('./features/tablero/tablero').then((m) => m.Tablero),
};

/** Datos de la barra superior del cotizador: «Solventa / Cotizar» y su título. */
const DATOS_COTIZAR = datosPagina(
  $localize`:@@cotizacion.miga:Cotizar`,
  $localize`:@@cotizacion.titulo:Cotizar seguro de vida hipotecario`,
);
const TITULO_COTIZAR = $localize`:@@cotizacion.tituloPestana:Cotizar seguro de vida hipotecario · Solventa`;

/** SOLV-WEB-05: el asesor cotiza para un cliente (SOLVENTAG5-132). */
const cotizarAsesor: Route = {
  path: 'cotizar',
  title: TITULO_COTIZAR,
  data: DATOS_COTIZAR,
  loadComponent: () =>
    import('./features/cotizacion/pagina-cotizar-asesor').then((m) => m.PaginaCotizarAsesor),
};

/** El cliente cotiza para sí mismo, con sus datos de la sesión (SOLVENTAG5-132, CA4). */
const cotizarCliente: Route = {
  path: 'cotizar',
  title: TITULO_COTIZAR,
  data: DATOS_COTIZAR,
  loadComponent: () =>
    import('./features/cotizacion/pagina-cotizar-cliente').then((m) => m.PaginaCotizarCliente),
};

/** Datos de la barra superior de la oferta: «Solventa / Cotizar / Oferta» y su título. */
const DATOS_OFERTA = datosPagina(
  $localize`:@@oferta.miga:Cotizar / Oferta`,
  $localize`:@@oferta.titulo:Oferta personalizada`,
);

/** SOLVENTAG5-49: la oferta de una cotización, en el portal del asesor y en el del cliente. */
function oferta(actor: Actor): Route {
  return {
    path: 'cotizar/oferta/:cotizacionId',
    title: $localize`:@@oferta.tituloPestana:Oferta personalizada · Solventa`,
    data: { ...DATOS_OFERTA, actor },
    loadComponent: () => import('./features/cotizacion/pagina-oferta').then((m) => m.PaginaOferta),
  };
}

/**
 * Grupo de rutas del portal de un rol, dentro del layout del portal y protegido por `rolGuard`.
 * Una pantalla nueva se agrega en `pantallas` de su rol, con su opción en `core/navegacion/menu.ts`.
 */
function portal(rol: Rol, pantallas: Routes): Route {
  return {
    path: PREFIJO_PORTAL[rol],
    canActivate: [rolGuard(rol)],
    loadComponent: () => import('./core/layout/layout-portal').then((m) => m.LayoutPortal),
    children: pantallas,
  };
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: redirigirAlPortal },
  portal('ASESOR', [tablero, cotizarAsesor, oferta('asesor')]),
  portal('CLIENTE', [tablero, cotizarCliente, oferta('cliente')]),
  portal('ANALISTA_RIESGO', [tablero]),
  portal('OPERACIONES', [tablero]),
  portal('SOCIO', [tablero]),
  {
    // Páginas públicas, sin sesión. Va al final: su '**' recoge cualquier ruta que no existe.
    path: '',
    loadComponent: () => import('./core/layout/layout-publico').then((m) => m.LayoutPublico),
    children: [
      {
        // Enlace que recibe el cliente para autorizar la consulta de sus datos (SOLVENTAG5-65).
        path: 'autorizar/:solicitudId',
        title: $localize`:@@autorizacion.tituloPestana:Autorizar la consulta de tus datos · Solventa`,
        loadComponent: () =>
          import('./features/autorizacion-datos/pagina-autorizacion-datos').then(
            (m) => m.PaginaAutorizacionDatos,
          ),
      },
      {
        path: '**',
        title: $localize`:@@portal.noEncontrada.tituloPestana:Página no encontrada · Solventa`,
        loadComponent: () =>
          import('./features/no-encontrada/pagina-no-encontrada').then((m) => m.PaginaNoEncontrada),
      },
    ],
  },
];
