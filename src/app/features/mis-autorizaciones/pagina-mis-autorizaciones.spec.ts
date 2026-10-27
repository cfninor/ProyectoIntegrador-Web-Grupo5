import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor, within } from '@testing-library/angular';
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
const URL_REVOCAR = `${BFF}/v1/consentimientos/${VIGENTE.consentimientoId}/revocacion`;
const REVOCADO_AHORA: Consentimiento = {
  ...VIGENTE,
  estado: 'REVOCADO',
  fechaRevoca: '2026-10-27T15:00:00Z',
};
const PREGUNTA = '¿Revocar esta autorización?';
const confirmacion = () => within(screen.getByRole('group', { name: PREGUNTA }));
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

  describe('CA3: revocar un vigente', () => {
    it('cada vigente tiene su botón y los del historial no', async () => {
      await cargar([VIGENTE, REVOCADO]);

      expect(vigentes().getByRole('button', { name: 'Revocar autorización' })).toBeInTheDocument();
      expect(historial().queryByRole('button')).not.toBeInTheDocument();
    });

    it('pide confirmación antes de revocar y pasa el foco a la pregunta', async () => {
      const { http, usuario } = await cargar([VIGENTE]);

      await usuario.click(screen.getByRole('button', { name: 'Revocar autorización' }));

      expect(
        confirmacion().getByText(/Solventa dejará de consultar tus datos/),
      ).toBeInTheDocument();
      expect(await screen.findByText(PREGUNTA)).toHaveFocus();
      expect(
        screen.queryByRole('button', { name: 'Revocar autorización' }),
      ).not.toBeInTheDocument();
      http.expectNone(URL_REVOCAR);
    });

    it('cancelar cierra la confirmación sin revocar y devuelve el foco al botón', async () => {
      const { http, usuario } = await cargar([VIGENTE]);
      await usuario.click(screen.getByRole('button', { name: 'Revocar autorización' }));

      await usuario.click(confirmacion().getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('group', { name: PREGUNTA })).not.toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Revocar autorización' })).toHaveFocus();
      http.expectNone(URL_REVOCAR);
    });

    it('al confirmar revoca, pasa el consentimiento al historial y lo avisa', async () => {
      const { http, usuario } = await cargar([VIGENTE]);
      await usuario.click(screen.getByRole('button', { name: 'Revocar autorización' }));

      await usuario.click(confirmacion().getByRole('button', { name: 'Sí, revocar' }));
      expect(confirmacion().getByRole('button', { name: 'Revocando…' })).toBeDisabled();
      expect(confirmacion().getByRole('button', { name: 'Cancelar' })).toBeDisabled();
      const peticion = http.expectOne(URL_REVOCAR);
      expect(peticion.request.method).toBe('POST');
      peticion.flush(REVOCADO_AHORA);

      expect(await screen.findByRole('status')).toHaveTextContent('Revocaste la autorización.');
      expect(
        vigentes().getByText(
          'No tienes autorizaciones vigentes: Solventa no está consultando tus datos.',
        ),
      ).toBeInTheDocument();
      expect(historial().getByText('Revocada el').nextElementSibling).toHaveTextContent(
        '27/10/2026',
      );
      // CA4: después de revocar se vuelve a consultar.
      http.expectOne(URL_CONSENTIMIENTOS).flush({
        clienteId: CLIENTE_ID,
        consentimientos: [REVOCADO_AHORA],
      });
    });

    it('si falla lo dice y deja reintentar', async () => {
      const { http, usuario } = await cargar([VIGENTE]);
      await usuario.click(screen.getByRole('button', { name: 'Revocar autorización' }));
      await usuario.click(confirmacion().getByRole('button', { name: 'Sí, revocar' }));

      http.expectOne(URL_REVOCAR).flush(null, { status: 503, statusText: 'No disponible' });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No pudimos revocar la autorización. Intenta de nuevo.',
      );
      await usuario.click(confirmacion().getByRole('button', { name: 'Sí, revocar' }));
      http.expectOne(URL_REVOCAR).flush(REVOCADO_AHORA);
      expect(await screen.findByRole('status')).toHaveTextContent('Revocaste la autorización.');
      http.expectOne(URL_CONSENTIMIENTOS).flush({
        clienteId: CLIENTE_ID,
        consentimientos: [REVOCADO_AHORA],
      });
    });

    it('con 404 lo dice y no deja reintentar', async () => {
      const { http, usuario } = await cargar([VIGENTE]);
      await usuario.click(screen.getByRole('button', { name: 'Revocar autorización' }));
      await usuario.click(confirmacion().getByRole('button', { name: 'Sí, revocar' }));

      http
        .expectOne(URL_REVOCAR)
        .flush({ codigo: 'X', detalle: 'x' }, { status: 404, statusText: '' });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No encontramos esta autorización.',
      );
      expect(confirmacion().queryByRole('button', { name: 'Sí, revocar' })).not.toBeInTheDocument();
      expect(confirmacion().getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    });

    it('solo confirma un consentimiento a la vez', async () => {
      const otro = { ...VIGENTE, consentimientoId: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f' };
      const { usuario } = await cargar([VIGENTE, otro]);
      const [primero, segundo] = screen.getAllByRole('button', { name: 'Revocar autorización' });

      await usuario.click(primero);
      await usuario.click(segundo);

      expect(screen.getAllByRole('group', { name: PREGUNTA })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Revocar autorización' })).toHaveLength(1);
    });
  });

  describe('CA4: tras revocar, la consulta refleja el nuevo estado', () => {
    async function revocar(respuesta: { status: number; cuerpo: unknown }) {
      const contexto = await cargar([VIGENTE]);
      await contexto.usuario.click(screen.getByRole('button', { name: 'Revocar autorización' }));
      await contexto.usuario.click(confirmacion().getByRole('button', { name: 'Sí, revocar' }));
      contexto.http
        .expectOne(URL_REVOCAR)
        .flush(respuesta.cuerpo, { status: respuesta.status, statusText: '' });
      return contexto;
    }

    it('vuelve a consultar y muestra lo que responde el BFF, con el aviso de los 5 minutos', async () => {
      const { http } = await revocar({ status: 200, cuerpo: REVOCADO_AHORA });

      const aviso = await screen.findByRole('status');
      expect(aviso).toHaveTextContent(
        'Revocaste la autorización. Dejamos de consultar tus datos en máximo 5 minutos y tus pólizas vigentes siguen activas.',
      );
      await waitFor(() => expect(aviso).toHaveFocus());
      const consulta = http.expectOne(URL_CONSENTIMIENTOS);
      expect(consulta.request.method).toBe('GET');
      consulta.flush({
        clienteId: CLIENTE_ID,
        consentimientos: [{ ...REVOCADO_AHORA, fechaRevoca: '2026-10-27T15:00:05Z' }, REVOCADO],
      });

      await waitFor(() => expect(screen.getAllByText('Revocada el')).toHaveLength(2));
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('si la nueva consulta falla deja la lista con el revocado y el aviso', async () => {
      const { http } = await revocar({ status: 200, cuerpo: REVOCADO_AHORA });
      await screen.findByRole('status');

      http.expectOne(URL_CONSENTIMIENTOS).flush(null, { status: 503, statusText: '' });

      expect(screen.getByRole('status')).toHaveTextContent('Revocaste la autorización.');
      expect(historial().getByText('Revocada el')).toBeInTheDocument();
      expect(
        screen.queryByText('No pudimos cargar tus autorizaciones. Intenta de nuevo.'),
      ).not.toBeInTheDocument();
    });

    it('con 409 (ya no estaba vigente) lo avisa y actualiza la lista con su estado real', async () => {
      const { http } = await revocar({
        status: 409,
        cuerpo: { codigo: 'CONSENTIMIENTO_NO_VIGENTE', detalle: 'x' },
      });

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Esa autorización ya no estaba vigente. Actualizamos la lista con su estado.',
      );
      http.expectOne(URL_CONSENTIMIENTOS).flush({
        clienteId: CLIENTE_ID,
        consentimientos: [{ ...VIGENTE, estado: 'VENCIDO' }],
      });

      expect(await screen.findByText('Venció el')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: PREGUNTA })).not.toBeInTheDocument();
    });

    it('abrir otra confirmación quita el aviso', async () => {
      const otro = { ...VIGENTE, consentimientoId: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f' };
      const { http, usuario } = await cargar([VIGENTE, otro]);
      await usuario.click(screen.getAllByRole('button', { name: 'Revocar autorización' })[0]);
      await usuario.click(confirmacion().getByRole('button', { name: 'Sí, revocar' }));
      http.expectOne(URL_REVOCAR).flush(REVOCADO_AHORA);
      await screen.findByRole('status');
      http
        .expectOne(URL_CONSENTIMIENTOS)
        .flush({ clienteId: CLIENTE_ID, consentimientos: [otro, REVOCADO_AHORA] });

      await usuario.click(await screen.findByRole('button', { name: 'Revocar autorización' }));

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('CA5: sin consentimientos', () => {
    async function cargarVacia() {
      const contexto = await renderizar();
      contexto.http
        .expectOne(URL_CONSENTIMIENTOS)
        .flush({ clienteId: CLIENTE_ID, consentimientos: [] });
      await screen.findByRole('region', { name: 'Todavía no has dado ninguna autorización' });
      return contexto;
    }

    it('muestra un estado vacío que explica cómo se autoriza, no un error', async () => {
      await cargarVacia();

      const vacio = within(
        screen.getByRole('region', { name: 'Todavía no has dado ninguna autorización' }),
      );
      expect(vacio.getByText(/te llegará un enlace por correo/)).toBeInTheDocument();
      expect(vacio.getByText(/la prima se calcula sin tu perfil de riesgo/)).toBeInTheDocument();
      expect(vacio.getByRole('link', { name: 'Cotizar un seguro' })).toHaveAttribute(
        'href',
        '/cliente/cotizar',
      );
      expect(screen.queryByRole('region', { name: 'Vigentes' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Revocadas y vencidas' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('No pudimos cargar tus autorizaciones. Intenta de nuevo.'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('con solo revocados o vencidos no es el estado vacío', async () => {
      await cargar([REVOCADO]);

      expect(
        screen.queryByRole('region', { name: 'Todavía no has dado ninguna autorización' }),
      ).not.toBeInTheDocument();
    });
  });
});
