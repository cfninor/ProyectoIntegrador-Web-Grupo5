import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { SolicitudParaCliente } from './modelos';
import { PaginaAutorizacionDatos } from './pagina-autorizacion-datos';

// SOLV-WEB-20 en inglés (D12): los mismos estados que la prueba en español, con la traducción de
// public/i18n/en-US.json cargada antes de importar la página.

const SOLICITUD_ID = '3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f';
const URL_SOLICITUD = `http://bff.prueba/v1/solicitudes-autorizacion/${SOLICITUD_ID}`;

const PENDIENTE: SolicitudParaCliente = {
  solicitudId: SOLICITUD_ID,
  estado: 'PENDIENTE',
  asesor: { nombre: 'Laura Gómez' },
  fechaSolicitud: '2026-10-09T14:30:00Z',
  catalogo: {
    version: 'v1',
    fuentes: [
      {
        fuente: 'OPEN_FINANCE',
        datos: [{ codigo: 'COMPORTAMIENTO_PAGO', entidades: ['ENTIDADES_FINANZAS_ABIERTAS'] }],
      },
      {
        fuente: 'OPEN_DATA',
        datos: [{ codigo: 'SALUD_ACTUARIAL_AGREGADA', entidades: ['MINSALUD'] }],
      },
    ],
  },
  condiciones: {
    duracionMeses: 12,
    finalidad: 'PERFILAMIENTO_VIDA_HIPOTECARIO',
    destinatario: 'SOLVENTA',
    baseLegal: ['LEY_1581_2012', 'DECRETO_1297_2022'],
    versionPolitica: 'v1',
  },
};

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar() {
  await render(PaginaAutorizacionDatos, {
    inputs: { solicitudId: SOLICITUD_ID },
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

describe('PaginaAutorizacionDatos · en inglés', () => {
  it('muestra la solicitud pendiente en inglés', async () => {
    const { http } = await renderizar();
    expect(screen.getByText('Loading the request…')).toBeInTheDocument();

    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);

    expect(
      await screen.findByText(
        'Request sent by Laura Gómez, from Solventa, on Oct 9, 2026 at 9:30 AM',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Authorize access to your data' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data we will check' })).toBeInTheDocument();
    expect(screen.getByText('Payment behavior and debt')).toBeInTheDocument();
    expect(screen.getByText('Population indicators, not your medical history')).toBeInTheDocument();
    expect(screen.getByText('Ministry of Health and Social Protection')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Terms' })).toBeInTheDocument();
    expect(screen.getByText('The authorization lasts 12 months')).toBeInTheDocument();
    expect(screen.getByText('Law 1581 of 2012')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^I authorize Solventa/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Authorize' })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Don't authorize" })).toBeEnabled();
  });

  it('autorizar muestra el resultado en inglés', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);
    await usuario.click(await screen.findByRole('checkbox', { name: /^I authorize Solventa/ }));

    await usuario.click(screen.getByRole('button', { name: 'Authorize' }));
    http
      .expectOne(`${URL_SOLICITUD}/decision`)
      .flush({ solicitudId: SOLICITUD_ID, estado: 'AUTORIZADA' });

    expect(
      await screen.findByRole('heading', { name: 'You authorized access to your data' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Authorized')).toBeInTheDocument();
  });

  it('una solicitud que no existe y un error de carga, en inglés', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load the request. Check your connection and try again.",
    );
    await usuario.click(screen.getByRole('button', { name: 'Try again' }));
    http.expectOne(URL_SOLICITUD).flush(null, { status: 404, statusText: '' });

    expect(
      await screen.findByRole('heading', { name: "We couldn't find this request" }),
    ).toBeInTheDocument();
  });
});
