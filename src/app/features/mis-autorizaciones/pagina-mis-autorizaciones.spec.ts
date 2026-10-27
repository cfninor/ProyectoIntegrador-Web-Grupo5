import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { provideSesionSimulada } from '../../core/sesion/sesion-simulada';
import { Consentimiento } from '../autorizacion-datos/modelos';
import { PaginaMisAutorizaciones } from './pagina-mis-autorizaciones';

const BFF = 'http://bff.prueba';
const CLIENTE_ID = '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e';
const URL_CONSENTIMIENTOS = `${BFF}/v1/clientes/${CLIENTE_ID}/consentimientos`;
const SESION_CLIENTE = {
  usuario: { id: 'cliente-local', nombre: 'Laura Gómez Pardo' },
  rol: 'CLIENTE',
  clienteId: CLIENTE_ID,
  documentoEnmascarado: 'CC ••••5678',
};
const FINALIDAD =
  'Para calcular tu perfil de riesgo y el precio personalizado de tu seguro de vida hipotecario';

const VIGENTE: Consentimiento = {
  consentimientoId: '7c6e5d4b-3a2f-4e1d-9c8b-0a1f2e3d4c5b',
  estado: 'VIGENTE',
  alcance: ['COMPORTAMIENTO_PAGO', 'ESTABILIDAD_INGRESOS', 'INMUEBLE_UBICACION'],
  finalidad: 'PERFILAMIENTO_VIDA_HIPOTECARIO',
  destinatario: 'SOLVENTA',
  versionCatalogo: 'v1',
  versionPolitica: 'v1',
  fechaOtorga: '2026-10-09T15:02:11Z',
  fechaVencimiento: '2027-10-09T15:02:11Z',
};
const REVOCADO: Consentimiento = {
  ...VIGENTE,
  consentimientoId: '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b',
  estado: 'REVOCADO',
  fechaOtorga: '2026-03-02T14:00:00Z',
  fechaVencimiento: '2027-03-02T14:00:00Z',
  fechaRevoca: '2026-06-15T16:30:00Z',
};

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(sesion: object | null = SESION_CLIENTE) {
  await render(PaginaMisAutorizaciones, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF, sesionSimulada: sesion } },
      provideSesionSimulada(),
      { provide: LOCALE_ID, useValue: 'es-CO' },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { http, usuario: userEvent.setup() };
}

async function cargar(consentimientos: Consentimiento[]) {
  const contexto = await renderizar();
  contexto.http.expectOne(URL_CONSENTIMIENTOS).flush({ clienteId: CLIENTE_ID, consentimientos });
  await screen.findByRole('region', { name: 'Vigentes' });
  return contexto;
}

const vigentes = () => within(screen.getByRole('region', { name: 'Vigentes' }));
const historial = () => within(screen.getByRole('region', { name: 'Revocadas y vencidas' }));
const VENCIDO: Consentimiento = {
  ...VIGENTE,
  consentimientoId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  estado: 'VENCIDO',
  fechaOtorga: '2025-01-20T13:00:00Z',
  fechaVencimiento: '2026-01-20T13:00:00Z',
};

describe('PaginaMisAutorizaciones · SOLVENTAG5-84', () => {
  it('consulta los consentimientos del cliente de la sesión mientras muestra que carga', async () => {
    const { http } = await renderizar();

    expect(screen.getByText('Cargando tus autorizaciones…')).toBeInTheDocument();
    const peticion = http.expectOne(URL_CONSENTIMIENTOS);
    expect(peticion.request.method).toBe('GET');
    peticion.flush({ clienteId: CLIENTE_ID, consentimientos: [VIGENTE] });

    await screen.findByRole('region', { name: 'Vigentes' });
    expect(screen.queryByText('Cargando tus autorizaciones…')).not.toBeInTheDocument();
  });

  it('CA1: cada vigente dice qué datos cubre, a quién autoriza y sus fechas', async () => {
    await cargar([VIGENTE]);

    const tarjeta = within(vigentes().getByRole('article', { name: FINALIDAD }));
    expect(tarjeta.getByRole('heading', { name: FINALIDAD })).toBeInTheDocument();
    expect(tarjeta.getByText('Vigente')).toBeInTheDocument();
    expect(tarjeta.getByText('A quién autorizas').nextElementSibling).toHaveTextContent('Solventa');
    expect(tarjeta.getByText('Otorgada el').nextElementSibling).toHaveTextContent('09/10/2026');
    expect(tarjeta.getByText('Vence el').nextElementSibling).toHaveTextContent('09/10/2027');
    expect(tarjeta.getAllByRole('listitem').map((dato) => dato.textContent?.trim())).toEqual([
      'Comportamiento de pago y endeudamiento',
      'Estabilidad de ingresos',
      'Datos del inmueble y su ubicación',
    ]);
  });

  it('en «Vigentes» solo van los vigentes', async () => {
    await cargar([VIGENTE, REVOCADO]);

    expect(vigentes().getAllByRole('article')).toHaveLength(1);
    expect(vigentes().getByText('Otorgada el').nextElementSibling).toHaveTextContent('09/10/2026');
  });

  it('CA2: los revocados y los vencidos van aparte, cada uno con su estado y su fecha', async () => {
    await cargar([VIGENTE, REVOCADO, VENCIDO]);

    const [revocado, vencido] = historial().getAllByRole('article');
    expect(within(revocado).getByText('Revocada')).toHaveClass('chip');
    expect(within(revocado).getByText('Otorgada el').nextElementSibling).toHaveTextContent(
      '02/03/2026',
    );
    expect(within(revocado).getByText('Revocada el').nextElementSibling).toHaveTextContent(
      '15/06/2026',
    );
    expect(within(revocado).queryByText('Venció el')).not.toBeInTheDocument();
    expect(within(vencido).getByText('Vencida')).toHaveClass('chip');
    expect(within(vencido).getByText('Venció el').nextElementSibling).toHaveTextContent(
      '20/01/2026',
    );
    expect(within(vencido).queryByText('Revocada el')).not.toBeInTheDocument();
    expect(within(vencido).getAllByRole('listitem')).toHaveLength(3);
    expect(vigentes().queryByText('Revocada')).not.toBeInTheDocument();
  });

  it('CA2: sin vigentes lo dice y muestra el historial', async () => {
    await cargar([REVOCADO]);

    expect(
      vigentes().getByText(
        'No tienes autorizaciones vigentes: Solventa no está consultando tus datos.',
      ),
    ).toBeInTheDocument();
    expect(historial().getAllByRole('article')).toHaveLength(1);
  });

  it('CA2: sin revocados ni vencidos no muestra el historial', async () => {
    await cargar([VIGENTE]);

    expect(screen.queryByRole('region', { name: 'Revocadas y vencidas' })).not.toBeInTheDocument();
  });

  it('las fechas van en hora de Bogotá: lo otorgado a las 2 a. m. UTC es del día anterior', async () => {
    await cargar([{ ...VIGENTE, fechaOtorga: '2026-10-10T02:00:00Z' }]);

    expect(vigentes().getByText('Otorgada el').nextElementSibling).toHaveTextContent('09/10/2026');
  });

  it('muestra un dato de un catálogo que esta versión no conoce con su código', async () => {
    await cargar([{ ...VIGENTE, alcance: ['DATO_NUEVO' as never] }]);

    expect(vigentes().getByText('DATO_NUEVO')).toBeInTheDocument();
  });

  it('si la consulta falla lo dice y deja reintentar', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_CONSENTIMIENTOS).flush(null, { status: 503, statusText: 'No disponible' });

    expect(
      await screen.findByText('No pudimos cargar tus autorizaciones. Intenta de nuevo.'),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    http
      .expectOne(URL_CONSENTIMIENTOS)
      .flush({ clienteId: CLIENTE_ID, consentimientos: [VIGENTE] });

    expect(await screen.findByRole('article', { name: FINALIDAD })).toBeInTheDocument();
  });

  it('sin clienteId en la sesión no consulta y pide terminar el registro', async () => {
    await renderizar({ ...SESION_CLIENTE, clienteId: undefined });

    expect(
      screen.getByText(/Tu cuenta todavía no tiene un cliente registrado/),
    ).toBeInTheDocument();
  });
});
