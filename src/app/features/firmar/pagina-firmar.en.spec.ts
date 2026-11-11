import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  DOCUMENTO_PARA_FIRMAR,
  FIRMA_FIRMADA,
  FIRMA_ID,
  errorFirma,
} from '../../../testing/fixtures-firma';
import { APP_CONFIG } from '../../core/config/app-config';
import { PaginaFirmar } from './pagina-firmar';

// La página pública para firmar en inglés (SOLVENTAG5-57, CA8).

const BFF = 'http://bff.prueba';
const URL_ABRIR = `${BFF}/v1/firmas/${FIRMA_ID}`;
const URL_VALIDAR = `${URL_ABRIR}/validacion`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function abierta() {
  const vista = await render(PaginaFirmar, {
    inputs: { firmaId: FIRMA_ID },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
      IDIOMA_INGLES,
    ],
  });
  http = TestBed.inject(HttpTestingController);
  http.expectOne(URL_ABRIR).flush(DOCUMENTO_PARA_FIRMAR);
  vista.detectChanges();
  return { ...vista, http, usuario: userEvent.setup() };
}

describe('PaginaFirmar · en inglés', () => {
  it('shows the document, the expiry in US format and the code field', async () => {
    await abierta();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign your policy');
    expect(screen.getByText(/Review the document and sign it with the 6-digit code/)).toBeVisible();
    expect(screen.getByText('The link expires on Nov 9, 2026 at 10:02 AM.')).toBeVisible();
    const resumen = within(screen.getByRole('article', { name: 'Your policy summary' }));
    expect(resumen.getByText('Sum insured').nextElementSibling).toHaveTextContent('$200,000,000');
    expect(screen.getByLabelText('Signature code')).toHaveAccessibleDescription(
      'It has 6 digits and works only once.',
    );
  });

  it('a wrong code says the attempts left, and the right one signs', async () => {
    const { http, usuario, detectChanges } = await abierta();
    const campo = screen.getByLabelText('Signature code');

    await usuario.type(campo, '111111');
    await usuario.click(screen.getByRole('button', { name: 'Sign' }));
    http
      .expectOne(URL_VALIDAR)
      .flush(errorFirma('CODIGO_INVALIDO', 4), { status: 409, statusText: 'Conflict' });
    detectChanges();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The code is not correct. You have 4 attempts left.',
    );

    await usuario.clear(campo);
    await usuario.type(campo, '042817');
    await usuario.click(screen.getByRole('button', { name: 'Sign' }));
    http.expectOne(URL_VALIDAR).flush(FIRMA_FIRMADA);
    detectChanges();

    expect(screen.getByRole('heading', { name: 'You signed your policy' })).toBeVisible();
    expect(
      within(screen.getByRole('article', { name: 'Electronic signature certificate' })).getByText(
        'Date and time',
      ).nextElementSibling,
    ).toHaveTextContent('Nov 6, 2026 at 10:23 AM');
  });

  it('an expired link is a state', async () => {
    const { http, usuario, detectChanges } = await abierta();

    await usuario.type(screen.getByLabelText('Signature code'), '042817');
    await usuario.click(screen.getByRole('button', { name: 'Sign' }));
    http
      .expectOne(URL_VALIDAR)
      .flush(errorFirma('ENLACE_VENCIDO'), { status: 409, statusText: 'Conflict' });
    detectChanges();

    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  });
});
