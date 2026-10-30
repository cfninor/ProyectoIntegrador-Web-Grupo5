import { IDIOMA_INGLES } from '../../../testing/ingles';

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
} from '../../../testing/fixtures-resultado';
import { SolicitudSuscripcion } from './modelos';
import { ActorResultado, TarjetaResultado } from './tarjeta-resultado';

// La tarjeta del resultado en inglés (SOLVENTAG5-55): textos traducidos y formatos de Estados Unidos.

async function renderizar(solicitud: SolicitudSuscripcion, actor: ActorResultado = 'cliente') {
  return render(TarjetaResultado, {
    inputs: { solicitud, actor },
    providers: [provideRouter([]), IDIOMA_INGLES],
  });
}

const dato = (etiqueta: string) =>
  screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling;
const AVISO = /We could not verify the record of this decision/;

describe('TarjetaResultado en inglés', () => {
  it('aceptada', async () => {
    await renderizar(ACEPTADA);

    expect(screen.getByRole('heading', { name: 'We approved your application' })).toBeVisible();
    expect(dato('Decision time')).toHaveTextContent('1.2 s');
    expect(dato('Sum insured')).toHaveTextContent('$200,000,000');
    expect(dato('Term')).toHaveTextContent('20 years');
    expect(dato('Final premium')).toHaveTextContent('$70,000');
    expect(dato('Adjustment')).toHaveTextContent('No adjustment');
    const tabla = screen.getByRole('table', {
      name: 'Evaluated rules, version VIDA_HIPOTECARIO.SUSCRIPCION.v1',
    });
    const score = screen
      .getByRole('rowheader', { name: 'Risk score' })
      .closest('tr') as HTMLElement;
    expect(within(score).getByText('Minimum 450')).toBeInTheDocument();
    expect(within(score).getByText('Met')).toBeInTheDocument();
    expect(within(tabla).getByText('Minimum 40 out of 100')).toBeInTheDocument();
    expect(within(tabla).getByText('72 out of 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toHaveAccessibleDescription(
      'Online payment is not available yet.',
    );
  });

  it('sin plazo en los datos del bien no muestra la vigencia', async () => {
    await renderizar({
      ...ACEPTADA,
      cobertura: { ramo: 'VIDA_HIPOTECARIO', datosBien: { montoCredito: 200_000_000 } },
    });

    expect(screen.queryByText('Term')).not.toBeInTheDocument();
    expect(dato('Sum insured')).toHaveTextContent('$200,000,000');
  });

  it('ajustada', async () => {
    await renderizar(AJUSTADA, 'asesor');

    expect(screen.getByRole('heading', { name: 'New premium: $109,200' })).toBeVisible();
    expect(screen.getByText(/The client must accept the new premium/)).toBeVisible();
    expect(dato('Adjustment')).toHaveTextContent('20% surcharge');
    expect(screen.getByText('Decisive')).toBeInTheDocument();
  });

  it('rechazada', async () => {
    await renderizar(RECHAZADA);

    expect(
      screen.getByRole('heading', { name: "We couldn't approve your application" }),
    ).toBeVisible();
    expect(screen.getByText('It does not meet a decline rule: Risk score.')).toBeVisible();
  });

  it('en revisión', async () => {
    await renderizar(EN_REVISION);

    expect(screen.getByText(/This is not an error/)).toBeVisible();
    expect(screen.getByText('What happens now')).toBeVisible();
    expect(screen.getByText('Sent to risk')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Rules to resolve' })).toHaveTextContent(
      'Risk profile. Limit: With a risk profile. Client value: No profile',
    );
    expect(screen.getByText(/You will see the decision on this same page/)).toHaveTextContent(
      'up to 1 business day',
    );
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toBeVisible();
  });

  it('pendiente y evaluada: último estado conocido', async () => {
    const { rerender } = await renderizar(PENDIENTE);
    expect(screen.getByText(/This is the last known status/)).toHaveTextContent(
      'as of Oct 14, 2026 at 11:30 AM. The decision is not ready yet.',
    );

    await rerender({ inputs: { solicitud: EVALUADA, actor: 'cliente' } });
    expect(screen.getByRole('heading', { name: 'We evaluated your application' })).toBeVisible();
    expect(screen.getByText(/This is the last known status/)).toHaveTextContent('11:31 AM');
  });

  it.each([
    ['registro ilegible', ILEGIBLE, false],
    ['registros no verificables', NO_VERIFICABLE, true],
  ])('%s: el aviso', async (_caso, solicitud, conDatos) => {
    await renderizar(solicitud);

    expect(screen.getByRole('status')).toHaveTextContent(AVISO);
    expect(screen.queryAllByRole('table')).toHaveLength(conDatos ? 1 : 0);
  });
});
