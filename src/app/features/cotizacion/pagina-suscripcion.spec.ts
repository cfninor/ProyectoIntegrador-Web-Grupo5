import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import { Actor } from './formulario-cotizacion';
import { PaginaSuscripcion } from './pagina-suscripcion';

// Destino de «Continuar a la contratación» (SOLVENTAG5-49, CA2): el paso 2 de la contratación,
// que la SOLVENTAG5-50 completa con la evaluación de suscripción.

async function renderizar(actor: Actor) {
  await render(PaginaSuscripcion, {
    inputs: { cotizacionId: 'c-1', actor },
    providers: [provideRouter([])],
  });
}

describe('PaginaSuscripcion', () => {
  it('marca la cotización como hecha y la suscripción como el paso actual', async () => {
    await renderizar('cliente');

    const pasos = within(screen.getByRole('list', { name: 'Pasos de la contratación' }));
    expect(pasos.getByText('Cotización').closest('li')).toHaveClass('hecho');
    expect(pasos.getByText('Suscripción').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(pasos.getByText('Pago').closest('li')).not.toHaveClass('hecho');
  });

  it('le dice al cliente que el paso aún no está disponible y le deja volver a su oferta', async () => {
    await renderizar('cliente');

    expect(
      screen.getByRole('heading', { name: 'La suscripción llega pronto' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Elegiste continuar con tu oferta/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a la oferta' })).toHaveAttribute(
      'href',
      '/cliente/cotizar/oferta/c-1',
    );
    expect(screen.getByRole('link', { name: 'Ir al tablero' })).toHaveAttribute('href', '/cliente');
  });

  it('al asesor le habla del cliente que aceptó', async () => {
    await renderizar('asesor');

    expect(screen.getByText(/El cliente aceptó la oferta/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a la oferta' })).toHaveAttribute(
      'href',
      '/asesor/cotizar/oferta/c-1',
    );
  });
});
