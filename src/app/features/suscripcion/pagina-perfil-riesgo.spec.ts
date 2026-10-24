import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { PerfilRiesgoSolicitud } from './modelos';
import { PaginaPerfilRiesgo } from './pagina-perfil-riesgo';

const BFF = 'http://bff.prueba';
const SOLICITUD_ID = '8e3b1f6a-2c4d-4e5f-9a7b-1c2d3e4f5a6b';
const URL_PERFIL = `${BFF}/v1/solicitudes-suscripcion/${SOLICITUD_ID}/perfil-riesgo`;
const CON_PERFIL: PerfilRiesgoSolicitud = {
  solicitudId: SOLICITUD_ID,
  cotizacionId: '5d2c8b1a-4e3f-4a6b-9c7d-8e1f2a3b4c5d',
  origen: 'PERFIL',
  perfil: {
    perfilId: '2a4b6c8d-1e3f-4a5b-8c7d-9e0f1a2b3c4d',
    version: 3,
    score: 640,
    nivel: 'MEDIO',
    senales: { comportamientoPago: 72, estabilidadIngresos: 65, ubicacion: 80, endeudamiento: 31 },
    calculadoEn: '2026-10-13T14:43:00Z',
    vigenteHasta: '2026-10-14T14:43:00Z',
  },
};
const SIN_PERFIL: PerfilRiesgoSolicitud = {
  solicitudId: SOLICITUD_ID,
  cotizacionId: '8f1e2d3c-4b5a-4c6d-9e7f-0a1b2c3d4e5f',
  origen: 'VALOR_POR_DEFECTO',
  motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
};

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(solicitudId?: string) {
  const vista = await render(PaginaPerfilRiesgo, {
    inputs: solicitudId ? { solicitudId } : {},
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
      { provide: LOCALE_ID, useValue: 'es-CO' },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { vista, http, usuario: userEvent.setup() };
}

async function cargar(perfil: PerfilRiesgoSolicitud) {
  const contexto = await renderizar(SOLICITUD_ID);
  contexto.http.expectOne(URL_PERFIL).flush(perfil);
  await screen.findByRole('region', { name: 'Perfil con que se cotizó' });
  return contexto;
}

const resultado = () => within(screen.getByRole('region', { name: 'Perfil con que se cotizó' }));

describe('PaginaPerfilRiesgo · SOLVENTAG5-67', () => {
  it('sin solicitud solo muestra el formulario de consulta', async () => {
    await renderizar();

    expect(
      screen.getByRole('heading', { name: 'Consultar el perfil de una solicitud' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Id de la solicitud de suscripción')).toHaveValue('');
    expect(
      screen.queryByRole('region', { name: 'Perfil con que se cotizó' }),
    ).not.toBeInTheDocument();
  });

  it('muestra el mismo perfil con que se cotizó: versión, score, nivel y fechas', async () => {
    await cargar(CON_PERFIL);

    const region = resultado();
    expect(region.getByText('Perfil del cliente · versión 3')).toBeInTheDocument();
    expect(region.getByText(SOLICITUD_ID)).toBeInTheDocument();
    expect(region.getByText(CON_PERFIL.cotizacionId)).toBeInTheDocument();
    expect(region.getByText(CON_PERFIL.perfil!.perfilId)).toBeInTheDocument();
    expect(region.getByText('640 de 850')).toBeInTheDocument();
    expect(region.getByText('Riesgo medio')).toHaveClass('chip-ambar');
    expect(region.getByText(/a las/)).toBeInTheDocument();
    expect(screen.getByLabelText('Id de la solicitud de suscripción')).toHaveValue(SOLICITUD_ID);
  });

  it('muestra las cuatro señales del perfil con su lectura', async () => {
    await cargar(CON_PERFIL);

    const senales = within(resultado().getByRole('list')).getAllByRole('listitem');
    const filas = senales.map((senal) =>
      [...senal.children].map((parte) => parte.textContent?.replace(/\s+/g, ' ').trim()),
    );
    expect(filas).toEqual([
      ['Comportamiento de pago', '', 'Muy bueno (72 de 100)'],
      ['Estabilidad de ingresos', '', 'Media (65 de 100)'],
      ['Ubicación del inmueble', '', 'Riesgo bajo (80 de 100)'],
      ['Endeudamiento actual', '', 'Alto (31 de 100)'],
    ]);
  });

  it.each([
    ['SIN_CLIENTE', /no había un cliente identificado/],
    ['SIN_CONSENTIMIENTO', /no tenía una autorización de datos vigente/],
    ['PERFIL_NO_DISPONIBLE', /no estuvo disponible a tiempo/],
  ] as const)('sin perfil dice que se usó el valor por defecto (%s)', async (motivo, texto) => {
    await cargar({ ...SIN_PERFIL, motivoSinPerfil: motivo });

    const region = resultado();
    expect(region.getByText('Valor por defecto')).toHaveClass('chip-gris');
    expect(region.getByText(texto)).toBeInTheDocument();
    expect(region.getByText(/valor por defecto del seguro/)).toBeInTheDocument();
    expect(region.queryByRole('list')).not.toBeInTheDocument();
    expect(region.queryByText(/de 850/)).not.toBeInTheDocument();
  });

  it('una solicitud que no existe lo dice', async () => {
    const { http } = await renderizar(SOLICITUD_ID);

    http
      .expectOne(URL_PERFIL)
      .flush(
        { codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA', detalle: 'x' },
        { status: 404, statusText: 'Not Found' },
      );

    expect(
      await screen.findByText('No encontramos una solicitud de suscripción con ese id.'),
    ).toBeInTheDocument();
  });

  it('si el perfil no coincide con el de la cotización pide no evaluarla', async () => {
    const { http } = await renderizar(SOLICITUD_ID);

    http
      .expectOne(URL_PERFIL)
      .flush(
        { codigo: 'PERFIL_NO_COINCIDE', detalle: 'x' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(await screen.findByText(/No la evalúes y repórtalo a soporte/)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Perfil con que se cotizó' }),
    ).not.toBeInTheDocument();
  });

  it('si el BFF falla permite reintentar', async () => {
    const { http, usuario } = await renderizar(SOLICITUD_ID);
    http
      .expectOne(URL_PERFIL)
      .flush(
        { codigo: 'NUCLEO_NO_DISPONIBLE', detalle: 'x' },
        { status: 503, statusText: 'Service Unavailable' },
      );

    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));
    http.expectOne(URL_PERFIL).flush(CON_PERFIL);

    expect(
      await screen.findByRole('region', { name: 'Perfil con que se cotizó' }),
    ).toBeInTheDocument();
  });

  it('mientras carga lo anuncia y no deja consultar de nuevo', async () => {
    await renderizar(SOLICITUD_ID);

    expect(screen.getByText('Cargando el perfil…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeDisabled();
    http!.expectOne(URL_PERFIL).flush(CON_PERFIL);
  });

  it('consultar un id válido lleva a la ruta de esa solicitud', async () => {
    const { usuario } = await renderizar();
    const navegar = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    await usuario.type(
      screen.getByLabelText('Id de la solicitud de suscripción'),
      ` ${SOLICITUD_ID.toUpperCase()} `,
    );
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));

    expect(navegar).toHaveBeenCalledWith(`/riesgo/perfil-riesgo/${SOLICITUD_ID}`);
  });

  it('consultar la misma solicitud que ya está abierta la vuelve a cargar', async () => {
    const { usuario, http } = await cargar(CON_PERFIL);

    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));

    http.expectOne(URL_PERFIL).flush(SIN_PERFIL);
    expect(await screen.findByText('Valor por defecto')).toBeInTheDocument();
  });

  it('un id que no es válido no se consulta y explica el formato', async () => {
    const { usuario } = await renderizar();
    const navegar = jest.spyOn(TestBed.inject(Router), 'navigateByUrl');

    await usuario.type(screen.getByLabelText('Id de la solicitud de suscripción'), 'abc');
    await usuario.click(screen.getByRole('button', { name: 'Consultar' }));

    const campo = screen.getByLabelText('Id de la solicitud de suscripción');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription(/Escribe un id de solicitud válido/);
    expect(navegar).not.toHaveBeenCalled();
  });
});
