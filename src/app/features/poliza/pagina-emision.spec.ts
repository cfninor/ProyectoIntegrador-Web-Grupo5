import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  HUELLA,
  NO_EMITIBLE,
  POLIZA_EMITIDA,
  POLIZA_GENERADA,
  POLIZA_ID,
  SOLICITUD_ID_POLIZA,
} from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { Poliza } from './modelos';
import { PaginaEmision } from './pagina-emision';

// SOLV-WEB-11, la confirmación de la emisión (SOLVENTAG5-58, D12): cada estado, la voz del asesor
// y del cliente, los datos y los documentos de la póliza emitida, «Ver póliza» y el foco.

const BFF = 'http://bff.prueba';
const URL_GENERAR = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID_POLIZA}/poliza`;
const URL_DOCUMENTO = `${BFF}/v1/polizas/${POLIZA_ID}/documento`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderizar(
  actor: Actor = 'cliente',
  solicitudId: string | null = SOLICITUD_ID_POLIZA,
) {
  const vista = await render(PaginaEmision, {
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

/** Renderiza con la póliza ya consultada. */
async function conPoliza(poliza: Poliza, actor: Actor = 'cliente') {
  const vista = await renderizar(actor);
  vista.http.expectOne(URL_GENERAR).flush(poliza);
  vista.detectChanges();
  await vista.fixture.whenStable();
  return vista;
}

const titulo = () => screen.getByRole('heading', { level: 2 });
const dato = (etiqueta: string, contenedor: HTMLElement = document.body) =>
  within(contenedor).getByText(etiqueta, { selector: 'dt' }).nextElementSibling;
const pasos = () =>
  within(screen.getByRole('list', { name: 'Pasos de la contratación' }))
    .getAllByRole('listitem')
    .filter((li) => li.classList.contains('paso'));

function simularDescarga() {
  const crear = jest.fn(() => 'blob:poliza');
  const liberar = jest.fn();
  Object.assign(URL, { createObjectURL: crear, revokeObjectURL: liberar });
  const clic = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return { crear, liberar, clic };
}

describe('PaginaEmision · SOLV-WEB-11', () => {
  it('pide la póliza de la solicitud al abrir, sin cuerpo', async () => {
    const { http } = await renderizar();

    const peticion = http.expectOne(URL_GENERAR);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    expect(titulo()).toHaveTextContent('Consultando la póliza…');
    peticion.flush(POLIZA_EMITIDA);
  });

  describe('con la póliza emitida', () => {
    it('el cliente ve el ícono verde, el título en segunda persona y el foco en el título', async () => {
      await conPoliza(POLIZA_EMITIDA, 'cliente');

      expect(screen.getByRole('img', { name: 'Póliza emitida' })).toBeInTheDocument();
      expect(titulo()).toHaveTextContent('¡Tu póliza fue emitida!');
      expect(titulo()).toHaveFocus();
      expect(screen.getByText(/Tu póliza quedó formalizada y vigente/)).toBeInTheDocument();
      expect(
        screen.getByText(
          'Te enviamos la póliza, el certificado de firma y el comprobante de pago.',
        ),
      ).toBeInTheDocument();
    });

    it('el asesor lo ve en tercera persona', async () => {
      await conPoliza(POLIZA_EMITIDA, 'asesor');

      expect(titulo()).toHaveTextContent('La póliza del cliente fue emitida');
      expect(titulo()).toHaveFocus();
      expect(screen.getByText(/El cliente ya la tiene disponible/)).toBeInTheDocument();
      expect(
        screen.getByText(
          'Enviamos al cliente la póliza, el certificado de firma y el comprobante de pago.',
        ),
      ).toBeInTheDocument();
    });

    it('el indicador de pasos está completo: los cinco hechos y ninguno actual', async () => {
      await conPoliza(POLIZA_EMITIDA);

      expect(pasos()).toHaveLength(5);
      for (const paso of pasos()) {
        expect(paso).toHaveClass('hecho');
        expect(paso).not.toHaveAttribute('aria-current');
      }
    });

    it('muestra el número, el tomador con el documento enmascarado, el inicio y el próximo cobro', async () => {
      await conPoliza(POLIZA_EMITIDA);

      expect(dato('Número de póliza')).toHaveTextContent('SV-VH-2026-004821');
      expect(dato('Tomador')).toHaveTextContent('María Fernanda Pérez Gómez · CC ••••5678');
      expect(dato('Fecha de inicio')).toHaveTextContent('06/11/2026');
      expect(dato('Próximo cobro')).toHaveTextContent('06/12/2026 por $ 70.000');
    });

    it('muestra el certificado de firma y el comprobante de pago, sin el número de la tarjeta', async () => {
      await conPoliza(POLIZA_EMITIDA);

      const certificado = screen.getByRole('article', {
        name: 'Certificado de firma electrónica',
      });
      expect(dato('Fecha y hora', certificado)).toHaveTextContent('06/11/2026 a las 10:23');
      expect(dato('Huella firmada', certificado)).toHaveTextContent(HUELLA);
      const comprobante = screen.getByRole('article', { name: 'Comprobante de pago' });
      expect(dato('Tarjeta', comprobante)).toHaveTextContent('VISA •••• 4242');
      expect(dato('Valor', comprobante)).toHaveTextContent('$ 70.000');
      expect(dato('Fecha', comprobante)).toHaveTextContent('06/11/2026 a las 10:00');
    });

    it.each<[Actor, string]>([
      ['asesor', '/asesor'],
      ['cliente', '/cliente'],
    ])('el %s tiene «Nueva cotización» e «Ir al tablero» de su portal', async (actor, portal) => {
      await conPoliza(POLIZA_EMITIDA, actor);

      expect(screen.getByRole('link', { name: 'Nueva cotización' })).toHaveAttribute(
        'href',
        `${portal}/cotizar`,
      );
      expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', portal);
    });

    it('sin próximo cobro ni documentos no muestra esas partes', async () => {
      await conPoliza({ ...POLIZA_EMITIDA, proximoCobro: undefined, documentos: undefined });

      expect(screen.queryByText('Próximo cobro')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Documentos' })).not.toBeInTheDocument();
      expect(dato('Número de póliza')).toHaveTextContent('SV-VH-2026-004821');
    });

    it('sin número muestra el id de la póliza', async () => {
      await conPoliza({ ...POLIZA_EMITIDA, numeroPoliza: undefined });

      expect(dato('Número de póliza')).toHaveTextContent(POLIZA_ID);
    });

    it('con solo uno de los documentos muestra ese', async () => {
      await conPoliza({
        ...POLIZA_EMITIDA,
        documentos: { ...POLIZA_EMITIDA.documentos!, certificadoFirma: undefined! },
      });

      expect(
        screen.queryByRole('article', { name: 'Certificado de firma electrónica' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('article', { name: 'Comprobante de pago' })).toBeInTheDocument();
    });

    it('«Ver póliza» entrega el PDF firmado con el nombre de la póliza y libera el blob', async () => {
      const { crear, liberar, clic } = simularDescarga();
      const { http, detectChanges } = await conPoliza(POLIZA_EMITIDA);
      jest.useFakeTimers();

      screen.getByRole('button', { name: 'Ver póliza' }).click();
      detectChanges();
      expect(screen.getByRole('button', { name: 'Ver póliza' })).toBeDisabled();
      const peticion = http.expectOne(URL_DOCUMENTO);
      expect(peticion.request.responseType).toBe('blob');
      peticion.flush(new Blob(['%PDF-'], { type: 'application/pdf' }));
      detectChanges();

      expect(crear).toHaveBeenCalled();
      expect(clic).toHaveBeenCalledTimes(1);
      expect((clic.mock.contexts[0] as HTMLAnchorElement).download).toBe(`poliza-${POLIZA_ID}.pdf`);
      jest.runOnlyPendingTimers();
      expect(liberar).toHaveBeenCalledWith('blob:poliza');
      expect(screen.getByRole('button', { name: 'Ver póliza' })).toBeEnabled();
    });

    it('un doble clic en «Ver póliza» pide el PDF una sola vez', async () => {
      simularDescarga();
      const { http, detectChanges } = await conPoliza(POLIZA_EMITIDA);
      const usuario = userEvent.setup();

      await usuario.dblClick(screen.getByRole('button', { name: 'Ver póliza' }));
      detectChanges();

      http.expectOne(URL_DOCUMENTO).flush(new Blob(['%PDF-']));
    });

    it('dos clics seguidos en «Ver póliza», antes de volver a pintar, piden el PDF una vez', async () => {
      simularDescarga();
      const { http } = await conPoliza(POLIZA_EMITIDA);
      const boton = screen.getByRole('button', { name: 'Ver póliza' });

      boton.click();
      boton.click();

      http.expectOne(URL_DOCUMENTO).flush(new Blob(['%PDF-']));
    });

    it('si el PDF no llega lo dice y se puede intentar de nuevo', async () => {
      const { http, detectChanges } = await conPoliza(POLIZA_EMITIDA);

      screen.getByRole('button', { name: 'Ver póliza' }).click();
      http.expectOne(URL_DOCUMENTO).flush(null, { status: 503, statusText: 'Error' });
      detectChanges();

      expect(screen.getByRole('alert')).toHaveTextContent(
        'No pudimos abrir la póliza. Intenta de nuevo.',
      );
      expect(screen.getByRole('button', { name: 'Ver póliza' })).toBeEnabled();
    });
  });

  describe('sin una póliza emitida', () => {
    it.each<[string, () => Poliza | null, number]>([
      ['la póliza todavía está PENDIENTE_FIRMA', () => POLIZA_GENERADA, 200],
      ['la solicitud no genera póliza (409)', () => null, 409],
    ])('si %s, un estado lleva a la firma', async (_caso, poliza, estado) => {
      const { http, detectChanges, fixture } = await renderizar('asesor');
      http
        .expectOne(URL_GENERAR)
        .flush(poliza() ?? NO_EMITIBLE.EN_REVISION, { status: estado, statusText: 'x' });
      detectChanges();
      await fixture.whenStable();

      expect(titulo()).toHaveTextContent('La póliza todavía no está emitida');
      expect(titulo()).toHaveFocus();
      expect(screen.getByRole('link', { name: 'Ir a la firma' })).toHaveAttribute(
        'href',
        `/asesor/cotizar/oferta/c-1/firma?solicitudId=${SOLICITUD_ID_POLIZA}`,
      );
      expect(screen.queryByRole('img', { name: 'Póliza emitida' })).not.toBeInTheDocument();
      const actual = pasos().find((li) => li.getAttribute('aria-current') === 'step');
      expect(actual).toHaveTextContent('Emisión');
    });

    it('sin solicitud en la URL lo dice sin pedir nada', async () => {
      await renderizar('cliente', null);

      expect(titulo()).toHaveTextContent('No hay una solicitud para confirmar');
    });

    it('una solicitud que no existe (404) lo dice', async () => {
      const { http, detectChanges } = await renderizar();
      http.expectOne(URL_GENERAR).flush(null, { status: 404, statusText: 'Not Found' });
      detectChanges();

      expect(titulo()).toHaveTextContent('No encontramos esta solicitud de suscripción');
    });

    it('si falla la consulta, «Reintentar» la vuelve a pedir', async () => {
      const { http, detectChanges } = await renderizar();
      http.expectOne(URL_GENERAR).flush(null, { status: 503, statusText: 'Error' });
      detectChanges();
      expect(titulo()).toHaveTextContent('No pudimos consultar la póliza');

      screen.getByRole('button', { name: 'Reintentar' }).click();
      http.expectOne(URL_GENERAR).flush(POLIZA_EMITIDA);
      detectChanges();

      expect(titulo()).toHaveTextContent('¡Tu póliza fue emitida!');
    });
  });

  it('al destruirse cancela la consulta en curso', async () => {
    const { http, fixture } = await renderizar();
    const peticion = http.expectOne(URL_GENERAR);

    fixture.destroy();

    expect(peticion.cancelled).toBe(true);
  });
});
