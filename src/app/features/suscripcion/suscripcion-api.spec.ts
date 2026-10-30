import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { SuscripcionApi } from './suscripcion-api';

describe('SuscripcionApi', () => {
  let api: SuscripcionApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      ],
    });
    api = TestBed.inject(SuscripcionApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('acepta la oferta por POST /v1/solicitudes-suscripcion solo con la cotización', async () => {
    const respuesta = firstValueFrom(api.aceptarOferta('c-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/solicitudes-suscripcion');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ cotizacionId: 'c-1' });
    peticion.flush({ solicitudId: 's-1', estado: 'PENDIENTE_EVALUACION' });

    await expect(respuesta).resolves.toEqual({
      solicitudId: 's-1',
      estado: 'PENDIENTE_EVALUACION',
    });
  });

  it('consulta la solicitud por GET /v1/solicitudes-suscripcion/{solicitudId}', async () => {
    const respuesta = firstValueFrom(api.obtenerSolicitud('a/b'));

    const peticion = http.expectOne('http://bff.prueba/v1/solicitudes-suscripcion/a%2Fb');
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ solicitudId: 'a/b', estado: 'EVALUADA' });

    await expect(respuesta).resolves.toEqual({ solicitudId: 'a/b', estado: 'EVALUADA' });
  });

  it('consulta el perfil por GET /v1/solicitudes-suscripcion/{solicitudId}/perfil-riesgo', async () => {
    const respuesta = firstValueFrom(api.obtenerPerfilRiesgo('s-1'));

    const peticion = http.expectOne(
      'http://bff.prueba/v1/solicitudes-suscripcion/s-1/perfil-riesgo',
    );
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ solicitudId: 's-1', origen: 'VALOR_POR_DEFECTO' });

    await expect(respuesta).resolves.toEqual({ solicitudId: 's-1', origen: 'VALOR_POR_DEFECTO' });
  });

  it('codifica el id de la solicitud en la ruta', () => {
    void firstValueFrom(api.obtenerPerfilRiesgo('a/b'));

    http.expectOne('http://bff.prueba/v1/solicitudes-suscripcion/a%2Fb/perfil-riesgo').flush({});
  });
});
