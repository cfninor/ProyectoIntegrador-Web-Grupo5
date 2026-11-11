import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { FIRMA_FIRMADA } from '../../../testing/fixtures-firma';
import {
  HUELLA,
  NO_EMITIBLE,
  POLIZA_EMITIDA,
  POLIZA_GENERADA,
  POLIZA_GENERANDO,
  POLIZA_ID,
  SOLICITUD_ID_POLIZA,
} from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { INTERVALO_CONSULTA_MS, MAXIMO_CONSULTAS, PaginaFirma } from './pagina-firma';

// SOLV-WEB-10, la póliza para firma (SOLVENTAG5-56): pedirla, consultarla cada segundo hasta
// GENERADO, la vista previa, la descarga del PDF y cada 409 de R2 como estado.

const BFF = 'http://bff.prueba';
const URL_GENERAR = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`;
const URL_POLIZA = `${BFF}/v1/polizas/${POLIZA_ID}`;
const URL_DOCUMENTO = `${URL_POLIZA}/documento`;
// La tarjeta de la firma (SOLVENTAG5-57) consulta la firma con el documento GENERADO; sus casos
// están en tarjeta-firma.spec.ts.
const URL_FIRMA = `${URL_POLIZA}/firma`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.match(URL_FIRMA);
  http?.verify();
  http = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderizar(
  actor: Actor = 'cliente',
  solicitudId: string | null = SOLICITUD_ID_POLIZA,
) {
  const vista = await render(PaginaFirma, {
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
const dato = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling;

describe('PaginaFirma · SOLV-WEB-10', () => {
  it('es el paso 4, Firma, con los anteriores completados', async () => {
    const { http } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);

    const pasos = within(screen.getByRole('list', { name: 'Pasos de la contratación' }));
    expect(pasos.getByText('Pago').closest('li')).toHaveClass('hecho');
    expect(pasos.getByText('Firma').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(pasos.getByText('Emisión').closest('li')).not.toHaveClass('hecho');
  });

  it('pide la póliza al abrir y muestra el estado intermedio con la vista previa', async () => {
    jest.useFakeTimers();
    const { http, detectChanges } = await renderizar();
    expect(titulo()).toHaveTextContent('Preparando la póliza…');

    const generar = http.expectOne(URL_GENERAR);
    expect(generar.request.method).toBe('POST');
    expect(generar.request.body).toBeNull();
    generar.flush(POLIZA_GENERANDO);
    detectChanges();

    expect(titulo()).toHaveTextContent('Tu póliza para firma');
    expect(screen.getByText(/Estamos generando el documento de tu póliza/)).toBeVisible();
    expect(within(dato('Documento') as HTMLElement).getByText('Generando')).toHaveClass(
      'chip-verde-azulado',
    );
    expect(dato('Número de póliza')).toHaveTextContent(POLIZA_ID);
    const descargar = screen.getByRole('button', { name: 'Descargar PDF' });
    expect(descargar).toBeDisabled();
    expect(descargar).toHaveAccessibleDescription(
      'El PDF estará disponible cuando termine de generarse.',
    );
    const seguimiento = within(screen.getByRole('list', { name: 'Seguimiento de la firma' }));
    expect(seguimiento.getByText('Generando el documento')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText('Huella del documento')).not.toBeInTheDocument();
  });

  it('la vista previa trae los datos de la respuesta, como «Resumen de tu póliza»', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    const resumen = within(screen.getByRole('article', { name: 'Resumen de tu póliza' }));
    expect(dato('Tomador')).toHaveTextContent('María Fernanda Pérez Gómez');
    expect(dato('Documento de identidad')).toHaveTextContent('CC ••••5678');
    expect(dato('Producto')).toHaveTextContent('Vida hipotecario');
    expect(dato('Suma asegurada')).toHaveTextContent('$ 200.000.000');
    expect(dato('Prima mensual')).toHaveTextContent('$ 70.000');
    expect(dato('Vigencia')).toHaveTextContent('Del 14/10/2026 al 14/10/2046');
    expect(
      resumen
        .getAllByRole('listitem')
        .slice(0, 2)
        .map((li) => li.textContent?.trim()),
    ).toEqual(['Fallecimiento del deudor', 'Incapacidad total y permanente del deudor']);
    expect(
      within(resumen.getByRole('list', { name: 'Exclusiones' })).getAllByRole('listitem'),
    ).toHaveLength(4);
    expect(resumen.getByText('Actos de guerra o terrorismo')).toBeInTheDocument();
    expect(resumen.getByText('Condiciones del producto, versión VH-2026.1.')).toBeInTheDocument();
  });

  it('una prima que no es mensual dice solo «Prima»', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush({ ...POLIZA_GENERADA, periodicidad: 'ANUAL', ramo: 'VIAJE' });
    detectChanges();

    expect(dato('Prima')).toHaveTextContent('$ 70.000');
    expect(dato('Producto')).toHaveTextContent('VIAJE');
  });

  it('consulta cada segundo, una petición a la vez, hasta ver el documento generado', async () => {
    jest.useFakeTimers();
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERANDO);

    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS - 1);
    http.expectNone(URL_POLIZA);
    jest.advanceTimersByTime(1);
    const primera = http.expectOne(URL_POLIZA);
    expect(primera.request.method).toBe('GET');
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 3);
    http.expectNone(URL_POLIZA); // no hay otra mientras la primera no responde
    primera.flush(POLIZA_GENERANDO);
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS);
    http.expectOne(URL_POLIZA).flush(POLIZA_GENERADA);
    detectChanges();

    expect(screen.getByText(/El documento de tu póliza está listo/)).toBeVisible();
    expect(within(dato('Documento') as HTMLElement).getByText('Generado')).toBeInTheDocument();
    const hito = within(screen.getByRole('list', { name: 'Seguimiento de la firma' })).getByRole(
      'listitem',
    );
    expect(hito).toHaveClass('hecho');
    expect(hito).toHaveTextContent('Documento generado 14/10/2026 a las 11:32');
    expect(dato('Huella del documento')).toHaveTextContent(HUELLA);
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();

    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 5);
    http.expectNone(URL_POLIZA);
  });

  it('después de 30 consultas dice que sigue generándose, como estado, y deja volver a consultar', async () => {
    jest.useFakeTimers();
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERANDO);
    for (let i = 0; i < MAXIMO_CONSULTAS; i++) {
      jest.advanceTimersByTime(INTERVALO_CONSULTA_MS);
      http.expectOne(URL_POLIZA).flush(POLIZA_GENERANDO);
    }
    detectChanges();

    expect(screen.getByRole('status')).toHaveTextContent('El documento sigue generándose');
    expect(titulo()).toHaveTextContent('Tu póliza para firma');
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 5);
    http.expectNone(URL_POLIZA);

    screen.getByRole('button', { name: 'Volver a consultar' }).click();
    http.expectOne(URL_POLIZA).flush(POLIZA_GENERADA);
    detectChanges();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Documento generado')).toBeInTheDocument();
  });

  it('si una consulta falla, conserva el último estado y sigue consultando', async () => {
    jest.useFakeTimers();
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERANDO);

    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS);
    http.expectOne(URL_POLIZA).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();
    expect(titulo()).toHaveTextContent('Tu póliza para firma');
    expect(screen.getByText('Generando', { selector: '.chip' })).toBeInTheDocument();

    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS);
    http.expectOne(URL_POLIZA).flush(POLIZA_GENERADA);
    detectChanges();
    expect(screen.getByText('Documento generado')).toBeInTheDocument();
  });

  it('una póliza que ya estaba generada no se consulta más', async () => {
    jest.useFakeTimers();
    const { http } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);

    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 5);
    expect(http.match(URL_POLIZA)).toHaveLength(0);
  });

  it.each([
    ['generando', POLIZA_GENERANDO, /Se está generando el documento de la póliza/],
    ['generada', POLIZA_GENERADA, /listo para que el cliente lo revise y lo firme/],
  ])('al asesor le habla en tercera persona (%s)', async (_caso, poliza, texto) => {
    const { http, detectChanges } = await renderizar('asesor');
    http.expectOne(URL_GENERAR).flush(poliza);
    detectChanges();

    expect(titulo()).toHaveTextContent('Póliza para firma del cliente');
    expect(screen.getByText(texto)).toBeVisible();
    expect(screen.getByRole('article', { name: 'Resumen de la póliza' })).toBeInTheDocument();
    http.match(URL_POLIZA);
  });

  it('deja de consultar al salir de la pantalla', async () => {
    jest.useFakeTimers();
    const { http, fixture } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERANDO);

    fixture.destroy();
    jest.advanceTimersByTime(INTERVALO_CONSULTA_MS * 3);

    expect(http.match(URL_POLIZA)).toHaveLength(0);
  });
});

describe('PaginaFirma · descargar el PDF', () => {
  function simularNavegador() {
    const crear = jest.fn(() => 'blob:poliza');
    const liberar = jest.fn();
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: liberar });
    const clic = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    return { crear, liberar, clic };
  }

  it('lo pide con HttpClient como blob, lo descarga con su nombre y libera el blob', async () => {
    jest.useFakeTimers();
    const { crear, liberar, clic } = simularNavegador();
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    screen.getByRole('button', { name: 'Descargar PDF' }).click();
    const descarga = http.expectOne(URL_DOCUMENTO);
    expect(descarga.request.responseType).toBe('blob');
    detectChanges();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    const pdf = new Blob(['%PDF-'], { type: 'application/pdf' });
    descarga.flush(pdf);
    detectChanges();

    expect(crear).toHaveBeenCalledWith(pdf);
    const enlace = clic.mock.contexts[0] as HTMLAnchorElement;
    expect(enlace.download).toBe(`poliza-${POLIZA_ID}.pdf`);
    expect(enlace.href).toBe('blob:poliza');
    expect(liberar).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(liberar).toHaveBeenCalledWith('blob:poliza');
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled();
  });

  it('si la descarga falla, lo dice', async () => {
    simularNavegador();
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Descargar PDF' }));
    http.expectOne(URL_DOCUMENTO).flush(new Blob(['{}']), { status: 409, statusText: 'Conflict' });
    detectChanges();

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos descargar el documento');
  });

  it('no descarga mientras el documento se genera', async () => {
    const { clic } = simularNavegador();
    const { http, fixture } = await renderizar();
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERANDO);

    (fixture.componentInstance as unknown as { descargar(): void }).descargar();

    http.expectNone(URL_DOCUMENTO);
    expect(clic).not.toHaveBeenCalled();
    http.match(URL_POLIZA);
  });
});

describe('PaginaFirma · lo que no genera póliza (R2)', () => {
  describe.each([
    {
      motivo: 'PRIMA_AJUSTADA_SIN_ACEPTAR' as const,
      chip: 'Nueva prima sin aceptar',
      clase: 'chip-ambar',
      cliente: 'Primero acepta la nueva prima',
      asesor: 'El cliente no ha aceptado la nueva prima',
    },
    {
      motivo: 'EN_REVISION' as const,
      chip: 'Pendiente de revisión',
      clase: 'chip-ambar',
      cliente: 'Tu solicitud está en revisión',
      asesor: 'La solicitud está en revisión',
    },
    {
      motivo: 'SIN_DECISION' as const,
      chip: 'Sin decisión',
      clase: 'chip-ambar',
      cliente: 'Tu solicitud todavía no tiene decisión',
      asesor: 'La solicitud todavía no tiene decisión',
    },
    {
      motivo: 'RECHAZADA' as const,
      chip: 'Rechazada',
      clase: 'chip-rojo',
      cliente: 'No podemos generar tu póliza',
      asesor: 'No se puede generar la póliza',
    },
    {
      motivo: 'SIN_CLIENTE' as const,
      chip: 'Sin cliente',
      clase: 'chip-ambar',
      cliente: 'La solicitud no tiene un cliente',
      asesor: 'La solicitud no tiene un cliente',
    },
  ])('409 $motivo', ({ motivo, chip, clase, cliente, asesor }) => {
    it.each([
      ['cliente', cliente],
      ['asesor', asesor],
    ] as const)('se lo muestra al %s como estado, con su chip', async (actor, texto) => {
      const { http, detectChanges } = await renderizar(actor);
      http
        .expectOne(URL_GENERAR)
        .flush(NO_EMITIBLE[motivo], { status: 409, statusText: 'Conflict' });
      detectChanges();

      expect(titulo()).toHaveTextContent(texto);
      expect(within(dato('Estado de la solicitud') as HTMLElement).getByText(chip)).toHaveClass(
        clase,
      );
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver a la suscripción' })).toHaveAttribute(
        'href',
        `/${actor}/cotizar/oferta/c-1/suscripcion?solicitudId=${SOLICITUD_ID_POLIZA}`,
      );
      expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute(
        'href',
        `/${actor}`,
      );
    });
  });

  it('un 409 sin un motivo conocido es un error que deja reintentar', async () => {
    const { http, detectChanges } = await renderizar();
    http
      .expectOne(URL_GENERAR)
      .flush({ codigo: 'SOLICITUD_NO_EMITIBLE', detalle: 'x' }, { status: 409, statusText: 'x' });
    detectChanges();

    expect(titulo()).toHaveTextContent('No pudimos preparar la póliza');
  });

  it('una solicitud ajena o que no existe (404) lo dice', async () => {
    const { http, detectChanges } = await renderizar();
    http
      .expectOne(URL_GENERAR)
      .flush(
        { codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA', detalle: 'No.' },
        { status: 404, statusText: 'Not Found' },
      );
    detectChanges();

    expect(titulo()).toHaveTextContent('No encontramos esta solicitud de suscripción');
  });

  it('si el BFF falla, permite reintentar', async () => {
    const { http, detectChanges } = await renderizar();
    http.expectOne(URL_GENERAR).flush(null, { status: 503, statusText: 'Service Unavailable' });
    detectChanges();
    expect(titulo()).toHaveTextContent('No pudimos preparar la póliza');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    http.expectOne(URL_GENERAR).flush(POLIZA_GENERADA);
    detectChanges();

    expect(titulo()).toHaveTextContent('Tu póliza para firma');
  });

  it('sin solicitud en la URL no pide nada', async () => {
    const { http } = await renderizar('cliente', null);

    expect(titulo()).toHaveTextContent('No hay una solicitud para firmar');
    http.expectNone(URL_GENERAR);
  });

  it('con la póliza emitida muestra su número y la tarjeta lleva a la confirmación (SOLVENTAG5-58)', async () => {
    const { http, detectChanges } = await renderizar('cliente');
    http.expectOne(URL_GENERAR).flush(POLIZA_EMITIDA);
    detectChanges();
    http.expectOne(URL_FIRMA).flush(FIRMA_FIRMADA);
    detectChanges();

    expect(dato('Número de póliza')).toHaveTextContent('SV-VH-2026-004821');
    expect(screen.getByRole('link', { name: 'Ver confirmación' })).toHaveAttribute(
      'href',
      `/cliente/cotizar/oferta/c-1/emision?solicitudId=${SOLICITUD_ID_POLIZA}`,
    );
    expect(screen.queryByRole('button', { name: 'Emitir póliza' })).not.toBeInTheDocument();
  });
});
