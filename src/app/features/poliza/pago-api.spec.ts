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
    peticion.flush(
      { pagoId: 'pg-1', polizaId: 'p/1', estado: 'APROBADO' },
      { status: 201, statusText: 'Created' },
    );

    await expect(respuesta).resolves.toEqual({
      pago: { pagoId: 'pg-1', polizaId: 'p/1', estado: 'APROBADO' },
      existente: false,
    });
  });

  it('un 200 del cobro es el pago que la póliza ya tenía (SOLVENTAG5-75, D2)', async () => {
    const respuesta = firstValueFrom(
      api.cobrar('p-1', { medioPago: 'TARJETA', token: 'tok-2' }, 'clave-2'),
    );

    http
      .expectOne('http://bff.prueba/v1/polizas/p-1/cobro')
      .flush({ pagoId: 'pg-1', polizaId: 'p-1', estado: 'PROCESANDO' });

    await expect(respuesta).resolves.toEqual({
      pago: { pagoId: 'pg-1', polizaId: 'p-1', estado: 'PROCESANDO' },
      existente: true,
    });
  });
});

describe('PagoApi · consulta del cobro (SOLVENTAG5-75)', () => {
  let api: PagoApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba', pasarelaUrl: '' } },
      ],
    });
    api = TestBed.inject(PagoApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta por GET /v1/polizas/{polizaId}/cobro, sin Idempotency-Key ni cuerpo', async () => {
    const cobro = {
      pago: { pagoId: 'pg-1', polizaId: 'p/1', estado: 'APROBADO' },
      intentos: [{ pagoId: 'pg-1', estado: 'APROBADO', canal: 'web', creadoEn: 'x' }],
    };
    const respuesta = firstValueFrom(api.obtenerCobro('p/1'));

    const peticion = http.expectOne('http://bff.prueba/v1/polizas/p%2F1/cobro');
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.headers.has('Idempotency-Key')).toBe(false);
    expect(peticion.request.body).toBeNull();
    peticion.flush(cobro);

    await expect(respuesta).resolves.toEqual(cobro);
  });
});
