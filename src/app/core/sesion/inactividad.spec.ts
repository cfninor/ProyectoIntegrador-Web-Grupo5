import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { EVENTOS_ACTIVIDAD, Inactividad, MINUTOS_INACTIVIDAD } from './inactividad';
import { Rol, SERVICIO_SESION, Sesion } from './sesion';

const MINUTO = 60_000;

function preparar(rol: Rol | null) {
  let sesion: Sesion | null = rol ? { usuario: { id: 'u-1', nombre: 'Ana' }, rol } : null;
  const eventos = new Subject<unknown>();
  const servicio = {
    actual: jest.fn(() => sesion),
    cerrar: jest.fn(() => {
      sesion = null;
      return Promise.resolve();
    }),
  };
  const router = { events: eventos, navigate: jest.fn(() => Promise.resolve(true)) };
  TestBed.configureTestingModule({
    providers: [
      { provide: SERVICIO_SESION, useValue: servicio },
      { provide: Router, useValue: router },
    ],
  });
  const inactividad = TestBed.inject(Inactividad);
  return {
    inactividad,
    servicio,
    router,
    /** Cambia la sesión y simula la navegación que siempre sigue a ingresar o cerrar sesión. */
    navegarCon(nueva: Rol | null) {
      sesion = nueva ? { usuario: { id: 'u-1', nombre: 'Ana' }, rol: nueva } : null;
      eventos.next(new NavigationEnd(1, '/', '/'));
    },
  };
}

/** Avanza el reloj falso y deja correr las promesas del cierre. */
async function avanzar(ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('MINUTOS_INACTIVIDAD (R8)', () => {
  it('15 minutos para los portales internos y 30 para el de clientes', () => {
    expect(MINUTOS_INACTIVIDAD).toEqual({
      ASESOR: 15,
      ANALISTA_RIESGO: 15,
      OPERACIONES: 15,
      SOCIO: 15,
      CLIENTE: 30,
    });
  });
});

describe('Inactividad', () => {
  it.each<[Rol, number]>([
    ['ASESOR', 15],
    ['SOCIO', 15],
    ['CLIENTE', 30],
  ])(
    'con %s cierra la sesión a los %i minutos y lleva a /ingresar?motivo=inactividad',
    async (rol, minutos) => {
      const { inactividad, servicio, router } = preparar(rol);
      inactividad.vigilar();

      await avanzar(minutos * MINUTO - 1);
      expect(servicio.cerrar).not.toHaveBeenCalled();

      await avanzar(1);
      expect(servicio.cerrar).toHaveBeenCalledWith('inactividad');
      expect(router.navigate).toHaveBeenCalledWith(['/ingresar'], {
        queryParams: { motivo: 'inactividad' },
      });
    },
  );

  it.each(EVENTOS_ACTIVIDAD)('la actividad (%s) reinicia el tiempo', async (evento) => {
    const { inactividad, servicio } = preparar('ASESOR');
    inactividad.vigilar();

    await avanzar(14 * MINUTO);
    document.dispatchEvent(new Event(evento));
    await avanzar(14 * MINUTO);
    expect(servicio.cerrar).not.toHaveBeenCalled();

    await avanzar(MINUTO);
    expect(servicio.cerrar).toHaveBeenCalledTimes(1);
  });

  it('el desplazamiento de un elemento interno también cuenta (captura)', async () => {
    const { inactividad, servicio } = preparar('ASESOR');
    const panel = document.body.appendChild(document.createElement('div'));
    inactividad.vigilar();

    await avanzar(14 * MINUTO);
    panel.dispatchEvent(new Event('scroll'));
    await avanzar(14 * MINUTO);

    expect(servicio.cerrar).not.toHaveBeenCalled();
    panel.remove();
  });

  it('sin sesión no corre, y arranca cuando se ingresa', async () => {
    const { inactividad, servicio, navegarCon } = preparar(null);
    inactividad.vigilar();

    await avanzar(60 * MINUTO);
    expect(servicio.cerrar).not.toHaveBeenCalled();

    navegarCon('CLIENTE');
    await avanzar(30 * MINUTO);
    expect(servicio.cerrar).toHaveBeenCalledWith('inactividad');
  });

  it('se detiene al cerrar la sesión: ni la actividad ni el tiempo la vuelven a cerrar', async () => {
    const { inactividad, servicio, navegarCon } = preparar('ASESOR');
    inactividad.vigilar();

    navegarCon(null);
    document.dispatchEvent(new Event('keydown'));
    await avanzar(60 * MINUTO);

    expect(servicio.cerrar).not.toHaveBeenCalled();
  });

  it('una navegación con la misma sesión no reinicia la cuenta', async () => {
    const { inactividad, servicio, navegarCon } = preparar('ASESOR');
    inactividad.vigilar();

    await avanzar(10 * MINUTO);
    navegarCon('ASESOR');
    await avanzar(5 * MINUTO);

    expect(servicio.cerrar).toHaveBeenCalledTimes(1);
  });

  it('si la sesión se cerró por otro lado, la actividad la detiene sin cerrarla otra vez', async () => {
    const { inactividad, servicio } = preparar('ASESOR');
    inactividad.vigilar();
    servicio.actual.mockReturnValue(null);

    document.dispatchEvent(new Event('pointermove'));
    await avanzar(60 * MINUTO);

    expect(servicio.cerrar).not.toHaveBeenCalled();
  });

  it('después de cerrar por inactividad, un nuevo ingreso vuelve a contar', async () => {
    const { inactividad, servicio, navegarCon } = preparar('ASESOR');
    inactividad.vigilar();
    await avanzar(15 * MINUTO);
    navegarCon(null);

    navegarCon('ASESOR');
    await avanzar(15 * MINUTO);

    expect(servicio.cerrar).toHaveBeenCalledTimes(2);
  });
});
