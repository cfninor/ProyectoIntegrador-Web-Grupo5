import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from './formulario-cotizacion';
import { PaginaOferta } from './pagina-oferta';

// La oferta en inglés (D8, D12): textos traducidos, montos y fechas de Estados Unidos.

const BFF = 'http://bff.prueba';
const OFERTA = {
  cotizacionId: 'c-1',
  ramo: 'VIDA_HIPOTECARIO',
  datosBien: {
    montoCredito: 280_000_000,
    plazoAnios: 15,
    ciudadInmueble: 'Bogotá D.C.',
    entidadAcreedora: 'Banco Andino S.A.',
  },
  prima: 148_500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  fechaCotizacion: '2026-10-14T15:00:00Z',
  vigenteHasta: '2026-10-21T15:00:00Z',
  estado: 'VIGENTE',
  calculadaSinPerfil: false,
  perfil: {
    perfilId: 'p-1',
    version: 1,
    score: 640,
    nivel: 'MEDIO',
    senales: { comportamientoPago: 72, estabilidadIngresos: 65, ubicacion: 58, endeudamiento: 30 },
    calculadoEn: '2026-10-14T14:43:00Z',
    vigenteHasta: '2026-10-15T14:43:00Z',
  },
};

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function cargar(actor: Actor) {
  await render(PaginaOferta, {
    inputs: { cotizacionId: 'c-1', actor },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  http.expectOne(`${BFF}/v1/cotizaciones/c-1`).flush(OFERTA);
  await screen.findByRole('region', { name: 'Coverage summary' });
}

describe('PaginaOferta en inglés', () => {
  it('muestra la oferta del cliente en inglés, con montos y fechas de Estados Unidos', async () => {
    await cargar('cliente');

    const prima = within(screen.getByRole('region', { name: 'Monthly premium' }));
    expect(prima.getByText('$148,500')).toBeInTheDocument();
    expect(prima.getByText('COP / month · monthly payment')).toBeInTheDocument();
    expect(prima.getByRole('img', { name: 'Score 640 out of 850' })).toBeInTheDocument();
    expect(prima.getByText('Medium risk')).toHaveClass('chip-ambar');
    expect(prima.getByText(/Offer valid until/)).toHaveTextContent(
      'Offer valid until Oct 21, 2026',
    );

    const perfil = within(screen.getByRole('region', { name: 'Why you got this price' }));
    expect(perfil.getByText('Current profile · Oct 14, 2026 9:43 AM')).toBeInTheDocument();
    expect(perfil.getAllByRole('listitem').map((fila) => fila.textContent?.trim())).toEqual([
      'Payment behaviorVery good (72 out of 100)',
      'Income stabilityMedium (65 out of 100)',
      'Property locationMedium risk (58 out of 100)',
      'Current debtHigh (30 out of 100)',
    ]);

    const cobertura = within(screen.getByRole('region', { name: 'Coverage summary' }));
    const dato = (nombre: string) => cobertura.getByText(nombre).nextElementSibling;
    expect(dato('Product')).toHaveTextContent('Mortgage life');
    expect(dato('Sum insured')).toHaveTextContent('$280,000,000');
    expect(dato('Payment frequency')).toHaveTextContent('Monthly');
    expect(dato('Policy term')).toHaveTextContent('15 years');
    expect(dato('Beneficiary')).toHaveTextContent('Banco Andino S.A.');
  });

  it('para el asesor habla del cliente en tercera persona', async () => {
    await cargar('asesor');

    expect(
      screen.getByRole('heading', { name: 'Why the client got this price' }),
    ).toBeInTheDocument();
  });
});
