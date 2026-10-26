import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  DatosCuenta,
  ErrorCuenta,
  ResultadoCuenta,
  SERVICIO_SESION,
  Sesion,
} from '../../core/sesion/sesion';
import { sesionFalsa } from '../../../testing/sesion-falsa';
import { PaginaCrearCuenta } from './pagina-crear-cuenta';

type Usuario = ReturnType<typeof userEvent.setup>;

const CORREO = 'maria@correo.com';
const CONTRASENA = 'Clave-Segura-1';
const DATOS: DatosCuenta = {
  documento: { tipo: 'CC', numero: '1020304050' },
  nombre: { nombres: 'María Fernanda', apellidos: 'López Rojas' },
  celular: '3001234567',
};
const CLIENTE: Sesion = {
  usuario: { id: 'sub-cliente', nombre: 'María Fernanda López Rojas' },
  rol: 'CLIENTE',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
};
const OK: ResultadoCuenta = { tipo: 'ok' };

async function renderizar(servicio = sesionFalsa()) {
  await render(PaginaCrearCuenta, {
    providers: [provideRouter([]), { provide: SERVICIO_SESION, useValue: servicio }],
  });
  const navegar = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  return { servicio, navegar, usuario: userEvent.setup() };
}

const campo = (etiqueta: string) => screen.getByLabelText(etiqueta);
const continuar = () => screen.getByRole('button', { name: 'Continuar' });

/** Llena «Tus datos». Sin contraseñas si es la cuenta de un cliente sin registrar. */
async function llenarDatos(usuario: Usuario, conContrasenas = true) {
  await usuario.type(campo('Documento de identidad'), ` ${DATOS.documento.numero} `);
  await usuario.type(campo('Nombres'), DATOS.nombre.nombres);
  await usuario.type(campo('Apellidos'), DATOS.nombre.apellidos);
  await usuario.type(campo('Celular'), DATOS.celular);
  if (conContrasenas) {
    await usuario.type(campo('Correo'), ` ${CORREO}`);
    await usuario.type(campo('Contraseña'), CONTRASENA);
    await usuario.type(campo('Confirma tu contraseña'), CONTRASENA);
  }
}

/** Llena «Tus datos», continúa y llega al paso «Código». */
async function hastaElCodigo(usuario: Usuario, servicio: ReturnType<typeof sesionFalsa>) {
  servicio.registrar.mockResolvedValue(OK);
  await llenarDatos(usuario);
  await usuario.click(continuar());
  await screen.findByRole('heading', { name: 'Confirma tu correo' });
}

async function escribirCodigo(usuario: Usuario, codigo = '123456') {
  await usuario.type(campo('Código'), codigo);
  await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));
}

describe('PaginaCrearCuenta · «Tus datos» (CA8)', () => {
  it('pide documento, nombres, apellidos, celular, correo y contraseñas, con el aviso de la Ley 1581', async () => {
    await renderizar();

    expect(screen.getByRole('heading', { level: 1, name: 'Crea tu cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Tus datos' })).toBeInTheDocument();
    expect(campo('Tipo de documento')).toHaveValue('CC');
    expect(screen.getAllByRole('option').map((opcion) => opcion.textContent)).toEqual([
      'CC',
      'CE',
      'PA',
      'PPT',
    ]);
    for (const etiqueta of ['Documento de identidad', 'Nombres', 'Apellidos', 'Celular']) {
      expect(campo(etiqueta)).toHaveValue('');
    }
    expect(campo('Correo')).toHaveAttribute('type', 'email');
    expect(campo('Correo')).not.toHaveAttribute('readonly');
    expect(campo('Contraseña')).toHaveAttribute('autocomplete', 'new-password');
    expect(campo('Confirma tu contraseña')).toHaveAttribute('type', 'password');
    expect(
      screen.getByText('Al menos 12 caracteres, con mayúsculas, minúsculas y números.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tus datos se cifran y se tratan según la Ley 1581 de 2012.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute(
      'href',
      '/ingresar',
    );
  });

  it('vacío: el mensaje bajo cada campo y sin registrar', async () => {
    const { servicio, usuario } = await renderizar();

    await usuario.click(continuar());

    for (const mensaje of [
      'Escribe el número de documento.',
      'Escribe tus nombres.',
      'Escribe tus apellidos.',
      'Escribe tu celular.',
      'Escribe tu correo.',
      'Escribe una contraseña.',
      'Escribe otra vez la contraseña.',
    ]) {
      expect(await screen.findByText(mensaje)).toBeInTheDocument();
    }
    expect(campo('Documento de identidad')).toHaveFocus();
    expect(servicio.registrar).not.toHaveBeenCalled();
  });

  it.each<[string, string, string]>([
    ['Documento de identidad', '12345', 'Debe tener de 6 a 10 dígitos.'],
    ['Documento de identidad', 'AB12345', 'Debe tener de 6 a 10 dígitos.'],
    ['Nombres', 'María2', 'Usa solo letras, separadas por un espacio, un apóstrofo o un guion.'],
    [
      'Apellidos',
      'López  Rojas',
      'Usa solo letras, separadas por un espacio, un apóstrofo o un guion.',
    ],
    ['Nombres', 'M', 'Debe tener entre 2 y 60 caracteres.'],
    ['Apellidos', 'L'.repeat(61), 'Debe tener entre 2 y 60 caracteres.'],
    ['Celular', '2001234567', 'Debe tener 10 dígitos y empezar por 3, sin indicativo ni espacios.'],
    [
      'Celular',
      '+573001234567',
      'Debe tener 10 dígitos y empezar por 3, sin indicativo ni espacios.',
    ],
    ['Correo', 'maria@correo', 'Escribe un correo válido, como nombre@correo.com.'],
    [
      'Contraseña',
      'clave-segura-1',
      'La contraseña debe tener al menos 12 caracteres, con mayúsculas, minúsculas y números.',
    ],
    [
      'Contraseña',
      'Corta-1',
      'La contraseña debe tener al menos 12 caracteres, con mayúsculas, minúsculas y números.',
    ],
  ])('%s «%s» no cumple R12: «%s»', async (etiqueta, valor, mensaje) => {
    const { usuario } = await renderizar();

    await usuario.type(campo(etiqueta), valor);
    await usuario.tab();

    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(campo(etiqueta)).toHaveAttribute('aria-invalid', 'true');
  });

  it('nombres con tilde, apóstrofo y guion son válidos', async () => {
    const { usuario } = await renderizar();

    await usuario.type(campo('Nombres'), "Ñandú O'Neill");
    await usuario.type(campo('Apellidos'), 'Pérez-Gómez');
    await usuario.tab();

    expect(campo('Nombres')).toHaveAttribute('aria-invalid', 'false');
    expect(campo('Apellidos')).toHaveAttribute('aria-invalid', 'false');
  });

  it('el pasaporte admite letras, y cambiar el tipo valida otra vez el número', async () => {
    const { usuario } = await renderizar();
    await usuario.type(campo('Documento de identidad'), 'AB123456');
    await usuario.tab();
    expect(await screen.findByText('Debe tener de 6 a 10 dígitos.')).toBeInTheDocument();

    await usuario.selectOptions(campo('Tipo de documento'), 'PA');

    expect(screen.queryByText('Debe tener de 6 a 10 dígitos.')).not.toBeInTheDocument();
    expect(campo('Documento de identidad')).toHaveAttribute('aria-invalid', 'false');

    await usuario.clear(campo('Documento de identidad'));
    await usuario.type(campo('Documento de identidad'), 'AB1');
    expect(await screen.findByText('Debe tener de 6 a 12 letras o números.')).toBeInTheDocument();
  });

  it('contraseñas distintas, y al corregir la contraseña la confirmación se valida otra vez', async () => {
    const { usuario } = await renderizar();
    await usuario.type(campo('Contraseña'), CONTRASENA);
    await usuario.type(campo('Confirma tu contraseña'), `${CONTRASENA}x`);
    await usuario.tab();
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();

    await usuario.type(campo('Contraseña'), 'x');

    expect(screen.queryByText('Las contraseñas no coinciden.')).not.toBeInTheDocument();
  });

  it('«Mostrar» y «Ocultar» en cada contraseña, con aria-pressed', async () => {
    const { usuario } = await renderizar();

    await usuario.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(campo('Contraseña')).toHaveAttribute('type', 'text');
    expect(campo('Confirma tu contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await usuario.click(screen.getByRole('button', { name: 'Mostrar confirmación' }));
    expect(campo('Confirma tu contraseña')).toHaveAttribute('type', 'text');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar confirmación' }));
    expect(campo('Confirma tu contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Mostrar confirmación' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('registra con el correo sin espacios y la contraseña, y pasa al código', async () => {
    const { servicio, usuario } = await renderizar();

    await hastaElCodigo(usuario, servicio);

    expect(servicio.registrar).toHaveBeenCalledWith(CORREO, CONTRASENA);
    expect(screen.getByRole('heading', { name: 'Confirma tu correo' })).toHaveFocus();
    expect(screen.getByText(CORREO)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('mientras registra, el botón dice «Enviando…» y está deshabilitado', async () => {
    const { servicio, usuario } = await renderizar();
    servicio.registrar.mockReturnValue(new Promise<ResultadoCuenta>(() => undefined));
    await llenarDatos(usuario);

    await usuario.click(continuar());

    expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled();
    expect(campo('Nombres')).toBeDisabled();
    await usuario.keyboard('{Enter}');
    expect(servicio.registrar).toHaveBeenCalledTimes(1);
  });

  it.each<[ErrorCuenta, string]>([
    ['CORREO_EXISTE', 'Ya existe una cuenta con ese correo. Ingresa con tu contraseña.'],
    [
      'CONTRASENA_INVALIDA',
      'La contraseña debe tener al menos 12 caracteres, con mayúsculas, minúsculas y números.',
    ],
    ['DEMASIADOS_INTENTOS', 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.'],
    ['SIN_CONEXION', 'No pudimos conectarnos. Intenta de nuevo.'],
    ['NO_DISPONIBLE', 'Crear cuenta no está disponible en este ambiente.'],
  ])('registrar con %s: su mensaje en la región aria-live (R13)', async (error, mensaje) => {
    const { servicio, usuario } = await renderizar();
    servicio.registrar.mockResolvedValue({ tipo: 'error', error });
    await llenarDatos(usuario);

    await usuario.click(continuar());

    const region = (await screen.findByText(mensaje)).closest('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    expect(continuar()).toBeEnabled();
  });
});

describe('PaginaCrearCuenta · «Código»', () => {
  it('vacío o sin 6 dígitos: su mensaje y sin confirmar', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);

    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('Escribe el código.')).toBeInTheDocument();
    expect(campo('Código')).toHaveFocus();

    await escribirCodigo(usuario, '12a45');
    expect(await screen.findByText('El código tiene 6 dígitos.')).toBeInTheDocument();
    expect(servicio.confirmar).not.toHaveBeenCalled();
  });

  it.each<[ErrorCuenta, string]>([
    ['CODIGO_ERRADO', 'El código no es correcto.'],
    ['CODIGO_VENCIDO', 'El código venció. Pide uno nuevo.'],
    ['DEMASIADOS_INTENTOS', 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.'],
  ])('confirmar con %s: su mensaje (R13)', async (error, mensaje) => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    servicio.confirmar.mockResolvedValue({ tipo: 'error', error });

    await escribirCodigo(usuario);

    expect((await screen.findByText(mensaje)).closest('[aria-live]')).toHaveFocus();
    expect(servicio.confirmar).toHaveBeenCalledWith(CORREO, '123456');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('«Reenviar código» pide otro y lo avisa', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    servicio.reenviarCodigo.mockResolvedValue(OK);

    await usuario.click(screen.getByRole('button', { name: 'Reenviar código' }));

    expect(servicio.reenviarCodigo).toHaveBeenCalledWith(CORREO);
    expect(await screen.findByRole('status')).toHaveTextContent('Te enviamos un código nuevo.');
  });

  it('si no puede reenviar, su mensaje', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    servicio.reenviarCodigo.mockResolvedValue({ tipo: 'error', error: 'DEMASIADOS_INTENTOS' });

    await usuario.click(screen.getByRole('button', { name: 'Reenviar código' }));

    expect(
      await screen.findByText(
        'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('mientras confirma, los dos botones quedan deshabilitados', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    servicio.confirmar.mockReturnValue(new Promise<ResultadoCuenta>(() => undefined));

    await escribirCodigo(usuario);

    expect(await screen.findByRole('button', { name: 'Confirmando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeDisabled();
  });
});

describe('PaginaCrearCuenta · un solo envío', () => {
  /** Dos envíos en el mismo instante, antes de que se deshabiliten los botones. */
  function enviarDosVeces(boton: HTMLElement) {
    const formulario = boton.closest('form') as HTMLFormElement;
    fireEvent.submit(formulario);
    fireEvent.submit(formulario);
  }

  it('«Tus datos» registra una sola vez', async () => {
    const { servicio, usuario } = await renderizar();
    servicio.registrar.mockReturnValue(new Promise<ResultadoCuenta>(() => undefined));
    await llenarDatos(usuario);

    enviarDosVeces(continuar());

    expect(servicio.registrar).toHaveBeenCalledTimes(1);
  });

  it('«Código» confirma una sola vez y no reenvía mientras confirma', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    servicio.confirmar.mockReturnValue(new Promise<ResultadoCuenta>(() => undefined));
    await usuario.type(campo('Código'), '123456');

    const reenviar = screen.getByRole('button', { name: 'Reenviar código' });
    enviarDosVeces(reenviar);
    fireEvent.click(reenviar);

    expect(servicio.confirmar).toHaveBeenCalledTimes(1);
    expect(servicio.reenviarCodigo).not.toHaveBeenCalled();
  });
});

describe('PaginaCrearCuenta · registro completo (D21)', () => {
  /** Después de confirmar, la cuenta ingresó y no tiene grupo (R2). */
  function alConfirmarIngresa(servicio: ReturnType<typeof sesionFalsa>) {
    servicio.confirmar.mockImplementation(async () => {
      servicio.cuentaSinRegistrar.mockReturnValue(CORREO);
      return OK;
    });
  }

  it('confirma, envía los datos a POST /v1/cuenta y va al tablero del cliente', async () => {
    const { servicio, navegar, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    alConfirmarIngresa(servicio);
    servicio.completarRegistro.mockResolvedValue({ tipo: 'sesion', sesion: CLIENTE });

    await escribirCodigo(usuario);

    expect(servicio.completarRegistro).toHaveBeenCalledWith(DATOS);
    expect(navegar).toHaveBeenCalledWith('/cliente');
  });

  it('si el BFF no enlaza la cuenta (409), vuelve a «Tus datos» sin contraseñas, con el mensaje', async () => {
    const { servicio, navegar, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    alConfirmarIngresa(servicio);
    servicio.completarRegistro.mockResolvedValue({ tipo: 'error', error: 'CUENTA_NO_ENLAZABLE' });

    await escribirCodigo(usuario);

    expect(
      await screen.findByText(
        'No pudimos crear tu cuenta con esos datos. Si ya te registraste en la app, usa el mismo correo; si no, comunícate con tu asesor.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    expect(campo('Correo')).toHaveValue(CORREO);
    expect(campo('Correo')).toHaveAttribute('readonly');
    expect(campo('Nombres')).toHaveValue(DATOS.nombre.nombres);
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();

    servicio.completarRegistro.mockResolvedValue({ tipo: 'sesion', sesion: CLIENTE });
    await usuario.click(screen.getByRole('button', { name: 'Terminar registro' }));
    expect(servicio.completarRegistro).toHaveBeenCalledTimes(2);
    expect(navegar).toHaveBeenCalledWith('/cliente');
  });

  it('un 422 marca los campos que rechazó el BFF', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    alConfirmarIngresa(servicio);
    servicio.completarRegistro.mockResolvedValue({
      tipo: 'error',
      error: 'VALIDACION',
      detalle: [
        { loc: ['body', 'celular'], msg: 'x', type: 'string_pattern_mismatch' },
        { loc: ['body', 'nombre', 'apellidos'], msg: 'x', type: 'string_pattern_mismatch' },
        { loc: ['body', 'otro'], msg: 'x', type: 'extra_forbidden' },
      ],
    });

    await escribirCodigo(usuario);

    expect(await screen.findByText('Revisa los datos marcados.')).toBeInTheDocument();
    expect(campo('Celular')).toHaveAttribute('aria-invalid', 'true');
    expect(campo('Apellidos')).toHaveAttribute('aria-invalid', 'true');
    expect(campo('Nombres')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getAllByText('El servicio no aceptó este dato. Revísalo.')).toHaveLength(2);

    await usuario.clear(campo('Celular'));
    await usuario.type(campo('Celular'), '3109876543');

    expect(campo('Celular')).toHaveAttribute('aria-invalid', 'false');
    expect(campo('Apellidos')).toHaveAttribute('aria-invalid', 'true');
  });

  it('un 422 sin detalle solo muestra el mensaje general', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    alConfirmarIngresa(servicio);
    servicio.completarRegistro.mockResolvedValue({ tipo: 'error', error: 'VALIDACION' });

    await escribirCodigo(usuario);

    expect(await screen.findByText('Revisa los datos marcados.')).toBeInTheDocument();
    expect(screen.queryByText('El servicio no aceptó este dato. Revísalo.')).toBeNull();
  });

  it('sin conexión con el BFF (503), su mensaje', async () => {
    const { servicio, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    alConfirmarIngresa(servicio);
    servicio.completarRegistro.mockResolvedValue({ tipo: 'error', error: 'SIN_CONEXION' });

    await escribirCodigo(usuario);

    expect(
      await screen.findByText('No pudimos conectarnos. Intenta de nuevo.'),
    ).toBeInTheDocument();
  });

  it('confirmada sin poder ingresar (sin credenciales en memoria), lleva a ingresar con su aviso', async () => {
    const { servicio, navegar, usuario } = await renderizar();
    await hastaElCodigo(usuario, servicio);
    servicio.confirmar.mockResolvedValue(OK);

    await escribirCodigo(usuario);

    expect(navegar).toHaveBeenCalledWith('/ingresar?motivo=confirmada');
    expect(servicio.completarRegistro).not.toHaveBeenCalled();
  });
});

describe('PaginaCrearCuenta · cuenta sin registrar (R2)', () => {
  function cuentaSinRegistrar() {
    const servicio = sesionFalsa();
    servicio.cuentaSinRegistrar.mockReturnValue(CORREO);
    return servicio;
  }

  it('el correo es el de la cuenta, en solo lectura, y no pide contraseñas', async () => {
    await renderizar(cuentaSinRegistrar());

    expect(campo('Correo')).toHaveValue(CORREO);
    expect(campo('Correo')).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirma tu contraseña')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Tu correo ya está confirmado. Completa tus datos para terminar tu registro.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inicia sesión' })).not.toBeInTheDocument();
  });

  it('«Terminar registro» envía los datos sin registrar otra cuenta', async () => {
    const { servicio, navegar, usuario } = await renderizar(cuentaSinRegistrar());
    servicio.completarRegistro.mockResolvedValue({ tipo: 'sesion', sesion: CLIENTE });
    await llenarDatos(usuario, false);

    await usuario.click(screen.getByRole('button', { name: 'Terminar registro' }));

    expect(servicio.registrar).not.toHaveBeenCalled();
    expect(servicio.completarRegistro).toHaveBeenCalledWith(DATOS);
    expect(navegar).toHaveBeenCalledWith('/cliente');
  });

  it('con un error se queda en «Tus datos» con su mensaje', async () => {
    const servicio = cuentaSinRegistrar();
    const { usuario } = await renderizar(servicio);
    servicio.completarRegistro.mockResolvedValue({ tipo: 'error', error: 'CUENTA_NO_ENLAZABLE' });
    await llenarDatos(usuario, false);

    await usuario.click(screen.getByRole('button', { name: 'Terminar registro' }));

    expect(
      await screen.findByText(/No pudimos crear tu cuenta con esos datos/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminar registro' })).toBeEnabled();
  });
});

describe('PaginaCrearCuenta · cuenta sin confirmar (D32)', () => {
  it('con la contraseña errada, el correo queda confirmado y lleva a ingresar con su aviso', async () => {
    const servicio = sesionFalsa();
    servicio.correoPorConfirmar.mockReturnValue(CORREO);
    // SesionCognito confirma y su ingreso con la contraseña errada no pasa: ok, sin sesión.
    servicio.confirmar.mockResolvedValue(OK);
    const { navegar, usuario } = await renderizar(servicio);

    await escribirCodigo(usuario);

    expect(servicio.confirmar).toHaveBeenCalledWith(CORREO, '123456');
    expect(navegar).toHaveBeenCalledWith('/ingresar?motivo=confirmada');
    expect(screen.queryByText('No pudimos conectarnos. Intenta de nuevo.')).toBeNull();
  });

  function cuentaSinConfirmar() {
    const servicio = sesionFalsa();
    servicio.correoPorConfirmar.mockReturnValue(CORREO);
    return servicio;
  }

  it('empieza en «Código» con el correo y el aviso de R9', async () => {
    await renderizar(cuentaSinConfirmar());

    expect(screen.getByRole('heading', { name: 'Confirma tu correo' })).toBeInTheDocument();
    expect(screen.getByText(CORREO)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tu correo aún no está confirmado. Te enviamos un código nuevo.',
    );
  });

  it('al confirmar ingresa y sigue a «Tus datos» sin contraseñas, y termina el registro', async () => {
    const servicio = cuentaSinConfirmar();
    const { navegar, usuario } = await renderizar(servicio);
    servicio.confirmar.mockImplementation(async () => {
      servicio.cuentaSinRegistrar.mockReturnValue(CORREO);
      return OK;
    });
    servicio.completarRegistro.mockResolvedValue({ tipo: 'sesion', sesion: CLIENTE });

    await escribirCodigo(usuario);

    expect(servicio.confirmar).toHaveBeenCalledWith(CORREO, '123456');
    expect(await screen.findByRole('heading', { name: 'Tus datos' })).toHaveFocus();
    expect(campo('Correo')).toHaveValue(CORREO);
    expect(campo('Correo')).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    expect(servicio.completarRegistro).not.toHaveBeenCalled();

    await llenarDatos(usuario, false);
    await usuario.click(screen.getByRole('button', { name: 'Terminar registro' }));

    expect(servicio.registrar).not.toHaveBeenCalled();
    expect(servicio.completarRegistro).toHaveBeenCalledWith(DATOS);
    expect(navegar).toHaveBeenCalledWith('/cliente');
  });
});
