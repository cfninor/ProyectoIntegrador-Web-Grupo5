import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import {
  Actor,
  CajaAutorizacion,
  ClienteCotizacion,
  EstadoBusqueda,
  FormularioCotizacion,
  leerEntero,
} from './formulario-cotizacion';
import { Cotizacion } from './modelos';
import { DatosRecotizar } from './navegacion-oferta';

const URL_COTIZAR = 'http://bff.prueba/v1/cotizaciones';
const CLIENTE: ClienteCotizacion = {
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  nombreCompleto: 'Laura Gómez Pardo',
  documento: 'CC ••••5678',
};
const DATOS_BIEN = {
  montoCredito: 280_000_000,
  plazoAnios: 15,
  ciudadInmueble: 'Bogotá D.C.',
  entidadAcreedora: 'Banco de Ejemplo',
};
const CON_PERFIL: Cotizacion = {
  cotizacionId: '5d2c8b1a-4e3f-4a6b-9c7d-8e1f2a3b4c5d',
  ramo: 'VIDA_HIPOTECARIO',
  datosBien: DATOS_BIEN,
  clienteId: CLIENTE.clienteId,
  prima: 148_500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  fechaCotizacion: '2026-10-14T15:00:00Z',
  // 15:00 UTC = 10:00 del 21 en Bogotá.
  vigenteHasta: '2026-10-21T15:00:00Z',
  estado: 'VIGENTE',
  calculadaSinPerfil: false,
};
// 15:02 UTC = 10:02 en Bogotá.
const AUTORIZADA: CajaAutorizacion = {
  tipo: 'estado',
  estado: 'AUTORIZADA',
  fechaEstado: '2026-10-09T15:02:11Z',
};

interface Opciones {
  actor?: Actor;
  cliente?: ClienteCotizacion | null;
  busqueda?: EstadoBusqueda;
  autorizacion?: CajaAutorizacion;
  envioHabilitado?: boolean;
  inicial?: DatosRecotizar | null;
}

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(opciones: Opciones = {}) {
  const salidas = {
    buscarCliente: jest.fn(),
    pedirAutorizacion: jest.fn(),
    reenviarSolicitud: jest.fn(),
    reintentarAutorizacion: jest.fn(),
    cotizada: jest.fn(),
    verOferta: jest.fn(),
  };
  const actor = opciones.actor ?? 'cliente';
  const vista = await render(FormularioCotizacion, {
    inputs: {
      actor,
      cliente:
        opciones.cliente === undefined ? (actor === 'cliente' ? CLIENTE : null) : opciones.cliente,
      busqueda: opciones.busqueda ?? 'inactiva',
      autorizacion: opciones.autorizacion ?? AUTORIZADA,
      envioHabilitado: opciones.envioHabilitado ?? true,
      inicial: opciones.inicial ?? null,
    },
    on: salidas,
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { ...vista, http, salidas, usuario: userEvent.setup() };
}

const campo = (nombre: RegExp | string) => screen.getByLabelText(nombre) as HTMLInputElement;
const botonCalcular = () => screen.getByRole('button', { name: 'Calcular cotización' });

/** Llena los datos del crédito con valores válidos. */
async function llenarCredito(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(campo('Monto del crédito (COP)'), '280000000');
  await usuario.type(campo('Plazo (años)'), '15');
  await usuario.type(campo('Ciudad del inmueble'), 'Bogotá D.C.');
  await usuario.type(campo('Entidad acreedora'), 'Banco de Ejemplo');
  await usuario.tab();
}

describe('FormularioCotizacion · cliente', () => {
  it('estado inicial: datos de la sesión de solo lectura, ayuda en segunda persona e invitación', async () => {
    await renderizar();

    expect(
      screen.getByRole('heading', { name: 'Datos del cliente y del crédito' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Con estos datos y tu autorización/)).toBeInTheDocument();
    expect(campo('Nombre completo')).toHaveValue('Laura Gómez Pardo');
    expect(campo('Nombre completo')).toHaveAttribute('readonly');
    expect(campo('Documento de identidad')).toHaveValue('CC ••••5678');
    expect(campo('Documento de identidad')).toHaveAttribute('readonly');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.getByText('Completa los datos y calcula la cotización para ver la prima estimada.'),
    ).toBeInTheDocument();
  });

  it('no habilita el envío hasta que los campos son válidos, e indica cuáles faltan (CA2)', async () => {
    const { usuario } = await renderizar();

    expect(botonCalcular()).toBeDisabled();
    expect(
      screen.getByText(
        'Para calcular, completa: Monto del crédito (COP), Plazo (años), Ciudad del inmueble, Entidad acreedora.',
      ),
    ).toBeInTheDocument();

    await usuario.type(campo('Monto del crédito (COP)'), '280000000');
    await usuario.type(campo('Plazo (años)'), '15');
    expect(
      screen.getByText('Para calcular, completa: Ciudad del inmueble, Entidad acreedora.'),
    ).toBeInTheDocument();

    await usuario.type(campo('Ciudad del inmueble'), 'Bogotá D.C.');
    await usuario.type(campo('Entidad acreedora'), 'Banco de Ejemplo');
    expect(botonCalcular()).toBeEnabled();
    expect(screen.queryByText(/Para calcular/)).not.toBeInTheDocument();
  });

  it.each([
    ['Monto del crédito (COP)', '', 'Escribe el monto del crédito.'],
    ['Monto del crédito (COP)', 'mucho', 'Escribe solo números.'],
    ['Monto del crédito (COP)', '9999999', 'Debe estar entre $ 10.000.000 y $ 1.200.000.000.'],
    ['Monto del crédito (COP)', '1200000001', 'Debe estar entre $ 10.000.000 y $ 1.200.000.000.'],
    ['Plazo (años)', '', 'Escribe el plazo en años.'],
    ['Plazo (años)', '7.5', 'Debe estar entre 5 y 30 años.'],
    ['Plazo (años)', 'diez', 'Escribe un número entero de años.'],
    ['Plazo (años)', '4', 'Debe estar entre 5 y 30 años.'],
    ['Plazo (años)', '31', 'Debe estar entre 5 y 30 años.'],
    ['Ciudad del inmueble', '   ', 'Escribe la ciudad del inmueble.'],
    ['Ciudad del inmueble', 'B', 'Debe tener entre 2 y 80 caracteres.'],
    ['Entidad acreedora', '', 'Escribe la entidad acreedora.'],
    ['Entidad acreedora', 'x'.repeat(121), 'Debe tener entre 2 y 120 caracteres.'],
  ])('al salir de «%s» con «%s» indica «%s»', async (etiqueta, valor, mensaje) => {
    const { usuario } = await renderizar();
    const control = campo(etiqueta);

    await usuario.click(control);
    if (valor) {
      await usuario.type(control, valor);
    }
    await usuario.tab();

    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(control).toHaveAttribute('aria-invalid', 'true');
  });

  it('un campo no muestra error antes de tocarlo', async () => {
    await renderizar();

    expect(campo('Plazo (años)')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Escribe el plazo en años.')).not.toBeInTheDocument();
  });

  it('el monto se muestra con separador de miles al salir del campo', async () => {
    const { usuario } = await renderizar();

    await usuario.type(campo('Monto del crédito (COP)'), '280000000');
    await usuario.tab();

    expect(campo('Monto del crédito (COP)')).toHaveValue('280.000.000');
  });

  it('calcula con el clienteId de la sesión, sin doble envío, y muestra el panel de prima (CA3, D6)', async () => {
    const { http, usuario, salidas } = await renderizar();
    await llenarCredito(usuario);

    await usuario.click(botonCalcular());
    const peticion = http.expectOne(URL_COTIZAR);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      ramo: 'VIDA_HIPOTECARIO',
      datosBien: DATOS_BIEN,
      clienteId: CLIENTE.clienteId,
    });

    const calculando = screen.getByRole('button', { name: 'Calculando…' });
    expect(calculando).toBeDisabled();
    expect(screen.getByText('Calculando la prima…')).toBeInTheDocument();
    await usuario.click(calculando);
    http.expectNone(URL_COTIZAR);

    peticion.flush(CON_PERFIL);

    const panel = within(await screen.findByRole('region', { name: 'Prima estimada' }));
    expect(panel.getByText('$ 148.500')).toBeInTheDocument();
    expect(panel.getByText('/ mes')).toBeInTheDocument();
    expect(panel.getByText('COP')).toBeInTheDocument();
    expect(panel.getByText('Saldo del crédito')).toBeInTheDocument();
    expect(panel.getByText('$ 280.000.000')).toBeInTheDocument();
    expect(panel.getByText('15 años')).toBeInTheDocument();
    expect(panel.getByText('Oferta válida hasta el 21/10/2026')).toBeInTheDocument();
    expect(panel.queryByText(/Calculada sin/)).not.toBeInTheDocument();
    expect(salidas.cotizada).toHaveBeenCalledWith(CON_PERFIL);

    // SOLVENTAG5-49: desde el panel se abre la oferta completa de esta cotización.
    expect(salidas.verOferta).not.toHaveBeenCalled();
    await usuario.click(panel.getByRole('button', { name: 'Ver la oferta' }));
    expect(salidas.verOferta).toHaveBeenCalledWith(CON_PERFIL);
  });

  it('Enter en un campo no envía mientras falten datos', async () => {
    const { http, usuario } = await renderizar();

    await usuario.type(campo('Plazo (años)'), '15{Enter}');

    http.expectNone(URL_COTIZAR);
    expect(screen.getByText(/Para calcular, completa: Monto del crédito/)).toBeInTheDocument();
  });

  it('mientras calcula, los campos quedan deshabilitados y un cambio de cliente no lo interrumpe', async () => {
    const { http, usuario, rerender } = await renderizar();
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());

    expect(campo('Plazo (años)')).toBeDisabled();
    await rerender({ inputs: { cliente: { ...CLIENTE, clienteId: 'otro' } }, partialUpdate: true });
    expect(screen.getByRole('button', { name: 'Calculando…' })).toBeDisabled();

    http.expectOne(URL_COTIZAR).flush(CON_PERFIL);

    expect(await screen.findByText('$ 148.500')).toBeInTheDocument();
    expect(campo('Plazo (años)')).toBeEnabled();
  });

  it('sin cliente no envía clienteId', async () => {
    const { http, usuario } = await renderizar({ cliente: null });
    await llenarCredito(usuario);

    await usuario.click(botonCalcular());

    const peticion = http.expectOne(URL_COTIZAR);
    expect(peticion.request.body).toEqual({ ramo: 'VIDA_HIPOTECARIO', datosBien: DATOS_BIEN });
    peticion.flush({ ...CON_PERFIL, clienteId: undefined });
  });

  it.each([
    ['SIN_CLIENTE', 'Calculada sin perfil de riesgo porque no hay un cliente identificado.'],
    [
      'SIN_CONSENTIMIENTO',
      'Calculada sin tu perfil de riesgo porque no tienes una autorización vigente.',
    ],
    [
      'PERFIL_NO_DISPONIBLE',
      'Calculada sin tu perfil de riesgo porque no estuvo disponible a tiempo.',
    ],
  ])('calculada sin perfil por %s, el panel lo avisa', async (motivo, aviso) => {
    const { http, usuario } = await renderizar();
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());

    http
      .expectOne(URL_COTIZAR)
      .flush({ ...CON_PERFIL, calculadaSinPerfil: true, motivoSinPerfil: motivo });

    expect(await screen.findByText(aviso)).toBeInTheDocument();
  });

  it('si el servicio falla conserva los datos y permite reintentar (CA5)', async () => {
    const { http, usuario } = await renderizar();
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());

    http.expectOne(URL_COTIZAR).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos calcular la cotización. Tus datos siguen aquí: intenta de nuevo.',
    );
    expect(campo('Monto del crédito (COP)')).toHaveValue('280.000.000');
    expect(campo('Plazo (años)')).toHaveValue('15');
    expect(campo('Ciudad del inmueble')).toHaveValue('Bogotá D.C.');
    expect(campo('Entidad acreedora')).toHaveValue('Banco de Ejemplo');

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    const reintento = http.expectOne(URL_COTIZAR);
    expect(reintento.request.body.datosBien).toEqual(DATOS_BIEN);
    reintento.flush(CON_PERFIL);

    expect(await screen.findByText('$ 148.500')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un error de red también permite reintentar', async () => {
    const { http, usuario } = await renderizar();
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());

    http.expectOne(URL_COTIZAR).error(new ProgressEvent('error'));

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('DATOS_BIEN_INVALIDOS marca los campos que el servicio rechazó', async () => {
    const { http, usuario } = await renderizar();
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());

    http.expectOne(URL_COTIZAR).flush(
      {
        codigo: 'DATOS_BIEN_INVALIDOS',
        detalle: 'Los datos del bien no cumplen las reglas del ramo.',
        campos: ['montoCredito', 'otroCampo'],
      },
      { status: 422, statusText: '' },
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servicio no aceptó algunos datos. Revisa los campos marcados.',
    );
    expect(screen.getByText('El servicio no aceptó este dato. Revísalo.')).toBeInTheDocument();
    expect(campo('Monto del crédito (COP)')).toHaveAttribute('aria-invalid', 'true');
    expect(botonCalcular()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();

    await usuario.clear(campo('Monto del crédito (COP)'));
    await usuario.type(campo('Monto del crédito (COP)'), '250000000');

    expect(
      screen.queryByText('El servicio no aceptó este dato. Revísalo.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(botonCalcular()).toBeEnabled();
  });

  it('un 422 sin campos del bien (RAMO_NO_SOPORTADO) permite reintentar', async () => {
    const { http, usuario } = await renderizar();
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());

    http
      .expectOne(URL_COTIZAR)
      .flush({ codigo: 'RAMO_NO_SOPORTADO', detalle: 'x' }, { status: 422, statusText: '' });

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('si cambian los datos o el cliente después de calcular, el panel vuelve a invitar', async () => {
    const { http, usuario, rerender } = await renderizar();
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());
    http.expectOne(URL_COTIZAR).flush(CON_PERFIL);
    expect(await screen.findByText('$ 148.500')).toBeInTheDocument();

    await usuario.type(campo('Plazo (años)'), '0');
    expect(screen.queryByText('$ 148.500')).not.toBeInTheDocument();
    expect(screen.getByText(/Completa los datos y calcula/)).toBeInTheDocument();

    await usuario.clear(campo('Plazo (años)'));
    await usuario.type(campo('Plazo (años)'), '15');
    await usuario.click(botonCalcular());
    http.expectOne(URL_COTIZAR).flush(CON_PERFIL);
    expect(await screen.findByText('$ 148.500')).toBeInTheDocument();

    await rerender({ inputs: { cliente: { ...CLIENTE, clienteId: 'otro' } }, partialUpdate: true });
    expect(screen.queryByText('$ 148.500')).not.toBeInTheDocument();
  });

  it.each<[string, CajaAutorizacion, string]>([
    ['cargando', { tipo: 'cargando' }, 'Consultando tu autorización…'],
    [
      'sin autorización',
      { tipo: 'estado', estado: 'SIN_SOLICITAR' },
      'No tienes una autorización vigente: calcularemos la prima sin tu perfil de riesgo.',
    ],
    [
      'revocada',
      { tipo: 'estado', estado: 'REVOCADA' },
      'No tienes una autorización vigente: calcularemos la prima sin tu perfil de riesgo.',
    ],
    [
      'autorizada con fecha',
      AUTORIZADA,
      'Tu autorización para consultar tus datos de Open Finance y Open Data está vigente desde el 09/10/2026.',
    ],
    [
      'autorizada sin fecha',
      { tipo: 'estado', estado: 'AUTORIZADA' },
      'Tu autorización para consultar tus datos de Open Finance y Open Data está vigente.',
    ],
  ])('la caja de autorización del cliente: %s', async (_caso, autorizacion, texto) => {
    const { container } = await renderizar({ autorizacion });

    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(container.querySelector('.indicador') !== null).toBe(
      autorizacion.tipo === 'estado' && autorizacion.estado === 'AUTORIZADA',
    );
    expect(screen.queryByRole('button', { name: 'Pedir autorización' })).not.toBeInTheDocument();
  });

  it('si no se pudo consultar la autorización, permite reintentar la consulta', async () => {
    const { usuario, salidas } = await renderizar({ autorizacion: { tipo: 'error' } });

    expect(screen.getByText(/No pudimos consultar tu autorización/)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(salidas.reintentarAutorizacion).toHaveBeenCalledTimes(1);
  });
});

describe('FormularioCotizacion · asesor', () => {
  const asesor = (opciones: Opciones = {}) => renderizar({ actor: 'asesor', ...opciones });
  const numeroDocumento = () => campo('Documento de identidad');

  it('estado inicial: tipo CC por defecto, ayuda en tercera persona y caja que pide buscar', async () => {
    await asesor();

    expect(screen.getByText(/Con estos datos y la autorización del cliente/)).toBeInTheDocument();
    const tipo = screen.getByRole('combobox', { name: 'Tipo de documento' });
    expect(tipo).toHaveValue('CC');
    expect(
      within(tipo)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['CC', 'CE', 'PA', 'PPT']);
    expect(numeroDocumento()).not.toHaveAttribute('readonly');
    expect(campo('Nombre completo')).toHaveValue('');
    expect(
      screen.getByText('Busca al cliente por su documento para ver el estado de su autorización.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Para calcular, completa: Documento de identidad, /),
    ).toBeInTheDocument();
  });

  it('al salir del documento, o con Enter, pide buscar al cliente una sola vez por documento (D15)', async () => {
    const { usuario, salidas } = await asesor();

    await usuario.type(numeroDocumento(), '1020305678');
    await usuario.tab();
    expect(salidas.buscarCliente).toHaveBeenCalledWith({
      tipoDocumento: 'CC',
      numeroDocumento: '1020305678',
    });

    await usuario.click(numeroDocumento());
    await usuario.keyboard('{Enter}');
    await usuario.tab();
    expect(salidas.buscarCliente).toHaveBeenCalledTimes(1);

    await usuario.clear(numeroDocumento());
    await usuario.type(numeroDocumento(), ' 52301884 {Enter}');
    expect(salidas.buscarCliente).toHaveBeenLastCalledWith({
      tipoDocumento: 'CC',
      numeroDocumento: '52301884',
    });
    expect(salidas.buscarCliente).toHaveBeenCalledTimes(2);
  });

  it('con un documento inválido no busca e indica el formato', async () => {
    const { usuario, salidas } = await asesor();

    await usuario.type(numeroDocumento(), '12345');
    await usuario.tab();

    expect(screen.getByText('Debe tener de 6 a 10 dígitos.')).toBeInTheDocument();
    expect(numeroDocumento()).toHaveAttribute('aria-invalid', 'true');
    expect(salidas.buscarCliente).not.toHaveBeenCalled();

    await usuario.clear(numeroDocumento());
    await usuario.tab();
    expect(screen.getByText('Escribe el número de documento.')).toBeInTheDocument();
  });

  it('el pasaporte admite letras; al cambiar el tipo se valida otra vez y se busca', async () => {
    const { usuario, salidas } = await asesor();

    await usuario.type(numeroDocumento(), 'AB12CD34');
    await usuario.tab();
    expect(screen.getByText('Debe tener de 6 a 10 dígitos.')).toBeInTheDocument();

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo de documento' }), 'PA');

    expect(screen.queryByText('Debe tener de 6 a 10 dígitos.')).not.toBeInTheDocument();
    expect(salidas.buscarCliente).toHaveBeenCalledWith({
      tipoDocumento: 'PA',
      numeroDocumento: 'AB12CD34',
    });

    await usuario.clear(numeroDocumento());
    await usuario.type(numeroDocumento(), 'AB-1');
    await usuario.tab();
    expect(screen.getByText('Debe tener de 6 a 12 letras o números.')).toBeInTheDocument();
  });

  it('cambiar el tipo sin número no busca', async () => {
    const { usuario, salidas } = await asesor();

    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo de documento' }), 'CE');

    expect(salidas.buscarCliente).not.toHaveBeenCalled();
  });

  it.each<[EstadoBusqueda, string]>([
    ['buscando', 'Buscando al cliente…'],
    ['no-encontrado', 'No encontramos un cliente con ese documento.'],
    ['error', 'No pudimos buscar al cliente. Intenta de nuevo.'],
  ])('muestra el estado de la búsqueda %s bajo el documento', async (busqueda, texto) => {
    await asesor({ busqueda });

    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it('si la búsqueda falló, el mismo documento se puede buscar otra vez', async () => {
    const { usuario, salidas, rerender } = await asesor();
    await usuario.type(numeroDocumento(), '1020305678');
    await usuario.tab();

    // rerender vuelve a suscribir las salidas: se le pasan otra vez.
    await rerender({ inputs: { busqueda: 'error' }, on: salidas, partialUpdate: true });
    await usuario.click(numeroDocumento());
    await usuario.tab();

    expect(salidas.buscarCliente).toHaveBeenCalledTimes(2);
  });

  it('con el cliente encontrado y autorizado, calcula con su clienteId (D4)', async () => {
    const { usuario, rerender, http } = await asesor();
    await usuario.type(numeroDocumento(), '1020305678');
    await usuario.tab();
    await rerender({ inputs: { cliente: CLIENTE }, partialUpdate: true });
    await llenarCredito(usuario);

    expect(campo('Nombre completo')).toHaveValue('Laura Gómez Pardo');
    expect(
      screen.getByText(
        'El cliente autorizó la consulta de sus datos de Open Finance y Open Data el 09/10/2026 a las 10:02.',
      ),
    ).toBeInTheDocument();
    await usuario.click(botonCalcular());

    const peticion = http.expectOne(URL_COTIZAR);
    expect(peticion.request.body.clienteId).toBe(CLIENTE.clienteId);
    peticion.flush(CON_PERFIL);
  });

  it('sin la autorización, «Calcular cotización» no se habilita y lo explica (D4)', async () => {
    const { usuario, rerender } = await asesor({ envioHabilitado: false });
    await usuario.type(numeroDocumento(), '1020305678');
    await usuario.tab();
    await rerender({ inputs: { cliente: CLIENTE }, partialUpdate: true });
    await llenarCredito(usuario);

    expect(botonCalcular()).toBeDisabled();
    expect(
      screen.getByText('Para calcular, el cliente debe autorizar la consulta de sus datos.'),
    ).toBeInTheDocument();
  });

  it('«Reintentar» no envía si mientras tanto el envío dejó de estar habilitado (D4)', async () => {
    const { usuario, rerender, http } = await asesor();
    await usuario.type(numeroDocumento(), '1020305678');
    await usuario.tab();
    await rerender({ inputs: { cliente: CLIENTE }, partialUpdate: true });
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());
    http.expectOne(URL_COTIZAR).flush(null, { status: 503, statusText: '' });
    const reintentar = await screen.findByRole('button', { name: 'Reintentar' });

    await rerender({ inputs: { envioHabilitado: false }, partialUpdate: true });
    await usuario.click(reintentar);

    http.expectNone(URL_COTIZAR);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Calculando la prima…')).not.toBeInTheDocument();
  });

  it('si el documento cambia y no se ha buscado, pide buscar antes de calcular', async () => {
    const { usuario, rerender } = await asesor();
    await usuario.type(numeroDocumento(), '1020305678');
    await usuario.tab();
    await rerender({ inputs: { cliente: CLIENTE }, partialUpdate: true });
    await llenarCredito(usuario);
    expect(botonCalcular()).toBeEnabled();

    await usuario.clear(numeroDocumento());
    await usuario.type(numeroDocumento(), '52301884');

    expect(botonCalcular()).toBeDisabled();
    expect(
      screen.getByText('Para calcular, busca al cliente por su documento.'),
    ).toBeInTheDocument();
  });

  it.each<[string, CajaAutorizacion, string, string | null]>([
    ['cargando', { tipo: 'cargando' }, 'Consultando la autorización del cliente…', null],
    [
      'sin solicitar',
      { tipo: 'estado', estado: 'SIN_SOLICITAR' },
      'El cliente todavía no ha autorizado la consulta de sus datos de Open Finance y Open Data.',
      'Pedir autorización',
    ],
    [
      'revocada',
      { tipo: 'estado', estado: 'REVOCADA' },
      'El cliente revocó la autorización para consultar sus datos.',
      'Pedir autorización',
    ],
    [
      'vencida',
      { tipo: 'estado', estado: 'VENCIDA' },
      'La autorización del cliente venció.',
      'Pedir autorización',
    ],
    [
      'esperando al cliente',
      { tipo: 'estado', estado: 'ESPERANDO_CLIENTE' },
      'Le enviamos la solicitud de autorización al cliente y aún no responde.',
      'Reenviar solicitud',
    ],
    [
      'autorizada sin fecha',
      { tipo: 'estado', estado: 'AUTORIZADA' },
      'El cliente autorizó la consulta de sus datos de Open Finance y Open Data.',
      null,
    ],
    ['error', { tipo: 'error' }, 'No pudimos consultar la autorización del cliente.', 'Reintentar'],
  ])('la caja de autorización del asesor: %s (D17)', async (_caso, autorizacion, texto, boton) => {
    const { usuario, salidas } = await asesor({ cliente: CLIENTE, autorizacion });

    expect(screen.getByText(texto)).toBeInTheDocument();
    const botones = ['Pedir autorización', 'Reenviar solicitud', 'Reintentar'];
    for (const nombre of botones.filter((b) => b !== boton)) {
      expect(screen.queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
    if (boton) {
      await usuario.click(screen.getByRole('button', { name: boton }));
      const salida = {
        'Pedir autorización': salidas.pedirAutorizacion,
        'Reenviar solicitud': salidas.reenviarSolicitud,
        Reintentar: salidas.reintentarAutorizacion,
      }[boton];
      expect(salida).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    [
      'SIN_CONSENTIMIENTO',
      'Calculada sin el perfil de riesgo del cliente porque no tiene una autorización vigente.',
    ],
    [
      'PERFIL_NO_DISPONIBLE',
      'Calculada sin el perfil de riesgo del cliente porque no estuvo disponible a tiempo.',
    ],
  ])('el aviso sin perfil por %s habla del cliente en tercera persona', async (motivo, aviso) => {
    const { usuario, rerender, http } = await asesor();
    await usuario.type(numeroDocumento(), '1020305678');
    await usuario.tab();
    await rerender({ inputs: { cliente: CLIENTE }, partialUpdate: true });
    await llenarCredito(usuario);
    await usuario.click(botonCalcular());

    http
      .expectOne(URL_COTIZAR)
      .flush({ ...CON_PERFIL, calculadaSinPerfil: true, motivoSinPerfil: motivo });

    expect(await screen.findByText(aviso)).toBeInTheDocument();
  });
});

describe('leerEntero', () => {
  it.each([
    ['280000000', 280_000_000],
    ['280.000.000', 280_000_000],
    ['$ 280,000,000', 280_000_000],
    ['  15 ', 15],
    ['', null],
    ['15a', null],
    ['-5', null],
  ])('«%s» → %s', (texto, esperado) => {
    expect(leerEntero(texto)).toBe(esperado);
  });

  describe('al ajustar o recotizar una oferta (SOLVENTAG5-49, CA3)', () => {
    it('el cliente ve el formulario lleno con los datos del crédito y puede calcular', async () => {
      await renderizar({ inicial: { datosBien: DATOS_BIEN } });

      expect(campo('Monto del crédito (COP)')).toHaveValue('280.000.000');
      expect(campo('Plazo (años)')).toHaveValue('15');
      expect(campo('Ciudad del inmueble')).toHaveValue('Bogotá D.C.');
      expect(campo('Entidad acreedora')).toHaveValue('Banco de Ejemplo');
      expect(botonCalcular()).toBeEnabled();
    });

    it('el asesor ve el documento con que se buscó y el formulario pide buscarlo', async () => {
      const { salidas } = await renderizar({
        actor: 'asesor',
        inicial: {
          datosBien: DATOS_BIEN,
          busqueda: { tipoDocumento: 'PA', numeroDocumento: 'AB12345' },
        },
      });

      expect(campo(/Tipo de documento/)).toHaveValue('PA');
      expect(campo('Documento de identidad')).toHaveValue('AB12345');
      expect(campo('Monto del crédito (COP)')).toHaveValue('280.000.000');
      expect(salidas.buscarCliente).toHaveBeenCalledTimes(1);
      expect(salidas.buscarCliente).toHaveBeenCalledWith({
        tipoDocumento: 'PA',
        numeroDocumento: 'AB12345',
      });
    });

    it('el cliente no usa el documento de una búsqueda', async () => {
      const { salidas } = await renderizar({
        inicial: { datosBien: DATOS_BIEN, busqueda: { tipoDocumento: 'CC', numeroDocumento: '1' } },
      });

      expect(salidas.buscarCliente).not.toHaveBeenCalled();
    });
  });
});
