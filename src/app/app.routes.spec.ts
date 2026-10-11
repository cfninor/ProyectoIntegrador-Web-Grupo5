import { routes } from './app.routes';
import { PaginaAutorizacionDatos } from './features/autorizacion-datos/pagina-autorizacion-datos';

describe('routes', () => {
  it('el enlace del cliente carga la página de autorización de datos de forma diferida', async () => {
    const ruta = routes.find((r) => r.path === 'autorizar/:solicitudId');

    expect(ruta?.title).toBe('Autorizar la consulta de tus datos · Solventa');
    await expect(ruta?.loadComponent?.()).resolves.toBe(PaginaAutorizacionDatos);
  });
});
