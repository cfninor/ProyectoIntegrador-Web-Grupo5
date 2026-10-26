import { provideHttpClient } from '@angular/common/http';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { APP_CONFIG, AppConfig, CONFIG_CARGADA } from '../config/app-config';
import { Inactividad } from './inactividad';
import { provideSesion } from './proveer-sesion';
import { SERVICIO_SESION } from './sesion';
import { SesionCognito } from './sesion-cognito';
import { SesionSimulada } from './sesion-simulada';

const COGNITO = { region: 'us-east-1', userPoolId: 'us-east-1_X', clienteId: 'c' };
const SESION = { usuario: { id: 'a', nombre: 'Asesor' }, rol: 'ASESOR' } as const;

/** Arranca los inicializadores con un config.json que se "carga" cuando se resuelve `cargar`. */
async function arrancar(config: AppConfig, cargada: Promise<void> = Promise.resolve()) {
  const restaurar = jest.spyOn(SesionSimulada.prototype, 'restaurar');
  const restaurarCognito = jest
    .spyOn(SesionCognito.prototype, 'restaurar')
    .mockResolvedValue(undefined);
  const vigilar = jest.spyOn(Inactividad.prototype, 'vigilar').mockImplementation(() => undefined);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      { provide: APP_CONFIG, useValue: config },
      { provide: CONFIG_CARGADA, useValue: cargada },
      provideSesion(),
    ],
  });
  await TestBed.inject(ApplicationInitStatus).donePromise;
  return { servicio: TestBed.inject(SERVICIO_SESION), restaurar, restaurarCognito, vigilar };
}

afterEach(() => jest.restoreAllMocks());

describe('provideSesion (D8)', () => {
  it('con cognito en config.json usa Cognito y restaura su sesión', async () => {
    const { servicio, restaurarCognito, vigilar } = await arrancar({
      apiBaseUrl: '',
      cognito: COGNITO,
    });

    expect(servicio).toBeInstanceOf(SesionCognito);
    expect(restaurarCognito).toHaveBeenCalledTimes(1);
    expect(vigilar).toHaveBeenCalledTimes(1);
  });

  it('con cognito y sesionSimulada, gana Cognito', async () => {
    const { servicio } = await arrancar({
      apiBaseUrl: '',
      cognito: COGNITO,
      sesionSimulada: SESION,
    });

    expect(servicio).toBeInstanceOf(SesionCognito);
  });

  it('sin cognito usa la sesión simulada de config.json', async () => {
    const { servicio, restaurar } = await arrancar({ apiBaseUrl: '', sesionSimulada: SESION });

    expect(servicio).toBeInstanceOf(SesionSimulada);
    expect(servicio.actual()).toEqual(SESION);
    expect(restaurar).toHaveBeenCalledTimes(1);
  });

  it('sin ninguna de las dos, la sesión vacía: sin sesión e ingresar responde SIN_CONEXION', async () => {
    const { servicio } = await arrancar({ apiBaseUrl: '' });

    expect(servicio.actual()).toBeNull();
    expect(await servicio.iniciar('a@b.co', 'clave')).toEqual({
      tipo: 'error',
      error: 'SIN_CONEXION',
    });
  });

  it('elige después de cargar config.json, aunque los inicializadores arranquen a la vez', async () => {
    const config: AppConfig = { apiBaseUrl: '' };
    let terminarCarga!: () => void;
    const cargada = new Promise<void>((resolver) => (terminarCarga = resolver));
    const arranque = arrancar(config, cargada);

    // config.json llega con cognito después de que el inicializador de la sesión empezó.
    config.cognito = COGNITO;
    terminarCarga();
    const { servicio } = await arranque;

    expect(servicio).toBeInstanceOf(SesionCognito);
  });
});
