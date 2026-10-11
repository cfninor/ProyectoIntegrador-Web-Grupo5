import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { SolicitudParaCliente } from './modelos';
import { PaginaAutorizacionDatos } from './pagina-autorizacion-datos';

const SOLICITUD_ID = '3f8a2c1e-6b7d-4e9a-9c2f-1a2b3c4d5e6f';
const URL_SOLICITUD = `http://bff.prueba/v1/solicitudes-autorizacion/${SOLICITUD_ID}`;
const URL_DECISION = `${URL_SOLICITUD}/decision`;

const PENDIENTE: SolicitudParaCliente = {
  solicitudId: SOLICITUD_ID,
  estado: 'PENDIENTE',
  asesor: { nombre: 'Laura Gómez' },
  // 14:30 UTC = 09:30 en Bogotá.
  fechaSolicitud: '2026-10-09T14:30:00Z',
  catalogo: {
    version: 'v1',
    fuentes: [
      {
        fuente: 'OPEN_FINANCE',
        datos: [
          { codigo: 'COMPORTAMIENTO_PAGO', entidades: ['ENTIDADES_FINANZAS_ABIERTAS'] },
          { codigo: 'ESTABILIDAD_INGRESOS', entidades: ['ENTIDADES_FINANZAS_ABIERTAS'] },
        ],
      },
      {
        fuente: 'OPEN_DATA',
        datos: [
          { codigo: 'SOCIODEMOGRAFICA_TERRITORIAL', entidades: ['DANE'] },
          { codigo: 'SALUD_ACTUARIAL_AGREGADA', entidades: ['MINSALUD'] },
          { codigo: 'INMUEBLE_UBICACION', entidades: ['IGAC'] },
        ],
      },
    ],
  },
  condiciones: {
    duracionMeses: 12,
    finalidad: 'PERFILAMIENTO_VIDA_HIPOTECARIO',
    destinatario: 'SOLVENTA',
    baseLegal: ['LEY_1581_2012', 'DECRETO_1297_2022'],
    versionPolitica: 'v1',
  },
};

async function renderizar() {
  const vista = await render(PaginaAutorizacionDatos, {
    inputs: { solicitudId: SOLICITUD_ID },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://bff.prueba' } },
    ],
  });
  httpDeLaPrueba = TestBed.inject(HttpTestingController);
  return { ...vista, http: httpDeLaPrueba, usuario: userEvent.setup() };
}

async function renderizarPendiente() {
  const vista = await renderizar();
  vista.http.expectOne(URL_SOLICITUD).flush(PENDIENTE);
  await screen.findByText(/Solicitud enviada por Laura Gómez/);
  return vista;
}

const botonAutorizar = () => screen.getByRole('button', { name: 'Autorizar' });
const botonNoAutorizar = () => screen.getByRole('button', { name: 'No autorizar' });
const DECLARACION =
  'Autorizo a Solventa a consultar mis datos de Open Finance y Open Data para calcular mi p' +
  'erfil de riesgo, conforme a la Ley 1581 de 2012 y al Decreto 1297 de 2022, y acepto la p' +
  'olítica de tratamiento de datos. Puedo revocar esta autorización en cualquier momento.';
const casilla = () => screen.getByRole('checkbox', { name: DECLARACION });

// Controlador HTTP de la prueba en curso: se verifica al terminar que no quedaron peticiones sin
// responder. Se guarda aquí porque el TestBed ya se reinició cuando corre este afterEach.
let httpDeLaPrueba: HttpTestingController | undefined;

afterEach(() => {
  httpDeLaPrueba?.verify();
  httpDeLaPrueba = undefined;
});

describe('PaginaAutorizacionDatos · carga', () => {
  it('mientras carga marca la página con aria-busy', async () => {
    const { http, container } = await renderizar();

    expect(screen.getByText('Cargando la solicitud…')).toBeInTheDocument();
    expect(container.querySelector('.pagina')).toHaveAttribute('aria-busy', 'true');

    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);
    await screen.findByText(/Solicitud enviada por Laura Gómez/);
    expect(container.querySelector('.pagina')).toHaveAttribute('aria-busy', 'false');
  });

  it('muestra el título, el origen en hora de Bogotá, los datos y las condiciones', async () => {
    await renderizarPendiente();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Autorizar la consulta de tus datos' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Solicitud enviada por Laura Gómez, de Solventa, el 09/10/2026 a las 09:30'),
    ).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Open Finance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Open Data' })).toBeInTheDocument();
    expect(screen.getByText('Comportamiento de pago y endeudamiento')).toBeInTheDocument();
    expect(screen.getByText('Cómo pagas tus créditos y cuánto debes hoy')).toBeInTheDocument();
    expect(screen.getByText('Estabilidad de ingresos')).toBeInTheDocument();
    expect(
      screen.getByText('Información sociodemográfica y territorial de tu zona'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Indicadores de la población, no tu historia clínica'),
    ).toBeInTheDocument();
    expect(screen.getByText('Datos del inmueble y su ubicación')).toBeInTheDocument();
    expect(
      screen.getAllByText('Entidades financieras del esquema de finanzas abiertas (simulado)'),
    ).toHaveLength(2);
    expect(screen.getByText('DANE')).toBeInTheDocument();
    expect(screen.getByText('Ministerio de Salud y Protección Social')).toBeInTheDocument();
    expect(screen.getByText('Instituto Geográfico Agustín Codazzi')).toBeInTheDocument();

    expect(screen.getByText('La autorización dura 12 meses')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Para calcular tu perfil de riesgo y el precio personalizado de tu seguro de vida hipotecario',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tu asesor ve el estado de la autorización y la prima/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Desde «Mis autorizaciones», cuando quieras/)).toBeInTheDocument();
    expect(screen.getByText('Ley 1581 de 2012')).toBeInTheDocument();
    expect(screen.getByText('Decreto 1297 de 2022')).toBeInTheDocument();
  });

  it('si la API trae un código que no conoce, muestra el código', async () => {
    const { http } = await renderizar();
    const conCodigosNuevos = {
      ...PENDIENTE,
      catalogo: {
        version: 'v2',
        fuentes: [
          { fuente: 'OPEN_X', datos: [{ codigo: 'DATO_NUEVO', entidades: ['ENT_NUEVA'] }] },
        ],
      },
    };

    http.expectOne(URL_SOLICITUD).flush(conCodigosNuevos);

    expect(await screen.findByRole('heading', { name: 'OPEN_X' })).toBeInTheDocument();
    expect(screen.getByText('DATO_NUEVO')).toBeInTheDocument();
    expect(screen.getByText('ENT_NUEVA')).toBeInTheDocument();
  });

  it.each([404, 422])('con %s muestra «no encontrada» sin detalles técnicos', async (codigo) => {
    const { http } = await renderizar();

    http
      .expectOne(URL_SOLICITUD)
      .flush(
        { codigo: 'SOLICITUD_NO_ENCONTRADA', detalle: 'x' },
        { status: codigo, statusText: '' },
      );

    expect(
      await screen.findByRole('heading', { name: 'No encontramos esta solicitud' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SOLICITUD_NO_ENCONTRADA|404|422/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('un error de carga permite reintentar', async () => {
    const { http, usuario } = await renderizar();

    http.expectOne(URL_SOLICITUD).flush(null, { status: 503, statusText: '' });
    const reintentar = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar la solicitud');

    await usuario.click(reintentar);
    http.expectOne(URL_SOLICITUD).flush(PENDIENTE);

    expect(await screen.findByText(/Solicitud enviada por Laura Gómez/)).toBeInTheDocument();
  });

  it('un error de red al cargar también permite reintentar', async () => {
    const { http } = await renderizar();

    http.expectOne(URL_SOLICITUD).error(new ProgressEvent('error'));

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it.each([
    ['AUTORIZADA', 'Autorizada', 'chip-verde', /Tu asesor ya puede ver tu autorización/],
    ['NO_AUTORIZADA', 'No autorizada', 'chip-gris', /La cotización personalizada no continúa/],
  ] as const)(
    'si ya estaba %s al cargar, muestra el chip con su estado y no el formulario',
    async (estado, textoChip, claseChip, texto) => {
      const { http } = await renderizar();

      http.expectOne(URL_SOLICITUD).flush({ ...PENDIENTE, estado });

      expect(
        await screen.findByRole('heading', { name: 'Esta solicitud ya fue respondida' }),
      ).toBeInTheDocument();
      expect(screen.getByText(textoChip)).toHaveClass('chip', claseChip);
      expect(screen.getByText(texto)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Autorizar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    },
  );
});

describe('PaginaAutorizacionDatos · aceptación', () => {
  it('Autorizar está deshabilitado hasta marcar la casilla', async () => {
    const { usuario } = await renderizarPendiente();

    expect(botonAutorizar()).toBeDisabled();
    expect(botonNoAutorizar()).toBeEnabled();

    await usuario.click(casilla());
    expect(botonAutorizar()).toBeEnabled();

    await usuario.click(casilla());
    expect(botonAutorizar()).toBeDisabled();
  });

  it('la casilla es una declaración explícita dentro de su recuadro, con su ayuda', async () => {
    await renderizarPendiente();

    expect(casilla().closest('label')).toHaveClass('casilla', 'declaracion');

    const ayuda = document.getElementById(casilla().getAttribute('aria-describedby') ?? '');
    expect(ayuda).toHaveTextContent('Para autorizar, marca la casilla.');
    expect(casilla()).toHaveAccessibleDescription(
      'Para autorizar, marca la casilla. Si no autorizas, no consultaremos tus datos.',
    );
  });

  it('Autorizar envía el cuerpo exacto y muestra el resultado con el foco en su título', async () => {
    const { http, usuario } = await renderizarPendiente();

    await usuario.click(casilla());
    await usuario.click(botonAutorizar());

    const peticion = http.expectOne(URL_DECISION);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      decision: 'AUTORIZAR',
      aceptaPolitica: true,
      versionPolitica: 'v1',
    });
    peticion.flush({ solicitudId: SOLICITUD_ID, estado: 'AUTORIZADA' });

    const titulo = await screen.findByRole('heading', {
      name: 'Autorizaste la consulta de tus datos',
    });
    expect(screen.getByRole('status')).toContainElement(titulo);
    expect(screen.getByText('Autorizada')).toHaveClass('chip', 'chip-verde');
    expect(
      screen.getByText('Tu asesor ya puede ver tu autorización y continuar con tu cotización'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Desde «Mis autorizaciones»/)).toBeInTheDocument();
    await waitFor(() => expect(titulo).toHaveFocus());
  });

  it('No autorizar envía el cuerpo exacto sin exigir la casilla', async () => {
    const { http, usuario } = await renderizarPendiente();

    await usuario.click(botonNoAutorizar());

    const peticion = http.expectOne(URL_DECISION);
    expect(peticion.request.body).toEqual({
      decision: 'NO_AUTORIZAR',
      aceptaPolitica: false,
      versionPolitica: 'v1',
    });
    peticion.flush({ solicitudId: SOLICITUD_ID, estado: 'NO_AUTORIZADA' });

    const titulo = await screen.findByRole('heading', {
      name: 'No autorizaste la consulta de tus datos',
    });
    expect(screen.getByText('No autorizada')).toHaveClass('chip', 'chip-gris');
    expect(
      screen.getByText(
        'La cotización personalizada no continúa; tu asesor puede enviarte una nueva solicitud.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(titulo).toHaveFocus());
  });

  it('mientras envía deshabilita los botones y un doble clic manda una sola petición', async () => {
    const { http, usuario } = await renderizarPendiente();
    await usuario.click(casilla());

    await usuario.dblClick(botonAutorizar());

    const peticion = http.expectOne(URL_DECISION);
    expect(botonAutorizar()).toBeDisabled();
    expect(botonNoAutorizar()).toBeDisabled();
    expect(casilla()).toBeDisabled();
    peticion.flush({ solicitudId: SOLICITUD_ID, estado: 'AUTORIZADA' });
    await screen.findByRole('heading', { name: 'Autorizaste la consulta de tus datos' });
  });

  it('con 409 consulta el estado real y muestra que ya fue respondida', async () => {
    const { http, usuario } = await renderizarPendiente();

    await usuario.click(botonNoAutorizar());
    http
      .expectOne(URL_DECISION)
      .flush(
        { codigo: 'SOLICITUD_YA_RESPONDIDA', detalle: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    http.expectOne(URL_SOLICITUD).flush({ ...PENDIENTE, estado: 'AUTORIZADA' });

    const titulo = await screen.findByRole('heading', {
      name: 'Esta solicitud ya fue respondida',
    });
    expect(screen.getByText('Autorizada')).toHaveClass('chip-verde');
    await waitFor(() => expect(titulo).toHaveFocus());
  });

  it.each([
    ['la consulta posterior al 409 sigue PENDIENTE', { ...PENDIENTE }, undefined],
    ['la consulta posterior al 409 falla', null, { status: 503, statusText: '' }],
  ])('si %s, muestra el error de envío', async (_caso, cuerpo, opciones) => {
    const { http, usuario } = await renderizarPendiente();

    await usuario.click(botonNoAutorizar());
    http.expectOne(URL_DECISION).flush(null, { status: 409, statusText: 'Conflict' });
    http.expectOne(URL_SOLICITUD).flush(cuerpo, opciones);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos registrar tu respuesta. Intenta de nuevo.',
    );
    expect(botonNoAutorizar()).toBeEnabled();
  });

  it('un error al enviar conserva la casilla y permite reintentar', async () => {
    const { http, usuario } = await renderizarPendiente();
    await usuario.click(casilla());

    await usuario.click(botonAutorizar());
    http.expectOne(URL_DECISION).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos registrar tu respuesta. Intenta de nuevo.',
    );
    expect(casilla()).toBeChecked();
    expect(botonAutorizar()).toBeEnabled();

    await usuario.click(botonAutorizar());
    const reintento = http.expectOne(URL_DECISION);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    reintento.flush({ solicitudId: SOLICITUD_ID, estado: 'AUTORIZADA' });

    expect(
      await screen.findByRole('heading', { name: 'Autorizaste la consulta de tus datos' }),
    ).toBeInTheDocument();
  });
});
