import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { routes } from '../../app.routes';
import { APP_CONFIG } from '../config/app-config';
import { provideSesionSimulada } from '../sesion/sesion-simulada';
import { Rol } from '../sesion/sesion';
import { LayoutPortal, iniciales } from './layout-portal';

/** Abre el tablero del portal del rol, con un `config.json` simulado de ese rol. */
async function abrirPortal(rol: Rol, nombre = 'Ana Sofía Reyes') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      {
        provide: APP_CONFIG,
        useValue: {
          apiBaseUrl: 'http://bff.prueba',
          sesionSimulada: { usuario: { id: 'u-1', nombre }, rol },
        },
      },
      provideSesionSimulada(),
      { provide: LOCALE_ID, useValue: 'es-CO' },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/');
  const pagina = harness.fixture.nativeElement as HTMLElement;
  return { harness, pagina, vista: within(pagina), usuario: userEvent.setup() };
}

describe('LayoutPortal', () => {
  it.each<[Rol, string, string, string[]]>([
    ['ASESOR', '/asesor', 'Asesor comercial', ['Tablero', 'Cotizar']],
    ['CLIENTE', '/cliente', 'Cliente', ['Tablero', 'Cotizar']],
    ['ANALISTA_RIESGO', '/riesgo', 'Analista de riesgo', ['Tablero']],
    ['OPERACIONES', '/operaciones', 'Operaciones', ['Tablero']],
    ['SOCIO', '/socio', 'Socio', ['Tablero']],
  ])(
    'el menú del rol %s tiene sus opciones y la tarjeta dice el rol',
    async (rol, ruta, nombreRol, opcionesDelRol) => {
      const { vista } = await abrirPortal(rol);

      const menu = within(vista.getByRole('navigation', { name: 'Menú principal' }));
      const opciones = menu.getAllByRole('link');
      expect(opciones.map((opcion) => opcion.textContent?.trim())).toEqual(opcionesDelRol);
      expect(menu.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', ruta);
      expect(vista.getByText(nombreRol)).toBeInTheDocument();
    },
  );

  it('la opción de la pantalla actual está activa y lo anuncia', async () => {
    const { vista } = await abrirPortal('ASESOR');

    const tablero = vista.getByRole('link', { name: 'Tablero' });
    expect(tablero).toHaveAttribute('aria-current', 'page');
    expect(tablero).toHaveClass('activa');
  });

  it('la tarjeta del usuario muestra sus iniciales, su nombre y su rol', async () => {
    const { pagina, vista } = await abrirPortal('ASESOR', 'Laura Gómez Pardo');

    expect(pagina.querySelector('.iniciales')).toHaveTextContent('LG');
    expect(pagina.querySelector('.iniciales')).toHaveAttribute('aria-hidden', 'true');
    expect(vista.getByText('Laura Gómez Pardo')).toBeInTheDocument();
    expect(vista.getByText('Asesor comercial')).toBeInTheDocument();
  });

  it('la barra superior muestra las migas y el título de la pantalla', async () => {
    const { vista } = await abrirPortal('CLIENTE');

    const migas = within(vista.getByRole('navigation', { name: 'Ruta de navegación' }));
    expect(migas.getAllByRole('listitem').map((miga) => miga.textContent?.trim())).toEqual([
      'Solventa',
      'Tablero',
    ]);
    expect(migas.getByText('Tablero')).toHaveAttribute('aria-current', 'page');
    expect(vista.getByRole('heading', { level: 1, name: 'Tablero' })).toBeInTheDocument();
    expect(vista.getByRole('main')).toHaveTextContent('Hola de nuevo, Ana Sofía Reyes.');
  });

  it('la barra superior tiene el selector de idioma con ES activo', async () => {
    const { pagina, vista } = await abrirPortal('ASESOR');

    const selector = vista.getByRole('group', { name: 'Idioma' });
    expect(pagina.querySelector('header .acciones')).toContainElement(selector);
    expect(within(selector).getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(selector).getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('el botón del menú lo abre y lo cierra, y lo anuncia con aria-expanded', async () => {
    const { pagina, vista, usuario } = await abrirPortal('ASESOR');
    const boton = vista.getByRole('button', { name: 'Menú' });
    const portal = pagina.querySelector('.portal');

    expect(boton).toHaveAttribute('aria-controls', 'menu-lateral');
    expect(pagina.querySelector('#menu-lateral')).not.toBeNull();
    expect(boton).toHaveAttribute('aria-expanded', 'false');

    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(portal).toHaveClass('menu-abierto');

    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    expect(portal).not.toHaveClass('menu-abierto');
  });

  it('Escape y el cambio de pantalla cierran el menú abierto', async () => {
    const { harness, vista, usuario } = await abrirPortal('ASESOR');
    const boton = vista.getByRole('button', { name: 'Menú' });

    await usuario.click(boton);
    await usuario.keyboard('{Escape}');
    expect(boton).toHaveAttribute('aria-expanded', 'false');

    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    await harness.navigateByUrl('/asesor?vista=2');
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('sin sesión ni datos de la pantalla no se rompe: sin opciones, sin tarjeta y sin título', async () => {
    // No pasa en la aplicación, porque rolGuard no deja entrar sin sesión al portal.
    const { container } = await render(LayoutPortal, {
      providers: [
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: '' } },
        provideSesionSimulada(),
      ],
    });

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(container.querySelector('.usuario')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('');
  });
});

describe('iniciales', () => {
  it.each([
    ['Ana Sofía Reyes', 'AS'],
    ['  laura   gómez ', 'LG'],
    ['Cliente', 'C'],
    ['', ''],
  ])('«%s» → «%s»', (nombre, esperadas) => {
    expect(iniciales(nombre)).toBe(esperadas);
  });
});
