import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { SolicitudSuscripcion } from '../suscripcion/modelos';
import { Actor } from './formulario-cotizacion';
import { INTERVALO_CONSULTA_MS, MAXIMO_CONSULTAS, PaginaSuscripcion } from './pagina-suscripcion';

// Paso 2 de la contratación (SOLVENTAG5-237): la solicitud que creó «Continuar a la contratación»
// con su estado. Mientras está en PENDIENTE_EVALUACION se consulta cada pocos segundos (ADR 0007,
// R8) hasta verla EVALUADA por la suscripción automática (SOLVENTAG5-50).

const BFF = 'http://bff.prueba';
const SOLICITUD_ID = '7e3a9c1f-2b4d-4f6a-8c0e-1d2f3a4b5c6d';
const URL_SOLICITUD = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID}`;
const PENDIENTE: SolicitudSuscripcion = {
  solicitudId: SOLICITUD_ID,
  cotizacionId: 'c-1',
  estado: 'PENDIENTE_EVALUACION',
  cobertura: { ramo: 'VIDA_HIPOTECARIO', datosBien: { montoCredito: 280_000_000 } },
  prima: 148_500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  canal: 'web',
  // 15:05 UTC = 10:05 en Bogotá.
  aceptadaEn: '2026-10-14T15:05:00Z',
};
const EVALUADA: SolicitudSuscripcion = { ...PENDIENTE, estado: 'EVALUADA' };

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
  jest.useRealTimers();
});

async function renderizar(actor: Actor = 'cliente', solicitudId: string | null = SOLICITUD_ID) {
  const vista = await render(PaginaSuscripcion, {
    inputs: { cotizacionId: 'c-1', actor, ...(solicitudId ? { solicitudId } : {}) },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { ...vista, http };
}

const titulo = () => screen.getByRole('heading', { level: 2 });

describe('PaginaSuscripcion · SOLVENTAG5-237', () => {
  it('marca la cotización como hecha y la suscripción como el paso actual', async () => {
    const { http } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(EVALUADA);

    const pasos = within(screen.getByRole('list', { name: 'Pasos de la contratación' }));
    expect(pasos.getByText('Cotización').closest('li')).toHaveClass('hecho');
    expect(pasos.getByText('Suscripción').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(pasos.getByText('Pago').closest('li')).not.toHaveClass('hecho');
  });

  it('consulta la solicitud y la muestra en evaluación con su resumen', async () => {
    const { http, detectChanges } = await renderizar();
    expect(titulo()).toHaveTextContent('Consultando la solicitud…');

    const consulta = http.expectOne(URL_SOLICITUD);
    expect(consulta.request.method).toBe('GET');
    consulta.flush(PENDIENTE);
    detectChanges();

    expect(titulo()).toHaveTextContent('Estamos evaluando tu solicitud');
    expect(screen.getByText(/con el perfil de riesgo con que cotizaste/)).toBeInTheDocument();
    expect(screen.getByText('Número de solicitud').nextElementSibling).toHaveTextContent(
      SOLICITUD_ID,
    );
    expect(screen.getByText('Prima mensual').nextElementSibling).toHaveTextContent('$ 148.500');
    expect(screen.getByText('Aceptada el').nextElementSibling).toHaveTextContent(
      '14/10/2026 a las 10:05',
    );
    http.match(URL_SOLICITUD);
  });

  it('vuelve a consultar mientras sigue en evaluación hasta verla evaluada', async () => {
    jest.useFakeTimers();
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);

    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS);
    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS);
    http.expectOne(URL_SOLICITUD).flush(EVALUADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Evaluamos tu solicitud');
    expect(screen.getByText(/Pronto verás aquí la decisión/)).toBeInTheDocument();
    // Evaluada: no se consulta más.
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 3);
    http.expectNone(URL_SOLICITUD);
  });

  it('si la evaluación tarda más de lo normal, lo dice y permite consultar de nuevo', async () => {
    jest.useFakeTimers();
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);
    for (let i = 1; i < MAXIMO_CONSULTAS; i++) {
      jest.advanceTimersByTime(INTERVALO_CONSULTA_MS);
      http.expectOne(URL_SOLICITUD).flush(PENDIENTE);
    }
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 3);
    http.expectNone(URL_SOLICITUD);
    detectChanges();

    expect(screen.getByRole('status')).toHaveTextContent(
      'La evaluación está tardando más de lo normal.',
    );
    screen.getByRole('button', { name: 'Consultar de nuevo' }).click();
    http.expectOne(URL_SOLICITUD).flush(EVALUADA);
    detectChanges();
    expect(titulo()).toHaveTextContent('Evaluamos tu solicitud');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('al asesor le habla del cliente', async () => {
    const { http, detectChanges } = await renderizar('asesor');
    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);
    detectChanges();
    expect(titulo()).toHaveTextContent('Evaluando la solicitud del cliente');

    expect(screen.getByRole('link', { name: 'Volver a la oferta' })).toHaveAttribute(
      'href',
      '/asesor/cotizar/oferta/c-1',
    );
    http.match(URL_SOLICITUD);
  });

  it('al asesor le dice que la solicitud evaluada espera la decisión', async () => {
    const { http, detectChanges } = await renderizar('asesor');
    http.expectOne(URL_SOLICITUD).flush(EVALUADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Solicitud evaluada');
    expect(screen.getByText(/espera la decisión/)).toBeInTheDocument();
  });

  it('permite volver a la oferta o ir al tablero', async () => {
    const { http } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(EVALUADA);

    expect(screen.getByRole('link', { name: 'Volver a la oferta' })).toHaveAttribute(
      'href',
      '/cliente/cotizar/oferta/c-1',
    );
    expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', '/cliente');
  });

  it('sin solicitud en la URL no consulta nada y pide volver a la oferta', async () => {
    await renderizar('cliente', null);

    expect(titulo()).toHaveTextContent('No hay una solicitud abierta');
    expect(screen.getByText(/vuelve a la oferta y acéptala/)).toBeInTheDocument();
  });

  it('una solicitud que no existe lo dice (404)', async () => {
    const { http, detectChanges } = await renderizar();
    http
      .expectOne(URL_SOLICITUD)
      .flush(
        { codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA', detalle: 'No encontramos la solicitud.' },
        { status: 404, statusText: 'Not Found' },
      );
    detectChanges();

    expect(titulo()).toHaveTextContent('No encontramos esta solicitud de suscripción');
  });

  it('si el BFF falla, permite reintentar', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();
    expect(titulo()).toHaveTextContent('No pudimos consultar la solicitud');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    http.expectOne(URL_SOLICITUD).flush(EVALUADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Evaluamos tu solicitud');
  });

  it('deja de consultar al salir de la pantalla', async () => {
    jest.useFakeTimers();
    const { http, fixture } = await renderizar();
    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);

    fixture.destroy();
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 3);

    http.expectNone(URL_SOLICITUD);
  });
});
