import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { PolizaApi } from './poliza-api';

describe('PolizaApi · SOLVENTAG5-56', () => {
  let api: PolizaApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      ],
    });
    api = TestBed.inject(PolizaApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide la póliza por POST .../poliza sin cuerpo, con el id codificado', async () => {
    const respuesta = firstValueFrom(api.generar('a/b'));

    const peticion = http.expectOne('http://bff.prueba/v1/solicitudes-suscripcion/a%2Fb/poliza');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush({ polizaId: 'p-1' });

    await expect(respuesta).resolves.toEqual({ polizaId: 'p-1' });
  });

  it('consulta la póliza por GET /v1/polizas/{polizaId}', async () => {
    const respuesta = firstValueFrom(api.obtener('p/1'));

    const peticion = http.expectOne('http://bff.prueba/v1/polizas/p%2F1');
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ polizaId: 'p/1' });

    await expect(respuesta).resolves.toEqual({ polizaId: 'p/1' });
  });

  it('descarga el PDF como blob por GET /v1/polizas/{polizaId}/documento', async () => {
    const respuesta = firstValueFrom(api.descargarDocumento('p-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/polizas/p-1/documento');
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.responseType).toBe('blob');
    const pdf = new Blob(['%PDF-'], { type: 'application/pdf' });
    peticion.flush(pdf);

    await expect(respuesta).resolves.toBe(pdf);
  });
});
