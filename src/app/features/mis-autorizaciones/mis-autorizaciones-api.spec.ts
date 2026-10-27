import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { MisAutorizacionesApi } from './mis-autorizaciones-api';

describe('MisAutorizacionesApi', () => {
  let api: MisAutorizacionesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      ],
    });
    api = TestBed.inject(MisAutorizacionesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta por GET /v1/clientes/{clienteId}/consentimientos', async () => {
    const respuesta = firstValueFrom(api.consultar('c-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/clientes/c-1/consentimientos');
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ clienteId: 'c-1', consentimientos: [] });

    await expect(respuesta).resolves.toEqual({ clienteId: 'c-1', consentimientos: [] });
  });

  it('codifica el id del cliente en la ruta', () => {
    void firstValueFrom(api.consultar('a/b'));

    http.expectOne('http://bff.prueba/v1/clientes/a%2Fb/consentimientos').flush({});
  });

  it('revoca por POST /v1/consentimientos/{consentimientoId}/revocacion', async () => {
    const respuesta = firstValueFrom(api.revocar('k-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/consentimientos/k-1/revocacion');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush({ consentimientoId: 'k-1', estado: 'REVOCADO' });

    await expect(respuesta).resolves.toEqual({ consentimientoId: 'k-1', estado: 'REVOCADO' });
  });
});
