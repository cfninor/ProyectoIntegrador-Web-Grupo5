import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { provideSesionSimulada } from '../../core/sesion/sesion-simulada';
import { PaginaCotizarAsesor } from './pagina-cotizar-asesor';

// SOLV-WEB-05 en inglés (D8, D12): búsqueda, caja de autorización y avisos del envío.

const BFF = 'http://bff.prueba';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const URL_ESTADO = `${BFF}/v1/clientes/${CLIENTE_ID}/autorizacion-datos`;
const URL_SOLICITUD = `${BFF}/v1/clientes/${CLIENTE_ID}/solicitudes-autorizacion`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar() {
  await render(PaginaCotizarAsesor, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: APP_CONFIG,
        useValue: {
          apiBaseUrl: BFF,
          sesionSimulada: {
            usuario: { id: 'asesor-017', nombre: 'Ana Sofía Reyes' },
            rol: 'ASESOR',
          },
        },
      },
      provideSesionSimulada(),
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { http, usuario: userEvent.setup() };
}

describe('PaginaCotizarAsesor · en inglés', () => {
  it('busca al cliente, pide la autorización y lo avisa en inglés', async () => {
    const { http, usuario } = await renderizar();
    expect(
      screen.getByText(
        'Look up the customer by their document to see the status of their authorization.',
      ),
    ).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('ID document'), '1020305678');
    await usuario.tab();
    expect(screen.getByText('Looking up the customer…')).toBeInTheDocument();
    http.expectOne(`${BFF}/v1/clientes/busqueda`).flush({
      clienteId: CLIENTE_ID,
      nombres: 'Laura',
      apellidos: 'Gómez Pardo',
      documentoEnmascarado: 'CC ••••5678',
    });
    expect(await screen.findByText("Checking the customer's authorization…")).toBeInTheDocument();
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'SIN_SOLICITAR' });

    await usuario.click(await screen.findByRole('button', { name: 'Request authorization' }));
    http.expectOne(URL_SOLICITUD).flush(
      {
        solicitudId: 's-1',
        estado: 'PENDIENTE',
        fechaSolicitud: '2026-10-14T15:00:00Z',
        envios: 1,
        reenviada: false,
        enlace: 'http://localhost:4200/autorizar/s-1',
      },
      { status: 201, statusText: 'Created' },
    );

    expect(
      await screen.findByText('We sent the authorization request to the customer.'),
    ).toBeInTheDocument();
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'ESPERANDO_CLIENTE' });
    expect(await screen.findByRole('button', { name: 'Resend request' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate quote' })).toBeDisabled();
  });

  it('el cliente no encontrado y el error del envío, en inglés', async () => {
    const { http, usuario } = await renderizar();
    await usuario.type(screen.getByLabelText('ID document'), '1020305678');
    await usuario.tab();
    http
      .expectOne(`${BFF}/v1/clientes/busqueda`)
      .flush({ codigo: 'CLIENTE_NO_ENCONTRADO', detalle: 'x' }, { status: 404, statusText: '' });
    expect(
      await screen.findByText("We couldn't find a customer with that document."),
    ).toBeInTheDocument();

    await usuario.clear(screen.getByLabelText('ID document'));
    await usuario.type(screen.getByLabelText('ID document'), '52301884{Enter}');
    http.expectOne(`${BFF}/v1/clientes/busqueda`).flush({
      clienteId: CLIENTE_ID,
      nombres: 'Laura',
      apellidos: 'Gómez Pardo',
      documentoEnmascarado: 'CC ••••1884',
    });
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'SIN_SOLICITAR' });
    await usuario.click(await screen.findByRole('button', { name: 'Request authorization' }));
    http.expectOne(URL_SOLICITUD).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't send the authorization request. Try again.",
    );
  });
});
