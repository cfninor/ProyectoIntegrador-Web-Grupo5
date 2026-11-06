import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import { BANDEJA, ILEGIBLE } from '../../../testing/fixtures-bandeja';
import { APP_CONFIG } from '../../core/config/app-config';
import { BandejaRevision } from './modelos';
import { PaginaBandeja } from './pagina-bandeja';

// La bandeja en inglés (SOLVENTAG5-52): textos traducidos y formatos de Estados Unidos.

async function cargar(bandeja: BandejaRevision) {
  const vista = await render(PaginaBandeja, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      IDIOMA_INGLES,
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  http.expectOne((r) => r.url.endsWith('/en-revision')).flush(bandeja);
  await vista.fixture.whenStable();
  http.verify();
}

const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('PaginaBandeja en inglés · SOLVENTAG5-52', () => {
  it('traduce la tabla, el motivo y los montos', async () => {
    await cargar(BANDEJA);

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Reason (unresolved rule)' }),
    ).toBeInTheDocument();
    const fila = within(filas()[1]);
    expect(fila.getByText('Mortgage life')).toBeInTheDocument();
    expect(fila.getByText('$950,000,000')).toBeInTheDocument();
    expect(fila.getByText('Oct 15, 2026')).toBeInTheDocument();
    expect(fila.getByText('9:05 AM')).toBeInTheDocument();
    expect(fila.getByText(/: \$950,000,000 \(limit: .*\$800,000,000\)$/)).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2 applications')).toBeInTheDocument();
  });

  it('traduce los avisos de un registro ilegible', async () => {
    await cargar({ ...BANDEJA, solicitudes: [ILEGIBLE], total: 1 });

    const fila = within(filas()[0]);
    expect(
      fila.getByText("We couldn't read the reason in the decision record."),
    ).toBeInTheDocument();
    expect(fila.getByText('Unverified record')).toBeInTheDocument();
    expect(fila.getByText('No identified customer')).toBeInTheDocument();
  });
});
