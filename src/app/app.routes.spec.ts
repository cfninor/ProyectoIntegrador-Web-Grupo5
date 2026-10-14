import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { within } from '@testing-library/angular';

import { routes } from './app.routes';
import { APP_CONFIG } from './core/config/app-config';
import { provideSesionSimulada } from './core/sesion/sesion-simulada';
import { Rol, Sesion } from './core/sesion/sesion';
import { PaginaAutorizacionDatos } from './features/autorizacion-datos/pagina-autorizacion-datos';

const SOLICITUD_ID = '3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f';

function sesionDe(rol: Rol): Sesion {
  return { usuario: { id: 'u-1', nombre: 'Ana Sofía Reyes' }, rol };
}

/** Arma el enrutador con un `config.json` simulado: con `sesionSimulada` si se da una sesión. */
async function navegar(url: string, sesion?: Sesion) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: APP_CONFIG,
        useValue: { apiBaseUrl: 'http://bff.prueba', sesionSimulada: sesion },
      },
      provideSesionSimulada(),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const pagina = harness.fixture.nativeElement as HTMLElement;
  return { url: TestBed.inject(Router).url, pagina, vista: within(pagina) };
}

describe('routes', () => {
  it.each<[Rol, string]>([
    ['ASESOR', '/asesor'],
    ['CLIENTE', '/cliente'],
    ['ANALISTA_RIESGO', '/riesgo'],
    ['OPERACIONES', '/operaciones'],
    ['SOCIO', '/socio'],
  ])('la raíz lleva al tablero del portal del rol %s', async (rol, tablero) => {
    const { url, vista } = await navegar('/', sesionDe(rol));

    expect(url).toBe(tablero);
    expect(vista.getByRole('heading', { level: 1, name: 'Tablero' })).toBeInTheDocument();
    expect(vista.getByText('Hola de nuevo, Ana Sofía Reyes.')).toBeInTheDocument();
  });

  it('sin sesión, la raíz lleva a la página no encontrada', async () => {
    const { url, vista } = await navegar('/');

    expect(url).toBe('/no-encontrada');
    expect(vista.getByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument();
  });

  it('sin sesión, un portal lleva a la página no encontrada, sin menú', async () => {
    const { url, vista } = await navegar('/asesor');

    expect(url).toBe('/no-encontrada');
    expect(vista.getByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument();
    expect(vista.queryByRole('navigation', { name: 'Menú principal' })).not.toBeInTheDocument();
  });

  it.each<[Rol, string, string]>([
    ['ASESOR', '/cliente', '/asesor'],
    ['CLIENTE', '/asesor', '/cliente'],
    ['SOCIO', '/riesgo', '/socio'],
    ['ANALISTA_RIESGO', '/operaciones', '/riesgo'],
    ['OPERACIONES', '/socio', '/operaciones'],
  ])('con el rol %s, el portal %s lleva a su propio tablero %s', async (rol, ajeno, propio) => {
    const { url } = await navegar(ajeno, sesionDe(rol));

    expect(url).toBe(propio);
  });

  it('el asesor abre SOLV-WEB-05 desde su menú, con sus migas y su título', async () => {
    const { url, vista } = await navegar('/asesor/cotizar', sesionDe('ASESOR'));

    expect(url).toBe('/asesor/cotizar');
    expect(document.title).toBe('Cotizar seguro de vida hipotecario · Solventa');
    const migas = within(vista.getByRole('navigation', { name: 'Ruta de navegación' }));
    expect(migas.getAllByRole('listitem').map((miga) => miga.textContent?.trim())).toEqual([
      'Solventa',
      'Cotizar',
    ]);
    expect(
      vista.getByRole('heading', { level: 1, name: 'Cotizar seguro de vida hipotecario' }),
    ).toBeInTheDocument();
    expect(vista.getByRole('link', { name: 'Cotizar' })).toHaveAttribute('aria-current', 'page');
    expect(vista.getByRole('link', { name: 'Tablero' })).not.toHaveAttribute('aria-current');
    expect(
      vista.getByRole('heading', { name: 'Datos del cliente y del crédito' }),
    ).toBeInTheDocument();
  });

  it('el cotizador del asesor no se abre con otro rol', async () => {
    const { url } = await navegar('/asesor/cotizar', sesionDe('CLIENTE'));

    expect(url).toBe('/cliente');
  });

  it('el cliente abre su cotizador desde su menú, con sus datos de la sesión', async () => {
    const sesion: Sesion = {
      ...sesionDe('CLIENTE'),
      clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
      documentoEnmascarado: 'CC ••••5678',
    };
    const { url, vista } = await navegar('/cliente/cotizar', sesion);

    expect(url).toBe('/cliente/cotizar');
    expect(document.title).toBe('Cotizar seguro de vida hipotecario · Solventa');
    expect(
      vista.getByRole('heading', { level: 1, name: 'Cotizar seguro de vida hipotecario' }),
    ).toBeInTheDocument();
    expect(vista.getByRole('link', { name: 'Cotizar' })).toHaveAttribute('aria-current', 'page');
    expect(vista.getByLabelText('Nombre completo')).toHaveValue('Ana Sofía Reyes');
    expect(vista.getByLabelText('Documento de identidad')).toHaveValue('CC ••••5678');
    TestBed.inject(HttpTestingController)
      .expectOne(
        'http://bff.prueba/v1/clientes/9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e/autorizacion-datos',
      )
      .flush({ clienteId: sesion.clienteId, estado: 'SIN_SOLICITAR' });
  });

  it('el cotizador del cliente no se abre con otro rol', async () => {
    const { url } = await navegar('/cliente/cotizar', sesionDe('ASESOR'));

    expect(url).toBe('/asesor');
  });

  it('una ruta que no existe muestra la página no encontrada en el layout público', async () => {
    const { url, vista } = await navegar('/no-existe/de-verdad', sesionDe('ASESOR'));

    expect(url).toBe('/no-existe/de-verdad');
    expect(vista.getByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument();
    expect(vista.getByText('Solventa')).toBeInTheDocument();
    expect(vista.queryByRole('navigation', { name: 'Menú principal' })).not.toBeInTheDocument();
  });

  it('SOLV-WEB-20 abre en el layout público, sin sesión y sin menú', async () => {
    const { url, pagina, vista } = await navegar(`/autorizar/${SOLICITUD_ID}`);

    expect(url).toBe(`/autorizar/${SOLICITUD_ID}`);
    expect(pagina.querySelector('app-layout-publico')).not.toBeNull();
    expect(pagina.querySelector('app-pagina-autorizacion-datos')).not.toBeNull();
    expect(vista.getByText('Solventa')).toBeInTheDocument();
    expect(vista.getByRole('banner')).toContainElement(
      vista.getByRole('group', { name: 'Idioma' }),
    );
    expect(vista.getByRole('main')).toContainElement(
      vista.getByRole('heading', { level: 1, name: 'Autorizar la consulta de tus datos' }),
    );
    expect(vista.queryByRole('navigation', { name: 'Menú principal' })).not.toBeInTheDocument();
  });

  it('el enlace del cliente carga la página de autorización de datos de forma diferida', async () => {
    const publico = routes.find((r) => r.path === '' && r.children);
    const ruta = publico?.children?.find((r) => r.path === 'autorizar/:solicitudId');

    expect(ruta?.title).toBe('Autorizar la consulta de tus datos · Solventa');
    await expect(ruta?.loadComponent?.()).resolves.toBe(PaginaAutorizacionDatos);
  });
});
