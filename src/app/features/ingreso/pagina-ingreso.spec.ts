import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { ResultadoIngreso, SERVICIO_SESION, Sesion } from '../../core/sesion/sesion';
import { sesionFalsa } from '../../../testing/sesion-falsa';
import { PaginaIngreso } from './pagina-ingreso';

const ASESOR: Sesion = { usuario: { id: 'sub-asesor', nombre: 'Laura Gómez' }, rol: 'ASESOR' };
const CLIENTE: Sesion = {
  usuario: { id: 'sub-cliente', nombre: 'María López' },
  rol: 'CLIENTE',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
};

async function renderizar(
  entradas: { volver?: string; motivo?: string } = {},
  servicio = sesionFalsa(),
) {
  await render(PaginaIngreso, {
    inputs: entradas,
    providers: [provideRouter([]), { provide: SERVICIO_SESION, useValue: servicio }],
  });
  const navegar = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  return { servicio, navegar, usuario: userEvent.setup() };
}

const campoCorreo = () => screen.getByLabelText('Correo');
const campoContrasena = () => screen.getByLabelText('Contraseña');
const continuar = () => screen.getByRole('button', { name: 'Continuar' });

async function ingresarCon(
  usuario: ReturnType<typeof userEvent.setup>,
  correo = 'asesor@solventa.example',
  contrasena = 'Clave-Segura-1',
) {
  await usuario.type(campoCorreo(), correo);
  await usuario.type(campoContrasena(), contrasena);
  await usuario.click(continuar());
}

describe('PaginaIngreso · formulario (SOLV-WEB-01, D12)', () => {
  it('pide correo y contraseña, con «Continuar» y el enlace para registrarse', async () => {
    await renderizar();

    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(campoCorreo()).toHaveAttribute('type', 'email');
    expect(campoCorreo()).toHaveAttribute('autocomplete', 'username');
    expect(campoContrasena()).toHaveAttribute('type', 'password');
    expect(campoContrasena()).toHaveAttribute('autocomplete', 'current-password');
    expect(continuar()).toBeEnabled();
    expect(screen.getByText('¿Aún no tienes cuenta como cliente?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Regístrate como cliente' })).toHaveAttribute(
      'href',
      '/crear-cuenta',
    );
  });

  it('no ofrece recuperar la contraseña, SSO ni «Recordar este dispositivo»', async () => {
    await renderizar();

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/olvid|recordar|SSO/i)).not.toBeInTheDocument();
  });

  it('sin Cognito (sesión simulada) no muestra el enlace para registrarse', async () => {
    const servicio = sesionFalsa();
    servicio.puedeCrearCuenta.mockReturnValue(false);

    await renderizar({}, servicio);

    expect(screen.queryByRole('link', { name: 'Regístrate como cliente' })).not.toBeInTheDocument();
  });

  it('«Mostrar» y «Ocultar» cambian la contraseña visible y lo anuncian con aria-pressed', async () => {
    const { usuario } = await renderizar();
    const boton = screen.getByRole('button', { name: 'Mostrar' });
    expect(boton).toHaveAttribute('aria-pressed', 'false');

    await usuario.click(boton);

    expect(campoContrasena()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar' })).toHaveAttribute('aria-pressed', 'true');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(campoContrasena()).toHaveAttribute('type', 'password');
  });

  it('vacío: el mensaje bajo cada campo, el foco en el primero y sin ingresar', async () => {
    const { servicio, usuario } = await renderizar();

    await usuario.click(continuar());

    expect(await screen.findByText('Escribe tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(campoCorreo()).toHaveAttribute('aria-invalid', 'true');
    expect(campoContrasena()).toHaveAttribute('aria-invalid', 'true');
    expect(campoCorreo()).toHaveFocus();
    expect(servicio.iniciar).not.toHaveBeenCalled();
  });

  it('un correo sin formato válido tiene su mensaje', async () => {
    const { servicio, usuario } = await renderizar();

    await ingresarCon(usuario, 'asesor@solventa');

    expect(
      await screen.findByText('Escribe un correo válido, como nombre@correo.com.'),
    ).toBeInTheDocument();
    expect(servicio.iniciar).not.toHaveBeenCalled();
  });

  it('el mensaje de un campo aparece al salir de él', async () => {
    const { usuario } = await renderizar();

    await usuario.click(campoCorreo());
    await usuario.tab();

    expect(await screen.findByText('Escribe tu correo.')).toBeInTheDocument();
    expect(screen.queryByText('Escribe tu contraseña.')).not.toBeInTheDocument();
  });
});

describe('PaginaIngreso · enviando', () => {
  it('mientras ingresa, «Continuar» y los campos quedan deshabilitados', async () => {
    const { servicio, usuario } = await renderizar();
    servicio.iniciar.mockReturnValue(new Promise<ResultadoIngreso>(() => undefined));

    await ingresarCon(usuario, '  asesor@solventa.example ');

    expect(await screen.findByRole('button', { name: 'Ingresando…' })).toBeDisabled();
    expect(campoCorreo()).toBeDisabled();
    expect(campoContrasena()).toBeDisabled();
    expect(servicio.iniciar).toHaveBeenCalledWith('asesor@solventa.example', 'Clave-Segura-1');
  });

  it('un doble envío solo ingresa una vez', async () => {
    const { servicio, usuario } = await renderizar();
    servicio.iniciar.mockReturnValue(new Promise<ResultadoIngreso>(() => undefined));
    await usuario.type(campoCorreo(), 'asesor@solventa.example');
    await usuario.type(campoContrasena(), 'Clave-Segura-1');

    // Dos envíos en el mismo instante, antes de que se deshabilite el botón.
    const formulario = continuar().closest('form') as HTMLFormElement;
    fireEvent.submit(formulario);
    fireEvent.submit(formulario);

    expect(servicio.iniciar).toHaveBeenCalledTimes(1);
  });
});

describe('PaginaIngreso · mensajes (R9)', () => {
  it.each<[string, string]>([
    ['CREDENCIALES', 'El correo o la contraseña no son correctos.'],
    ['BLOQUEO', 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.'],
    ['SIN_CONEXION', 'No pudimos conectarnos. Intenta de nuevo.'],
    ['SIN_PORTAL', 'Tu usuario no tiene un portal asignado. Comunícate con el administrador.'],
  ])('%s: su mensaje en la región aria-live, que recibe el foco', async (error, mensaje) => {
    const { servicio, navegar, usuario } = await renderizar();
    servicio.iniciar.mockResolvedValue({ tipo: 'error', error } as ResultadoIngreso);

    await ingresarCon(usuario);

    const texto = await screen.findByText(mensaje);
    const region = texto.closest('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveFocus();
    expect(campoCorreo()).toHaveValue('asesor@solventa.example');
    expect(campoContrasena()).toHaveValue('');
    expect(continuar()).toBeEnabled();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('un error nuevo reemplaza al anterior, y un envío inválido lo quita', async () => {
    const { servicio, usuario } = await renderizar();
    servicio.iniciar.mockResolvedValue({ tipo: 'error', error: 'CREDENCIALES' });
    await ingresarCon(usuario);
    await screen.findByText('El correo o la contraseña no son correctos.');

    await usuario.click(continuar());

    expect(screen.queryByText('El correo o la contraseña no son correctos.')).toBeNull();
    expect(await screen.findByText('Escribe tu contraseña.')).toBeInTheDocument();
  });

  it.each<[string, string]>([
    ['inactividad', 'Tu sesión se cerró por inactividad.'],
    ['expirada', 'Tu sesión expiró. Ingresa de nuevo.'],
    ['confirmada', 'Tu correo quedó confirmado. Ingresa con tu contraseña.'],
  ])('llegada por %s: aviso informativo, no error', async (motivo, aviso) => {
    await renderizar({ motivo });

    const texto = screen.getByText(aviso);
    expect(texto).toHaveAttribute('role', 'status');
    expect(texto).not.toHaveClass('mensaje-error');
  });

  it('un motivo que no conoce no muestra aviso', async () => {
    await renderizar({ motivo: 'otro' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('PaginaIngreso · al ingresar', () => {
  it('va a volver si es una ruta del portal del rol (R11)', async () => {
    const { servicio, navegar, usuario } = await renderizar({ volver: '/asesor/cotizar' });
    servicio.iniciar.mockResolvedValue({ tipo: 'sesion', sesion: ASESOR });

    await ingresarCon(usuario);

    expect(navegar).toHaveBeenCalledWith('/asesor/cotizar');
  });

  it('con volver de otro portal va al tablero del rol', async () => {
    const { servicio, navegar, usuario } = await renderizar({ volver: '/riesgo' });
    servicio.iniciar.mockResolvedValue({ tipo: 'sesion', sesion: ASESOR });

    await ingresarCon(usuario);

    expect(navegar).toHaveBeenCalledWith('/asesor');
  });

  it('sin volver, el cliente va a su tablero', async () => {
    const { servicio, navegar, usuario } = await renderizar();
    servicio.iniciar.mockResolvedValue({ tipo: 'sesion', sesion: CLIENTE });

    await ingresarCon(usuario, 'maria@correo.com');

    expect(navegar).toHaveBeenCalledWith('/cliente');
  });

  it('una cuenta de cliente sin registrar (R2) sigue en crear cuenta', async () => {
    const { servicio, navegar, usuario } = await renderizar();
    servicio.iniciar.mockResolvedValue({ tipo: 'sinRegistrar', correo: 'maria@correo.com' });

    await ingresarCon(usuario, 'maria@correo.com');

    expect(navegar).toHaveBeenCalledWith('/crear-cuenta');
  });

  it('una cuenta sin confirmar (D32) va al paso «Código» de crear cuenta', async () => {
    const { servicio, navegar, usuario } = await renderizar();
    servicio.iniciar.mockResolvedValue({ tipo: 'error', error: 'SIN_CONFIRMAR' });

    await ingresarCon(usuario, 'maria@correo.com');

    expect(navegar).toHaveBeenCalledWith('/crear-cuenta');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
