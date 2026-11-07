import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { PagoApi } from './pago-api';

describe('PagoApi · SOLVENTAG5-74', () => {
  let api: PagoApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiBaseUrl: 'http://bff.prueba', pasarelaUrl: 'http://pasarela.prueba' },
        },
      ],
    });
    api = TestBed.inject(PagoApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('tokeniza por POST /tokenizaciones directo contra la pasarela, no el BFF', async () => {
    const respuesta = firstValueFrom(
      api.tokenizar({ numero: '4111111111111111', vencimiento: '09/28' }),
    );

    const peticion = http.expectOne('http://pasarela.prueba/tokenizaciones');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ numero: '4111111111111111', vencimiento: '09/28' });
    peticion.flush({ token: 'tok-1', marca: 'VISA', ultimos4: '4242', vencimiento: '09/28' });

    await expect(respuesta).resolves.toEqual({
      token: 'tok-1',
      marca: 'VISA',
      ultimos4: '4242',
      vencimiento: '09/28',
    });
  });

  it('cobra por POST /v1/polizas/{polizaId}/cobro con la Idempotency-Key en la cabecera', async () => {
    const respuesta = firstValueFrom(
      api.cobrar('p/1', { medioPago: 'TARJETA', token: 'tok-1' }, 'clave-1'),
    );

    const peticion = http.expectOne('http://bff.prueba/v1/polizas/p%2F1/cobro');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ medioPago: 'TARJETA', token: 'tok-1' });
    expect(peticion.request.headers.get('Idempotency-Key')).toBe('clave-1');
    peticion.flush({ pagoId: 'pg-1', polizaId: 'p/1', estado: 'APROBADO' });

    await expect(respuesta).resolves.toEqual({
      pagoId: 'pg-1',
      polizaId: 'p/1',
      estado: 'APROBADO',
    });
  });
});
