import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { provideSesionSimulada } from '../../core/sesion/sesion-simulada';
import { PaginaCotizarCliente } from './pagina-cotizar-cliente';

// La cotización del cliente en inglés (D8, D12): segunda persona, montos y fechas de Estados Unidos.

const BFF = 'http://bff.prueba';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const URL_ESTADO = `${BFF}/v1/clientes/${CLIENTE_ID}/autorizacion-datos`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar() {
  await render(PaginaCotizarCliente, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: APP_CONFIG,
        useValue: {
          apiBaseUrl: BFF,
          sesionSimulada: {
            usuario: { id: 'cliente-local', nombre: 'Laura Gómez Pardo' },
            rol: 'CLIENTE',
            clienteId: CLIENTE_ID,
            documentoEnmascarado: 'CC ••••5678',
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

describe('PaginaCotizarCliente · en inglés', () => {
  it('la caja dice desde cuándo está vigente la autorización, con la fecha de Estados Unidos', async () => {
    const { http } = await renderizar();
    expect(screen.getByText('Checking your authorization…')).toBeInTheDocument();

    http
      .expectOne(URL_ESTADO)
      .flush({ clienteId: CLIENTE_ID, estado: 'AUTORIZADA', fechaEstado: '2026-10-09T15:02:11Z' });

    expect(
      await screen.findByText(
        'Your authorization to access your Open Finance and Open Data information has been active since Oct 9, 2026.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Laura Gómez Pardo');
  });

  it('sin autorización calcula y avisa en inglés', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'SIN_SOLICITAR' });
    expect(
      await screen.findByText(
        "You don't have an active authorization: we'll calculate the premium without your risk profile.",
      ),
    ).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Loan amount (COP)'), '280000000');
    await usuario.type(screen.getByLabelText('Term (years)'), '15');
    await usuario.type(screen.getByLabelText('Property city'), 'Bogotá D.C.');
    await usuario.type(screen.getByLabelText('Lender'), 'Banco de Ejemplo');
    await usuario.click(screen.getByRole('button', { name: 'Calculate quote' }));
    http.expectOne(`${BFF}/v1/cotizaciones`).flush({
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
      calculadaSinPerfil: true,
      motivoSinPerfil: 'SIN_CONSENTIMIENTO',
    });

    const panel = within(await screen.findByRole('region', { name: 'Estimated premium' }));
    expect(panel.getByText('$148,500')).toBeInTheDocument();
    expect(
      panel.getByText(
        "Calculated without your risk profile because you don't have an active authorization.",
      ),
    ).toBeInTheDocument();
  });
});
