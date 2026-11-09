import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import {
  ACEPTADA,
  AJUSTADA,
  EN_REVISION,
  EVALUADA,
  ILEGIBLE,
  NO_VERIFICABLE,
  PENDIENTE,
  RECHAZADA,
  SOLICITUD_ID,
} from '../../../testing/fixtures-resultado';
import { SolicitudSuscripcion } from './modelos';
import { ActorResultado, TarjetaResultado } from './tarjeta-resultado';

// La tarjeta del resultado (SOLVENTAG5-55, R5): SOLV-WEB-07, SOLV-WEB-08 y el último estado conocido.

async function renderizar(solicitud: SolicitudSuscripcion, actor: ActorResultado = 'cliente') {
  return render(TarjetaResultado, {
    inputs: { solicitud, actor },
    providers: [provideRouter([])],
  });
}

const titulo = () => screen.getByRole('heading', { level: 2 });
const dato = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling;
const AVISO = /No pudimos verificar el registro de esta decisión/;

function fila(nombre: string | RegExp) {
  return within(screen.getByRole('rowheader', { name: nombre }).closest('tr') as HTMLElement);
}

describe('TarjetaResultado · SOLV-WEB-07', () => {
  it('aceptada: número, tiempo, chip, condiciones, reglas y pago deshabilitado', async () => {
    await renderizar(ACEPTADA);

    expect(titulo()).toHaveTextContent('Aprobamos tu solicitud');
    expect(dato('Número de solicitud')).toHaveTextContent(SOLICITUD_ID);
    expect(dato('Tiempo de decisión')).toHaveTextContent('1,2 s');
    expect(within(dato('Decisión') as HTMLElement).getByText('Aceptada')).toHaveClass('chip-verde');
    expect(screen.getByRole('heading', { name: 'Condiciones aprobadas' })).toBeInTheDocument();
    expect(dato('Producto')).toHaveTextContent('Vida hipotecario');
    expect(dato('Suma asegurada')).toHaveTextContent('$ 200.000.000');
    expect(dato('Vigencia')).toHaveTextContent('20 años');
    expect(dato('Suma asegurada')?.nextElementSibling).toBe(screen.getByText('Vigencia'));
    expect(dato('Vigencia')?.nextElementSibling).toBe(screen.getByText('Prima cotizada'));
    expect(dato('Prima cotizada')).toHaveTextContent('$ 70.000');
    expect(dato('Prima final')).toHaveTextContent('$ 70.000');
    expect(dato('Ajuste')).toHaveTextContent('Sin ajuste');
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(screen.queryByText('Determinante')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Volver al tablero' })).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Continuar al pago' })).toHaveAttribute(
      'href',
      `/cliente/cotizar/oferta/${ACEPTADA.cotizacionId}/pago?solicitudId=${SOLICITUD_ID}`,
    );
  });

  it('la tabla tiene caption con la versión, encabezados y una fila por regla', async () => {
    await renderizar(ACEPTADA);

    const tabla = screen.getByRole('table', {
      name: 'Reglas evaluadas, versión VIDA_HIPOTECARIO.SUSCRIPCION.v1',
    });
    expect(
      within(tabla)
        .getAllByRole('columnheader')
        .map((c) => c.textContent?.trim()),
    ).toEqual(['Regla', 'Límite', 'Valor del cliente', 'Resultado']);
    expect(within(tabla).getAllByRole('rowheader')).toHaveLength(6);

    const score = fila('Puntaje de riesgo');
    expect(score.getByText('Mínimo 450')).toBeInTheDocument();
    expect(score.getByText('640')).toBeInTheDocument();
    expect(score.getByText('Cumple')).toHaveClass('chip-verde');
    const senal = fila('Comportamiento de pago');
    expect(senal.getByText('Mínimo 40 de 100')).toBeInTheDocument();
    expect(senal.getByText('72 de 100')).toBeInTheDocument();
    expect(fila('Suma asegurada').getByText('Máximo $ 800.000.000')).toBeInTheDocument();
    expect(fila('Nivel de riesgo').getByText('Riesgo bajo · Riesgo medio')).toBeInTheDocument();
  });

  it('ajustada: la nueva prima, el recargo, la regla determinante y que hay que aceptarla', async () => {
    await renderizar(AJUSTADA);

    expect(titulo()).toHaveTextContent('Aprobamos tu solicitud con ajustes');
    expect(within(dato('Decisión') as HTMLElement).getByText('Aceptada con ajuste')).toHaveClass(
      'chip-verde-azulado',
    );
    expect(screen.getByRole('heading', { name: 'Nueva prima: $ 109.200' })).toBeInTheDocument();
    expect(screen.getByText(/Debes aceptar la nueva prima/)).toBeInTheDocument();
    expect(dato('Prima cotizada')).toHaveTextContent('$ 91.000');
    expect(dato('Prima final')).toHaveTextContent('$ 109.200');
    expect(dato('Ajuste')).toHaveTextContent('Recargo del 20 %');

    const determinante = screen.getByRole('rowheader', { name: /Nivel de riesgo.*Determinante/ });
    expect(determinante.closest('tr')).toHaveClass('determinante');
    expect(screen.getAllByText('Determinante')).toHaveLength(1);
    expect(fila(/Nivel de riesgo/).getByText('No cumple')).toHaveClass('chip-rojo');
    // SOLVENTAG5-56: sin aceptar la nueva prima no hay pago; el cliente la acepta aquí.
    expect(screen.queryByRole('link', { name: 'Continuar al pago' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar nueva prima' })).toBeEnabled();
  });

  it('ajustada para el asesor: el cliente debe aceptarla, y el asesor no la acepta', async () => {
    await renderizar(AJUSTADA, 'asesor');

    expect(titulo()).toHaveTextContent('Solicitud aceptada con ajuste');
    expect(screen.getByText(/El cliente debe aceptar la nueva prima/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar nueva prima' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuar al pago' })).not.toBeInTheDocument();
  });

  it('rechazada: el motivo y las reglas, sin condiciones ni pago', async () => {
    await renderizar(RECHAZADA);

    expect(titulo()).toHaveTextContent('No pudimos aprobar tu solicitud');
    expect(within(dato('Decisión') as HTMLElement).getByText('Rechazada')).toHaveClass('chip-rojo');
    expect(screen.getByText('No cumple una regla de rechazo: Puntaje de riesgo.')).toBeVisible();
    expect(fila(/Puntaje de riesgo/).getByText('400')).toBeInTheDocument();
    expect(screen.queryByText('Condiciones aprobadas')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuar al pago' })).not.toBeInTheDocument();
  });

  it('un ramo sin suma asegurada numérica muestra su código y omite la suma', async () => {
    await renderizar({
      ...ACEPTADA,
      cobertura: { ramo: 'VIAJE', datosBien: {} },
      reglasEvaluadas: [],
    });

    expect(dato('Producto')).toHaveTextContent('VIAJE');
    expect(screen.queryByText('Suma asegurada')).not.toBeInTheDocument();
    expect(screen.queryByText('Vigencia')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('TarjetaResultado · SOLV-WEB-08', () => {
  it('en revisión no es un error: motivo, regla resaltada y qué pasa ahora, sin notificación', async () => {
    const { container } = await renderizar(EN_REVISION);

    expect(titulo()).toHaveTextContent('Tu solicitud está en revisión');
    expect(screen.getByText(/Esto no es un error/)).toBeVisible();
    expect(within(dato('Decisión') as HTMLElement).getByText('Pendiente de revisión')).toHaveClass(
      'chip-ambar',
    );
    expect(
      screen.getByText('Necesita la revisión de un suscriptor por: Perfil de riesgo.'),
    ).toBeVisible();
    const resaltadas = screen.getByRole('list', { name: 'Reglas por resolver' });
    expect(within(resaltadas).getAllByRole('listitem')).toHaveLength(1);
    expect(resaltadas).toHaveTextContent(
      'Perfil de riesgo. Límite: Con perfil de riesgo. Valor del cliente: Sin perfil: el perfil no estuvo disponible a tiempo.',
    );

    const pasos = screen.getByText('Enviada a riesgo').closest('ol') as HTMLElement;
    expect(
      within(pasos)
        .getAllByRole('listitem')
        .map((p) => p.textContent?.trim()),
    ).toEqual(['Enviada a riesgo', 'Revisión', 'Decisión']);
    expect(within(pasos).getByText('Revisión')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText(/Verás la decisión en esta misma página/)).toHaveTextContent(
      'hasta 1 día hábil',
    );
    expect(container.textContent).not.toMatch(/notific|correo/i);

    expect(screen.getByRole('link', { name: 'Volver al tablero' })).toHaveAttribute(
      'href',
      '/cliente',
    );
    expect(screen.queryByRole('link', { name: 'Continuar al pago' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('al asesor le dice que puede volver al tablero', async () => {
    await renderizar(EN_REVISION, 'asesor');

    expect(titulo()).toHaveTextContent('Solicitud pendiente de revisión');
    expect(screen.getByText(/La decisión se verá en esta misma página/)).toHaveTextContent(
      'puedes volver al tablero',
    );
    expect(screen.getByRole('link', { name: 'Volver al tablero' })).toHaveAttribute(
      'href',
      '/asesor',
    );
  });

  it('sin regla determinante solo dice el motivo', async () => {
    const decision = { ...EN_REVISION.decision!, motivo: 'EVALUACION_NO_VERIFICABLE' as const };
    await renderizar({
      ...EN_REVISION,
      decision,
      reglasEvaluadas: EN_REVISION.reglasEvaluadas!.map((r) => ({ ...r, determinante: false })),
    });

    expect(screen.getByText(/El registro de la evaluación no se pudo verificar/)).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Reglas por resolver' })).not.toBeInTheDocument();
  });
});

describe('TarjetaResultado · sin decisión', () => {
  it('pendiente: último estado conocido con su fecha, sin reglas ni decisión', async () => {
    await renderizar(PENDIENTE);

    expect(titulo()).toHaveTextContent('Estamos evaluando tu solicitud');
    expect(screen.getByText(/Este es el último estado conocido/)).toHaveTextContent(
      'del 14/10/2026 a las 11:30. La decisión todavía no está lista.',
    );
    expect(dato('Prima mensual')).toHaveTextContent('$ 70.000');
    expect(dato('Aceptada el')).toHaveTextContent('14/10/2026 a las 11:30');
    expect(screen.queryByText('Decisión')).not.toBeInTheDocument();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuar al pago' })).not.toBeInTheDocument();
  });

  it('evaluada: el estado y la fecha de la evaluación, sin mostrar reglas todavía', async () => {
    await renderizar(EVALUADA, 'asesor');

    expect(titulo()).toHaveTextContent('Solicitud evaluada');
    expect(screen.getByText(/Este es el último estado conocido/)).toHaveTextContent(
      'del 14/10/2026 a las 11:31',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sin actualizadaEn usa la fecha de la aceptación', async () => {
    await renderizar({ ...PENDIENTE, actualizadaEn: undefined });

    expect(screen.getByText(/Este es el último estado conocido/)).toHaveTextContent(
      'del 14/10/2026 a las 11:30',
    );
  });
});

describe('TarjetaResultado · registros', () => {
  it('registro ilegible: el estado y el aviso, sin inventar la decisión', async () => {
    await renderizar(ILEGIBLE);

    expect(screen.getByRole('status')).toHaveTextContent(AVISO);
    expect(titulo()).toHaveTextContent('Aprobamos tu solicitud');
    expect(within(dato('Decisión') as HTMLElement).getByText('Aceptada')).toBeInTheDocument();
    expect(dato('Última actualización')).toHaveTextContent('14/10/2026 a las 11:30');
    expect(screen.queryByText('Tiempo de decisión')).not.toBeInTheDocument();
    expect(screen.queryByText('Condiciones aprobadas')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuar al pago' })).not.toBeInTheDocument();
  });

  it('en revisión con registro ilegible: el aviso y volver al tablero', async () => {
    await renderizar({ ...ILEGIBLE, estado: 'EN_REVISION' });

    expect(screen.getByRole('status')).toHaveTextContent(AVISO);
    expect(screen.queryByText(/Esto no es un error/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al tablero' })).toBeInTheDocument();
  });

  it('registros no verificables: el aviso, aunque haya datos', async () => {
    await renderizar(NO_VERIFICABLE);

    expect(screen.getByRole('status')).toHaveTextContent(AVISO);
    expect(screen.getByRole('heading', { name: 'Condiciones aprobadas' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

// SOLVENTAG5-56: la nueva prima de una solicitud ajustada la acepta el cliente titular (D2).
describe('TarjetaResultado · aceptar la nueva prima', () => {
  // 16:31 UTC = 11:31 en Bogotá.
  const ACEPTADA_LA_PRIMA: SolicitudSuscripcion = {
    ...AJUSTADA,
    primaAjustadaAceptadaEn: '2026-10-14T16:31:05Z',
  };

  it('el botón avisa a la página', async () => {
    const aceptar = jest.fn();
    await render(TarjetaResultado, {
      inputs: { solicitud: AJUSTADA, actor: 'cliente' },
      on: { aceptarPrima: aceptar },
      providers: [provideRouter([])],
    });

    screen.getByRole('button', { name: 'Aceptar nueva prima' }).click();

    expect(aceptar).toHaveBeenCalledTimes(1);
  });

  it('mientras se acepta, el botón queda ocupado y deshabilitado', async () => {
    await render(TarjetaResultado, {
      inputs: { solicitud: AJUSTADA, actor: 'cliente', aceptacion: 'aceptando' },
      providers: [provideRouter([])],
    });

    const boton = screen.getByRole('button', { name: 'Aceptar nueva prima' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
  });

  it('si la aceptación falla, lo dice y deja intentarlo de nuevo', async () => {
    await render(TarjetaResultado, {
      inputs: { solicitud: AJUSTADA, actor: 'cliente', aceptacion: 'error' },
      providers: [provideRouter([])],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No pudimos registrar tu aceptación. Intenta de nuevo.',
    );
    expect(screen.getByRole('button', { name: 'Aceptar nueva prima' })).toBeEnabled();
  });

  it('aceptada, el cliente ve cuándo y que continúa a pago y emisión', async () => {
    await renderizar(ACEPTADA_LA_PRIMA);

    expect(
      screen.getByText(
        'Aceptaste la nueva prima el 14/10/2026 a las 11:31. Tu solicitud continúa a pago y emisión.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar nueva prima' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Debes aceptar la nueva prima/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar al pago' })).toHaveAttribute(
      'href',
      `/cliente/cotizar/oferta/${ACEPTADA_LA_PRIMA.cotizacionId}/pago?solicitudId=${SOLICITUD_ID}`,
    );
  });

  it('aceptada, el asesor ve la fecha y la hora de la aceptación', async () => {
    await renderizar(ACEPTADA_LA_PRIMA, 'asesor');

    expect(
      screen.getByText('El cliente aceptó la nueva prima el 14/10/2026 a las 11:31.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/El cliente debe aceptar la nueva prima/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar al pago' })).toHaveAttribute(
      'href',
      `/asesor/cotizar/oferta/${ACEPTADA_LA_PRIMA.cotizacionId}/pago?solicitudId=${SOLICITUD_ID}`,
    );
  });
});
