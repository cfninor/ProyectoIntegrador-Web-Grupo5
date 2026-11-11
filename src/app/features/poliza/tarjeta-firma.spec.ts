import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  FIRMA_ABIERTA,
  FIRMA_ENVIADA,
  FIRMA_FIRMADA,
  FIRMA_PENDIENTE_ENVIO,
  FIRMA_VENCIDA,
  errorFirma,
} from '../../../testing/fixtures-firma';
import { HUELLA, POLIZA_ID, SOLICITUD_ID_POLIZA } from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { Firma } from './modelos';
import { INTERVALO_SEGUIMIENTO_MS, MAXIMO_SEGUIMIENTO, TarjetaFirma } from './tarjeta-firma';

// La tarjeta de la firma electrónica de SOLV-WEB-10 (SOLVENTAG5-57, D14): cada estado, el envío,
// el reenvío, las consultas cada 5 segundos y su límite, y la voz del asesor y del cliente.

const BFF = 'http://bff.prueba';
const URL_FIRMA = `${BFF}/v1/polizas/${POLIZA_ID}/firma`;
const URL_REENVIO = `${URL_FIRMA}/reenvio`;
const GENERADO_EN = '2026-10-14T16:32:10.850Z';
const RUTA_PAGO = '/cliente/cotizar/oferta/c-1/pago';

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
  jest.useRealTimers();
});

async function renderizar(actor: Actor = 'cliente') {
  const vista = await render(TarjetaFirma, {
    inputs: {
      polizaId: POLIZA_ID,
      actor,
      generadoEn: GENERADO_EN,
      huella: HUELLA,
      rutaPago: RUTA_PAGO,
      solicitudId: SOLICITUD_ID_POLIZA,
    },
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

/** Renderiza con la firma ya consultada. */
async function conFirma(firma: Firma, actor: Actor = 'cliente') {
  const vista = await renderizar(actor);
  vista.http.expectOne(URL_FIRMA).flush(firma);
  vista.detectChanges();
  return vista;
}

const sinFirma = (http: HttpTestingController) =>
  http
    .expectOne(URL_FIRMA)
    .flush(errorFirma('FIRMA_NO_ENCONTRADA'), { status: 404, statusText: 'Not Found' });

const hitos = () =>
  within(screen.getByRole('list', { name: 'Seguimiento de la firma' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/\s+/g, ' ').trim());

const chip = () => screen.getByText(/^(Esperando firma|Firmado|Vencido)$/, { selector: '.chip' });
const dato = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling;

describe('TarjetaFirma · SOLV-WEB-10 (SOLVENTAG5-57)', () => {
  it('consulta la firma al abrir y, mientras tanto, muestra el documento generado y su huella', async () => {
    const { http } = await renderizar();

    const consulta = http.expectOne(URL_FIRMA);
    expect(consulta.request.method).toBe('GET');
    expect(screen.getByRole('heading', { name: 'Firma electrónica' })).toBeInTheDocument();
    expect(screen.getByText('Consultando la firma…')).toBeInTheDocument();
    expect(hitos()).toEqual(['Documento generado 14/10/2026 a las 11:32']);
    expect(dato('Huella del documento')).toHaveTextContent(HUELLA);
    consulta.flush(FIRMA_ENVIADA);
  });

  describe('sin firma', () => {
    it('el cliente ve «Enviar enlace de firma», en segunda persona', async () => {
      const { http, detectChanges } = await renderizar('cliente');
      sinFirma(http);
      detectChanges();

      expect(screen.getByText(/Te enviaremos por correo y por SMS un enlace/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enviar enlace de firma' })).toBeEnabled();
      expect(screen.queryByText(/Esperando firma/)).not.toBeInTheDocument();
    });

    it('el asesor lo ve en tercera persona', async () => {
      const { http, detectChanges } = await renderizar('asesor');
      sinFirma(http);
      detectChanges();

      expect(screen.getByText(/El cliente recibirá por correo y por SMS/)).toBeInTheDocument();
    });

    it('enviar pide la firma sin cuerpo, muestra «Esperando firma» y empieza el seguimiento', async () => {
      jest.useFakeTimers();
      const { http, detectChanges } = await renderizar('asesor');
      sinFirma(http);
      detectChanges();

      screen.getByRole('button', { name: 'Enviar enlace de firma' }).click();
      detectChanges();
      expect(screen.getByRole('button', { name: 'Enviar enlace de firma' })).toBeDisabled();
      const envio = http.expectOne({ method: 'POST', url: URL_FIRMA });
      expect(envio.request.body).toBeNull();
      envio.flush(FIRMA_PENDIENTE_ENVIO, { status: 201, statusText: 'Created' });
      detectChanges();

      expect(chip()).toHaveTextContent('Esperando firma');
      expect(chip()).toHaveClass('chip-ambar');
      expect(screen.getByText(/Se está enviando el enlace al cliente/)).toBeInTheDocument();
      expect(screen.getByText('El enlace vence el 09/11/2026 a las 10:02.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reenviar enlace' })).not.toBeInTheDocument();

      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS);
      http.expectOne({ method: 'GET', url: URL_FIRMA }).flush(FIRMA_ENVIADA);
      detectChanges();
      expect(screen.getByText(/El cliente recibió el enlace y el código/)).toBeInTheDocument();
    });

    it('un 409 PAGO_NO_APROBADO es un estado que ofrece «Ir al pago»', async () => {
      const { http, detectChanges } = await renderizar('cliente');
      sinFirma(http);
      detectChanges();

      screen.getByRole('button', { name: 'Enviar enlace de firma' }).click();
      http
        .expectOne({ method: 'POST', url: URL_FIRMA })
        .flush(errorFirma('PAGO_NO_APROBADO'), { status: 409, statusText: 'Conflict' });
      detectChanges();

      expect(
        screen.getByRole('heading', { name: 'Falta el pago de la primera prima' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/cuando el pago de tu primera prima esté aprobado/)).toBeVisible();
      expect(screen.getByRole('link', { name: 'Ir al pago' })).toHaveAttribute(
        'href',
        `${RUTA_PAGO}?solicitudId=${SOLICITUD_ID_POLIZA}`,
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('el asesor ve PAGO_NO_APROBADO en tercera persona', async () => {
      const { http, detectChanges } = await renderizar('asesor');
      sinFirma(http);
      detectChanges();
      screen.getByRole('button', { name: 'Enviar enlace de firma' }).click();
      http
        .expectOne({ method: 'POST', url: URL_FIRMA })
        .flush(errorFirma('PAGO_NO_APROBADO'), { status: 409, statusText: 'Conflict' });
      detectChanges();

      expect(screen.getByText(/primera prima del cliente esté aprobado/)).toBeVisible();
    });

    it.each([
      ['cliente', /No tienes un correo ni un celular registrados/],
      ['asesor', /El cliente no tiene un correo ni un celular registrados/],
    ] as const)(
      'un 409 CLIENTE_SIN_CONTACTO se muestra con su motivo (%s)',
      async (actor, texto) => {
        const { http, detectChanges } = await renderizar(actor);
        sinFirma(http);
        detectChanges();
        screen.getByRole('button', { name: 'Enviar enlace de firma' }).click();
        http
          .expectOne({ method: 'POST', url: URL_FIRMA })
          .flush(errorFirma('CLIENTE_SIN_CONTACTO'), { status: 409, statusText: 'Conflict' });
        detectChanges();

        expect(
          screen.getByRole('heading', { name: 'No hay a dónde enviar el enlace' }),
        ).toBeInTheDocument();
        expect(screen.getByText(texto)).toBeVisible();
        expect(screen.queryByRole('link', { name: 'Ir al pago' })).not.toBeInTheDocument();
      },
    );

    it('un 409 DOCUMENTO_EN_GENERACION se muestra con su motivo y deja intentar de nuevo', async () => {
      const { http, detectChanges } = await renderizar();
      sinFirma(http);
      detectChanges();
      screen.getByRole('button', { name: 'Enviar enlace de firma' }).click();
      http
        .expectOne({ method: 'POST', url: URL_FIRMA })
        .flush(errorFirma('DOCUMENTO_EN_GENERACION'), { status: 409, statusText: 'Conflict' });
      detectChanges();

      expect(
        screen.getByRole('heading', { name: 'El documento todavía se está generando' }),
      ).toBeInTheDocument();
      screen.getByRole('button', { name: 'Intentar de nuevo' }).click();
      http.expectOne({ method: 'POST', url: URL_FIRMA }).flush(FIRMA_PENDIENTE_ENVIO);
      detectChanges();
      expect(chip()).toHaveTextContent('Esperando firma');
      http.match(URL_FIRMA);
    });

    it.each([
      [503, errorFirma('NUCLEO_NO_DISPONIBLE')],
      [409, errorFirma('OTRO_CODIGO')],
      [0, null],
    ])(
      'si el envío falla con %s, lo dice y deja el botón para reintentar',
      async (status, cuerpo) => {
        const { http, detectChanges } = await renderizar();
        sinFirma(http);
        detectChanges();

        screen.getByRole('button', { name: 'Enviar enlace de firma' }).click();
        http
          .expectOne({ method: 'POST', url: URL_FIRMA })
          .flush(cuerpo, { status, statusText: 'x' });
        detectChanges();

        expect(screen.getByRole('alert')).toHaveTextContent('No pudimos enviar el enlace');
        expect(screen.getByRole('button', { name: 'Enviar enlace de firma' })).toBeEnabled();
      },
    );

    it('un doble envío pide la firma una sola vez', async () => {
      const { http, fixture, detectChanges } = await renderizar();
      sinFirma(http);
      detectChanges();
      const tarjeta = fixture.componentInstance as unknown as { enviar(): void };

      tarjeta.enviar();
      tarjeta.enviar();

      const envios = http.match({ method: 'POST', url: URL_FIRMA });
      expect(envios).toHaveLength(1);
      envios[0].flush(FIRMA_PENDIENTE_ENVIO);
      http.match(URL_FIRMA);
    });
  });

  describe('con firma', () => {
    it('ENVIADA: «Esperando firma», el hito enviado con su hora y «Reenviar enlace»', async () => {
      const { http } = await conFirma(FIRMA_ENVIADA);

      expect(chip()).toHaveTextContent('Esperando firma');
      expect(
        screen.getByText('Te enviamos el enlace y el código por correo y por SMS.'),
      ).toBeVisible();
      expect(hitos()).toEqual([
        'Documento generado 14/10/2026 a las 11:32',
        'Enlace enviado 06/11/2026 a las 10:02',
        'Enlace abierto Pendiente',
        'Documento firmado Pendiente',
      ]);
      const lista = within(screen.getByRole('list', { name: 'Seguimiento de la firma' }));
      expect(lista.getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step');
      expect(lista.getAllByRole('listitem')[3]).not.toHaveAttribute('aria-current');
      expect(screen.getByRole('button', { name: 'Reenviar enlace' })).toBeEnabled();
      expect(
        screen.queryByRole('button', { name: 'Enviar enlace de firma' }),
      ).not.toBeInTheDocument();
      http.match(URL_FIRMA);
    });

    it('PENDIENTE_ENVIO en la voz del cliente, sin reenviar', async () => {
      const { http } = await conFirma(FIRMA_PENDIENTE_ENVIO);

      expect(screen.getByText(/Estamos enviándote el enlace/)).toBeVisible();
      const lista = within(screen.getByRole('list', { name: 'Seguimiento de la firma' }));
      expect(lista.getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step');
      expect(screen.queryByRole('button', { name: 'Reenviar enlace' })).not.toBeInTheDocument();
      http.match(URL_FIRMA);
    });

    it.each([
      ['asesor', 'El cliente abrió el enlace y todavía no firma.'],
      ['cliente', 'Abriste el enlace; falta firmar con el código.'],
    ] as const)('ABIERTA (%s): el hito abierto y «Reenviar enlace»', async (actor, texto) => {
      const { http } = await conFirma(FIRMA_ABIERTA, actor);

      expect(screen.getByText(texto)).toBeVisible();
      expect(hitos()[2]).toBe('Enlace abierto 06/11/2026 a las 10:20');
      expect(screen.getByRole('button', { name: 'Reenviar enlace' })).toBeEnabled();
      http.match(URL_FIRMA);
    });

    it('FIRMADA: chip verde, los cuatro hitos con su hora y el certificado, sin consultar más', async () => {
      jest.useFakeTimers();
      const { http } = await conFirma(FIRMA_FIRMADA, 'asesor');

      expect(chip()).toHaveTextContent('Firmado');
      expect(chip()).toHaveClass('chip-verde');
      expect(screen.getByText('El cliente firmó la póliza. Ya se puede emitir.')).toBeVisible();
      expect(hitos()).toEqual([
        'Documento generado 14/10/2026 a las 11:32',
        'Enlace enviado 06/11/2026 a las 10:02',
        'Enlace abierto 06/11/2026 a las 10:20',
        'Documento firmado 06/11/2026 a las 10:23',
      ]);
      const certificado = within(
        screen.getByRole('article', { name: 'Certificado de firma electrónica' }),
      );
      expect(certificado.getByText('Fecha y hora').nextElementSibling).toHaveTextContent(
        '06/11/2026 a las 10:23',
      );
      expect(certificado.getByText('IP').nextElementSibling).toHaveTextContent('203.0.113.24');
      expect(certificado.getByText('Huella firmada').nextElementSibling).toHaveTextContent(HUELLA);
      expect(screen.queryByRole('button', { name: 'Reenviar enlace' })).not.toBeInTheDocument();
      expect(screen.queryByText(/El enlace vence el/)).not.toBeInTheDocument();

      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS * 3);
      http.expectNone(URL_FIRMA);
    });

    it.each([
      [
        'cliente',
        'No firmaste en 72 horas: el enlace venció, tu póliza no se emite y te devolvemos el pago de la primera prima.',
      ],
      [
        'asesor',
        'El cliente no firmó en 72 horas: el enlace venció, la póliza no se emite y el cobro de la primera prima se reversa.',
      ],
    ] as const)('VENCIDA (%s): chip gris, el hito vencido y sin reenviar', async (actor, texto) => {
      jest.useFakeTimers();
      const { http } = await conFirma(FIRMA_VENCIDA, actor);

      expect(chip()).toHaveTextContent('Vencido');
      expect(chip()).toHaveClass('chip-gris');
      expect(screen.getByText(texto)).toBeVisible();
      expect(hitos()).toEqual([
        'Documento generado 14/10/2026 a las 11:32',
        'Enlace enviado 06/11/2026 a las 10:02',
        'Enlace abierto 06/11/2026 a las 10:20',
        'Enlace vencido 09/11/2026 a las 10:02',
      ]);
      expect(screen.queryByRole('button', { name: 'Reenviar enlace' })).not.toBeInTheDocument();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS * 3);
      http.expectNone(URL_FIRMA);
    });

    it('VENCIDA sin enviar y sin la hora del proceso: solo lo que ocurrió y el vencimiento', async () => {
      await conFirma({
        ...FIRMA_VENCIDA,
        enviadaEn: undefined,
        abiertaEn: undefined,
        vencidaEn: undefined,
      });

      expect(hitos()).toEqual([
        'Documento generado 14/10/2026 a las 11:32',
        'Enlace vencido 09/11/2026 a las 10:02',
      ]);
    });
  });

  describe('seguimiento', () => {
    it('consulta cada 5 segundos, hasta 60 veces (D14)', () => {
      expect(INTERVALO_SEGUIMIENTO_MS).toBe(5000);
      expect(MAXIMO_SEGUIMIENTO).toBe(60);
    });

    it('consulta cada 5 segundos, una petición a la vez, hasta que la firma termina', async () => {
      jest.useFakeTimers();
      const { http, detectChanges } = await conFirma(FIRMA_ENVIADA);

      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS - 1);
      http.expectNone(URL_FIRMA);
      jest.advanceTimersByTime(1);
      const segunda = http.expectOne(URL_FIRMA);
      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS * 3);
      http.expectNone(URL_FIRMA); // no hay otra mientras la anterior no responde
      segunda.flush(FIRMA_ABIERTA);
      detectChanges();
      expect(hitos()[2]).toBe('Enlace abierto 06/11/2026 a las 10:20');

      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS);
      http.expectOne(URL_FIRMA).flush(FIRMA_FIRMADA);
      detectChanges();
      expect(chip()).toHaveTextContent('Firmado');
      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS * 3);
      http.expectNone(URL_FIRMA);
    });

    it('si una consulta falla, conserva el último estado y sigue consultando', async () => {
      jest.useFakeTimers();
      const { http, detectChanges } = await conFirma(FIRMA_ENVIADA);

      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS);
      http.expectOne(URL_FIRMA).flush(null, { status: 503, statusText: 'Service Unavailable' });
      detectChanges();
      expect(chip()).toHaveTextContent('Esperando firma');
      expect(hitos()[1]).toBe('Enlace enviado 06/11/2026 a las 10:02');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS);
      http.expectOne(URL_FIRMA).flush(FIRMA_FIRMADA);
      detectChanges();
      expect(chip()).toHaveTextContent('Firmado');
    });

    it(`después de ${MAXIMO_SEGUIMIENTO} consultas se detiene y ofrece «Actualizar seguimiento»`, async () => {
      jest.useFakeTimers();
      const { http, detectChanges } = await conFirma(FIRMA_ENVIADA);
      for (let i = 1; i < MAXIMO_SEGUIMIENTO; i++) {
        jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS);
        http.expectOne(URL_FIRMA).flush(FIRMA_ENVIADA);
      }
      detectChanges();

      expect(screen.getByRole('status')).toHaveTextContent(
        'El seguimiento dejó de actualizarse solo.',
      );
      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS * 5);
      http.expectNone(URL_FIRMA);

      screen.getByRole('button', { name: 'Actualizar seguimiento' }).click();
      http.expectOne(URL_FIRMA).flush(FIRMA_ABIERTA);
      detectChanges();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(hitos()[2]).toBe('Enlace abierto 06/11/2026 a las 10:20');
      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS);
      http.expectOne(URL_FIRMA).flush(FIRMA_FIRMADA);
    });

    it('si la primera consulta falla, lo dice y deja reintentar', async () => {
      const { http, detectChanges } = await renderizar();
      http.expectOne(URL_FIRMA).flush(null, { status: 503, statusText: 'Service Unavailable' });
      detectChanges();

      expect(screen.getByText('No pudimos consultar la firma.')).toBeVisible();
      screen.getByRole('button', { name: 'Reintentar' }).click();
      detectChanges();
      expect(screen.getByText('Consultando la firma…')).toBeVisible();
      sinFirma(http);
      detectChanges();
      expect(screen.getByRole('button', { name: 'Enviar enlace de firma' })).toBeVisible();
    });
  });

  describe('reenviar', () => {
    it('reenvía sin cuerpo, lo anuncia y reinicia el seguimiento con la respuesta', async () => {
      jest.useFakeTimers();
      const { http, detectChanges } = await conFirma(FIRMA_ABIERTA, 'asesor');

      screen.getByRole('button', { name: 'Reenviar enlace' }).click();
      detectChanges();
      expect(screen.getByRole('button', { name: 'Reenviar enlace' })).toBeDisabled();
      http.expectNone({ method: 'GET', url: URL_FIRMA });
      const reenvio = http.expectOne(URL_REENVIO);
      expect(reenvio.request.method).toBe('POST');
      expect(reenvio.request.body).toBeNull();
      reenvio.flush(FIRMA_ABIERTA);
      detectChanges();

      expect(screen.getByRole('status')).toHaveTextContent('Enlace reenviado con un código nuevo.');
      expect(screen.getByRole('button', { name: 'Reenviar enlace' })).toBeEnabled();
      jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS);
      http.expectOne(URL_FIRMA).flush(FIRMA_ABIERTA);
    });

    it('si el proveedor no responde (503), lo dice y la firma sigue igual', async () => {
      const { http, detectChanges } = await conFirma(FIRMA_ENVIADA);

      screen.getByRole('button', { name: 'Reenviar enlace' }).click();
      http
        .expectOne(URL_REENVIO)
        .flush(errorFirma('NUCLEO_NO_DISPONIBLE'), { status: 503, statusText: 'x' });
      detectChanges();

      expect(screen.getByRole('alert')).toHaveTextContent('No pudimos enviar el enlace');
      expect(chip()).toHaveTextContent('Esperando firma');
      expect(screen.getByRole('button', { name: 'Reenviar enlace' })).toBeEnabled();
      http.match(URL_FIRMA);
    });

    it('un 409 FIRMA_NO_REENVIABLE lo anuncia y consulta el estado actual', async () => {
      const { http, detectChanges } = await conFirma(FIRMA_ENVIADA);

      screen.getByRole('button', { name: 'Reenviar enlace' }).click();
      http
        .expectOne(URL_REENVIO)
        .flush(errorFirma('FIRMA_NO_REENVIABLE'), { status: 409, statusText: 'Conflict' });
      http.expectOne(URL_FIRMA).flush(FIRMA_VENCIDA);
      detectChanges();

      expect(screen.getByRole('status')).toHaveTextContent('El enlace ya no se puede reenviar.');
      expect(chip()).toHaveTextContent('Vencido');
      expect(screen.queryByRole('button', { name: 'Reenviar enlace' })).not.toBeInTheDocument();
    });
  });

  it('un doble reenvío reenvía una sola vez', async () => {
    const { http, fixture } = await conFirma(FIRMA_ENVIADA);
    const tarjeta = fixture.componentInstance as unknown as { reenviar(): void };

    tarjeta.reenviar();
    tarjeta.reenviar();

    const reenvios = http.match(URL_REENVIO);
    expect(reenvios).toHaveLength(1);
    reenvios[0].flush(FIRMA_ENVIADA);
    http.match(URL_FIRMA);
  });

  it('al destruirse deja de consultar', async () => {
    jest.useFakeTimers();
    const { http, fixture } = await conFirma(FIRMA_ENVIADA);

    fixture.destroy();
    jest.advanceTimersByTime(INTERVALO_SEGUIMIENTO_MS * 3);
    expect(http.match(URL_FIRMA)).toHaveLength(0);
  });

  it('el botón de enviar es accesible con el teclado', async () => {
    const { http, detectChanges } = await renderizar();
    sinFirma(http);
    detectChanges();

    const usuario = userEvent.setup();
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Enviar enlace de firma' })).toHaveFocus();
    await usuario.keyboard('{Enter}');
    http.expectOne({ method: 'POST', url: URL_FIRMA }).flush(FIRMA_PENDIENTE_ENVIO);
    http.match(URL_FIRMA);
  });
});
