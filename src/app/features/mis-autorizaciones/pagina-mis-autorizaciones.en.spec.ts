import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';

import { APP_CONFIG } from '../../core/config/app-config';
import { provideSesionSimulada } from '../../core/sesion/sesion-simulada';
import { Consentimiento } from '../autorizacion-datos/modelos';
import { PaginaMisAutorizaciones } from './pagina-mis-autorizaciones';

// «Mis autorizaciones» en inglés (D8, D12): textos y fechas de Estados Unidos.

const BFF = 'http://bff.prueba';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const VIGENTE: Consentimiento = {
  consentimientoId: '7c6e5d4b-3a2f-4e1d-9c8b-0a1f2e3d4c5b',
  estado: 'VIGENTE',
  alcance: ['COMPORTAMIENTO_PAGO'],
  finalidad: 'PERFILAMIENTO_VIDA_HIPOTECARIO',
  destinatario: 'SOLVENTA',
  versionCatalogo: 'v1',
  versionPolitica: 'v1',
  fechaOtorga: '2026-10-09T15:02:11Z',
  fechaVencimiento: '2027-10-09T15:02:11Z',
};

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function cargar(consentimientos: Consentimiento[]) {
  await render(PaginaMisAutorizaciones, {
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
          },
        },
      },
      provideSesionSimulada(),
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  http
    .expectOne(`${BFF}/v1/clientes/${CLIENTE_ID}/consentimientos`)
    .flush({ clienteId: CLIENTE_ID, consentimientos });
}

describe('PaginaMisAutorizaciones · en inglés', () => {
  it('CA1: el vigente en inglés, con las fechas de Estados Unidos', async () => {
    await cargar([VIGENTE]);

    const vigentes = within(await screen.findByRole('region', { name: 'Active' }));
    expect(vigentes.getByText('Who you authorize').nextElementSibling).toHaveTextContent(
      'Solventa',
    );
    expect(vigentes.getByText('Granted on').nextElementSibling).toHaveTextContent('Oct 9, 2026');
    expect(vigentes.getByText('Expires on').nextElementSibling).toHaveTextContent('Oct 9, 2027');
  });
});
