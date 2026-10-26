import { IDIOMA_INGLES } from '../../../testing/ingles';

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { within } from '@testing-library/angular';

import { routes } from '../../app.routes';
import { APP_CONFIG } from '../config/app-config';
import { provideSesionSimulada } from '../sesion/sesion-simulada';
import { Rol, Sesion } from '../sesion/sesion';

// La base del portal en inglés (D12): menú, migas, títulos, tarjeta, página no encontrada y
// selector, con la traducción de public/i18n/en-US.json cargada antes de importar las rutas.

async function navegar(url: string, rol?: Rol) {
  const sesion: Sesion | undefined = rol
    ? { usuario: { id: 'u-1', nombre: 'Ana Sofía Reyes' }, rol }
    : undefined;
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      {
        provide: APP_CONFIG,
        useValue: { apiBaseUrl: 'http://bff.prueba', sesionSimulada: sesion },
      },
      provideSesionSimulada(),
      IDIOMA_INGLES,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return within(harness.fixture.nativeElement as HTMLElement);
}

describe('Base del portal · en inglés', () => {
  it('el tablero del asesor tiene menú, migas, título y bienvenida en inglés', async () => {
    const vista = await navegar('/', 'ASESOR');

    const menu = within(vista.getByRole('navigation', { name: 'Main menu' }));
    expect(menu.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    const migas = within(vista.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(migas.getAllByRole('listitem').map((miga) => miga.textContent?.trim())).toEqual([
      'Solventa',
      'Dashboard',
    ]);
    expect(vista.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(vista.getByText('Welcome back, Ana Sofía Reyes.')).toBeInTheDocument();
    expect(vista.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
    expect(document.title).toBe('Dashboard · Solventa');
  });

  it('el selector de la barra marca EN como activo', async () => {
    const vista = await navegar('/', 'CLIENTE');

    const selector = within(vista.getByRole('group', { name: 'Language' }));
    expect(selector.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(selector.getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it.each<[Rol, string]>([
    ['ASESOR', 'Sales advisor'],
    ['CLIENTE', 'Customer'],
    ['ANALISTA_RIESGO', 'Risk analyst'],
    ['OPERACIONES', 'Operations'],
    ['SOCIO', 'Partner'],
  ])('la tarjeta del usuario dice el rol %s en inglés', async (rol, nombreRol) => {
    const vista = await navegar('/', rol);

    expect(vista.getByText(nombreRol)).toBeInTheDocument();
  });

  it('«Cerrar sesión» está en inglés en la tarjeta del usuario (SOLVENTAG5-207)', async () => {
    const vista = await navegar('/', 'ASESOR');

    expect(vista.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('sin sesión, el portal lleva a ingresar, en inglés', async () => {
    const vista = await navegar('/asesor');

    expect(vista.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(document.title).toBe('Sign in · Solventa');
  });

  it('crear cuenta tiene su título en inglés', async () => {
    const vista = await navegar('/crear-cuenta');

    expect(
      vista.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Create account · Solventa');
  });

  it('la página no encontrada está en inglés, en el layout público con su selector', async () => {
    const vista = await navegar('/no-existe');

    expect(vista.getByRole('heading', { name: "We couldn't find this page" })).toBeInTheDocument();
    expect(
      vista.getByText('Check the address or open the link you received again.'),
    ).toBeInTheDocument();
    expect(vista.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(document.title).toBe('Page not found · Solventa');
  });
});
