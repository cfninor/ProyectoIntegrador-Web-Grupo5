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
