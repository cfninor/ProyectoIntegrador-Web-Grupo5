import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import {
  BANDEJA,
  ILEGIBLE,
  MONTO_ALTO,
  NO_VERIFICABLE,
  SIN_PERFIL,
  VACIA,
} from '../../../testing/fixtures-bandeja';
import { APP_CONFIG } from '../../core/config/app-config';
import { BandejaRevision } from './modelos';
import { PaginaBandeja, RUTA_BANDEJA, paginaDe } from './pagina-bandeja';

const BFF = 'http://bff.prueba';
const URL_BANDEJA = `${BFF}/v1/solicitudes-suscripcion/en-revision`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(pagina?: string) {
  const ruta = { queryParamMap: of(convertToParamMap(pagina === undefined ? {} : { pagina })) };
  const vista = await render(PaginaBandeja, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: ruta },
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
      { provide: LOCALE_ID, useValue: 'es-CO' },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { vista, http, usuario: userEvent.setup() };
}

function peticion(controlador: HttpTestingController, pagina = 1) {
  return controlador.expectOne(
    (r) =>
      r.url === URL_BANDEJA &&
      r.params.get('pagina') === String(pagina) &&
      r.params.get('tamano') === '20',
  );
}

async function cargar(bandeja: BandejaRevision, pagina?: string) {
  const contexto = await renderizar(pagina);
  peticion(contexto.http, bandeja.pagina).flush(bandeja);
  await contexto.vista.fixture.whenStable();
  return contexto;
}

const tabla = () => within(screen.getByRole('table'));
const filas = () => tabla().getAllByRole('row').slice(1);

describe('PaginaBandeja · SOLVENTAG5-52', () => {
  it('pide la primera página con el tamaño del contrato', async () => {
    const { http } = await renderizar();

    const consulta = peticion(http);
    expect(consulta.request.method).toBe('GET');
    expect(screen.getByText('Cargando la bandeja…')).toBeInTheDocument();
    consulta.flush(VACIA);
  });

  it('muestra el total de pendientes y una fila por solicitud, en el orden de la respuesta', async () => {
    await cargar(BANDEJA);

    const indicador = screen.getByText('Pendientes de revisión').parentElement as HTMLElement;
    expect(within(indicador).getByText('2')).toBeInTheDocument();
    expect(filas()).toHaveLength(2);
    expect(within(filas()[0]).getByText('9f1b3d5e')).toHaveAttribute(
      'title',
      SIN_PERFIL.solicitudId,
    );
    expect(within(filas()[1]).getByText('4c6e8a0b')).toBeInTheDocument();
  });

  it('cada fila trae el cliente, el producto con la suma asegurada y cuándo entró a revisión', async () => {
    await cargar(BANDEJA);

    const fila = within(filas()[1]);
    expect(fila.getByText('Carlos Andrés Peña Ruiz')).toBeInTheDocument();
    expect(fila.getByText('CC ••••5120')).toBeInTheDocument();
    expect(fila.getByText('Vida hipotecario')).toBeInTheDocument();
    expect(fila.getByText('$ 950.000.000')).toBeInTheDocument();
    // 14:05 UTC son las 09:05 en Bogotá.
    expect(fila.getByText('15/10/2026')).toBeInTheDocument();
    expect(fila.getByText('09:05')).toBeInTheDocument();
  });

  it('el motivo es la regla sin resolver con el valor del cliente y su límite', async () => {
    await cargar(BANDEJA);

    expect(
      within(filas()[1]).getByText('Suma asegurada: $ 950.000.000 (límite: Máximo $ 800.000.000)'),
    ).toBeInTheDocument();
    expect(
      within(filas()[0]).getByText(
        'Perfil de riesgo: Sin perfil: el perfil no estuvo disponible a tiempo (límite: Con perfil de riesgo)',
      ),
    ).toBeInTheDocument();
  });

  it('sin reglas sin resolver muestra el motivo general', async () => {
    await cargar({ ...BANDEJA, solicitudes: [NO_VERIFICABLE], total: 1 });

    expect(
      within(filas()[0]).getByText(/El registro de la evaluación no se pudo verificar al decidir/),
    ).toBeInTheDocument();
  });

  it('con un registro ilegible avisa que no se pudo leer el motivo y que no está verificado', async () => {
    await cargar({ ...BANDEJA, solicitudes: [ILEGIBLE], total: 1 });

    const fila = within(filas()[0]);
    expect(
      fila.getByText('No pudimos leer el motivo en el registro de la decisión.'),
    ).toBeInTheDocument();
    expect(fila.getByText('Registro sin verificar')).toBeInTheDocument();
    expect(fila.getByText('Sin cliente identificado')).toBeInTheDocument();
  });

  it('una solicitud con los registros verificados no lleva el aviso', async () => {
    await cargar(BANDEJA);

    expect(tabla().queryByText('Registro sin verificar')).not.toBeInTheDocument();
  });

  it('cada fila enlaza el perfil de riesgo de su solicitud', async () => {
    await cargar(BANDEJA);

    expect(
      screen.getByRole('link', { name: 'Ver el perfil de riesgo de la solicitud 4c6e8a0b' }),
    ).toHaveAttribute('href', `/riesgo/perfil-riesgo/${MONTO_ALTO.solicitudId}`);
  });

  it('la bandeja vacía lo dice, sin tabla', async () => {
    await cargar(VACIA);

    expect(
      screen.getByText('No hay solicitudes esperando la revisión de un analista.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('siempre avisa que una solicitud de la bandeja no avanza a cobro ni a emisión', async () => {
    await cargar(VACIA);

    expect(
      screen.getByText(/no avanza a cobro ni a emisión hasta que se registre/),
    ).toBeInTheDocument();
  });

  it('si el BFF falla, permite reintentar', async () => {
    const { http, usuario } = await renderizar();
    peticion(http).flush(
      { codigo: 'NUCLEO_NO_DISPONIBLE', detalle: 'x' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(
      await screen.findByText('No pudimos cargar la bandeja. Intenta de nuevo.'),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    peticion(http).flush(BANDEJA);
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  describe('páginas', () => {
    const veintiuna: BandejaRevision = { ...BANDEJA, total: 21 };

    it('dice qué solicitudes muestra y de cuántas', async () => {
      await cargar(veintiuna);

      expect(screen.getByText('Mostrando 1–2 de 21 solicitudes')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    });

    it('«Siguiente» lleva a la página 2 en la ruta', async () => {
      const { usuario } = await cargar(veintiuna);
      const navegar = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      await usuario.click(screen.getByRole('button', { name: 'Siguiente' }));

      expect(navegar).toHaveBeenCalledWith([RUTA_BANDEJA], { queryParams: { pagina: 2 } });
    });

    it('en la última página, «Anterior» vuelve a la primera sin parámetro', async () => {
      const ultima: BandejaRevision = { ...veintiuna, solicitudes: [MONTO_ALTO], pagina: 2 };
      const { usuario } = await cargar(ultima, '2');
      const navegar = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(screen.getByText('Mostrando 21–21 de 21 solicitudes')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
      await usuario.click(screen.getByRole('button', { name: 'Anterior' }));

      expect(navegar).toHaveBeenCalledWith([RUTA_BANDEJA], { queryParams: { pagina: null } });
    });

    it('pasada la última página ofrece volver a la primera', async () => {
      const { usuario } = await cargar({ ...BANDEJA, solicitudes: [], pagina: 5 }, '5');
      const navegar = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(screen.getByText('Esta página no tiene solicitudes.')).toBeInTheDocument();
      await usuario.click(screen.getByRole('button', { name: 'Ir a la primera página' }));

      expect(navegar).toHaveBeenCalledWith([RUTA_BANDEJA], { queryParams: { pagina: null } });
    });

    it.each([
      [undefined, 1],
      ['3', 3],
      ['0', 1],
      ['-2', 1],
      ['dos', 1],
      ['1.5', 1],
    ])('la página %p de la ruta se pide como %p', (valor, pagina) => {
      expect(paginaDe(valor)).toBe(pagina);
    });
  });
});
