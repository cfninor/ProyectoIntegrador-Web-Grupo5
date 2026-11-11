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
import { HUELLA } from '../../../testing/fixtures-poliza';
import { APP_CONFIG } from '../../core/config/app-config';
import { PaginaFirmar } from './pagina-firmar';

// La página pública para firmar la póliza (SOLVENTAG5-57, D14): el documento, el código y cada
// resultado como estado.

const BFF = 'http://bff.prueba';
const URL_ABRIR = `${BFF}/v1/firmas/${FIRMA_ID}`;
const URL_VALIDAR = `${URL_ABRIR}/validacion`;
const CODIGO = '042817';

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar() {
  const vista = await render(PaginaFirmar, {
    inputs: { firmaId: FIRMA_ID },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { ...vista, http };
}

/** Abre la página con el documento y devuelve el usuario para escribir el código. */
async function abierta() {
  const vista = await renderizar();
  vista.http.expectOne(URL_ABRIR).flush(DOCUMENTO_PARA_FIRMAR);
  vista.detectChanges();
  return { ...vista, usuario: userEvent.setup() };
}

const campo = () => screen.getByLabelText('Código de firma');

async function firmarCon(
  vista: Awaited<ReturnType<typeof abierta>>,
  codigo = CODIGO,
): Promise<void> {
  await vista.usuario.clear(campo());
  await vista.usuario.type(campo(), codigo);
  await vista.usuario.click(screen.getByRole('button', { name: 'Firmar' }));
}

function responder(vista: Awaited<ReturnType<typeof abierta>>, status: number, cuerpo: unknown) {
  vista.http.expectOne(URL_VALIDAR).flush(cuerpo, { status, statusText: 'x' });
  vista.detectChanges();
}

describe('PaginaFirmar · enlace público (SOLVENTAG5-57)', () => {
  it('pide el documento al abrir y muestra la vista previa, la huella y el vencimiento', async () => {
    const { http, detectChanges } = await renderizar();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Firma tu póliza');
    expect(screen.getByText('Cargando el documento…')).toBeVisible();

    const abrir = http.expectOne(URL_ABRIR);
    expect(abrir.request.method).toBe('GET');
    abrir.flush(DOCUMENTO_PARA_FIRMAR);
    detectChanges();

    expect(
      screen.getByText(/Revisa el documento y fírmalo con el código de 6 dígitos/),
    ).toBeVisible();
    expect(screen.getByText('El enlace vence el 09/11/2026 a las 10:02.')).toBeVisible();
    const resumen = within(screen.getByRole('article', { name: 'Resumen de tu póliza' }));
    expect(resumen.getByText('Tomador').nextElementSibling).toHaveTextContent(
      'María Fernanda Pérez Gómez',
    );
    expect(resumen.getByText('Suma asegurada').nextElementSibling).toHaveTextContent(
      '$ 200.000.000',
    );
    expect(resumen.getByText('Vigencia').nextElementSibling).toHaveTextContent(
      'Del 14/10/2026 al 14/10/2046',
    );
    expect(
      screen.getByText('Huella del documento', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent(HUELLA);
  });

  it('el campo del código es numérico, de un solo uso y con su ayuda', async () => {
    await abierta();

    expect(campo()).toHaveAttribute('inputmode', 'numeric');
    expect(campo()).toHaveAttribute('autocomplete', 'one-time-code');
    expect(campo()).toHaveAttribute('maxlength', '6');
    expect(campo()).toHaveAccessibleDescription('Tiene 6 dígitos y solo sirve una vez.');
    expect(campo()).not.toHaveAttribute('aria-invalid');
  });

  it('firma con el código y muestra el certificado, con el foco en el resultado', async () => {
    const vista = await abierta();

    await firmarCon(vista);
    const validar = vista.http.expectOne(URL_VALIDAR);
    expect(validar.request.method).toBe('POST');
    expect(validar.request.body).toEqual({ codigo: CODIGO });
    validar.flush(FIRMA_FIRMADA);
    vista.detectChanges();
    await vista.fixture.whenStable();

    const titulo = screen.getByRole('heading', { level: 2, name: 'Firmaste tu póliza' });
    expect(titulo).toHaveFocus();
    const certificado = within(
      screen.getByRole('article', { name: 'Certificado de firma electrónica' }),
    );
    expect(certificado.getByText('Fecha y hora').nextElementSibling).toHaveTextContent(
      '06/11/2026 a las 10:23',
    );
    expect(certificado.getByText('IP').nextElementSibling).toHaveTextContent('203.0.113.24');
    expect(certificado.getByText('Huella firmada').nextElementSibling).toHaveTextContent(HUELLA);
    expect(screen.queryByLabelText('Código de firma')).not.toBeInTheDocument();
  });

  it('una firma sin certificado en la respuesta no muestra el certificado', async () => {
    const vista = await abierta();

    await firmarCon(vista);
    responder(vista, 200, { ...FIRMA_FIRMADA, certificado: undefined });

    expect(screen.getByRole('heading', { name: 'Firmaste tu póliza' })).toBeVisible();
    expect(screen.queryByRole('article', { name: /Certificado/ })).not.toBeInTheDocument();
  });

  it('un código que no tiene 6 dígitos no se envía y lo dice junto al campo', async () => {
    const vista = await abierta();

    await firmarCon(vista, '4281');

    vista.http.expectNone(URL_VALIDAR);
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe los 6 dígitos del código.');
    expect(campo()).toHaveAttribute('aria-invalid', 'true');
    expect(campo()).toHaveAccessibleDescription(
      'Tiene 6 dígitos y solo sirve una vez. Escribe los 6 dígitos del código.',
    );

    await vista.usuario.type(campo(), '17');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un código vacío tampoco se envía, y los espacios alrededor se ignoran', async () => {
    const vista = await abierta();

    await vista.usuario.click(screen.getByRole('button', { name: 'Firmar' }));
    vista.http.expectNone(URL_VALIDAR);
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe los 6 dígitos del código.');

    await firmarCon(vista, ` ${CODIGO}`);
    expect(vista.http.expectOne(URL_VALIDAR).request.body).toEqual({ codigo: CODIGO });
  });

  it.each([
    [3, 'El código no es correcto. Te quedan 3 intentos.'],
    [1, 'El código no es correcto. Te queda 1 intento.'],
    [0, 'El código no es correcto y ya no te quedan intentos.'],
  ])(
    'un código errado dice los intentos que quedan (%s) y deja el formulario',
    async (n, texto) => {
      const vista = await abierta();

      await firmarCon(vista);
      responder(vista, 409, errorFirma('CODIGO_INVALIDO', n));

      expect(screen.getByRole('alert')).toHaveTextContent(texto);
      expect(campo()).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('button', { name: 'Firmar' })).toBeEnabled();
    },
  );

  it('después de un código errado, firma con el correcto', async () => {
    const vista = await abierta();
    await firmarCon(vista, '111111');
    responder(vista, 409, errorFirma('CODIGO_INVALIDO', 4));

    await firmarCon(vista);
    responder(vista, 200, FIRMA_FIRMADA);

    expect(screen.getByRole('heading', { name: 'Firmaste tu póliza' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un CODIGO_INVALIDO sin intentos en el cuerpo se toma como sin intentos', async () => {
    const vista = await abierta();
    await firmarCon(vista);
    responder(vista, 409, errorFirma('CODIGO_INVALIDO'));

    expect(screen.getByRole('alert')).toHaveTextContent('ya no te quedan intentos');
  });

  it.each([
    [
      'CODIGO_VENCIDO',
      'Este código ya no es válido',
      /reenvíe el enlace: llegará con un código nuevo/,
    ],
    ['CODIGO_USADO', 'Este documento ya está firmado', /El código ya se usó/],
    [
      'ENLACE_VENCIDO',
      'Este enlace venció',
      'Pasaron más de 72 horas desde que se pidió la firma. Tu póliza no se emite y te devolvemos el pago de la primera prima.',
    ],
    ['DOCUMENTO_ALTERADO', 'No podemos firmar este documento', /El documento cambió después/],
  ])('un 409 %s es un estado, con el foco en su título', async (codigo, titulo, texto) => {
    const vista = await abierta();

    await firmarCon(vista);
    responder(vista, 409, errorFirma(codigo));
    await vista.fixture.whenStable();

    expect(screen.getByRole('heading', { level: 2, name: titulo })).toHaveFocus();
    expect(screen.getByText(texto)).toBeVisible();
    expect(screen.queryByLabelText('Código de firma')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [503, errorFirma('NUCLEO_NO_DISPONIBLE')],
    [0, null],
    [409, errorFirma('OTRO')],
    [500, null],
  ])(
    'con el servicio no disponible (%s) dice que el código sigue valiendo y deja intentar de nuevo',
    async (status, cuerpo) => {
      const vista = await abierta();

      await firmarCon(vista);
      responder(vista, status, cuerpo);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'El servicio no está disponible. Tu código sigue valiendo',
      );
      await vista.usuario.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
      expect(vista.http.expectOne(URL_VALIDAR).request.body).toEqual({ codigo: CODIGO });
    },
  );

  it('un 422 del BFF al firmar se muestra como un código mal escrito', async () => {
    const vista = await abierta();
    await firmarCon(vista);
    responder(vista, 422, { detail: [] });

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe los 6 dígitos del código.');
  });

  it('un 404 al firmar es un enlace que no existe', async () => {
    const vista = await abierta();
    await firmarCon(vista);
    responder(vista, 404, errorFirma('FIRMA_NO_ENCONTRADA'));

    expect(screen.getByRole('heading', { name: 'No encontramos este enlace' })).toBeVisible();
  });

  it('mientras firma, el botón queda ocupado y no envía dos veces', async () => {
    const vista = await abierta();
    await vista.usuario.type(campo(), CODIGO);
    const pagina = vista.fixture.componentInstance as unknown as { firmar(): void };

    pagina.firmar();
    pagina.firmar();
    vista.detectChanges();

    expect(screen.getByRole('button', { name: 'Firmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Firmar' })).toHaveAttribute('aria-busy', 'true');
    vista.http.expectOne(URL_VALIDAR).flush(FIRMA_FIRMADA);
  });

  describe('al abrir', () => {
    it.each([404, 422])('un %s es un enlace que no existe', async (status) => {
      const { http, detectChanges } = await renderizar();
      http
        .expectOne(URL_ABRIR)
        .flush(errorFirma('FIRMA_NO_ENCONTRADA'), { status, statusText: 'x' });
      detectChanges();

      expect(screen.getByRole('heading', { name: 'No encontramos este enlace' })).toBeVisible();
      expect(screen.getByText(/Revisa el enlace que recibiste por correo o por SMS/)).toBeVisible();
    });

    it('con el servicio no disponible lo dice y deja intentar de nuevo', async () => {
      const { http, detectChanges } = await renderizar();
      http.expectOne(URL_ABRIR).flush(null, { status: 503, statusText: 'x' });
      detectChanges();

      expect(screen.getByRole('alert')).toHaveTextContent('El servicio no está disponible.');
      screen.getByRole('button', { name: 'Intentar de nuevo' }).click();
      http.expectOne(URL_ABRIR).flush(DOCUMENTO_PARA_FIRMAR);
      detectChanges();
      expect(screen.getByLabelText('Código de firma')).toBeVisible();
    });

    it.each([
      ['VENCIDA', 'Este enlace venció'],
      ['FIRMADA', 'Este documento ya está firmado'],
    ] as const)(
      'una firma %s se muestra como estado, sin el formulario',
      async (estado, titulo) => {
        const { http, detectChanges } = await renderizar();
        http.expectOne(URL_ABRIR).flush({ ...DOCUMENTO_PARA_FIRMAR, estado });
        detectChanges();

        expect(screen.getByRole('heading', { level: 2, name: titulo })).toBeVisible();
        expect(screen.getByRole('heading', { level: 2, name: titulo })).not.toHaveFocus();
        expect(screen.queryByLabelText('Código de firma')).not.toBeInTheDocument();
      },
    );

    it('una firma PENDIENTE_ENVIO o ENVIADA muestra el formulario', async () => {
      const { http, detectChanges } = await renderizar();
      http.expectOne(URL_ABRIR).flush({ ...DOCUMENTO_PARA_FIRMAR, estado: 'ENVIADA' });
      detectChanges();

      expect(screen.getByLabelText('Código de firma')).toBeVisible();
    });
  });
});
