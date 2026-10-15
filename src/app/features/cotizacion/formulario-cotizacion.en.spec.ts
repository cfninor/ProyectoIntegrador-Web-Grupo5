import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { Actor, CajaAutorizacion, FormularioCotizacion } from './formulario-cotizacion';
import { Cotizacion } from './modelos';

// El formulario de cotización en inglés (D8, D12): textos, montos con coma de miles y fechas en
// formato de Estados Unidos, en hora de Bogotá.

const URL_COTIZAR = 'http://bff.prueba/v1/cotizaciones';
const CLIENTE = {
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  nombreCompleto: 'Laura Gómez Pardo',
  documento: 'CC ••••5678',
};
const SIN_PERFIL: Cotizacion = {
  cotizacionId: '8f1e2d3c-4b5a-4c6d-9e7f-0a1b2c3d4e5f',
  ramo: 'VIDA_HIPOTECARIO',
  datosBien: {
    montoCredito: 280_000_000,
    plazoAnios: 15,
    ciudadInmueble: 'Bogotá D.C.',
    entidadAcreedora: 'Banco de Ejemplo',
  },
  clienteId: CLIENTE.clienteId,
  prima: 148_500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  fechaCotizacion: '2026-10-14T15:00:00Z',
  vigenteHasta: '2026-10-21T15:00:00Z',
  estado: 'VIGENTE',
  calculadaSinPerfil: true,
  motivoSinPerfil: 'SIN_CONSENTIMIENTO',
};

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(actor: Actor, autorizacion: CajaAutorizacion) {
  await render(FormularioCotizacion, {
    inputs: { actor, cliente: CLIENTE, autorizacion },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { http, usuario: userEvent.setup() };
}

const campo = (nombre: string) => screen.getByLabelText(nombre) as HTMLInputElement;

describe('FormularioCotizacion · en inglés', () => {
  it('el cliente ve el formulario, la caja y la invitación en inglés, en segunda persona', async () => {
    await renderizar('cliente', { tipo: 'estado', estado: 'SIN_SOLICITAR' });

    expect(screen.getByRole('heading', { name: 'Customer and loan details' })).toBeInTheDocument();
    expect(screen.getByText(/With these details and your authorization/)).toBeInTheDocument();
    for (const etiqueta of ['Full name', 'ID document', 'Loan amount (COP)', 'Term (years)']) {
      expect(campo(etiqueta)).toBeInTheDocument();
    }
    expect(campo('Property city')).toBeInTheDocument();
    expect(campo('Lender')).toBeInTheDocument();
    expect(
      screen.getByText(
        "You don't have an active authorization: we'll calculate the premium without your risk profile.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Complete the details and calculate the quote to see the estimated premium.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'To calculate, complete: Loan amount (COP), Term (years), Property city, Lender.',
      ),
    ).toBeInTheDocument();
  });

  it('los errores y el monto usan el formato de Estados Unidos', async () => {
    const { usuario } = await renderizar('cliente', { tipo: 'cargando' });

    await usuario.type(campo('Loan amount (COP)'), '5000');
    await usuario.tab();
    expect(
      screen.getByText('It must be between $10,000,000 and $1,200,000,000.'),
    ).toBeInTheDocument();

    await usuario.clear(campo('Loan amount (COP)'));
    await usuario.type(campo('Loan amount (COP)'), '280000000');
    await usuario.tab();
    expect(campo('Loan amount (COP)')).toHaveValue('280,000,000');
    expect(screen.getByText('Checking your authorization…')).toBeInTheDocument();
  });

  it('el panel de prima muestra montos, plazo, aviso y fecha en inglés', async () => {
    const { http, usuario } = await renderizar('cliente', {
      tipo: 'estado',
      estado: 'SIN_SOLICITAR',
    });
    await usuario.type(campo('Loan amount (COP)'), '280000000');
    await usuario.type(campo('Term (years)'), '15');
    await usuario.type(campo('Property city'), 'Bogotá D.C.');
    await usuario.type(campo('Lender'), 'Banco de Ejemplo');

    await usuario.click(screen.getByRole('button', { name: 'Calculate quote' }));
    expect(screen.getByRole('button', { name: 'Calculating…' })).toBeDisabled();
    http.expectOne(URL_COTIZAR).flush(SIN_PERFIL);

    const panel = within(await screen.findByRole('region', { name: 'Estimated premium' }));
    expect(panel.getByText('$148,500')).toBeInTheDocument();
    expect(panel.getByText('/ month')).toBeInTheDocument();
    expect(panel.getByText('Loan balance')).toBeInTheDocument();
    expect(panel.getByText('$280,000,000')).toBeInTheDocument();
    expect(panel.getByText('15 years')).toBeInTheDocument();
    expect(panel.getByText('Offer valid until Oct 21, 2026')).toBeInTheDocument();
    expect(
      panel.getByText(
        "Calculated without your risk profile because you don't have an active authorization.",
      ),
    ).toBeInTheDocument();
  });

  it('el error del servicio se puede reintentar, en inglés', async () => {
    const { http, usuario } = await renderizar('cliente', { tipo: 'estado', estado: 'AUTORIZADA' });
    await usuario.type(campo('Loan amount (COP)'), '280000000');
    await usuario.type(campo('Term (years)'), '15');
    await usuario.type(campo('Property city'), 'Bogotá D.C.');
    await usuario.type(campo('Lender'), 'Banco de Ejemplo');
    await usuario.click(screen.getByRole('button', { name: 'Calculate quote' }));

    http.expectOne(URL_COTIZAR).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't calculate the quote. Your details are still here: try again.",
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('el asesor ve la caja en tercera persona, con la fecha y la hora de Estados Unidos', async () => {
    await renderizar('asesor', {
      tipo: 'estado',
      estado: 'AUTORIZADA',
      fechaEstado: '2026-10-09T15:02:11Z',
    });

    expect(
      screen.getByText(/With these details and the customer's authorization/),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Document type' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'The customer authorized access to their Open Finance and Open Data information on Oct 9, 2026 at 10:02 AM.',
      ),
    ).toBeInTheDocument();
  });

  it('el asesor ve «Request authorization» y «Resend request»', async () => {
    await renderizar('asesor', { tipo: 'estado', estado: 'VENCIDA' });
    expect(screen.getByText("The customer's authorization expired.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request authorization' })).toBeInTheDocument();
  });
});
