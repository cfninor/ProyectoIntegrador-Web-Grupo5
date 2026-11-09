import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import {
  CON_AVISOS,
  EN_REVISION,
  ILEGIBLE,
  PENDIENTE,
  PERFIL_NO_COINCIDE,
  SIN_PERFIL,
  YA_DECIDIDA,
} from '../../../testing/fixtures-revision';
import { APP_CONFIG } from '../../core/config/app-config';
import { RevisionSolicitud } from './modelos';
import { PaginaRevision } from './pagina-revision';

const BFF = 'http://bff.prueba';
const urlRevision = (id: string) => `${BFF}/v1/solicitudes-suscripcion/${id}/revision`;

let http: HttpTestingController | undefined;

afterEach(() => {
  http?.verify();
  http = undefined;
});

async function renderizar(solicitudId: string = EN_REVISION.solicitudId) {
  const vista = await render(PaginaRevision, {
    inputs: { solicitudId },
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

async function cargar(revision: RevisionSolicitud) {
  const contexto = await renderizar(revision.solicitudId);
  contexto.http.expectOne(urlRevision(revision.solicitudId)).flush(revision);
  await contexto.vista.fixture.whenStable();
  return contexto;
}

/** El valor de un dato de la solicitud, por su etiqueta. */
function dato(etiqueta: string): HTMLElement {
  const termino = screen.getByText(etiqueta, { selector: 'dt' });
  return termino.nextElementSibling as HTMLElement;
}

const tablaReglas = () => within(screen.getByRole('table'));
const filaDe = (regla: string) =>
  screen.getByRole('rowheader', { name: regla }).closest('tr') as HTMLElement;

describe('PaginaRevision · SOLVENTAG5-53', () => {
  it('pide el detalle de la solicitud de la ruta, solo con GET', async () => {
    const { http } = await renderizar();

    const consulta = http.expectOne(urlRevision(EN_REVISION.solicitudId));
    expect(consulta.request.method).toBe('GET');
    expect(screen.getByText('Cargando la solicitud…')).toBeInTheDocument();
    consulta.flush(EN_REVISION);
  });

  it('muestra la solicitud con su cliente y su estado', async () => {
    await cargar(EN_REVISION);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Solicitud 4c6e8a0b · Carlos Andrés Peña Ruiz',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('4c6e8a0b')).toHaveAttribute('title', EN_REVISION.solicitudId);
    expect(screen.getByText('CC ••••5120')).toBeInTheDocument();
    expect(screen.getByText('En revisión')).toHaveClass('chip-ambar');
  });

  it('muestra los datos de la solicitud y quién la cotizó, sin el nombre', async () => {
    await cargar(EN_REVISION);

    expect(dato('Producto')).toHaveTextContent('Vida hipotecario');
    expect(dato('Suma asegurada')).toHaveTextContent('$ 950.000.000');
    expect(dato('Plazo')).toHaveTextContent('20 años');
    expect(dato('Prima ofertada')).toHaveTextContent('$ 231.900 / mes');
    expect(dato('Cotizada por')).toHaveTextContent('Un asesor');
    expect(dato('Cotizada por')).toHaveTextContent('Usuario 3f6a9c2e');
    expect(dato('Canal')).toHaveTextContent('Portal web');
    expect(dato('Oferta aceptada')).toHaveTextContent('15/10/2026');
    expect(dato('Oferta aceptada')).toHaveTextContent('09:05');
    expect(screen.queryByText(/Edad/)).not.toBeInTheDocument();
  });

  it('muestra las reglas con su versión, su límite, el valor del cliente y su resultado', async () => {
    await cargar(EN_REVISION);

    expect(
      screen.getByRole('heading', {
        name: 'Reglas evaluadas · versión VIDA_HIPOTECARIO.SUSCRIPCION.v1',
      }),
    ).toBeInTheDocument();
    expect(tablaReglas().getAllByRole('row')).toHaveLength(7);
    const suma = within(filaDe('Suma asegurada'));
    expect(suma.getByText('Máximo $ 800.000.000')).toBeInTheDocument();
    expect(suma.getByText('$ 950.000.000')).toBeInTheDocument();
    const puntaje = within(filaDe('Puntaje de riesgo'));
    expect(puntaje.getByText('Mínimo 450')).toBeInTheDocument();
    expect(puntaje.getByText('684')).toBeInTheDocument();
    expect(puntaje.getByText('Cumple')).toHaveClass('chip-verde');
  });

  it('marca «Sin resolver» solo la regla que mandó la solicitud a revisión', async () => {
    await cargar(EN_REVISION);

    expect(tablaReglas().getAllByText('Sin resolver')).toHaveLength(1);
    const suma = filaDe('Suma asegurada');
    expect(suma).toHaveClass('sin-resolver');
    expect(within(suma).getByText('Sin resolver')).toHaveClass('chip-ambar');
    expect(filaDe('Perfil de riesgo')).not.toHaveClass('sin-resolver');
  });

  it('explica el motivo de la revisión con la regla sin resolver', async () => {
    await cargar(EN_REVISION);

    expect(screen.getByText('Motivo de la revisión')).toBeInTheDocument();
    expect(
      screen.getByText('Necesita la revisión de un suscriptor por: Suma asegurada.'),
    ).toBeInTheDocument();
  });

  it('muestra las señales del perfil con su fecha, vigente al aceptar', async () => {
    await cargar(EN_REVISION);

    expect(screen.getByText('Perfil vigente · 15/10/2026 08:14')).toHaveClass('chip-verde-azulado');
    expect(dato('Score')).toHaveTextContent('684 de 850');
    expect(dato('Nivel')).toHaveTextContent('Riesgo medio');
    expect(dato('Versión del perfil')).toHaveTextContent('2');
    expect(dato('Vigente hasta')).toHaveTextContent('16/10/2026');
    const senales = screen.getAllByRole('listitem');
    expect(senales).toHaveLength(4);
    expect(senales[0]).toHaveTextContent('Comportamiento de pago');
    expect(senales[0]).toHaveTextContent('Muy bueno (72 de 100)');
    expect(senales[3]).toHaveTextContent('Endeudamiento actual');
    expect(senales[3]).toHaveTextContent('Medio (41 de 100)');
    expect(screen.queryByText(/desactualizado/)).not.toBeInTheDocument();
  });

  it('una solicitud en revisión con todo verificado no lleva avisos', async () => {
    await cargar(EN_REVISION);

    expect(screen.queryByText(/no se pudo verificar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no está en revisión/)).not.toBeInTheDocument();
  });

  it('sin perfil explica por qué y marca sin resolver la regla del perfil', async () => {
    await cargar(SIN_PERFIL);

    expect(screen.getByText('Valor por defecto')).toHaveClass('chip-gris');
    expect(
      screen.getByText(
        'Se cotizó sin perfil de riesgo porque el perfil no estuvo disponible a tiempo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(within(filaDe('Perfil de riesgo')).getByText('Sin resolver')).toBeInTheDocument();
    expect(dato('Cotizada por')).toHaveTextContent('El mismo cliente');
  });

  it('avisa de un registro que no se pudo verificar y de un perfil desactualizado', async () => {
    await cargar(CON_AVISOS);

    expect(
      screen.getByText(/Un registro de esta solicitud no se pudo verificar/),
    ).toBeInTheDocument();
    expect(screen.getByText('Perfil desactualizado · 17/10/2026 04:12')).toHaveClass('chip-ambar');
    expect(
      screen.getByText(/El perfil venció el 18\/10\/2026, antes de que el cliente aceptara/),
    ).toBeInTheDocument();
    // Lo guardado se muestra igual, sin corregirlo.
    expect(within(filaDe('Endeudamiento actual')).getByText('Sin resolver')).toBeInTheDocument();
  });

  it('cotizada sin usuario lo dice, con el canal', async () => {
    await cargar(CON_AVISOS);

    expect(dato('Cotizada por')).toHaveTextContent('No registrado');
    expect(dato('Canal')).toHaveTextContent('App móvil');
  });

  it('una solicitud que ya no está en revisión muestra su resultado y no ofrece revisarla', async () => {
    await cargar(YA_DECIDIDA);

    expect(screen.getByText('Rechazada', { selector: '.chip' })).toHaveClass('chip-rojo');
    expect(
      screen.getByText(
        'Esta solicitud no está en revisión: su estado es Rechazada. No hay nada que revisar.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Resultado de la decisión automática')).toBeInTheDocument();
    expect(
      screen.getByText('No cumple una regla de rechazo: Puntaje de riesgo.'),
    ).toBeInTheDocument();
    expect(tablaReglas().queryByText('Sin resolver')).not.toBeInTheDocument();
    expect(within(filaDe('Puntaje de riesgo')).getByText('No cumple')).toHaveClass('chip-rojo');
  });

  it('un perfil que no coincide se indica sin mostrar señales', async () => {
    await cargar(PERFIL_NO_COINCIDE);

    expect(
      screen.getByText(/El perfil guardado en la cotización no coincide con el de la solicitud/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByText(/Perfil vigente/)).not.toBeInTheDocument();
  });

  it('un registro de la decisión ilegible no inventa reglas', async () => {
    await cargar(ILEGIBLE);

    expect(
      screen.getByText('No pudimos leer las reglas en el registro de la decisión.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reglas evaluadas' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Motivo de la revisión')).not.toBeInTheDocument();
    expect(screen.getByText(/no se pudo verificar/)).toBeInTheDocument();
  });

  it('una solicitud sin evaluar lo dice', async () => {
    await cargar(PENDIENTE);

    expect(screen.getByText('Pendiente de evaluación', { selector: '.chip' })).toHaveClass(
      'chip-gris',
    );
    expect(screen.getByText(/aún no se ha evaluado/)).toBeInTheDocument();
    expect(screen.queryByText(/no se pudo verificar/)).not.toBeInTheDocument();
  });

  it('sin cliente identificado lo dice en el encabezado', async () => {
    await cargar({ ...CON_AVISOS, cliente: undefined, clienteId: undefined });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Solicitud 22b36d8b' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sin cliente identificado')).toBeInTheDocument();
  });

  it.each([
    ['EVALUADA', 'Evaluada, sin decisión', 'chip-gris'],
    ['ACEPTADA', 'Aceptada', 'chip-verde'],
    ['AJUSTADA', 'Ajustada', 'chip-verde-azulado'],
  ] as const)('el estado %s se muestra como «%s»', async (estado, texto, clase) => {
    await cargar({ ...YA_DECIDIDA, estado });

    expect(screen.getByText(texto, { selector: '.chip' })).toHaveClass(clase);
    expect(screen.getByText(new RegExp(`su estado es ${texto}`))).toBeInTheDocument();
  });

  it('desde el canal de un socio muestra el canal y el rol de quien cotizó', async () => {
    await cargar({ ...EN_REVISION, canal: 'socio', cotizadaPor: { id: 'socio-77', rol: 'SOCIO' } });

    expect(dato('Canal')).toHaveTextContent('Socio');
    expect(dato('Cotizada por')).toHaveTextContent('SOCIO');
    expect(dato('Cotizada por')).toHaveTextContent('Usuario socio-77');
  });

  it('sin la suma asegurada ni el plazo en los datos del bien, y con otra periodicidad', async () => {
    await cargar({
      ...EN_REVISION,
      cobertura: { ramo: 'OTRO_RAMO', datosBien: { montoCredito: 'mucho' } },
      periodicidad: 'ANUAL',
    });

    expect(dato('Producto')).toHaveTextContent('OTRO_RAMO');
    expect(dato('Suma asegurada')).toHaveTextContent('—');
    expect(dato('Plazo')).toHaveTextContent('—');
    expect(dato('Prima ofertada')).toHaveTextContent('$ 231.900');
    expect(dato('Prima ofertada')).not.toHaveTextContent('/ mes');
  });

  it('una solicitud que no existe lo dice', async () => {
    const { http, vista } = await renderizar();

    http
      .expectOne(urlRevision(EN_REVISION.solicitudId))
      .flush(
        { codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA' },
        { status: 404, statusText: 'Not Found' },
      );
    await vista.fixture.whenStable();

    expect(
      screen.getByText('No encontramos una solicitud de suscripción con ese id.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('si el BFF falla, permite reintentar', async () => {
    const { http, vista, usuario } = await renderizar();
    http
      .expectOne(urlRevision(EN_REVISION.solicitudId))
      .flush(
        { codigo: 'NUCLEO_NO_DISPONIBLE' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await vista.fixture.whenStable();

    expect(
      screen.getByText('No pudimos cargar la solicitud. Intenta de nuevo.'),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    http.expectOne(urlRevision(EN_REVISION.solicitudId)).flush(EN_REVISION);
    await vista.fixture.whenStable();
    expect(dato('Producto')).toHaveTextContent('Vida hipotecario');
  });

  it('ofrece volver a la bandeja', async () => {
    await cargar(EN_REVISION);

    expect(screen.getByRole('link', { name: 'Volver a la bandeja' })).toHaveAttribute(
      'href',
      '/riesgo/bandeja',
    );
  });

  it('codifica el id de la ruta al pedir el detalle', async () => {
    const { http } = await renderizar('a/b');

    http.expectOne(`${BFF}/v1/solicitudes-suscripcion/a%2Fb/revision`).flush(EN_REVISION);
  });
});
