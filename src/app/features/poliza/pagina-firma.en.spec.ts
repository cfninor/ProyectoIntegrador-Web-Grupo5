import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import {
  NO_EMITIBLE,
  POLIZA_GENERADA,
  POLIZA_GENERANDO,
  SOLICITUD_ID_POLIZA,
} from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { PaginaFirma } from './pagina-firma';

// SOLV-WEB-10 en inglés (SOLVENTAG5-56, CA7): textos traducidos y formatos de Estados Unidos.

const BFF = 'http://bff.prueba';
const URL_GENERAR = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.match(() => true);
  http?.verify();
  http = undefined;
});

async function renderizar(actor: Actor = 'cliente') {
  const vista = await render(PaginaFirma, {
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
  return { ...vista, http };
}

const titulo = () => screen.getByRole('heading', { level: 2 });
const dato = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling;

describe('PaginaFirma · SOLV-WEB-10 en inglés', () => {
  it('generándose', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERANDO);
    detectChanges();

    expect(titulo()).toHaveTextContent('Your policy for signature');
    expect(screen.getByText(/We're generating your policy document/)).toBeVisible();
    expect(screen.getByText('Generating', { selector: '.chip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toHaveAccessibleDescription(
      'The PDF will be available once it finishes generating.',
    );
    expect(screen.getByText('Generating the document')).toBeInTheDocument();
    const pasos = within(screen.getByRole('list', { name: 'Purchase steps' }));
    expect(pasos.getByText('Signature').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('generada, con la vista previa y el hito con su hora', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    expect(screen.getByRole('article', { name: 'Your policy summary' })).toBeInTheDocument();
    expect(dato('Policyholder')).toHaveTextContent('María Fernanda Pérez Gómez');
    expect(dato('Sum insured')).toHaveTextContent('$200,000,000');
    expect(dato('Monthly premium')).toHaveTextContent('$70,000');
    expect(dato('Term')).toHaveTextContent('From Oct 14, 2026 to Oct 14, 2046');
    expect(screen.getByRole('heading', { name: 'Coverages' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Exclusions' })).toBeInTheDocument();
    expect(screen.getByText('Fallecimiento del deudor')).toBeInTheDocument();
    const hito = within(screen.getByRole('list', { name: 'Signature tracking' })).getByRole(
      'listitem',
    );
    expect(hito).toHaveTextContent('Document generated Oct 14, 2026 at 11:32 AM');
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  });

  it('al asesor', async () => {
    const { http, detectChanges } = await renderizar('asesor');
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    expect(titulo()).toHaveTextContent("Client's policy for signature");
    expect(screen.getByText(/ready for the client to review and sign/)).toBeVisible();
  });

  it.each([
    ['PRIMA_AJUSTADA_SIN_ACEPTAR', 'First accept the new premium', 'New premium not accepted'],
    ['EN_REVISION', 'Your application is under review', 'Pending review'],
    ['SIN_DECISION', "Your application doesn't have a decision yet", 'No decision'],
    ['RECHAZADA', "We can't generate your policy", 'Declined'],
    ['SIN_CLIENTE', 'The application has no client', 'No client'],
  ] as const)('409 %s', async (motivo, textoTitulo, chip) => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(NO_EMITIBLE[motivo], { status: 409, statusText: 'Conflict' });
    detectChanges();

    expect(titulo()).toHaveTextContent(textoTitulo);
    expect(within(dato('Application status') as HTMLElement).getByText(chip)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to underwriting' })).toBeInTheDocument();
  });
});
