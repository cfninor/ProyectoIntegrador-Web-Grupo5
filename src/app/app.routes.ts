import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    // Enlace que recibe el cliente para autorizar la consulta de sus datos (SOLVENTAG5-65).
    path: 'autorizar/:solicitudId',
    title: $localize`:@@autorizacion.tituloPestana:Autorizar la consulta de tus datos · Solventa`,
    loadComponent: () =>
      import('./features/autorizacion-datos/pagina-autorizacion-datos').then(
        (m) => m.PaginaAutorizacionDatos,
      ),
  },
];
