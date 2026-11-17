import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { AJUSTADA_POR_ANALISTA, EN_REVISION } from '../../../testing/fixtures-revision';
import { APP_CONFIG } from '../../core/config/app-config';
import { RevisionSolicitud } from './modelos';
import { PanelDecision, primaConRecargo } from './panel-decision';

// El panel «Registrar decisión» del detalle de revisión (SOLVENTAG5-54).

const BFF = 'http://bff.prueba';
const URL_DECISION = `${BFF}/v1/solicitudes-suscripcion/${EN_REVISION.solicitudId}/decision`;
const JUSTIFICACION = 'El monto supera el máximo, pero el perfil es MEDIO y paga a tiempo.';

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(revision: RevisionSolicitud = EN_REVISION) {
  const decidida = jest.fn();
  const recargar = jest.fn();
  const vista = await render(PanelDecision, {
    inputs: { revision },
    on: { decidida, recargar },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
      { provide: LOCALE_ID, useValue: 'es-CO' },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { vista, http, decidida, recargar, usuario: userEvent.setup() };
}

const opcion = (nombre: string) => screen.getByRole('radio', { name: nombre });
const justificacion = () => screen.getByLabelText('Justificación (obligatoria)');
const recargo = () => screen.getByLabelText('Recargo de prima (%)');
const registrar = () => screen.getByRole('button', { name: 'Registrar decisión' });

describe('PanelDecision · SOLVENTAG5-54', () => {
  it('ofrece aceptar, ajustar o rechazar, con la justificación obligatoria y la nota', async () => {
    await renderizar();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Registrar decisión' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Decisión' })).toBeInTheDocument();
    expect(opcion('Aceptar sin cambios')).not.toBeChecked();
    expect(opcion('Ajustar condiciones del riesgo')).not.toBeChecked();
    expect(opcion('Rechazar la solicitud')).not.toBeChecked();
    expect(justificacion()).toHaveAttribute('maxlength', '1000');
    expect(screen.queryByLabelText('Recargo de prima (%)')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'La decisión se guarda con las reglas, las señales, tu usuario y la hora, y no se puede editar ni revertir.',
      ),
    ).toBeInTheDocument();
  });

  it('al ajustar pide el recargo y muestra la nueva prima antes de confirmar', async () => {
    const { usuario } = await renderizar();

    await usuario.click(opcion('Ajustar condiciones del riesgo'));
    expect(screen.getByLabelText('Nueva prima')).toHaveTextContent('—');
    await usuario.type(recargo(), '15');

    expect(screen.getByLabelText('Nueva prima')).toHaveTextContent('$ 266.685 / mes');
  });

  it.each(['0', '101', '12.5', 'diez'])('con el recargo «%s» no hay nueva prima', async (valor) => {
    const { usuario } = await renderizar();

    await usuario.click(opcion('Ajustar condiciones del riesgo'));
    await usuario.type(recargo(), valor);

    expect(screen.getByLabelText('Nueva prima')).toHaveTextContent('—');
  });

  it('sin una prima mensual la nueva prima va sin «/ mes»', async () => {
    const { usuario } = await renderizar({ ...EN_REVISION, periodicidad: 'ANUAL' });

    await usuario.click(opcion('Ajustar condiciones del riesgo'));
    await usuario.type(recargo(), '20');

    expect(screen.getByLabelText('Nueva prima')).toHaveTextContent(/^\$ 278\.280$/);
  });

  it('sin decisión ni justificación no envía nada y dice qué falta', async () => {
    const { usuario, http } = await renderizar();

    await usuario.click(registrar());

    expect(screen.getByText('Elige una decisión.')).toBeInTheDocument();
    expect(screen.getByText('Escribe la justificación.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Decisión' })).toHaveAttribute('aria-invalid', 'true');
    expect(justificacion()).toHaveAttribute('aria-invalid', 'true');
    http.expectNone(URL_DECISION);
  });

  it('una justificación de solo espacios no vale', async () => {
    const { usuario, http } = await renderizar();

    await usuario.click(opcion('Aceptar sin cambios'));
    await usuario.type(justificacion(), '   ');
    await usuario.click(registrar());

    expect(screen.getByText('Escribe la justificación.')).toBeInTheDocument();
    http.expectNone(URL_DECISION);
  });

  it.each([
    ['', 'Escribe el recargo.'],
    ['0', 'El recargo es un número entero entre 1 y 100 %.'],
    ['101', 'El recargo es un número entero entre 1 y 100 %.'],
    ['12.5', 'El recargo es un número entero entre 1 y 100 %.'],
  ])('al ajustar con el recargo «%s» dice «%s» y no envía', async (valor, mensaje) => {
    const { usuario, http } = await renderizar();

    await usuario.click(opcion('Ajustar condiciones del riesgo'));
    if (valor) {
      await usuario.type(recargo(), valor);
    }
    await usuario.type(justificacion(), JUSTIFICACION);
    await usuario.click(registrar());

    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(recargo()).toHaveAttribute('aria-invalid', 'true');
    http.expectNone(URL_DECISION);
  });

  it('registra un ajuste con el recargo como número y avisa con el detalle decidido', async () => {
    const { usuario, http, decidida } = await renderizar();

    await usuario.click(opcion('Ajustar condiciones del riesgo'));
    await usuario.type(recargo(), '15');
    await usuario.type(justificacion(), `  ${JUSTIFICACION}  `);
    await usuario.click(registrar());

    const peticion = http.expectOne(URL_DECISION);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      resultado: 'AJUSTADA',
      recargoPorcentaje: 15,
      justificacion: JUSTIFICACION,
    });
    peticion.flush(AJUSTADA_POR_ANALISTA);
    expect(decidida).toHaveBeenCalledWith(AJUSTADA_POR_ANALISTA);
  });

  it.each([
    ['Aceptar sin cambios', 'ACEPTADA'],
    ['Rechazar la solicitud', 'RECHAZADA'],
  ])('«%s» se envía sin recargo', async (nombre, resultado) => {
    const { usuario, http } = await renderizar();

    await usuario.click(opcion(nombre));
    await usuario.type(justificacion(), JUSTIFICACION);
    await usuario.click(registrar());

    expect(http.expectOne(URL_DECISION).request.body).toEqual({
      resultado,
      justificacion: JUSTIFICACION,
    });
  });

  it('al pasar de ajustar a rechazar se borra el recargo', async () => {
    const { usuario, http } = await renderizar();

    await usuario.click(opcion('Ajustar condiciones del riesgo'));
    await usuario.type(recargo(), '15');
    await usuario.click(opcion('Rechazar la solicitud'));
    await usuario.type(justificacion(), JUSTIFICACION);
    await usuario.click(registrar());

    expect(screen.queryByLabelText('Recargo de prima (%)')).not.toBeInTheDocument();
    expect(http.expectOne(URL_DECISION).request.body).toEqual({
      resultado: 'RECHAZADA',
      justificacion: JUSTIFICACION,
    });
  });

  it('mientras registra, el botón queda ocupado y no envía dos veces', async () => {
    const { usuario, http } = await renderizar();

    await usuario.click(opcion('Aceptar sin cambios'));
    await usuario.type(justificacion(), JUSTIFICACION);
    await usuario.click(registrar());

    expect(registrar()).toBeDisabled();
    expect(registrar()).toHaveAttribute('aria-busy', 'true');
    http.expectOne(URL_DECISION);
  });

  it('si otra persona ya la decidió, lo dice y ofrece ver la decisión', async () => {
    const { usuario, http, recargar, decidida } = await renderizar();

    await usuario.click(opcion('Aceptar sin cambios'));
    await usuario.type(justificacion(), JUSTIFICACION);
    await usuario.click(registrar());
    http
      .expectOne(URL_DECISION)
      .flush(
        { codigo: 'SOLICITUD_NO_EN_REVISION', detalle: 'x' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta solicitud ya no está en revisión: otra persona registró una decisión.',
    );
    expect(registrar()).toBeDisabled();
    await usuario.click(screen.getByRole('button', { name: 'Ver la decisión' }));
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(decidida).not.toHaveBeenCalled();
  });

  it('si el BFF falla, lo dice y deja intentarlo de nuevo', async () => {
    const { usuario, http, decidida } = await renderizar();

    await usuario.click(opcion('Aceptar sin cambios'));
    await usuario.type(justificacion(), JUSTIFICACION);
    await usuario.click(registrar());
    http
      .expectOne(URL_DECISION)
      .flush({ codigo: 'NUCLEO_NO_DISPONIBLE', detalle: 'x' }, { status: 503, statusText: 'x' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos registrar la decisión. Intenta de nuevo.',
    );
    expect(registrar()).toBeEnabled();
    await usuario.click(registrar());
    http.expectOne(URL_DECISION).flush(AJUSTADA_POR_ANALISTA);
    expect(decidida).toHaveBeenCalledTimes(1);
  });
});

describe('primaConRecargo', () => {
  it.each([
    [231_900, 15, 266_685],
    [59_501, 20, 71_401],
    [70_000, 1, 70_700],
    // Redondeo al peso: 1.5 sube a 2, como ROUND_HALF_UP del núcleo.
    [150, 1, 152],
  ])('%d con %d %% es %d', (prima, recargo, nueva) => {
    expect(primaConRecargo(prima, recargo)).toBe(nueva);
  });
});
