import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import { crearCuentaGuard, ingresarGuard, redirigirAlPortal, rolGuard } from './rol-guard';
import { Rol, SERVICIO_SESION, Sesion } from './sesion';

function sesionDe(rol: Rol): Sesion {
  return { usuario: { id: 'u-1', nombre: 'Ana' }, rol };
}

function preparar(sesion: Sesion | null, sinRegistrar: string | null = null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: SERVICIO_SESION,
        useValue: { actual: () => sesion, cuentaSinRegistrar: () => sinRegistrar },
      },
    ],
  });
}

/** El resultado de un guard como texto: `true` o la URL a la que redirige. */
function destino(resultado: unknown): string | boolean {
  return resultado instanceof UrlTree
    ? TestBed.inject(Router).serializeUrl(resultado)
    : (resultado as boolean);
}

function correrRolGuard(rol: Rol, url: string): string | boolean {
  const estado = { url } as RouterStateSnapshot;
  return destino(
    TestBed.runInInjectionContext(() => rolGuard(rol)({} as ActivatedRouteSnapshot, estado)),
  );
}

function correr(guard: typeof ingresarGuard): string | boolean {
  return destino(
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ),
  );
}

describe('rolGuard', () => {
  it('deja entrar con el rol del portal', () => {
    preparar(sesionDe('ASESOR'));

    expect(correrRolGuard('ASESOR', '/asesor/cotizar')).toBe(true);
  });

  it('con otro rol lleva al tablero de su portal', () => {
    preparar(sesionDe('CLIENTE'));

    expect(correrRolGuard('ASESOR', '/asesor/cotizar')).toBe('/cliente');
  });

  it('sin sesión lleva a /ingresar con la ruta para volver', () => {
    preparar(null);

    expect(correrRolGuard('ASESOR', '/asesor/cotizar/oferta/c-1')).toBe(
      '/ingresar?volver=%2Fasesor%2Fcotizar%2Foferta%2Fc-1',
    );
  });

  it('la cuenta de un cliente sin registrar va a crear cuenta (R2)', () => {
    preparar(null, 'maria@correo.com');

    expect(correrRolGuard('CLIENTE', '/cliente')).toBe('/crear-cuenta');
  });
});

describe('redirigirAlPortal', () => {
  it.each<[Sesion | null, string | null, string]>([
    [sesionDe('OPERACIONES'), null, '/operaciones'],
    [null, null, '/ingresar'],
    [null, 'maria@correo.com', '/crear-cuenta'],
  ])('con %j y cuenta sin registrar %p lleva a %s', (sesion, sinRegistrar, esperado) => {
    preparar(sesion, sinRegistrar);

    expect(
      TestBed.runInInjectionContext(() =>
        redirigirAlPortal({} as ActivatedRouteSnapshot & Parameters<typeof redirigirAlPortal>[0]),
      ),
    ).toBe(esperado);
  });
});

describe('ingresarGuard', () => {
  it('sin sesión deja ver /ingresar', () => {
    preparar(null);

    expect(correr(ingresarGuard)).toBe(true);
  });

  it('con sesión lleva al tablero', () => {
    preparar(sesionDe('SOCIO'));

    expect(correr(ingresarGuard)).toBe('/socio');
  });

  it('la cuenta sin registrar va a crear cuenta', () => {
    preparar(null, 'maria@correo.com');

    expect(correr(ingresarGuard)).toBe('/crear-cuenta');
  });
});

describe('crearCuentaGuard', () => {
  it.each<[Sesion | null, string | null]>([
    [null, null],
    [null, 'maria@correo.com'],
  ])('sin sesión (cuenta sin registrar: %p) deja crear la cuenta', (sesion, sinRegistrar) => {
    preparar(sesion, sinRegistrar);

    expect(correr(crearCuentaGuard)).toBe(true);
  });

  it('con sesión lleva al tablero', () => {
    preparar(sesionDe('CLIENTE'));

    expect(correr(crearCuentaGuard)).toBe('/cliente');
  });
});
