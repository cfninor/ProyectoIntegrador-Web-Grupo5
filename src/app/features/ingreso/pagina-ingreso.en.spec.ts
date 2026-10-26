import { IDIOMA_INGLES } from '../../../testing/ingles';

import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { SERVICIO_SESION } from '../../core/sesion/sesion';
import { sesionFalsa } from '../../../testing/sesion-falsa';
import { PaginaIngreso } from './pagina-ingreso';

// SOLV-WEB-01 en inglés (CA7): la traducción de public/i18n/en-US.json se carga antes de importar
// la página.

async function renderizar(motivo?: string) {
  const servicio = sesionFalsa();
  await render(PaginaIngreso, {
    inputs: motivo ? { motivo } : {},
    providers: [provideRouter([]), { provide: SERVICIO_SESION, useValue: servicio }, IDIOMA_INGLES],
  });
  return { servicio, usuario: userEvent.setup() };
}

describe('PaginaIngreso en inglés', () => {
  it('el formulario, el botón y el enlace para registrarse', async () => {
    await renderizar();

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Sign in with your email and password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByText("Don't have a customer account yet?")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up as a customer' })).toBeInTheDocument();
  });

  it('los mensajes de los campos', async () => {
    const { usuario } = await renderizar();

    await usuario.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  });

  it.each<[string, string]>([
    ['CREDENCIALES', 'The email or password is incorrect.'],
    ['BLOQUEO', 'Too many attempts. Wait a few minutes and try again.'],
    ['SIN_CONEXION', "We couldn't connect. Try again."],
    ['SIN_PORTAL', "Your user doesn't have a portal assigned. Contact the administrator."],
  ])('el mensaje de %s', async (error, mensaje) => {
    const { servicio, usuario } = await renderizar();
    servicio.iniciar.mockResolvedValue({ tipo: 'error', error: error as 'CREDENCIALES' });

    await usuario.type(screen.getByLabelText('Email'), 'advisor@solventa.example');
    await usuario.type(screen.getByLabelText('Password'), 'Clave-Segura-1');
    await usuario.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });

  it.each<[string, string]>([
    ['inactividad', 'Your session was closed due to inactivity.'],
    ['expirada', 'Your session expired. Sign in again.'],
    ['confirmada', 'Your email is confirmed. Sign in with your password.'],
  ])('el aviso de llegada por %s', async (motivo, aviso) => {
    await renderizar(motivo);

    expect(screen.getByRole('status')).toHaveTextContent(aviso);
  });
});
