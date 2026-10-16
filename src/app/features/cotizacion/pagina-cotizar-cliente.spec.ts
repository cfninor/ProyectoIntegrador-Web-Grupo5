import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { Sesion } from '../../core/sesion/sesion';
import { provideSesionSimulada } from '../../core/sesion/sesion-simulada';
import { PaginaCotizarCliente } from './pagina-cotizar-cliente';

const BFF = 'http://bff.prueba';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const URL_ESTADO = `${BFF}/v1/clientes/${CLIENTE_ID}/autorizacion-datos`;
const URL_COTIZAR = `${BFF}/v1/cotizaciones`;
const SESION: Sesion = {
  usuario: { id: 'cliente-local', nombre: 'Laura Gómez Pardo' },
  rol: 'CLIENTE',
  clienteId: CLIENTE_ID,
  documentoEnmascarado: 'CC ••••5678',
};
const DATOS_BIEN = {
  montoCredito: 280_000_000,
  plazoAnios: 15,
  ciudadInmueble: 'Bogotá D.C.',
  entidadAcreedora: 'Banco de Ejemplo',
};
const cotizacion = (extra: object = {}) => ({
  cotizacionId: 'c-1',
  ramo: 'VIDA_HIPOTECARIO',
  datosBien: DATOS_BIEN,
  clienteId: CLIENTE_ID,
  prima: 148_500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  fechaCotizacion: '2026-10-14T15:00:00Z',
  vigenteHasta: '2026-10-21T15:00:00Z',
  estado: 'VIGENTE',
  calculadaSinPerfil: false,
  ...extra,
});

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(sesion: Sesion = SESION) {
  await render(PaginaCotizarCliente, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF, sesionSimulada: sesion } },
      provideSesionSimulada(),
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { http, usuario: userEvent.setup() };
}

const campo = (nombre: string) => screen.getByLabelText(nombre) as HTMLInputElement;

async function llenarCredito(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(campo('Monto del crédito (COP)'), '280000000');
  await usuario.type(campo('Plazo (años)'), '15');
  await usuario.type(campo('Ciudad del inmueble'), 'Bogotá D.C.');
  await usuario.type(campo('Entidad acreedora'), 'Banco de Ejemplo');
}

describe('PaginaCotizarCliente', () => {
  it('muestra los datos de la sesión de solo lectura y consulta su autorización (CA4, D17)', async () => {
    const { http } = await renderizar();

    expect(campo('Nombre completo')).toHaveValue('Laura Gómez Pardo');
    expect(campo('Nombre completo')).toHaveAttribute('readonly');
    expect(campo('Documento de identidad')).toHaveValue('CC ••••5678');
    expect(campo('Documento de identidad')).toHaveAttribute('readonly');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText(/Con estos datos y tu autorización/)).toBeInTheDocument();
    expect(screen.getByText('Consultando tu autorización…')).toBeInTheDocument();

    const consulta = http.expectOne(URL_ESTADO);
    expect(consulta.request.method).toBe('GET');
    consulta.flush({
      clienteId: CLIENTE_ID,
      estado: 'AUTORIZADA',
      fechaEstado: '2026-10-09T15:02:11Z',
    });

    expect(
      await screen.findByText(
        'Tu autorización para consultar tus datos de Open Finance y Open Data está vigente desde el 09/10/2026.',
      ),
    ).toBeInTheDocument();
  });

  it('con la autorización vigente cotiza con el clienteId de la sesión (CA3, CA4)', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'AUTORIZADA' });
    await llenarCredito(usuario);

    await usuario.click(screen.getByRole('button', { name: 'Calcular cotización' }));
    const peticion = http.expectOne(URL_COTIZAR);
    expect(peticion.request.body).toEqual({
      ramo: 'VIDA_HIPOTECARIO',
      datosBien: DATOS_BIEN,
      clienteId: CLIENTE_ID,
    });
    peticion.flush(cotizacion());

    const panel = within(await screen.findByRole('region', { name: 'Prima estimada' }));
    expect(panel.getByText('$ 148.500')).toBeInTheDocument();
    expect(panel.queryByText(/Calculada sin/)).not.toBeInTheDocument();

    // SOLVENTAG5-49: «Ver la oferta» abre la oferta de esta cotización en el Portal Clientes.
    const navegar = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await usuario.click(panel.getByRole('button', { name: 'Ver la oferta' }));
    expect(navegar).toHaveBeenCalledWith('/cliente/cotizar/oferta/c-1');
  });

  it.each(['SIN_SOLICITAR', 'ESPERANDO_CLIENTE', 'REVOCADA', 'VENCIDA'])(
    'sin autorización vigente (%s) igual calcula, y el panel avisa que fue sin perfil',
    async (estado) => {
      const { http, usuario } = await renderizar();
      http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado });

      expect(
        await screen.findByText(
          'No tienes una autorización vigente: calcularemos la prima sin tu perfil de riesgo.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pedir autorización' })).not.toBeInTheDocument();
      await llenarCredito(usuario);
      expect(screen.getByRole('button', { name: 'Calcular cotización' })).toBeEnabled();

      await usuario.click(screen.getByRole('button', { name: 'Calcular cotización' }));
      http
        .expectOne(URL_COTIZAR)
        .flush(cotizacion({ calculadaSinPerfil: true, motivoSinPerfil: 'SIN_CONSENTIMIENTO' }));

      expect(
        await screen.findByText(
          'Calculada sin tu perfil de riesgo porque no tienes una autorización vigente.',
        ),
      ).toBeInTheDocument();
    },
  );

  it('si no se puede consultar la autorización, igual calcula y permite reintentar la consulta', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_ESTADO).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByText(/No pudimos consultar tu autorización/)).toBeInTheDocument();
    await llenarCredito(usuario);
    expect(screen.getByRole('button', { name: 'Calcular cotización' })).toBeEnabled();

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Consultando tu autorización…')).toBeInTheDocument();
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'AUTORIZADA' });

    expect(
      await screen.findByText(
        'Tu autorización para consultar tus datos de Open Finance y Open Data está vigente.',
      ),
    ).toBeInTheDocument();
  });

  it('si el servicio de cotización falla, conserva los datos y permite reintentar (CA5)', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'AUTORIZADA' });
    await llenarCredito(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Calcular cotización' }));
    http.expectOne(URL_COTIZAR).flush(null, { status: 503, statusText: '' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos calcular la cotización.',
    );
    expect(campo('Plazo (años)')).toHaveValue('15');

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    http.expectOne(URL_COTIZAR).flush(cotizacion());

    expect(await screen.findByText('$ 148.500')).toBeInTheDocument();
  });

  it('una sesión sin clienteId no consulta la autorización y cotiza sin cliente', async () => {
    // No pasa con un cliente registrado: la sesión del rol CLIENTE trae su clienteId (D11).
    const { http, usuario } = await renderizar({ usuario: SESION.usuario, rol: 'CLIENTE' });

    http.expectNone(URL_ESTADO);
    expect(campo('Nombre completo')).toHaveValue('');
    expect(
      screen.getByText(
        'No tienes una autorización vigente: calcularemos la prima sin tu perfil de riesgo.',
      ),
    ).toBeInTheDocument();
    await llenarCredito(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Calcular cotización' }));

    const peticion = http.expectOne(URL_COTIZAR);
    expect(peticion.request.body).toEqual({ ramo: 'VIDA_HIPOTECARIO', datosBien: DATOS_BIEN });
    peticion.flush(cotizacion({ calculadaSinPerfil: true, motivoSinPerfil: 'SIN_CLIENTE' }));
  });

  it('el documento vacío si la sesión no trae el enmascarado', async () => {
    const { http } = await renderizar({ ...SESION, documentoEnmascarado: undefined });
    http.expectOne(URL_ESTADO).flush({ clienteId: CLIENTE_ID, estado: 'AUTORIZADA' });

    expect(campo('Documento de identidad')).toHaveValue('');
    expect(campo('Nombre completo')).toHaveValue('Laura Gómez Pardo');
  });
});
