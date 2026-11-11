import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import {
  DOCUMENTO_PARA_FIRMAR,
  FIRMA_ENVIADA,
  FIRMA_FIRMADA,
} from '../../../testing/fixtures-firma';
import { APP_CONFIG } from '../../core/config/app-config';
import { FirmaApi } from './firma-api';

describe('FirmaApi · SOLVENTAG5-57', () => {
  let api: FirmaApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      ],
    });
    api = TestBed.inject(FirmaApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide la firma por POST /v1/polizas/{polizaId}/firma, sin cuerpo', async () => {
    const respuesta = firstValueFrom(api.enviar('p/1'));

    const peticion = http.expectOne('http://bff.prueba/v1/polizas/p%2F1/firma');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush(FIRMA_ENVIADA);

    await expect(respuesta).resolves.toEqual(FIRMA_ENVIADA);
  });

  it('consulta el seguimiento por GET /v1/polizas/{polizaId}/firma', async () => {
    const respuesta = firstValueFrom(api.obtener('p-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/polizas/p-1/firma');
    expect(peticion.request.method).toBe('GET');
    peticion.flush(FIRMA_ENVIADA);

    await expect(respuesta).resolves.toEqual(FIRMA_ENVIADA);
  });

  it('reenvía por POST /v1/polizas/{polizaId}/firma/reenvio, sin cuerpo', async () => {
    const respuesta = firstValueFrom(api.reenviar('p-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/polizas/p-1/firma/reenvio');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush(FIRMA_ENVIADA);

    await expect(respuesta).resolves.toEqual(FIRMA_ENVIADA);
  });

  it('abre el documento por GET /v1/firmas/{firmaId}', async () => {
    const respuesta = firstValueFrom(api.abrir('f/1'));

    const peticion = http.expectOne('http://bff.prueba/v1/firmas/f%2F1');
    expect(peticion.request.method).toBe('GET');
    peticion.flush(DOCUMENTO_PARA_FIRMAR);

    await expect(respuesta).resolves.toEqual(DOCUMENTO_PARA_FIRMAR);
  });

  it('firma por POST /v1/firmas/{firmaId}/validacion con el código', async () => {
    const respuesta = firstValueFrom(api.firmar('f-1', '042817'));

    const peticion = http.expectOne('http://bff.prueba/v1/firmas/f-1/validacion');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ codigo: '042817' });
    peticion.flush(FIRMA_FIRMADA);

    await expect(respuesta).resolves.toEqual(FIRMA_FIRMADA);
  });
});
