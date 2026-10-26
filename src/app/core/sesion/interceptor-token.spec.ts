import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import { interceptorToken } from './interceptor-token';
import { SERVICIO_SESION, Sesion } from './sesion';

const SESION: Sesion = { usuario: { id: 'u-1', nombre: 'Laura' }, rol: 'ASESOR' };

interface Escenario {
  apiBaseUrl?: string;
  sesion?: Sesion | null;
  sinRegistrar?: string | null;
  token?: string | null;
}

function preparar({
  apiBaseUrl = 'http://bff.prueba',
  sesion = SESION,
  sinRegistrar = null,
  token = 'id-token',
}: Escenario = {}) {
  const servicio = {
    actual: jest.fn(() => sesion),
    cuentaSinRegistrar: jest.fn(() => sinRegistrar),
    token: jest.fn(() => Promise.resolve(token)),
    cerrar: jest.fn(() => Promise.resolve()),
  };
  const router = { navigate: jest.fn(() => Promise.resolve(true)) };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([interceptorToken])),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl } },
      { provide: SERVICIO_SESION, useValue: servicio },
      { provide: Router, useValue: router },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    controlador: TestBed.inject(HttpTestingController),
    servicio,
    router,
  };
}

/** Espera a que el interceptor resuelva el token y la petición llegue al controlador. */
const pausa = () => new Promise((resolver) => setTimeout(resolver));

describe('interceptorToken', () => {
  it('agrega el ID token a las llamadas a la API con sesión', async () => {
    const { http, controlador } = preparar();

    const respuesta = firstValueFrom(http.get('http://bff.prueba/v1/cotizaciones/c-1'));
    await pausa();
    const peticion = controlador.expectOne('http://bff.prueba/v1/cotizaciones/c-1');
    peticion.flush({ ok: true });

    expect(peticion.request.headers.get('Authorization')).toBe('Bearer id-token');
    await expect(respuesta).resolves.toEqual({ ok: true });
  });

  it('con apiBaseUrl vacío (mismo dominio en AWS) también agrega el token a /v1/', async () => {
    const { http, controlador } = preparar({ apiBaseUrl: '' });

    void firstValueFrom(http.get('/v1/cotizaciones/c-1'));
    await pausa();

    expect(controlador.expectOne('/v1/cotizaciones/c-1').request.headers.get('Authorization')).toBe(
      'Bearer id-token',
    );
  });

  it('la cuenta sin registrar envía su token a POST /v1/cuenta', async () => {
    const { http, controlador } = preparar({ sesion: null, sinRegistrar: 'maria@correo.com' });

    void firstValueFrom(http.post('http://bff.prueba/v1/cuenta', {}));
    await pausa();

    expect(
      controlador.expectOne('http://bff.prueba/v1/cuenta').request.headers.has('Authorization'),
    ).toBe(true);
  });

  it.each([
    ['otro dominio', 'https://otro.example/v1/cotizaciones'],
    ['la configuración', 'http://bff.prueba/config.json'],
    ['una ruta del BFF fuera de /v1', 'http://bff.prueba/health'],
    ['el mismo prefijo sin la barra de /v1/', 'http://bff.prueba/v10/x'],
  ])('no agrega el token a %s', async (_caso, url) => {
    const { http, controlador, servicio } = preparar();

    void firstValueFrom(http.get(url));
    await pausa();

    expect(controlador.expectOne(url).request.headers.has('Authorization')).toBe(false);
    expect(servicio.token).not.toHaveBeenCalled();
  });

  it('sin sesión no agrega el token ni lo pide', async () => {
    const { http, controlador, servicio } = preparar({ sesion: null });

    void firstValueFrom(http.get('http://bff.prueba/v1/solicitudes-autorizacion/s-1'));
    await pausa();

    expect(
      controlador
        .expectOne('http://bff.prueba/v1/solicitudes-autorizacion/s-1')
        .request.headers.has('Authorization'),
    ).toBe(false);
    expect(servicio.token).not.toHaveBeenCalled();
  });

  it('con la sesión simulada, que no tiene token, la petición sale sin Authorization', async () => {
    const { http, controlador } = preparar({ token: null });

    void firstValueFrom(http.get('http://bff.prueba/v1/cotizaciones/c-1'));
    await pausa();

    expect(
      controlador
        .expectOne('http://bff.prueba/v1/cotizaciones/c-1')
        .request.headers.has('Authorization'),
    ).toBe(false);
  });

  it('un 401 del BFF cierra la sesión y lleva a /ingresar?motivo=expirada', async () => {
    const { http, controlador, servicio, router } = preparar();

    const respuesta = firstValueFrom(http.get('http://bff.prueba/v1/cotizaciones/c-1'));
    await pausa();
    controlador
      .expectOne('http://bff.prueba/v1/cotizaciones/c-1')
      .flush({ codigo: 'NO_AUTENTICADO' }, { status: 401, statusText: 'Unauthorized' });

    await expect(respuesta).rejects.toMatchObject({ status: 401 });
    await pausa();
    expect(servicio.cerrar).toHaveBeenCalledWith('expirada');
    expect(router.navigate).toHaveBeenCalledWith(['/ingresar'], {
      queryParams: { motivo: 'expirada' },
    });
  });

  it.each([403, 404, 503])('un %s no cierra la sesión', async (estado) => {
    const { http, controlador, servicio, router } = preparar();

    const respuesta = firstValueFrom(http.get('http://bff.prueba/v1/cotizaciones/c-1'));
    await pausa();
    controlador
      .expectOne('http://bff.prueba/v1/cotizaciones/c-1')
      .flush({}, { status: estado, statusText: 'x' });

    await expect(respuesta).rejects.toMatchObject({ status: estado });
    expect(servicio.cerrar).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
