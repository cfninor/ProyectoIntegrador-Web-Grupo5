import { Route, Routes } from '@angular/router';

import { datosPagina } from './core/layout/pagina';
import { PREFIJO_PORTAL } from './core/sesion/roles';
import {
  crearCuentaGuard,
  ingresarGuard,
  redirigirAlPortal,
  rolGuard,
} from './core/sesion/rol-guard';
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

/** CA2 de la SOLVENTAG5-49: «Continuar a la contratación» lleva al paso 2, Suscripción. */
function suscripcion(actor: Actor): Route {
  return {
    path: 'cotizar/oferta/:cotizacionId/suscripcion',
    title: $localize`:@@suscripcion.tituloPestana:Suscripción · Solventa`,
    data: {
      ...datosPagina(
        $localize`:@@suscripcion.miga:Cotizar / Suscripción`,
        $localize`:@@suscripcion.tituloPagina:Suscripción`,
      ),
      actor,
    },
    loadComponent: () =>
      import('./features/cotizacion/pagina-suscripcion').then((m) => m.PaginaSuscripcion),
  };
}

/**
 * SOLV-WEB-09, paso 3: el pago de la primera prima (SOLVENTAG5-74). Se llega aquí desde
 * «Continuar al pago» de la tarjeta de resultado de la suscripción, con `?solicitudId=` en la
 * URL; un pago APROBADO continúa a la firma (D17).
 */
function pago(actor: Actor): Route {
  return {
    path: 'cotizar/oferta/:cotizacionId/pago',
    title: $localize`:@@pago.tituloPestana:Pago · Solventa`,
    data: {
      ...datosPagina($localize`:@@pago.miga:Cotizar / Pago`, $localize`:@@pago.tituloPagina:Pago`),
      actor,
    },
    loadComponent: () => import('./features/poliza/pagina-pago').then((m) => m.PaginaPago),
  };
}

/**
 * SOLV-WEB-10, paso 4: la póliza para firma (SOLVENTAG5-56). Se abre por su ruta con
 * `?solicitudId=`: a la firma se llega desde un pago aprobado (D17).
 */
function firma(actor: Actor): Route {
  return {
    path: 'cotizar/oferta/:cotizacionId/firma',
    title: $localize`:@@firma.tituloPestana:Firma · Solventa`,
    data: {
      ...datosPagina(
        $localize`:@@firma.miga:Cotizar / Firma`,
        $localize`:@@firma.tituloPagina:Firma`,
      ),
      actor,
    },
    loadComponent: () => import('./features/poliza/pagina-firma').then((m) => m.PaginaFirma),
  };
}

const DATOS_PERFIL_RIESGO = datosPagina(
  $localize`:@@perfilRiesgo.miga:Suscripción / Perfil de riesgo`,
  $localize`:@@perfilRiesgo.titulo:Perfil de riesgo de la solicitud`,
);

function perfilRiesgo(path: string): Route {
  return {
    path,
    title: $localize`:@@perfilRiesgo.tituloPestana:Perfil de riesgo · Solventa`,
    data: DATOS_PERFIL_RIESGO,
    loadComponent: () =>
      import('./features/suscripcion/pagina-perfil-riesgo').then((m) => m.PaginaPerfilRiesgo),
  };
}

/** SOLVENTAG5-52: la bandeja de suscripción asistida del analista de riesgo. */
const bandeja: Route = {
  path: 'bandeja',
  title: $localize`:@@bandeja.tituloPestana:Bandeja de suscripción · Solventa`,
  data: datosPagina(
    $localize`:@@bandeja.miga:Suscripción / Bandeja`,
    $localize`:@@bandeja.titulo:Bandeja de suscripción asistida`,
  ),
  loadComponent: () => import('./features/suscripcion/pagina-bandeja').then((m) => m.PaginaBandeja),
};

/**
 * SOLVENTAG5-53: el detalle de revisión de una solicitud, que se abre con «Revisar» desde la
 * bandeja. Cuelga de la bandeja para que el menú la siga marcando.
 */
const revision: Route = {
  path: 'bandeja/revision/:solicitudId',
  title: $localize`:@@revision.tituloPestana:Revisión de la solicitud · Solventa`,
  data: datosPagina(
    $localize`:@@revision.miga:Suscripción / Revisión`,
    $localize`:@@revision.titulo:Revisión de la solicitud`,
  ),
  loadComponent: () =>
    import('./features/suscripcion/pagina-revision').then((m) => m.PaginaRevision),
};

/** SOLVENTAG5-84: los consentimientos que el cliente ha otorgado. */
const misAutorizaciones: Route = {
  path: 'autorizaciones',
  title: $localize`:@@misAutorizaciones.tituloPestana:Mis autorizaciones · Solventa`,
  data: datosPagina($localize`:@@misAutorizaciones.titulo:Mis autorizaciones`),
  loadComponent: () =>
    import('./features/mis-autorizaciones/pagina-mis-autorizaciones').then(
      (m) => m.PaginaMisAutorizaciones,
    ),
};

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
  portal('ASESOR', [
    tablero,
    cotizarAsesor,
    oferta('asesor'),
    suscripcion('asesor'),
    pago('asesor'),
    firma('asesor'),
  ]),
  portal('CLIENTE', [
    tablero,
    cotizarCliente,
    oferta('cliente'),
    suscripcion('cliente'),
    pago('cliente'),
    firma('cliente'),
    misAutorizaciones,
  ]),
  portal('ANALISTA_RIESGO', [
    tablero,
    bandeja,
    revision,
    perfilRiesgo('perfil-riesgo'),
    perfilRiesgo('perfil-riesgo/:solicitudId'),
  ]),
  portal('OPERACIONES', [tablero]),
  portal('SOCIO', [tablero]),
  {
    // Páginas públicas, sin sesión. Va al final: su '**' recoge cualquier ruta que no existe.
    path: '',
    loadComponent: () => import('./core/layout/layout-publico').then((m) => m.LayoutPublico),
    children: [
      {
        // SOLV-WEB-01: ingreso de todos los perfiles (SOLVENTAG5-207, D10).
        path: 'ingresar',
        title: $localize`:@@ingreso.tituloPestana:Iniciar sesión · Solventa`,
        canActivate: [ingresarGuard],
        loadComponent: () =>
          import('./features/ingreso/pagina-ingreso').then((m) => m.PaginaIngreso),
      },
      {
        // El cliente crea su cuenta, o termina el registro de una cuenta sin grupo (CA8, D20).
        path: 'crear-cuenta',
        title: $localize`:@@crearCuenta.tituloPestana:Crear cuenta · Solventa`,
        canActivate: [crearCuentaGuard],
        loadComponent: () =>
          import('./features/ingreso/pagina-crear-cuenta').then((m) => m.PaginaCrearCuenta),
      },
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
