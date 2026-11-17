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
import { PaginaPago, SEGUIMIENTO_INTERVALO_MS, SEGUIMIENTO_MAXIMO } from './pagina-pago';

// SOLV-WEB-09, el pago de la primera prima (SOLVENTAG5-74): tokenizar la tarjeta contra la
// pasarela simulada, cobrar con una Idempotency-Key generada en el cliente (SOLVENTAG5-121, R2)
// y reanudar el mismo intento si la conexión falla o la página se recarga. Desde la SOLVENTAG5-75:
// antes del formulario se consulta el cobro de la póliza (CA2), un PROCESANDO se sigue con la
// consulta y no reenviando el cobro, y el 200 del cobro es un pago que ya existía (CA3).

const BFF = 'http://bff.prueba';
const PASARELA = 'http://pasarela.prueba';
const URL_GENERAR = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`;
const URL_TOKENIZAR = `${PASARELA}/tokenizaciones`;
const URL_COBRO = `${BFF}/v1/polizas/${POLIZA_ID}/cobro`;
const POST_COBRO = { method: 'POST', url: URL_COBRO };
const GET_COBRO = { method: 'GET', url: URL_COBRO };
const CLAVE_UUID = '11111111-1111-4111-a111-111111111111';
const INTENTO = `solventa.pago.intento.${POLIZA_ID}`;

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
const PAGO_PROCESANDO = {
  pagoId: 'p-1',
  polizaId: POLIZA_ID,
  estado: 'PROCESANDO',
  monto: 70_000,
  moneda: 'COP',
  medio: 'TARJETA',
  creadoEn: '2026-10-14T16:32:10.850Z',
};
const SIN_INTENTOS = { codigo: 'COBRO_NO_ENCONTRADO', detalle: 'x' };

/** `CobroPoliza` con un solo intento, del pago dado. */
function cobroCon(pago: object & { pagoId: string; estado: string }) {
  return {
    pago,
    intentos: [{ pagoId: pago.pagoId, estado: pago.estado, canal: 'web', creadoEn: 'x' }],
  };
}

const INTENTO_GUARDADO = JSON.stringify({
  idempotencyKey: CLAVE_UUID,
  cuerpo: { medioPago: 'TARJETA', token: 'tok-guardado' },
});

let http: HttpTestingController | undefined;

beforeEach(() => {
  sessionStorage.clear();
  jest.spyOn(crypto, 'randomUUID').mockReturnValue(CLAVE_UUID);
});

afterEach(() => {
  http?.verify();
  http = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
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

/** La póliza generada y la respuesta de la consulta de su cobro (por defecto, sin intentos). */
async function conLaPoliza(
  consulta: { cuerpo: unknown; status?: number } = { cuerpo: SIN_INTENTOS, status: 404 },
  actor: Actor = 'cliente',
) {
  const vista = await renderizar(actor);
  vista.http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
  vista.detectChanges();
  const status = consulta.status ?? 200;
  vista.http
    .expectOne(GET_COBRO)
    .flush(consulta.cuerpo, { status, statusText: status === 200 ? 'OK' : 'x' });
  vista.detectChanges();
  return vista;
}

const titulo = () => screen.getByRole('heading', { level: 2 });
const formulario = () => screen.queryByRole('button', { name: /^Pagar/ });

async function llenarTarjeta(usuario = userEvent.setup()) {
  await usuario.type(screen.getByLabelText('Número de tarjeta'), '4111111111111111');
  await usuario.type(screen.getByLabelText('Vencimiento (MM/AA)'), '09/28');
  return usuario;
}

describe('PaginaPago · SOLV-WEB-09', () => {
  it('es el paso 3, Pago, con la suscripción completada', async () => {
    await conLaPoliza();

    const pasos = within(screen.getByRole('list', { name: 'Pasos de la contratación' }));
    expect(pasos.getByText('Suscripción').closest('li')).toHaveClass('hecho');
    expect(pasos.getByText('Pago').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(pasos.getByText('Firma').closest('li')).not.toHaveClass('hecho');
  });

  it('pide o crea la póliza, consulta su cobro y muestra el formulario con el valor a pagar', async () => {
    const { http, detectChanges } = await renderizar();
    expect(titulo()).toHaveTextContent('Preparando el pago…');

    const generar = http.expectOne(URL_GENERAR);
    expect(generar.request.method).toBe('POST');
    generar.flush(POLIZA_GENERADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Pago de tu primera prima');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Consultando si la póliza ya tiene un pago…',
    );
    expect(formulario()).toBeNull();

    http.expectOne(GET_COBRO).flush(SIN_INTENTOS, { status: 404, statusText: 'Not Found' });
    detectChanges();

    expect(screen.getByText(POLIZA_ID)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar $ 70.000' })).toBeDisabled();
  });

  it('un campo tocado e inválido muestra su mensaje y aria-invalid', async () => {
    await conLaPoliza();
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
    await conLaPoliza(undefined, 'asesor');

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
    http.expectNone(URL_COBRO);
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
    http.expectOne(GET_COBRO).flush(SIN_INTENTOS, { status: 404, statusText: 'Not Found' });
    detectChanges();

    expect(titulo()).toHaveTextContent('Pago de tu primera prima');
  });
});

describe('PaginaPago · tokenizar y cobrar', () => {
  it('tokeniza directo contra la pasarela y cobra con una Idempotency-Key nueva', async () => {
    const { http, detectChanges } = await conLaPoliza();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));

    const tokenizar = http.expectOne(URL_TOKENIZAR);
    expect(tokenizar.request.method).toBe('POST');
    expect(tokenizar.request.body).toEqual({ numero: '4111111111111111', vencimiento: '09/28' });
    tokenizar.flush(TOKEN_TARJETA);
    detectChanges();

    const cobro = http.expectOne(POST_COBRO);
    expect(cobro.request.headers.get('Idempotency-Key')).toBe(CLAVE_UUID);
    expect(cobro.request.body).toEqual({ medioPago: 'TARJETA', token: 'tok-1' });
    cobro.flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.queryByText('Esta póliza ya tiene un pago.')).toBeNull();
    expect(screen.getByRole('link', { name: 'Continuar a la firma' })).toHaveAttribute(
      'href',
      `/cliente/cotizar/oferta/c-1/firma?solicitudId=${SOLICITUD_ID_POLIZA}`,
    );
    expect(sessionStorage.getItem(INTENTO)).toBeNull();
  });

  it('«Pagar» queda deshabilitado mientras tokeniza y cobra (doble clic)', async () => {
    const { http, detectChanges } = await conLaPoliza();
    const usuario = await llenarTarjeta();
    const pagar = screen.getByRole('button', { name: /^Pagar/ });

    await usuario.dblClick(pagar);

    expect(pagar).toBeDisabled();
    expect(pagar).toHaveAttribute('aria-busy', 'true');
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
    http.expectOne(POST_COBRO).flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
  });

  it('un segundo envío mientras tokeniza no tokeniza ni cobra otra vez', async () => {
    const { http, detectChanges, fixture } = await conLaPoliza();
    await llenarTarjeta();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');

    form.requestSubmit();
    form.requestSubmit(); // antes de que se pinte el botón deshabilitado

    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(POST_COBRO).flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
  });

  it('rechazado: deja intentar con otro medio, con una clave nueva', async () => {
    const { http, detectChanges } = await conLaPoliza();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http
      .expectOne(POST_COBRO)
      .flush({ ...PAGO_APROBADO, estado: 'RECHAZADO' }, { status: 201, statusText: 'Created' });
    detectChanges();

    expect(screen.getByText(/La pasarela rechazó el pago/)).toBeVisible();
    expect(sessionStorage.getItem(INTENTO)).toBeNull();

    await usuario.click(screen.getByRole('button', { name: 'Intentar con otro medio' }));
    expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
    expect(screen.queryByText(/El pago anterior de esta póliza fue rechazado/)).toBeNull();

    jest.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-a222-222222222222');
    await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    const segundoCobro = http.expectOne(POST_COBRO);
    expect(segundoCobro.request.headers.get('Idempotency-Key')).toBe(
      '22222222-2222-4222-a222-222222222222',
    );
    segundoCobro.flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
  });

  it('procesando: conserva el intento y lo sigue con la consulta, no reenviando el cobro', async () => {
    const { http, detectChanges } = await conLaPoliza();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(POST_COBRO).flush(PAGO_PROCESANDO, { status: 201, statusText: 'Created' });
    detectChanges();

    expect(screen.getByText(/Tu pago se está procesando/)).toBeVisible();
    expect(sessionStorage.getItem(INTENTO)).not.toBeNull();

    await usuario.click(screen.getByRole('button', { name: 'Consultar de nuevo' }));
    http.expectNone(POST_COBRO);
    http.expectOne(GET_COBRO).flush(cobroCon(PAGO_APROBADO));
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(sessionStorage.getItem(INTENTO)).toBeNull();
  });

  it('409 clave en curso: deja volver a consultar sin tokenizar de nuevo', async () => {
    const { http, detectChanges } = await conLaPoliza();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http
      .expectOne(POST_COBRO)
      .flush(
        { codigo: 'CLAVE_IDEMPOTENCIA_EN_CURSO', detalle: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    detectChanges();

    expect(screen.getByText(/Ya hay un cobro en curso/)).toBeVisible();

    await usuario.click(screen.getByRole('button', { name: 'Volver a consultar' }));
    http.expectOne(POST_COBRO).flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
  });

  it('si el cobro no conecta, lo dice y reintenta con el mismo intento', async () => {
    const { http, detectChanges } = await conLaPoliza();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(POST_COBRO).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();

    expect(screen.getByText(/No pudimos conectarnos para procesar el pago/)).toBeVisible();

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    const reintento = http.expectOne(POST_COBRO);
    expect(reintento.request.headers.get('Idempotency-Key')).toBe(CLAVE_UUID);
    reintento.flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
  });

  it('si la tokenización falla, lo dice y deja reintentar sin perder los datos', async () => {
    const { http, detectChanges } = await conLaPoliza();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();

    expect(screen.getByText(/No pudimos procesar la tarjeta/)).toBeVisible();
    expect(screen.getByLabelText('Número de tarjeta')).toHaveValue('4111111111111111');

    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    detectChanges();
    http.expectOne(POST_COBRO).flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
  });

  it('con el formulario incompleto, no tokeniza (el envío por Enter no se procesa)', async () => {
    const { http, fixture } = await conLaPoliza();

    fixture.nativeElement.querySelector('form').requestSubmit();

    http.expectNone(URL_TOKENIZAR);
  });

  it('un intento guardado corrupto se ignora y muestra el formulario', async () => {
    sessionStorage.setItem(INTENTO, '{no-es-json');
    const { http } = await conLaPoliza();

    http.expectNone(POST_COBRO);
    expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
  });
});

describe('PaginaPago · el pago que la póliza ya tenía (SOLVENTAG5-75, CA3)', () => {
  async function pagarYRecibir(pago: object) {
    const vista = await conLaPoliza();
    const usuario = await llenarTarjeta();
    await usuario.click(screen.getByRole('button', { name: /^Pagar/ }));
    vista.http.expectOne(URL_TOKENIZAR).flush(TOKEN_TARJETA);
    vista.detectChanges();
    vista.http.expectOne(POST_COBRO).flush(pago);
    vista.detectChanges();
    return { ...vista, usuario };
  }

  it('el 200 de un pago aprobado lo muestra como el pago existente, con su estado', async () => {
    await pagarYRecibir(PAGO_APROBADO);

    expect(screen.getByText('Esta póliza ya tiene un pago.')).toBeVisible();
    expect(screen.getByText('Aprobado')).toBeInTheDocument();
    expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
    expect(screen.queryByText('Tu pago quedó aprobado.')).toBeNull();
    expect(screen.getByRole('link', { name: 'Continuar a la firma' })).toBeVisible();
    expect(formulario()).toBeNull();
    expect(sessionStorage.getItem(INTENTO)).toBeNull();
  });

  it('el 200 de un pago procesando lo sigue con la consulta y sigue siendo el existente', async () => {
    const { http, detectChanges, usuario } = await pagarYRecibir(PAGO_PROCESANDO);

    expect(screen.getByText('Esta póliza ya tiene un pago.')).toBeVisible();
    expect(screen.getByText('Procesando')).toBeInTheDocument();
    expect(screen.queryByText(/Tarjeta/)).toBeNull();

    await usuario.click(screen.getByRole('button', { name: 'Consultar de nuevo' }));
    http.expectOne(GET_COBRO).flush(cobroCon(PAGO_APROBADO));
    detectChanges();

    expect(screen.getByText('Esta póliza ya tiene un pago.')).toBeVisible();
    expect(screen.getByText('Aprobado')).toBeInTheDocument();
  });
});

describe('PaginaPago · consulta del cobro al entrar (SOLVENTAG5-75, CA2)', () => {
  it('APROBADO: muestra el resultado y «Continuar a la firma», sin formulario', async () => {
    sessionStorage.setItem(INTENTO, INTENTO_GUARDADO);
    const { http } = await conLaPoliza({ cuerpo: cobroCon(PAGO_APROBADO) });

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continuar a la firma' })).toBeVisible();
    expect(formulario()).toBeNull();
    expect(sessionStorage.getItem(INTENTO)).toBeNull();
    http.expectNone(POST_COBRO);
  });

  it('PROCESANDO: lo dice, sin formulario, con «Consultar de nuevo»', async () => {
    const { http, detectChanges } = await conLaPoliza({ cuerpo: cobroCon(PAGO_PROCESANDO) });

    expect(screen.getByRole('status')).toHaveTextContent(/Tu pago se está procesando/);
    expect(formulario()).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Consultar de nuevo' }));
    expect(screen.getByText(/Tu pago se está procesando/)).toBeVisible();
    http.expectOne(GET_COBRO).flush(cobroCon(PAGO_PROCESANDO));
    detectChanges();
    expect(screen.getByText(/Tu pago se está procesando/)).toBeVisible();
    http.expectNone(POST_COBRO);
  });

  it('RECHAZADO: el formulario para un intento nuevo, con el aviso del rechazo anterior', async () => {
    sessionStorage.setItem(INTENTO, INTENTO_GUARDADO);
    const { http } = await conLaPoliza({
      cuerpo: cobroCon({ ...PAGO_APROBADO, estado: 'RECHAZADO' }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'El pago anterior de esta póliza fue rechazado. Intenta de nuevo con otra tarjeta.',
    );
    expect(formulario()).toBeDisabled();
    expect(sessionStorage.getItem(INTENTO)).toBeNull(); // el intento nuevo usa otra clave (CA5)
    http.expectNone(POST_COBRO);
  });

  it('REVERSADO: dice que el pago se devolvió, sin formulario', async () => {
    await conLaPoliza({ cuerpo: cobroCon({ ...PAGO_APROBADO, estado: 'REVERSADO' }) });

    expect(screen.getByRole('status')).toHaveTextContent(
      'El pago se devolvió porque la póliza no se firmó a tiempo.',
    );
    expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', '/cliente');
    expect(formulario()).toBeNull();
  });

  it('sin intentos y con un intento guardado, lo reenvía con su misma clave sin tokenizar', async () => {
    sessionStorage.setItem(INTENTO, INTENTO_GUARDADO);
    const { http, detectChanges } = await conLaPoliza();

    http.expectNone(URL_TOKENIZAR);
    const cobro = http.expectOne(POST_COBRO);
    expect(cobro.request.headers.get('Idempotency-Key')).toBe(CLAVE_UUID);
    expect(cobro.request.body).toEqual({ medioPago: 'TARJETA', token: 'tok-guardado' });
    cobro.flush(PAGO_APROBADO, { status: 201, statusText: 'Created' });
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
  });

  it('si la consulta falla, lo dice y deja reintentarla', async () => {
    const { http, detectChanges } = await conLaPoliza({ cuerpo: null, status: 503 });

    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos consultar el pago/);
    expect(formulario()).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Consultando si la póliza/);
    http.expectOne(GET_COBRO).flush(cobroCon(PAGO_APROBADO));
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
  });

  it('un 404 de la póliza en la consulta se trata como un error de la consulta', async () => {
    await conLaPoliza({ cuerpo: { codigo: 'POLIZA_NO_ENCONTRADA', detalle: 'x' }, status: 404 });

    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos consultar el pago/);
  });
});

describe('PaginaPago · consulta automática de un PROCESANDO', () => {
  beforeEach(() => jest.useFakeTimers());

  async function procesandoAlEntrar() {
    return conLaPoliza({ cuerpo: cobroCon(PAGO_PROCESANDO) });
  }

  it('consulta sola cada 5 s hasta ver la decisión', async () => {
    const { http, detectChanges } = await procesandoAlEntrar();

    http.expectNone(GET_COBRO);
    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS);
    http.expectOne(GET_COBRO).flush(cobroCon(PAGO_PROCESANDO));
    detectChanges();
    expect(screen.getByText(/Tu pago se está procesando/)).toBeVisible();

    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS);
    http.expectOne(GET_COBRO).flush(cobroCon(PAGO_APROBADO));
    detectChanges();
    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();

    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS * 3);
    http.expectNone(GET_COBRO); // con la decisión, deja de consultar
    http.expectNone(POST_COBRO);
  });

  it(`consulta a lo sumo ${SEGUIMIENTO_MAXIMO} veces mientras siga PROCESANDO`, async () => {
    const { http, detectChanges } = await procesandoAlEntrar();

    for (let vez = 0; vez < SEGUIMIENTO_MAXIMO; vez++) {
      jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS);
      http.expectOne(GET_COBRO).flush(cobroCon(PAGO_PROCESANDO));
      detectChanges();
    }
    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS * 2);

    http.expectNone(GET_COBRO);
    expect(screen.getByRole('button', { name: 'Consultar de nuevo' })).toBeVisible();
  });

  it('un error en una consulta automática no cambia la pantalla y la siguiente sigue', async () => {
    const { http, detectChanges } = await procesandoAlEntrar();

    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS);
    http.expectOne(GET_COBRO).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();
    expect(screen.getByText(/Tu pago se está procesando/)).toBeVisible();

    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS);
    http.expectOne(GET_COBRO).flush(cobroCon({ ...PAGO_APROBADO, estado: 'RECHAZADO' }));
    detectChanges();
    expect(screen.getByText(/El pago anterior de esta póliza fue rechazado/)).toBeVisible();
  });

  it('un PROCESANDO del cobro también se sigue solo, sin reenviar el cobro', async () => {
    jest.useRealTimers();
    sessionStorage.setItem(INTENTO, INTENTO_GUARDADO);
    const { http, detectChanges } = await conLaPoliza();
    jest.useFakeTimers();
    http.expectOne(POST_COBRO).flush(PAGO_PROCESANDO, { status: 201, statusText: 'Created' });
    detectChanges();

    jest.advanceTimersByTime(SEGUIMIENTO_INTERVALO_MS);
    http.expectOne(GET_COBRO).flush(cobroCon(PAGO_APROBADO));
    detectChanges();

    expect(screen.getByText('Tu pago quedó aprobado.')).toBeVisible();
    http.expectNone(POST_COBRO);
  });
});
