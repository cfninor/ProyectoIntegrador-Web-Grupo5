import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { Sesion } from '../../core/sesion/sesion';
import { provideSesionSimulada } from '../../core/sesion/sesion-simulada';
import { PaginaCotizarAsesor } from './pagina-cotizar-asesor';

const BFF = 'http://bff.prueba';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const URL_BUSQUEDA = `${BFF}/v1/clientes/busqueda`;
const URL_ESTADO = `${BFF}/v1/clientes/${CLIENTE_ID}/autorizacion-datos`;
const URL_SOLICITUD = `${BFF}/v1/clientes/${CLIENTE_ID}/solicitudes-autorizacion`;
const URL_COTIZAR = `${BFF}/v1/cotizaciones`;
const SESION: Sesion = {
  usuario: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' },
  rol: 'ASESOR',
};
const ENCONTRADO = {
  clienteId: CLIENTE_ID,
  nombres: 'Laura',
  apellidos: 'Gómez Pardo',
  documentoEnmascarado: 'CC ••••5678',
};
const ENVIADA = {
  solicitudId: '3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f',
  estado: 'PENDIENTE',
  fechaSolicitud: '2026-10-14T15:00:00Z',
  envios: 1,
  reenviada: false,
  enlace: 'http://localhost:4200/autorizar/3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f',
};
const estado = (valor: string, fechaEstado?: string) => ({
  clienteId: CLIENTE_ID,
  estado: valor,
  ...(fechaEstado ? { fechaEstado } : {}),
});

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

/** `sesion` null simula no tener sesión. */
async function renderizar(sesion: Sesion | null = SESION) {
  await render(PaginaCotizarAsesor, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF, sesionSimulada: sesion ?? undefined } },
      provideSesionSimulada(),
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { http, usuario: userEvent.setup() };
}

const campo = (nombre: string) => screen.getByLabelText(nombre) as HTMLInputElement;
const botonCalcular = () => screen.getByRole('button', { name: 'Calcular cotización' });

/** Escribe el documento, sale del campo y responde la búsqueda con el cliente encontrado. */
async function encontrarCliente(
  usuario: ReturnType<typeof userEvent.setup>,
  http: HttpTestingController,
) {
  await usuario.type(campo('Documento de identidad'), '1020305678');
  await usuario.tab();
  http.expectOne(URL_BUSQUEDA).flush(ENCONTRADO);
  await screen.findByDisplayValue('Laura Gómez Pardo');
}

async function llenarCredito(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(campo('Monto del crédito (COP)'), '280000000');
  await usuario.type(campo('Plazo (años)'), '15');
  await usuario.type(campo('Ciudad del inmueble'), 'Bogotá D.C.');
  await usuario.type(campo('Entidad acreedora'), 'Banco de Ejemplo');
}

describe('PaginaCotizarAsesor · SOLV-WEB-05', () => {
  it('estado inicial: sin cliente, la caja pide buscarlo y no se puede calcular', async () => {
    await renderizar();

    expect(campo('Nombre completo')).toHaveValue('');
    expect(
      screen.getByText('Busca al cliente por su documento para ver el estado de su autorización.'),
    ).toBeInTheDocument();
    expect(botonCalcular()).toBeDisabled();
  });

  it('busca al cliente, consulta su autorización y cotiza con su clienteId (D15, D4, CA3)', async () => {
    const { http, usuario } = await renderizar();

    await usuario.type(campo('Documento de identidad'), '1020305678');
    await usuario.tab();
    const busqueda = http.expectOne(URL_BUSQUEDA);
    expect(busqueda.request.method).toBe('POST');
    expect(busqueda.request.body).toEqual({ tipoDocumento: 'CC', numeroDocumento: '1020305678' });
    expect(screen.getByText('Buscando al cliente…')).toBeInTheDocument();

    busqueda.flush(ENCONTRADO);
    expect(await screen.findByDisplayValue('Laura Gómez Pardo')).toHaveAttribute('readonly');
    expect(screen.getByText('Consultando la autorización del cliente…')).toBeInTheDocument();

    const consulta = http.expectOne(URL_ESTADO);
    expect(consulta.request.method).toBe('GET');
    // 15:02 UTC = 10:02 en Bogotá.
    consulta.flush(estado('AUTORIZADA', '2026-10-09T15:02:11Z'));
    expect(
      await screen.findByText(
        'El cliente autorizó la consulta de sus datos de Open Finance y Open Data el 09/10/2026 a las 10:02.',
      ),
    ).toBeInTheDocument();

    await llenarCredito(usuario);
    await usuario.click(botonCalcular());
    const cotizar = http.expectOne(URL_COTIZAR);
    expect(cotizar.request.body.clienteId).toBe(CLIENTE_ID);
    cotizar.flush({
      cotizacionId: 'c-1',
      ramo: 'VIDA_HIPOTECARIO',
      datosBien: {
        montoCredito: 280_000_000,
        plazoAnios: 15,
        ciudadInmueble: 'Bogotá D.C.',
        entidadAcreedora: 'Banco de Ejemplo',
      },
      clienteId: CLIENTE_ID,
      prima: 148_500,
      moneda: 'COP',
      periodicidad: 'MENSUAL',
      fechaCotizacion: '2026-10-14T15:00:00Z',
      vigenteHasta: '2026-10-21T15:00:00Z',
      estado: 'VIGENTE',
      calculadaSinPerfil: false,
    });

    const panel = within(await screen.findByRole('region', { name: 'Prima estimada' }));
    expect(panel.getByText('$ 148.500')).toBeInTheDocument();
  });

  it.each([
    [404, 'No encontramos un cliente con ese documento.'],
    [422, 'No pudimos buscar al cliente. Intenta de nuevo.'],
    [503, 'No pudimos buscar al cliente. Intenta de nuevo.'],
  ])('si la búsqueda responde %s lo indica bajo el documento', async (codigo, mensaje) => {
    const { http, usuario } = await renderizar();
    await usuario.type(campo('Documento de identidad'), '1020305678');
    await usuario.tab();

    http
      .expectOne(URL_BUSQUEDA)
      .flush({ codigo: 'X', detalle: 'x' }, { status: codigo, statusText: '' });

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(campo('Nombre completo')).toHaveValue('');
    expect(botonCalcular()).toBeDisabled();
  });

  it('una búsqueda nueva cancela la anterior y descarta su cliente', async () => {
    const { http, usuario } = await renderizar();
    await encontrarCliente(usuario, http);
    http.expectOne(URL_ESTADO).flush(estado('AUTORIZADA'));

    await usuario.clear(campo('Documento de identidad'));
    await usuario.type(campo('Documento de identidad'), '52301884');
    await usuario.tab();
    const primera = http.expectOne(URL_BUSQUEDA);
    expect(campo('Nombre completo')).toHaveValue('');

    await usuario.clear(campo('Documento de identidad'));
    await usuario.type(campo('Documento de identidad'), '79123456{Enter}');
    const segunda = http.expectOne(URL_BUSQUEDA);

    expect(primera.cancelled).toBe(true);
    expect(segunda.request.body.numeroDocumento).toBe('79123456');
    segunda.flush({ ...ENCONTRADO, nombres: 'Carlos', apellidos: 'Peña Ruiz' });
    expect(await screen.findByDisplayValue('Carlos Peña Ruiz')).toBeInTheDocument();
    http.expectOne(URL_ESTADO).flush(estado('SIN_SOLICITAR'));
  });

  it('sin autorización no deja calcular; «Pedir autorización» la pide con el asesor de la sesión (D4)', async () => {
    const { http, usuario } = await renderizar();
    await encontrarCliente(usuario, http);
    http.expectOne(URL_ESTADO).flush(estado('SIN_SOLICITAR'));
    await llenarCredito(usuario);

    expect(botonCalcular()).toBeDisabled();
    expect(
      screen.getByText('Para calcular, el cliente debe autorizar la consulta de sus datos.'),
    ).toBeInTheDocument();

    await usuario.click(await screen.findByRole('button', { name: 'Pedir autorización' }));
    const pedir = http.expectOne(URL_SOLICITUD);
    expect(pedir.request.method).toBe('POST');
    expect(pedir.request.body).toEqual({ asesor: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' } });
    expect(screen.queryByRole('button', { name: 'Pedir autorización' })).not.toBeInTheDocument();

    pedir.flush(ENVIADA, { status: 201, statusText: 'Created' });
    expect(
      await screen.findByText('Le enviamos al cliente la solicitud de autorización.'),
    ).toBeInTheDocument();
    http.expectOne(URL_ESTADO).flush(estado('ESPERANDO_CLIENTE', '2026-10-14T15:00:00Z'));

    await usuario.click(await screen.findByRole('button', { name: 'Reenviar solicitud' }));
    http.expectOne(URL_SOLICITUD).flush({ ...ENVIADA, envios: 2, reenviada: true });
    expect(
      await screen.findByText('Le reenviamos al cliente la solicitud de autorización.'),
    ).toBeInTheDocument();
    http.expectOne(URL_ESTADO).flush(estado('ESPERANDO_CLIENTE', '2026-10-14T15:05:00Z'));

    expect(
      await screen.findByText(
        'Le enviamos la solicitud de autorización al cliente y aún no responde.',
      ),
    ).toBeInTheDocument();
    expect(botonCalcular()).toBeDisabled();
  });

  it('si el cliente ya autorizó (409), consulta el estado y habilita el cálculo', async () => {
    const { http, usuario } = await renderizar();
    await encontrarCliente(usuario, http);
    http.expectOne(URL_ESTADO).flush(estado('VENCIDA', '2026-10-01T15:00:00Z'));
    await llenarCredito(usuario);

    await usuario.click(await screen.findByRole('button', { name: 'Pedir autorización' }));
    http
      .expectOne(URL_SOLICITUD)
      .flush(
        { codigo: 'CLIENTE_YA_AUTORIZADO', detalle: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    http.expectOne(URL_ESTADO).flush(estado('AUTORIZADA', '2026-10-14T15:02:00Z'));

    expect(await screen.findByText(/El cliente autorizó la consulta/)).toBeInTheDocument();
    expect(botonCalcular()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si no se puede enviar la solicitud lo avisa y deja la caja como estaba', async () => {
    const { http, usuario } = await renderizar();
    await encontrarCliente(usuario, http);
    http.expectOne(URL_ESTADO).flush(estado('REVOCADA', '2026-10-10T15:00:00Z'));

    await usuario.click(await screen.findByRole('button', { name: 'Pedir autorización' }));
    http.expectOne(URL_SOLICITUD).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos enviar la solicitud de autorización. Intenta de nuevo.',
    );
    expect(
      screen.getByText('El cliente revocó la autorización para consultar sus datos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir autorización' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Pedir autorización' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    http.expectOne(URL_SOLICITUD).flush(ENVIADA, { status: 201, statusText: 'Created' });
    http.expectOne(URL_ESTADO).flush(estado('ESPERANDO_CLIENTE'));
  });

  it('si la consulta de la autorización falla, «Reintentar» la repite', async () => {
    const { http, usuario } = await renderizar();
    await encontrarCliente(usuario, http);
    http.expectOne(URL_ESTADO).flush(null, { status: 503, statusText: '' });

    expect(
      await screen.findByText('No pudimos consultar la autorización del cliente.'),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    http.expectOne(URL_ESTADO).flush(estado('AUTORIZADA'));

    expect(await screen.findByText(/El cliente autorizó la consulta/)).toBeInTheDocument();
  });

  it('una búsqueda nueva borra el aviso del envío anterior', async () => {
    const { http, usuario } = await renderizar();
    await encontrarCliente(usuario, http);
    http.expectOne(URL_ESTADO).flush(estado('SIN_SOLICITAR'));
    await usuario.click(await screen.findByRole('button', { name: 'Pedir autorización' }));
    http.expectOne(URL_SOLICITUD).flush(null, { status: 503, statusText: '' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await usuario.clear(campo('Documento de identidad'));
    await usuario.type(campo('Documento de identidad'), '52301884');
    await usuario.tab();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    http.expectOne(URL_BUSQUEDA).flush(ENCONTRADO);
    http.expectOne(URL_ESTADO).flush(estado('SIN_SOLICITAR'));
  });

  it('sin sesión no envía la solicitud de autorización', async () => {
    // No pasa en la aplicación: rolGuard no deja entrar sin sesión al portal del asesor.
    const { http, usuario } = await renderizar(null);
    await encontrarCliente(usuario, http);
    http.expectOne(URL_ESTADO).flush(estado('SIN_SOLICITAR'));

    await usuario.click(await screen.findByRole('button', { name: 'Pedir autorización' }));

    http.expectNone(URL_SOLICITUD);
  });
});
