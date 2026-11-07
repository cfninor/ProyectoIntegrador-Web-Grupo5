import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  NO_EMITIBLE,
  POLIZA_GENERADA,
  POLIZA_ID,
  SOLICITUD_ID_POLIZA,
} from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { PaginaPago } from './pagina-pago';

// SOLV-WEB-09, el pago de la primera prima (SOLVENTAG5-74): tokenizar la tarjeta contra la
// pasarela simulada, cobrar con una Idempotency-Key generada en el cliente (SOLVENTAG5-121, R2)
// y reanudar el mismo intento si la conexión falla o la página se recarga.

const BFF = 'http://bff.prueba';
const PASARELA = 'http://pasarela.prueba';
const URL_GENERAR = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`;
const URL_TOKENIZAR = `${PASARELA}/tokenizaciones`;
const URL_COBRO = `${BFF}/v1/polizas/${POLIZA_ID}/cobro`;
const CLAVE_UUID = '11111111-1111-4111-a111-111111111111';

const TOKEN_TARJETA = { token: 'tok-1', marca: 'VISA', ultimos4: '4242', vencimiento: '09/28' };

const PAGO_APROBADO = {
  pagoId: 'p-1',
  polizaId: POLIZA_ID,
  estado: 'APROBADO',
  monto: 70_000,
  moneda: 'COP',
  medio: 'TARJETA',
  creadoEn: '2026-10-14T16:32:10.850Z',
  referenciaPasarela: 'pasarela-sim-1',
  marca: 'VISA',
  ultimos4: '4242',
  vencimiento: '09/28',
};

let http: HttpTestingController | undefined;

beforeEach(() => {
  sessionStorage.clear();
  jest.spyOn(crypto, 'randomUUID').mockReturnValue(CLAVE_UUID);
});

afterEach(() => {
  http?.verify();
  http = undefined;
  jest.restoreAllMocks();
});

async function renderizar(
  actor: Actor = 'cliente',
  solicitudId: string | null = SOLICITUD_ID_POLIZA,
) {
  const vista = await render(PaginaPago, {
    inputs: { cotizacionId: 'c-1', actor, ...(solicitudId ? { solicitudId } : {}) },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF, pasarelaUrl: PASARELA } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { ...vista, http };
}

const titulo = () => screen.getByRole('heading', { level: 2 });

async function llenarTarjeta() {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Número de tarjeta'), '4111111111111111');
  await usuario.type(screen.getByLabelText('Vencimiento (MM/AA)'), '09/28');
  return usuario;
}

describe('PaginaPago · SOLV-WEB-09', () => {
  it('es el paso 3, Pago, con la suscripción completada', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    const pasos = within(screen.getByRole('list', { name: 'Pasos de la contratación' }));
    expect(pasos.getByText('Suscripción').closest('li')).toHaveClass('hecho');
    expect(pasos.getByText('Pago').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(pasos.getByText('Firma').closest('li')).not.toHaveClass('hecho');
  });

  it('pide o crea la póliza y muestra el formulario de tarjeta con el valor a pagar', async () => {
    const { http, detectChanges } = await renderizar();
    expect(titulo()).toHaveTextContent('Preparando el pago…');

    const generar = http.expectOne(URL_GENERAR);
    expect(generar.request.method).toBe('POST');
    generar.flush(POLIZA_GENERADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Pago de tu primera prima');
    expect(screen.getByText(POLIZA_ID)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar $ 70.000' })).toBeDisabled();
  });

  it('un campo tocado e inválido muestra su mensaje y aria-invalid', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();
    const usuario = userEvent.setup();
    const numero = screen.getByLabelText('Número de tarjeta');

    await usuario.click(numero);
    await usuario.tab();

    expect(numero).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escribe el número de la tarjeta.')).toBeInTheDocument();

    await usuario.type(numero, '123');
    await usuario.tab();

    expect(numero).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('El número de tarjeta tiene entre 13 y 19 dígitos.'),
    ).toBeInTheDocument();
  });

  it('al asesor le habla del cliente', async () => {
    const { http, detectChanges } = await renderizar('asesor');
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Pago de la prima del cliente');
  });

  it('sin solicitud en la URL no pide nada', async () => {
    const { http } = await renderizar('cliente', null);

    expect(titulo()).toHaveTextContent('No hay una solicitud para pagar');
    http.expectNone(URL_GENERAR);
  });

  it('una solicitud que no existe (404) lo dice', async () => {
    const { http, detectChanges } = await renderizar();
    http
      .expectOne(URL_GENERAR)
      .flush({ codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA' }, { status: 404, statusText: 'x' });
    detectChanges();

    expect(titulo()).toHaveTextContent('No encontramos esta solicitud de suscripción');
  });

  it('una solicitud con decisión EN_REVISION no deja pagar y ofrece volver a la suscripción', async () => {
    const { http, detectChanges } = await renderizar();
    http
      .expectOne(URL_GENERAR)
      .flush(NO_EMITIBLE.EN_REVISION, { status: 409, statusText: 'Conflict' });
    detectChanges();

    expect(screen.getByText(/La solicitud está en revisión/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver a la suscripción' })).toHaveAttribute(
      'href',
      `/cliente/cotizar/oferta/c-1/suscripcion?solicitudId=${SOLICITUD_ID_POLIZA}`,
    );
    http.expectNone(URL_TOKENIZAR);
  });

  it('una solicitud sin cliente no deja pagar', async () => {
    const { http, detectChanges } = await renderizar();
    http
      .expectOne(URL_GENERAR)
      .flush(NO_EMITIBLE.SIN_CLIENTE, { status: 409, statusText: 'Conflict' });
    detectChanges();

    expect(screen.getByText(/La solicitud no tiene un cliente registrado/)).toBeVisible();
  });

  it('si el BFF falla al pedir la póliza, permite reintentar', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();
    expect(titulo()).toHaveTextContent('No pudimos preparar el pago');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Pago de tu primera prima');
  });
});

describe('PaginaPago · tokenizar y cobrar', () => {
  async function hastaElFormulario() {
    const vista = await renderizar();
    vista.http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    vista.detectChanges();
    return vista;
  }

  it('tokeniza directo contra la pasarela y cobra con una Idempotency-Key nueva', async () => {
    const { http, detectChanges } = await hastaElFormulario();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));

    const tokenizar = http.expectOne(URL_TOKENIZAR);
    expect(tokenizar.request.method).toBe('POST');
    expect(tokenizar.request.body).toEqual({ numero: '4111111111111111', vencimiento: '09/28' });
    tokenizar.flush(TOKEN_TARJETA);
    detectChanges();

    const cobro = http.expectOne(URL_COBRO);
    expect(cobro.request.method).toBe('POST');
    expect(cobro.request.headers.get('Idempotency-Key')).toBe(CLAVE_UUID);
    expect(cobro.request.body).toEqual({ medioPago: 'TARJETA', token: 'tok-1' });
    cobro.flush(PAGO_APROBADO);
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar a la firma' })).toHaveAttribute(
      'href',
      `/cliente/cotizar/oferta/c-1/firma?solicitudId=${SOLICITUD_ID_POLIZA}`,
    );
    expect(sessionStorage.getItem(`solventa.pago.intento.${POLIZA_ID}`)).toBeNull();
  });

  it('rechazado: deja intentar con otro medio, con una clave nueva', async () => {
    const { http, detectChanges } = await hastaElFormulario();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(URL_COBRO).flush({ ...PAGO_APROBADO, estado: 'RECHAZADO' });
    detectChanges();

    expect(screen.getByText(/La pasarela rechazó el pago/)).toBeVisible();
    expect(sessionStorage.getItem(`solventa.pago.intento.${POLIZA_ID}`)).toBeNull();

    await usuario.click(screen.getByRole('button', { name: 'Intentar con otro medio' }));
    expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();

    jest.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-a222-222222222222');
    await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    const segundoCobro = http.expectOne(URL_COBRO);
    expect(segundoCobro.request.headers.get('Idempotency-Key')).toBe(
      '22222222-2222-4222-a222-222222222222',
    );
    segundoCobro.flush(PAGO_APROBADO);
  });

  it('procesando: conserva la clave y vuelve a consultar con el mismo cuerpo', async () => {
    const { http, detectChanges } = await hastaElFormulario();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(URL_COBRO).flush({ ...PAGO_APROBADO, estado: 'PROCESANDO' });
    detectChanges();

    expect(screen.getByText(/Tu pago se está procesando/)).toBeVisible();
    expect(sessionStorage.getItem(`solventa.pago.intento.${POLIZA_ID}`)).not.toBeNull();
    http.expectNone(URL_TOKENIZAR);

    await usuario.click(screen.getByRole('button', { name: 'Volver a consultar' }));
    const reconsulta = http.expectOne(URL_COBRO);
    expect(reconsulta.request.headers.get('Idempotency-Key')).toBe(CLAVE_UUID);
    expect(reconsulta.request.body).toEqual({ medioPago: 'TARJETA', token: 'tok-1' });
    reconsulta.flush(PAGO_APROBADO);
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(sessionStorage.getItem(`solventa.pago.intento.${POLIZA_ID}`)).toBeNull();
  });

  it('409 clave en curso: deja volver a consultar sin tokenizar de nuevo', async () => {
    const { http, detectChanges } = await hastaElFormulario();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http
      .expectOne(URL_COBRO)
      .flush(
        { codigo: 'CLAVE_IDEMPOTENCIA_EN_CURSO', detalle: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    detectChanges();

    expect(screen.getByText(/Ya hay un cobro en curso/)).toBeVisible();

    await usuario.click(screen.getByRole('button', { name: 'Volver a consultar' }));
    http.expectOne(URL_COBRO).flush(PAGO_APROBADO);
  });

  it('si el cobro no conecta, lo dice y reintenta con el mismo intento', async () => {
    const { http, detectChanges } = await hastaElFormulario();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(URL_COBRO).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();

    expect(screen.getByText(/No pudimos conectarnos para procesar el pago/)).toBeVisible();

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    const reintento = http.expectOne(URL_COBRO);
    expect(reintento.request.headers.get('Idempotency-Key')).toBe(CLAVE_UUID);
    reintento.flush(PAGO_APROBADO);
  });

  it('si la tokenización falla, lo dice y deja reintentar sin perder los datos', async () => {
    const { http, detectChanges } = await hastaElFormulario();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();

    expect(screen.getByText(/No pudimos procesar la tarjeta/)).toBeVisible();
    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('4111111111111111');

    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(URL_COBRO).flush(PAGO_APROBADO);
  });

  it('con el formulario incompleto, no tokeniza (el envío por Enter no se procesa)', async () => {
    const { http, fixture } = await hastaElFormulario();

    fixture.nativeElement.querySelector('form').requestSubmit();

    http.expectNone(URL_TOKENIZAR);
  });

  it('un intento guardado corrupto se ignora y muestra el formulario', async () => {
    sessionStorage.setItem(`solventa.pago.intento.${POLIZA_ID}`, '{no-es-json');
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    http.expectNone(URL_COBRO);
    expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
  });

  it('si se recarga con un intento guardado, lo reanuda sin tokenizar de nuevo', async () => {
    sessionStorage.setItem(
      `solventa.pago.intento.${POLIZA_ID}`,
      JSON.stringify({
        idempotencyKey: CLAVE_UUID,
        cuerpo: { medioPago: 'TARJETA', token: 'tok-guardado' },
      }),
    );
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    http.expectNone(URL_TOKENIZAR);
    const cobro = http.expectOne(URL_COBRO);
    expect(cobro.request.headers.get('Idempotency-Key')).toBe(CLAVE_UUID);
    expect(cobro.request.body).toEqual({ medioPago: 'TARJETA', token: 'tok-guardado' });
    cobro.flush(PAGO_APROBADO);
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
  });
});
