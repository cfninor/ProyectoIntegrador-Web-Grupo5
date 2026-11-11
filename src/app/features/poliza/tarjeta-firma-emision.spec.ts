import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { FIRMA_ENVIADA, FIRMA_FIRMADA } from '../../../testing/fixtures-firma';
import {
  HUELLA,
  POLIZA_EMITIDA,
  POLIZA_ID,
  POLIZA_NO_EMITIBLE,
  SOLICITUD_ID_POLIZA,
} from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { EstadoPoliza, Firma } from './modelos';
import { TarjetaFirma } from './tarjeta-firma';

// «Emitir póliza» y «Ver confirmación» en la tarjeta de firma de SOLV-WEB-10 (SOLVENTAG5-58, D12):
// con la firma FIRMADA y la póliza PENDIENTE_FIRMA se emite y se va a SOLV-WEB-11; con la póliza
// VIGENTE se ve la confirmación; cada 409 POLIZA_NO_EMITIBLE se muestra como estado.

const BFF = 'http://bff.prueba';
const URL_FIRMA = `${BFF}/v1/polizas/${POLIZA_ID}/firma`;
const URL_EMISION = `${BFF}/v1/polizas/${POLIZA_ID}/emision`;
const RUTA_EMISION = '/asesor/cotizar/oferta/c-1/emision';

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
  jest.restoreAllMocks();
});

async function renderizar(
  firma: Firma,
  {
    actor = 'asesor',
    estadoPoliza = 'PENDIENTE_FIRMA',
    rutaEmision = RUTA_EMISION,
  }: { actor?: Actor; estadoPoliza?: EstadoPoliza; rutaEmision?: string | null } = {},
) {
  const vista = await render(TarjetaFirma, {
    inputs: {
      polizaId: POLIZA_ID,
      actor,
      generadoEn: '2026-10-14T16:32:10.850Z',
      huella: HUELLA,
      rutaPago: '/asesor/cotizar/oferta/c-1/pago',
      solicitudId: SOLICITUD_ID_POLIZA,
      estadoPoliza,
      ...(rutaEmision ? { rutaEmision } : {}),
    },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  http.expectOne(URL_FIRMA).flush(firma);
  vista.detectChanges();
  const navegar = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { ...vista, http, navegar };
}

const emitir = () => screen.queryByRole('button', { name: 'Emitir póliza' });

describe('TarjetaFirma · emisión (SOLVENTAG5-58)', () => {
  it.each([201, 200])(
    'con la firma FIRMADA, «Emitir póliza» emite sin cuerpo y, con el %s, lleva a SOLV-WEB-11',
    async (estado) => {
      const { http, navegar } = await renderizar(FIRMA_FIRMADA);

      emitir()!.click();
      const peticion = http.expectOne(URL_EMISION);
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.body).toBeNull();
      peticion.flush(POLIZA_EMITIDA, { status: estado, statusText: 'OK' });

      expect(navegar).toHaveBeenCalledWith([RUTA_EMISION], {
        queryParams: { solicitudId: SOLICITUD_ID_POLIZA },
      });
    },
  );

  it('un doble clic emite una sola vez: el botón queda deshabilitado mientras emite', async () => {
    const { http, detectChanges } = await renderizar(FIRMA_FIRMADA);
    const usuario = userEvent.setup();

    await usuario.dblClick(emitir()!);
    detectChanges();

    expect(emitir()).toBeDisabled();
    expect(emitir()).toHaveAttribute('aria-busy', 'true');
    http.expectOne(URL_EMISION).flush(POLIZA_EMITIDA, { status: 201, statusText: 'Created' });
  });

  it('dos clics seguidos, antes de volver a pintar, también emiten una sola vez', async () => {
    const { http } = await renderizar(FIRMA_FIRMADA);
    const boton = emitir()!;

    boton.click();
    boton.click();

    http.expectOne(URL_EMISION).flush(POLIZA_EMITIDA, { status: 201, statusText: 'Created' });
  });

  it('con la firma en curso no ofrece emitir', async () => {
    await renderizar(FIRMA_ENVIADA);

    expect(emitir()).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver confirmación' })).not.toBeInTheDocument();
  });

  it.each<EstadoPoliza>(['PENDIENTE_FIRMA', 'VIGENTE'])(
    'sin la ruta de la confirmación la tarjeta no ofrece la emisión (%s)',
    async (estadoPoliza) => {
      await renderizar(FIRMA_FIRMADA, { estadoPoliza, rutaEmision: null });

      expect(emitir()).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Ver confirmación' })).not.toBeInTheDocument();
    },
  );

  describe('con la póliza VIGENTE', () => {
    it.each<[Actor, RegExp]>([
      ['asesor', /El cliente firmó la póliza y ya está emitida/],
      ['cliente', /Firmaste tu póliza y ya está emitida/],
    ])(
      'el %s ve «Ver confirmación», que lleva a SOLV-WEB-11, y no «Emitir póliza»',
      async (actor, texto) => {
        await renderizar(FIRMA_FIRMADA, { actor, estadoPoliza: 'VIGENTE' });

        expect(screen.getByText(texto)).toBeInTheDocument();
        expect(screen.queryByText(/Ya se puede emitir/)).not.toBeInTheDocument();
        expect(emitir()).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ver confirmación' })).toHaveAttribute(
          'href',
          `${RUTA_EMISION}?solicitudId=${SOLICITUD_ID_POLIZA}`,
        );
      },
    );
  });

  describe('cada 409 POLIZA_NO_EMITIBLE se muestra como estado', () => {
    it.each<[keyof typeof POLIZA_NO_EMITIBLE, string, string, boolean]>([
      [
        'POLIZA_CANCELADA',
        'La póliza fue cancelada',
        'La póliza no se puede emitir porque quedó cancelada.',
        false,
      ],
      [
        'FIRMA_PENDIENTE',
        'Falta la firma del documento',
        'La póliza se emite cuando el documento esté firmado.',
        true,
      ],
      [
        'PAGO_NO_APROBADO',
        'Falta el pago aprobado de la primera prima',
        'La póliza se emite cuando el pago de la primera prima esté aprobado.',
        true,
      ],
    ])('%s', async (motivo, titulo, texto, sePuedeReintentar) => {
      const { http, detectChanges, navegar } = await renderizar(FIRMA_FIRMADA);

      emitir()!.click();
      http
        .expectOne(URL_EMISION)
        .flush(POLIZA_NO_EMITIBLE[motivo], { status: 409, statusText: 'Conflict' });
      detectChanges();

      expect(screen.getByRole('heading', { level: 4, name: titulo })).toBeInTheDocument();
      expect(screen.getByText(texto)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(navegar).not.toHaveBeenCalled();
      if (sePuedeReintentar) {
        expect(emitir()).toBeEnabled();
      } else {
        expect(emitir()).not.toBeInTheDocument();
      }
    });
  });

  it.each([
    [409, { codigo: 'OTRO', detalle: 'x' }],
    [409, { codigo: 'POLIZA_NO_EMITIBLE', detalle: 'x', motivo: 'DESCONOCIDO' }],
    [503, { codigo: 'NUCLEO_NO_DISPONIBLE', detalle: 'x' }],
    [500, null],
  ])('otro error (%s) es un aviso y se puede intentar de nuevo', async (estado, cuerpo) => {
    const { http, detectChanges } = await renderizar(FIRMA_FIRMADA);

    emitir()!.click();
    http.expectOne(URL_EMISION).flush(cuerpo, { status: estado, statusText: 'Error' });
    detectChanges();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No pudimos emitir la póliza. Intenta de nuevo en unos minutos.',
    );
    expect(emitir()).toBeEnabled();
  });

  it('se puede emitir con el teclado', async () => {
    const { http } = await renderizar(FIRMA_FIRMADA);
    const usuario = userEvent.setup();

    emitir()!.focus();
    await usuario.keyboard('{Enter}');

    http.expectOne(URL_EMISION).flush(POLIZA_EMITIDA, { status: 201, statusText: 'Created' });
  });

  it('al destruirse cancela la emisión en curso', async () => {
    const { http, fixture } = await renderizar(FIRMA_FIRMADA);

    emitir()!.click();
    const peticion = http.expectOne(URL_EMISION);
    fixture.destroy();

    expect(peticion.cancelled).toBe(true);
  });
});
