import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { AutorizacionAsesorApi } from './autorizacion-asesor-api';

describe('AutorizacionAsesorApi', () => {
  let api: AutorizacionAsesorApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      ],
    });
    api = TestBed.inject(AutorizacionAsesorApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta el estado de la autorización del cliente por GET', async () => {
    const respuesta = firstValueFrom(api.consultarEstado('cliente-1'));

    const peticion = http.expectOne('http://bff.prueba/v1/clientes/cliente-1/autorizacion-datos');
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ clienteId: 'cliente-1', estado: 'AUTORIZADA' });

    await expect(respuesta).resolves.toEqual({ clienteId: 'cliente-1', estado: 'AUTORIZADA' });
  });

  it('pide la autorización por POST con los datos del asesor', async () => {
    const asesor = { asesor: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' } };
    const respuesta = firstValueFrom(api.pedirAutorizacion('cliente-1', asesor));

    const peticion = http.expectOne(
      'http://bff.prueba/v1/clientes/cliente-1/solicitudes-autorizacion',
    );
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(asesor);
    peticion.flush({ solicitudId: 's-1', reenviada: false });

    await expect(respuesta).resolves.toMatchObject({ reenviada: false });
  });

  it('codifica el id del cliente en la ruta', () => {
    api.consultarEstado('a/b').subscribe();

    http.expectOne('http://bff.prueba/v1/clientes/a%2Fb/autorizacion-datos').flush({});
  });
});
