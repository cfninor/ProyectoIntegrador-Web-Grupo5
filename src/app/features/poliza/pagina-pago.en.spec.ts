import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { POLIZA_GENERADA, POLIZA_ID, SOLICITUD_ID_POLIZA } from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { PaginaPago, SEGUIMIENTO_INTERVALO_MS } from './pagina-pago';

// SOLV-WEB-09 en inglés (SOLVENTAG5-75): la consulta del cobro al entrar, el pago existente y el
// seguimiento de un PROCESANDO, con sus textos traducidos.

const BFF = 'http://bff.prueba';
const URL_GENERAR = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`;
const URL_COBRO = `${BFF}/v1/polizas/${POLIZA_ID}/cobro`;
const GET_COBRO = { method: 'GET', url: URL_COBRO };
const PAGO = {
  pagoId: 'p-1',
  polizaId: POLIZA_ID,
  monto: 70_000,
  moneda: 'COP',
  medio: 'TARJETA',
  creadoEn: '2026-10-14T16:32:10.850Z',
  marca: 'VISA',
  ultimos4: '4242',
};

function cobroCon(estado: string) {
  return {
    pago: { ...PAGO, estado },
    intentos: [{ pagoId: 'p-1', estado, canal: 'web', creadoEn: 'x' }],
  };
}

let http: HttpTestingController | undefined;

beforeEach(() => sessionStorage.clear());

afterEach(() => {
  http?.verify();
  http = undefined;
  jest.useRealTimers();
});

async function conElCobro(cuerpo: unknown, status = 200) {
  const vista = await render(PaginaPago, {
    inputs: { cotizacionId: 'c-1', actor: 'cliente', solicitudId: SOLICITUD_ID_POLIZA },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF, pasarelaUrl: 'http://pasarela.prueba' } },
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
  vista.detectChanges();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Checking whether the policy already has a payment…',
  );
  http.expectOne(GET_COBRO).flush(cuerpo, { status, statusText: 'x' });
  vista.detectChanges();
  return { ...vista, http };
}

describe('PaginaPago · en inglés', () => {
  it('APPROVED: «Your payment was approved.» and «Continue to signature»', async () => {
    await conElCobro(cobroCon('APROBADO'));

    expect(screen.getByText('Your payment was approved.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continue to signature' })).toBeVisible();
  });

  it('PROCESSING: the message and «Check again», checked again on its own', async () => {
    jest.useFakeTimers();
    const { http, detectChanges } = await conElCobro(cobroCon('PROCESANDO'));

    expect(screen.getByText(/Your payment is being processed/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeVisible();

    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS);
    http.expectOne(GET_COBRO).flush(cobroCon('APROBADO'));
    detectChanges();
    expect(screen.getByText('Your payment was approved.')).toBeVisible();
  });

  it('DECLINED: the card form with the previous decline notice', async () => {
    await conElCobro(cobroCon('RECHAZADO'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The previous payment for this policy was declined. Try again with another card.',
    );
    expect(screen.getByLabelText('Card number')).toBeVisible();
  });

  it('REFUNDED: the refund message, without the form', async () => {
    await conElCobro(cobroCon('REVERSADO'));

    expect(screen.getByRole('status')).toHaveTextContent(
      "The payment was refunded because the policy wasn't signed in time.",
    );
    expect(screen.queryByLabelText('Card number')).toBeNull();
  });

  it('if the check fails, it says so and lets you try again', async () => {
    await conElCobro(null, 503);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't check the policy's payment. Try again in a few seconds.",
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('a 200 from the charge shows «This policy already has a payment.» with its status', async () => {
    const { http, detectChanges } = await conElCobro(
      { codigo: 'COBRO_NO_ENCONTRADO', detalle: 'x' },
      404,
    );
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Card number'), '4111111111111111');
    await usuario.type(screen.getByLabelText('Expiration (MM/YY)'), '09/28');
    await usuario.click(screen.getByRole('button', { name: /^Pay/ }));
    http
      .expectOne('http://pasarela.prueba/tokenizaciones')
      .flush({ token: 'tok-1', marca: 'VISA', ultimos4: '4242', vencimiento: '09/28' });
    detectChanges();
    http.expectOne({ method: 'POST', url: URL_COBRO }).flush({ ...PAGO, estado: 'PROCESANDO' });
    detectChanges();

    expect(screen.getByText('This policy already has a payment.')).toBeVisible();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('the status names are translated', async () => {
    const { http, detectChanges } = await conElCobro(
      { codigo: 'COBRO_NO_ENCONTRADO', detalle: 'x' },
      404,
    );
    const usuario = userEvent.setup();
    await usuario.type(screen.getByLabelText('Card number'), '4111111111111111');
    await usuario.type(screen.getByLabelText('Expiration (MM/YY)'), '09/28');
    await usuario.click(screen.getByRole('button', { name: /^Pay/ }));
    http
      .expectOne('http://pasarela.prueba/tokenizaciones')
      .flush({ token: 'tok-1', marca: 'VISA', ultimos4: '4242', vencimiento: '09/28' });
    detectChanges();
    http.expectOne({ method: 'POST', url: URL_COBRO }).flush({ ...PAGO, estado: 'APROBADO' });
    detectChanges();

    expect(screen.getByText('Approved')).toBeInTheDocument();
  });
});
