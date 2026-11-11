import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';

import { FIRMA_FIRMADA } from '../../../testing/fixtures-firma';
import {
  HUELLA,
  POLIZA_ID,
  POLIZA_NO_EMITIBLE,
  SOLICITUD_ID_POLIZA,
} from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { EstadoPoliza } from './modelos';
import { TarjetaFirma } from './tarjeta-firma';

// La emisión en la tarjeta de firma, en inglés (SOLVENTAG5-58, CA7).

const BFF = 'http://bff.prueba';
const URL_FIRMA = `${BFF}/v1/polizas/${POLIZA_ID}/firma`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(estadoPoliza: EstadoPoliza) {
  const vista = await render(TarjetaFirma, {
    inputs: {
      polizaId: POLIZA_ID,
      actor: 'cliente',
      generadoEn: '2026-10-14T16:32:10.850Z',
      huella: HUELLA,
      rutaPago: '/cliente/cotizar/oferta/c-1/pago',
      solicitudId: SOLICITUD_ID_POLIZA,
      estadoPoliza,
      rutaEmision: '/cliente/cotizar/oferta/c-1/emision',
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
  http.expectOne(URL_FIRMA).flush(FIRMA_FIRMADA);
  vista.detectChanges();
  return { ...vista, http };
}

describe('TarjetaFirma · emisión en inglés', () => {
  it('ofrece «Issue policy» y muestra el 409 traducido', async () => {
    const { http, detectChanges } = await renderizar('PENDIENTE_FIRMA');

    screen.getByRole('button', { name: 'Issue policy' }).click();
    http
      .expectOne(`${BFF}/v1/polizas/${POLIZA_ID}/emision`)
      .flush(POLIZA_NO_EMITIBLE.PAGO_NO_APROBADO, { status: 409, statusText: 'Conflict' });
    detectChanges();

    expect(
      screen.getByRole('heading', { name: "The first premium payment isn't approved" }),
    ).toBeInTheDocument();
  });

  it('con la póliza VIGENTE ofrece «View confirmation»', async () => {
    await renderizar('VIGENTE');

    expect(screen.getByText('You signed your policy and it has been issued.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View confirmation' })).toBeInTheDocument();
  });
});
