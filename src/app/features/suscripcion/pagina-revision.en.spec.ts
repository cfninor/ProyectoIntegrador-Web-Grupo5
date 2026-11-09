import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';

import { CON_AVISOS, EN_REVISION, YA_DECIDIDA } from '../../../testing/fixtures-revision';
import { APP_CONFIG } from '../../core/config/app-config';
import { RevisionSolicitud } from './modelos';
import { PaginaRevision } from './pagina-revision';

// El detalle de revisión en inglés (SOLVENTAG5-53): textos traducidos y formatos de Estados Unidos.

async function cargar(revision: RevisionSolicitud) {
  const vista = await render(PaginaRevision, {
    inputs: { solicitudId: revision.solicitudId },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
      IDIOMA_INGLES,
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  http.expectOne((r) => r.url.endsWith('/revision')).flush(revision);
  await vista.fixture.whenStable();
  http.verify();
}

function dato(etiqueta: string): HTMLElement {
  return screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling as HTMLElement;
}

describe('PaginaRevision en inglés · SOLVENTAG5-53', () => {
  it('traduce los datos, las reglas y el perfil, con los formatos de Estados Unidos', async () => {
    await cargar(EN_REVISION);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Application 4c6e8a0b · Carlos Andrés Peña Ruiz',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Under review', { selector: '.chip' })).toBeInTheDocument();
    expect(dato('Product')).toHaveTextContent('Mortgage life');
    expect(dato('Sum insured')).toHaveTextContent('$950,000,000');
    expect(dato('Term')).toHaveTextContent('20 years');
    expect(dato('Offered premium')).toHaveTextContent('$231,900 / month');
    expect(dato('Quoted by')).toHaveTextContent('An advisor');
    expect(dato('Offer accepted')).toHaveTextContent('Oct 15, 2026');
    expect(
      screen.getByRole('heading', {
        name: 'Evaluated rules · version VIDA_HIPOTECARIO.SUSCRIPCION.v1',
      }),
    ).toBeInTheDocument();
    const fila = within(screen.getByRole('rowheader', { name: 'Sum insured' }).closest('tr')!);
    expect(fila.getByText('Unresolved')).toBeInTheDocument();
    expect(screen.getByText('Valid profile · Oct 15, 2026 8:14 AM')).toBeInTheDocument();
    expect(screen.getByText('Back to the inbox')).toBeInTheDocument();
  });

  it('traduce los avisos', async () => {
    await cargar(CON_AVISOS);

    expect(
      screen.getByText(/A record of this application couldn't be verified/),
    ).toBeInTheDocument();
    expect(screen.getByText('Outdated profile · Oct 17, 2026 4:12 AM')).toBeInTheDocument();
    expect(dato('Quoted by')).toHaveTextContent('Not recorded');
    expect(dato('Channel')).toHaveTextContent('Mobile app');
  });

  it('traduce el aviso de una solicitud que no está en revisión', async () => {
    await cargar(YA_DECIDIDA);

    expect(
      screen.getByText(
        "This application isn't under review: its status is Rejected. There's nothing to review.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Result of the automatic decision')).toBeInTheDocument();
  });
});
