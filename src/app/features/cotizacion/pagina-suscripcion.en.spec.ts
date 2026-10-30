import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';

import { POR_RESULTADO } from '../../../testing/fixtures-resultado';
import { APP_CONFIG } from '../../core/config/app-config';
import { PaginaSuscripcion } from './pagina-suscripcion';

// El paso de suscripción en inglés (D12): textos traducidos, montos y fechas de Estados Unidos.

const BFF = 'http://bff.prueba';

describe('PaginaSuscripcion en inglés', () => {
  it('muestra la solicitud evaluada en inglés', async () => {
    const { detectChanges } = await render(PaginaSuscripcion, {
      inputs: { cotizacionId: 'c-1', actor: 'cliente', solicitudId: 's-1' },
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
        IDIOMA_INGLES,
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${BFF}/v1/solicitudes-suscripcion/s-1`).flush({
      solicitudId: 's-1',
      cotizacionId: 'c-1',
      estado: 'EVALUADA',
      cobertura: { ramo: 'VIDA_HIPOTECARIO', datosBien: {} },
      prima: 148_500,
      moneda: 'COP',
      periodicidad: 'MENSUAL',
      canal: 'web',
      aceptadaEn: '2026-10-14T15:05:00Z',
    });
    detectChanges();

    expect(screen.getByRole('heading', { name: 'We evaluated your application' })).toBeVisible();
    expect(screen.getByText('Application number')).toBeInTheDocument();
    expect(screen.getByText('$148,500')).toBeInTheDocument();
    expect(screen.getByText('Oct 14, 2026 at 10:05 AM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the offer' })).toBeInTheDocument();
    http.verify();
  });

  it.each([
    ['ACEPTADA', 'We approved your application', 'Approved'],
    ['AJUSTADA', 'We approved your application with adjustments', 'Approved with adjustments'],
    ['RECHAZADA', "We couldn't approve your application", 'Declined'],
    ['EN_REVISION', 'Your application is under review', 'Pending review'],
  ] as const)('muestra la decisión %s en inglés', async (estado, titulo, chip) => {
    const { detectChanges } = await render(PaginaSuscripcion, {
      inputs: { cotizacionId: 'c-1', actor: 'cliente', solicitudId: 's-1' },
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
        IDIOMA_INGLES,
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${BFF}/v1/solicitudes-suscripcion/s-1`).flush(POR_RESULTADO[estado]);
    detectChanges();

    expect(screen.getByRole('heading', { name: titulo })).toBeVisible();
    expect(screen.getByText('Decision', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      chip,
    );
    http.verify();
  });

  it('una solicitud que no existe lo dice en inglés (404)', async () => {
    const { detectChanges } = await render(PaginaSuscripcion, {
      inputs: { cotizacionId: 'c-1', actor: 'cliente', solicitudId: 's-1' },
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
        IDIOMA_INGLES,
      ],
    });
    TestBed.inject(HttpTestingController)
      .expectOne(`${BFF}/v1/solicitudes-suscripcion/s-1`)
      .flush(
        { codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA', detalle: 'x' },
        { status: 404, statusText: 'Not Found' },
      );
    detectChanges();

    expect(
      screen.getByRole('heading', { name: "We couldn't find this underwriting application" }),
    ).toBeVisible();
  });
});
