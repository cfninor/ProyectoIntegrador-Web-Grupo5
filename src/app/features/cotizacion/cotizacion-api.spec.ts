import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { CotizacionApi } from './cotizacion-api';

describe('CotizacionApi', () => {
  let api: CotizacionApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      ],
    });
    api = TestBed.inject(CotizacionApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('cotiza por POST /v1/cotizaciones con el cuerpo del contrato', async () => {
    const solicitud = {
      ramo: 'VIDA_HIPOTECARIO',
      datosBien: {
        montoCredito: 200_000_000,
        plazoAnios: 20,
        ciudadInmueble: 'Bogotá',
        entidadAcreedora: 'Banco de Ejemplo',
      },
      clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
    } as const;
    const respuesta = firstValueFrom(api.cotizar(solicitud));

    const peticion = http.expectOne('http://bff.prueba/v1/cotizaciones');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(solicitud);
    peticion.flush({ cotizacionId: 'c-1', prima: 70_000 });

    await expect(respuesta).resolves.toEqual({ cotizacionId: 'c-1', prima: 70_000 });
  });

  it('busca al cliente por POST /v1/clientes/busqueda, con el documento en el cuerpo', async () => {
    const respuesta = firstValueFrom(
      api.buscarCliente({ tipoDocumento: 'CC', numeroDocumento: '1020305678' }),
    );

    const peticion = http.expectOne('http://bff.prueba/v1/clientes/busqueda');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ tipoDocumento: 'CC', numeroDocumento: '1020305678' });
    peticion.flush({
      clienteId: 'x',
      nombres: 'Laura',
      apellidos: 'Gómez',
      documentoEnmascarado: 'CC ••••5678',
    });

    await expect(respuesta).resolves.toMatchObject({ documentoEnmascarado: 'CC ••••5678' });
  });

  it('un 404 CLIENTE_NO_ENCONTRADO llega como error con su código', async () => {
    const respuesta = firstValueFrom(
      api.buscarCliente({ tipoDocumento: 'PA', numeroDocumento: 'AB123456' }),
    );

    http.expectOne('http://bff.prueba/v1/clientes/busqueda').flush(
      {
        codigo: 'CLIENTE_NO_ENCONTRADO',
        detalle: 'No encontramos un cliente con ese documento.',
      },
      { status: 404, statusText: '' },
    );

    await expect(respuesta).rejects.toMatchObject({
      status: 404,
      error: { codigo: 'CLIENTE_NO_ENCONTRADO' },
    });
  });

  it('consulta la cotización registrada por GET /v1/cotizaciones/{cotizacionId}', async () => {
    const respuesta = firstValueFrom(api.obtener('c-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/cotizaciones/c-1');
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ cotizacionId: 'c-1', estado: 'VIGENTE' });

    await expect(respuesta).resolves.toEqual({ cotizacionId: 'c-1', estado: 'VIGENTE' });
  });
});
