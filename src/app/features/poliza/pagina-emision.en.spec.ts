import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import {
  POLIZA_EMITIDA,
  POLIZA_EMITIDA_SIN_DETALLE,
  POLIZA_GENERADA,
  SOLICITUD_ID_POLIZA,
} from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { Poliza } from './modelos';
import { PaginaEmision } from './pagina-emision';

// SOLV-WEB-11 en inglés (SOLVENTAG5-58, CA7): textos traducidos para el asesor y el cliente, y
// fechas, horas y montos con los formatos de Estados Unidos, en hora de Bogotá.

const BFF = 'http://bff.prueba';
const URL_GENERAR = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`;
const URL_POLIZA = `${BFF}/v1/polizas/${POLIZA_EMITIDA.polizaId}`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function conPoliza(poliza: Poliza, actor: Actor) {
  const vista = await render(PaginaEmision, {
    inputs: { cotizacionId: 'c-1', actor, solicitudId: SOLICITUD_ID_POLIZA },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  // Como el núcleo: el POST trae la póliza VIGENTE sin el detalle y el GET, completa.
  if (poliza.estado === 'VIGENTE') {
    http.expectOne(URL_GENERAR).flush(POLIZA_EMITIDA_SIN_DETALLE);
    http.expectOne(URL_POLIZA).flush(poliza);
  } else {
    http.expectOne(URL_GENERAR).flush(poliza);
  }
  vista.detectChanges();
  return vista;
}

const dato = (etiqueta: string, contenedor: HTMLElement = document.body) =>
  within(contenedor).getByText(etiqueta, { selector: 'dt' }).nextElementSibling;

describe('PaginaEmision · SOLV-WEB-11 en inglés', () => {
  it('el cliente ve la confirmación en inglés, con los formatos de Estados Unidos', async () => {
    await conPoliza(POLIZA_EMITIDA, 'cliente');

    expect(screen.getByRole('img', { name: 'Policy issued' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Your policy was issued!');
    expect(screen.getByText(/Your policy is now formalized and in force/)).toBeInTheDocument();
    expect(dato('Policy number')).toHaveTextContent('SV-VH-2026-004821');
    expect(dato('Policyholder')).toHaveTextContent('María Fernanda Pérez Gómez · CC ••••5678');
    expect(dato('Start date')).toHaveTextContent('Nov 6, 2026');
    expect(dato('Next charge')).toHaveTextContent('Dec 6, 2026 for $70,000');
    const certificado = screen.getByRole('article', { name: 'Electronic signature certificate' });
    expect(dato('Date and time', certificado)).toHaveTextContent('Nov 6, 2026 at 10:23 AM');
    const comprobante = screen.getByRole('article', { name: 'Payment receipt' });
    expect(dato('Card', comprobante)).toHaveTextContent('VISA •••• 4242');
    expect(dato('Amount', comprobante)).toHaveTextContent('$70,000');
    expect(dato('Date', comprobante)).toHaveTextContent('Nov 6, 2026 at 10:00 AM');
    expect(
      screen.getByText(
        'We sent you the policy, the signature certificate and the payment receipt.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New quote' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toBeInTheDocument();
  });

  it('el asesor la ve en tercera persona', async () => {
    await conPoliza(POLIZA_EMITIDA, 'asesor');

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "The client's policy was issued",
    );
    expect(dato('Next charge')).toHaveTextContent('Dec 6, 2026 for $70,000');
    expect(
      screen.getByRole('article', { name: 'Electronic signature certificate' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Payment receipt' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'We sent the client the policy, the signature certificate and the payment receipt.',
      ),
    ).toBeInTheDocument();
  });

  it('una póliza sin emitir lleva a la firma, en inglés', async () => {
    await conPoliza(POLIZA_GENERADA, 'cliente');

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "The policy hasn't been issued yet",
    );
    expect(screen.getByRole('link', { name: 'Go to signature' })).toBeInTheDocument();
  });
});
