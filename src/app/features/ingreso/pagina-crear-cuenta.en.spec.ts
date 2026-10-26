import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ErrorCuenta, SERVICIO_SESION } from '../../core/sesion/sesion';
import { sesionFalsa } from '../../../testing/sesion-falsa';
import { PaginaCrearCuenta } from './pagina-crear-cuenta';

// Crear cuenta en inglés (CA7): la traducción de public/i18n/en-US.json se carga antes de importar
// la página.

async function renderizar(servicio = sesionFalsa()) {
  await render(PaginaCrearCuenta, {
    providers: [provideRouter([]), { provide: SERVICIO_SESION, useValue: servicio }, IDIOMA_INGLES],
  });
  return { servicio, usuario: userEvent.setup() };
}

describe('PaginaCrearCuenta en inglés', () => {
  it('«Tus datos» con sus campos, la política y el aviso de la Ley 1581', async () => {
    await renderizar();

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your details' })).toBeInTheDocument();
    for (const etiqueta of [
      'Document type',
      'ID document',
      'First names',
      'Last names',
      'Mobile phone',
      'Email',
      'Password',
      'Confirm your password',
    ]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
    expect(
      screen.getByText(
        'At least 12 characters, with uppercase letters, lowercase letters and numbers.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your data is encrypted and processed under Colombian Law 1581 of 2012.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('los mensajes de los campos', async () => {
    const { usuario } = await renderizar();

    await usuario.click(screen.getByRole('button', { name: 'Continue' }));

    for (const mensaje of [
      'Enter the document number.',
      'Enter your first names.',
      'Enter your last names.',
      'Enter your mobile phone.',
      'Enter your email.',
      'Enter a password.',
      'Enter the password again.',
    ]) {
      expect(await screen.findByText(mensaje)).toBeInTheDocument();
    }
  });

  it.each<[ErrorCuenta, string]>([
    ['CORREO_EXISTE', 'An account with that email already exists. Sign in with your password.'],
    ['SIN_CONEXION', "We couldn't connect. Try again."],
  ])('el mensaje de %s', async (error, mensaje) => {
    const { servicio, usuario } = await renderizar();
    servicio.registrar.mockResolvedValue({ tipo: 'error', error });

    await usuario.type(screen.getByLabelText('ID document'), '1020304050');
    await usuario.type(screen.getByLabelText('First names'), 'María');
    await usuario.type(screen.getByLabelText('Last names'), 'López');
    await usuario.type(screen.getByLabelText('Mobile phone'), '3001234567');
    await usuario.type(screen.getByLabelText('Email'), 'maria@correo.com');
    await usuario.type(screen.getByLabelText('Password'), 'Clave-Segura-1');
    await usuario.type(screen.getByLabelText('Confirm your password'), 'Clave-Segura-1');
    await usuario.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });

  it('«Código» de una cuenta sin confirmar (D32)', async () => {
    const servicio = sesionFalsa();
    servicio.correoPorConfirmar.mockReturnValue('maria@correo.com');
    servicio.confirmar.mockResolvedValue({ tipo: 'error', error: 'CODIGO_ERRADO' });
    const { usuario } = await renderizar(servicio);

    expect(screen.getByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
    expect(screen.getByText(/Enter the 6-digit code we sent to/)).toHaveTextContent(
      'Enter the 6-digit code we sent to maria@correo.com.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "Your email isn't confirmed yet. We sent you a new code.",
    );
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Code'), '123456');
    await usuario.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('The code is incorrect.')).toBeInTheDocument();
  });

  it('«Tus datos» de una cuenta sin registrar', async () => {
    const servicio = sesionFalsa();
    servicio.cuentaSinRegistrar.mockReturnValue('maria@correo.com');

    await renderizar(servicio);

    expect(
      screen.getByText(
        'Your email is already confirmed. Complete your details to finish signing up.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish signing up' })).toBeInTheDocument();
  });
});
