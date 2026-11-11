import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import {
  FIRMA_ENVIADA,
  FIRMA_FIRMADA,
  FIRMA_VENCIDA,
  errorFirma,
} from '../../../testing/fixtures-firma';
import { HUELLA, POLIZA_ID } from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { Firma } from './modelos';
import { TarjetaFirma } from './tarjeta-firma';

// La tarjeta de la firma en inglés (SOLVENTAG5-57, CA8): textos traducidos y formatos de Estados
// Unidos, en hora de Bogotá.

const BFF = 'http://bff.prueba';
const URL_FIRMA = `${BFF}/v1/polizas/${POLIZA_ID}/firma`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.match(() => true);
  http?.verify();
  http = undefined;
});

async function renderizar(actor: Actor, firma: Firma | null) {
  const vista = await render(TarjetaFirma, {
    inputs: {
      polizaId: POLIZA_ID,
      actor,
      generadoEn: '2026-10-14T16:32:10.850Z',
      huella: HUELLA,
      rutaPago: '/cliente/cotizar/oferta/c-1/pago',
    },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  const consulta = http.expectOne(URL_FIRMA);
  if (firma) {
    consulta.flush(firma);
  } else {
    consulta.flush(errorFirma('FIRMA_NO_ENCONTRADA'), { status: 404, statusText: 'Not Found' });
  }
  vista.detectChanges();
  return { ...vista, http };
}

const hitos = () =>
  within(screen.getByRole('list', { name: 'Signature tracking' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/\s+/g, ' ').trim());

describe('TarjetaFirma · en inglés', () => {
  it('without a signature, the client sees «Send signature link» in the second person', async () => {
    await renderizar('cliente', null);

    expect(screen.getByRole('heading', { name: 'Electronic signature' })).toBeInTheDocument();
    expect(screen.getByText(/We will send you a link and a one-time code/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send signature link' })).toBeVisible();
  });

  it('PAGO_NO_APROBADO offers «Go to payment»', async () => {
    const { http, detectChanges } = await renderizar('asesor', null);

    screen.getByRole('button', { name: 'Send signature link' }).click();
    http
      .expectOne({ method: 'POST', url: URL_FIRMA })
      .flush(errorFirma('PAGO_NO_APROBADO'), { status: 409, statusText: 'Conflict' });
    detectChanges();

    expect(
      screen.getByRole('heading', { name: 'The first premium payment is missing' }),
    ).toBeVisible();
    expect(screen.getByText(/the client's first premium payment is approved/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to payment' })).toBeVisible();
  });

  it('SENT: «Awaiting signature», the milestones in US format and «Resend link»', async () => {
    await renderizar('asesor', FIRMA_ENVIADA);

    expect(screen.getByText('Awaiting signature', { selector: '.chip' })).toHaveClass('chip-ambar');
    expect(
      screen.getByText('The client received the link and the code by email and text message.'),
    ).toBeVisible();
    expect(screen.getByText('The link expires on Nov 9, 2026 at 10:02 AM.')).toBeVisible();
    expect(hitos()).toEqual([
      'Document generated Oct 14, 2026 at 11:32 AM',
      'Link sent Nov 6, 2026 at 10:02 AM',
      'Link opened Pending',
      'Document signed Pending',
    ]);
    expect(screen.getByRole('button', { name: 'Resend link' })).toBeVisible();
  });

  it('SIGNED: «Signed» and the certificate', async () => {
    await renderizar('cliente', FIRMA_FIRMADA);

    expect(screen.getByText('Signed', { selector: '.chip' })).toHaveClass('chip-verde');
    expect(screen.getByText('You signed your policy. It can now be issued.')).toBeVisible();
    const certificado = within(
      screen.getByRole('article', { name: 'Electronic signature certificate' }),
    );
    expect(certificado.getByText('Date and time').nextElementSibling).toHaveTextContent(
      'Nov 6, 2026 at 10:23 AM',
    );
    expect(certificado.getByText('Signed fingerprint').nextElementSibling).toHaveTextContent(
      HUELLA,
    );
  });

  it('EXPIRED: «Expired» and the expired milestone', async () => {
    await renderizar('cliente', FIRMA_VENCIDA);

    expect(screen.getByText('Expired', { selector: '.chip' })).toHaveClass('chip-gris');
    expect(
      screen.getByText(
        'You did not sign within 72 hours: the link expired, your policy is not issued, and we refund your first premium payment.',
      ),
    ).toBeVisible();
    expect(hitos().at(-1)).toBe('Link expired Nov 9, 2026 at 10:02 AM');
  });
});
