import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { AutorizacionDatosApi } from './autorizacion-datos-api';

describe('AutorizacionDatosApi', () => {
  let api: AutorizacionDatosApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      ],
    });
    api = TestBed.inject(AutorizacionDatosApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta la solicitud en el BFF configurado', async () => {
    const respuesta = firstValueFrom(api.obtenerSolicitud('abc-123'));

    const peticion = http.expectOne('http://bff.prueba/v1/solicitudes-autorizacion/abc-123');
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ solicitudId: 'abc-123' });

    await expect(respuesta).resolves.toEqual({ solicitudId: 'abc-123' });
  });

  it('envía la decisión por POST con el cuerpo del contrato', async () => {
    const cuerpo = { decision: 'AUTORIZAR', aceptaPolitica: true, versionPolitica: 'v1' } as const;
    const respuesta = firstValueFrom(api.decidir('abc-123', cuerpo));

    const peticion = http.expectOne(
      'http://bff.prueba/v1/solicitudes-autorizacion/abc-123/decision',
    );
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(cuerpo);
    peticion.flush({ solicitudId: 'abc-123', estado: 'AUTORIZADA' });

    await expect(respuesta).resolves.toEqual({ solicitudId: 'abc-123', estado: 'AUTORIZADA' });
  });

  it('codifica el id del enlace para no alterar la ruta', () => {
    api.obtenerSolicitud('../otra/ruta').subscribe();

    const peticion = http.expectOne(
      'http://bff.prueba/v1/solicitudes-autorizacion/..%2Fotra%2Fruta',
    );
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.url).toBe(
      'http://bff.prueba/v1/solicitudes-autorizacion/..%2Fotra%2Fruta',
    );
    peticion.flush({});
  });
});
