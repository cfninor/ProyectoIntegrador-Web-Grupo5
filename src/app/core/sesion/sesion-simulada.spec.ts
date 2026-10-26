import { TestBed } from '@angular/core/testing';

import { APP_CONFIG, AppConfig } from '../config/app-config';
import { SERVICIO_SESION, Sesion } from './sesion';
import { provideSesionSimulada } from './sesion-simulada';

function servicio(config: AppConfig) {
  TestBed.configureTestingModule({
    providers: [{ provide: APP_CONFIG, useValue: config }, provideSesionSimulada()],
  });
  return TestBed.inject(SERVICIO_SESION);
}

describe('SesionSimulada', () => {
  it('da la sesión de sesionSimulada de config.json, con el clienteId del rol CLIENTE', () => {
    const sesion: Sesion = {
      usuario: { id: 'cliente-local', nombre: 'Laura Gómez' },
      rol: 'CLIENTE',
      clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
      documentoEnmascarado: 'CC ••••5678',
    };

    expect(servicio({ apiBaseUrl: '', sesionSimulada: sesion }).actual()).toEqual(sesion);
  });

  it('sin sesionSimulada no hay sesión', () => {
    expect(servicio({ apiBaseUrl: '' }).actual()).toBeNull();
  });

  it('un rol que el portal no conoce es como no tener sesión', () => {
    const sesionSimulada = { usuario: { id: 'x', nombre: 'X' }, rol: 'ADMIN' } as unknown as Sesion;

    expect(servicio({ apiBaseUrl: '', sesionSimulada }).actual()).toBeNull();
  });

  it('lee config.json en cada consulta: ve la configuración cargada al iniciar', () => {
    const config: AppConfig = { apiBaseUrl: '' };
    const sesiones = servicio(config);
    expect(sesiones.actual()).toBeNull();

    config.sesionSimulada = { usuario: { id: 'a', nombre: 'Asesor' }, rol: 'ASESOR' };

    expect(sesiones.actual()?.rol).toBe('ASESOR');
  });
});

describe('SesionSimulada · ingresar y cerrar (SOLVENTAG5-207)', () => {
  const sesion: Sesion = { usuario: { id: 'asesor-local', nombre: 'Asesor' }, rol: 'ASESOR' };

  it('restaurar no cambia nada: la sesión sale de config.json', async () => {
    const sesiones = servicio({ apiBaseUrl: '', sesionSimulada: sesion });

    await sesiones.restaurar();

    expect(sesiones.actual()).toEqual(sesion);
  });

  it('cerrar la quita, e iniciar con cualquier credencial la devuelve', async () => {
    const sesiones = servicio({ apiBaseUrl: '', sesionSimulada: sesion });

    await sesiones.cerrar('inactividad');
    expect(sesiones.actual()).toBeNull();

    expect(await sesiones.iniciar('cualquiera', 'x')).toEqual({ tipo: 'sesion', sesion });
    expect(sesiones.actual()).toEqual(sesion);
  });

  it('sin sesionSimulada, iniciar responde SIN_CONEXION', async () => {
    expect(await servicio({ apiBaseUrl: '' }).iniciar('a@b.co', 'x')).toEqual({
      tipo: 'error',
      error: 'SIN_CONEXION',
    });
  });

  it('no tiene token ni cuenta sin registrar', async () => {
    const sesiones = servicio({ apiBaseUrl: '', sesionSimulada: sesion });

    expect(await sesiones.token()).toBeNull();
    expect(sesiones.cuentaSinRegistrar()).toBeNull();
    expect(sesiones.correoPorConfirmar()).toBeNull();
  });

  it('crear cuenta no está disponible sin Cognito', async () => {
    const sesiones = servicio({ apiBaseUrl: '', sesionSimulada: sesion });
    const noDisponible = { tipo: 'error', error: 'NO_DISPONIBLE' };

    expect(sesiones.puedeCrearCuenta()).toBe(false);
    expect(await sesiones.registrar('a@b.co', 'x')).toEqual(noDisponible);
    expect(await sesiones.confirmar('a@b.co', '123456')).toEqual(noDisponible);
    expect(await sesiones.reenviarCodigo('a@b.co')).toEqual(noDisponible);
    expect(
      await sesiones.completarRegistro({
        documento: { tipo: 'CC', numero: '1020304050' },
        nombre: { nombres: 'Ana', apellidos: 'Ruiz' },
        celular: '3001234567',
      }),
    ).toEqual(noDisponible);
  });
});
