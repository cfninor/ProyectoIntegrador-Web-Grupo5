import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { APP_CONFIG } from '../../core/config/app-config';
import { Actor } from './formulario-cotizacion';
import { Cotizacion } from './modelos';
import { PaginaOferta } from './pagina-oferta';

// Oferta personalizada (SOLVENTAG5-49): prima y periodicidad, por qué recibió ese precio, resumen
// de la cobertura y vigencia de la oferta (CA1); continuar, ajustar o descartar (CA2); y la oferta
// vencida, que solo permite recotizar (CA3). En los dos portales.

const BFF = 'http://bff.prueba';
const COTIZACION_ID = '5d2c8b1a-4e3f-4a6b-9c7d-8e1f2a3b4c5d';
const URL_OFERTA = `${BFF}/v1/cotizaciones/${COTIZACION_ID}`;
const CON_PERFIL: Cotizacion = {
  cotizacionId: COTIZACION_ID,
  ramo: 'VIDA_HIPOTECARIO',
  datosBien: {
    montoCredito: 280_000_000,
    plazoAnios: 15,
    ciudadInmueble: 'Bogotá D.C.',
    entidadAcreedora: 'Banco Andino S.A.',
  },
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  prima: 148_500,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  fechaCotizacion: '2026-10-14T15:00:00Z',
  // 15:00 UTC = 10:00 del 21 en Bogotá.
  vigenteHasta: '2026-10-21T15:00:00Z',
  estado: 'VIGENTE',
  calculadaSinPerfil: false,
  perfil: {
    perfilId: '2a4b6c8d-1e3f-4a5b-8c7d-9e0f1a2b3c4d',
    version: 3,
    score: 720,
    nivel: 'BAJO',
    senales: { comportamientoPago: 88, estabilidadIngresos: 76, ubicacion: 70, endeudamiento: 55 },
    // 14:43 UTC = 09:43 en Bogotá.
    calculadoEn: '2026-10-14T14:43:00Z',
    vigenteHasta: '2026-10-15T14:43:00Z',
  },
};
const SIN_PERFIL: Cotizacion = {
  ...CON_PERFIL,
  prima: 70_000,
  calculadaSinPerfil: true,
  motivoSinPerfil: 'SIN_CONSENTIMIENTO',
  perfil: undefined,
};

let http: HttpTestingController | undefined;

afterEach(() => {
  history.replaceState(null, '');
  http?.verify();
  http = undefined;
});

async function renderizar(actor: Actor = 'cliente') {
  await render(PaginaOferta, {
    inputs: { cotizacionId: COTIZACION_ID, actor },
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BFF } },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  return { http, usuario: userEvent.setup() };
}

async function cargar(cotizacion: Cotizacion, actor: Actor = 'cliente') {
  const vista = await renderizar(actor);
  vista.http.expectOne(URL_OFERTA).flush(cotizacion);
  await screen.findByRole('region', { name: 'Resumen de la cobertura' });
  return vista;
}

const region = (nombre: string) => within(screen.getByRole('region', { name: nombre }));

describe('PaginaOferta · SOLVENTAG5-49', () => {
  it('muestra la prima, su periodicidad y hasta cuándo vale la oferta', async () => {
    const { http } = await renderizar();

    expect(screen.getByText('Cargando la oferta…')).toBeInTheDocument();
    const peticion = http.expectOne(URL_OFERTA);
    expect(peticion.request.method).toBe('GET');
    peticion.flush(CON_PERFIL);

    const prima = within(await screen.findByRole('region', { name: 'Prima mensual' }));
    expect(prima.getByText('$ 148.500')).toBeInTheDocument();
    expect(prima.getByText('COP / mes · pago mensual')).toBeInTheDocument();
    expect(prima.getByText(/Oferta válida hasta el/)).toHaveTextContent(
      'Oferta válida hasta el 21/10/2026',
    );
    expect(screen.queryByText('Cargando la oferta…')).not.toBeInTheDocument();
  });

  it('resume la cobertura contratada, la periodicidad y el beneficiario', async () => {
    await cargar(CON_PERFIL);

    const cobertura = region('Resumen de la cobertura');
    const dato = (nombre: string) => cobertura.getByText(nombre).nextElementSibling;
    expect(dato('Producto')).toHaveTextContent('Vida hipotecario');
    expect(dato('Cobertura')).toHaveTextContent('Saldo del crédito');
    expect(dato('Suma asegurada')).toHaveTextContent('$ 280.000.000');
    expect(dato('Periodicidad de pago')).toHaveTextContent('Mensual');
    expect(dato('Vigencia de la póliza')).toHaveTextContent('15 años');
    expect(dato('Beneficiario')).toHaveTextContent('Banco Andino S.A.');
  });

  it('explica el precio con el score, el nivel y las señales del perfil', async () => {
    await cargar(CON_PERFIL);

    const prima = region('Prima mensual');
    expect(prima.getByRole('img', { name: 'Score 720 de 850' })).toBeInTheDocument();
    expect(prima.getByText('Riesgo bajo')).toHaveClass('chip', 'chip-verde');

    const perfil = region('Por qué recibiste este precio');
    expect(
      perfil.getByText('Señales de tu perfil de riesgo, calculadas con tu autorización.'),
    ).toBeInTheDocument();
    expect(perfil.getByText('Perfil vigente · 14/10/2026 09:43')).toBeInTheDocument();
    const senales = perfil.getAllByRole('listitem').map((fila) => fila.textContent?.trim());
    expect(senales).toEqual([
      'Comportamiento de pagoMuy bueno (88 de 100)',
      'Estabilidad de ingresosAlta (76 de 100)',
      'Ubicación del inmuebleRiesgo bajo (70 de 100)',
      'Endeudamiento actualMedio (55 de 100)',
    ]);
    const barras = perfil.getAllByRole('listitem').map((fila) => fila.querySelector('.relleno'));
    expect(barras.map((barra) => barra?.getAttribute('style'))).toEqual([
      'width: 88%;',
      'width: 76%;',
      'width: 70%;',
      'width: 55%;',
    ]);
    expect(barras[3]).toHaveClass('medio');
  });

  it('para el asesor habla del cliente en tercera persona', async () => {
    await cargar(CON_PERFIL, 'asesor');

    const perfil = region('Por qué el cliente recibió este precio');
    expect(
      perfil.getByText('Señales del perfil de riesgo, calculadas con la autorización del cliente.'),
    ).toBeInTheDocument();
  });

  it('sin perfil, dice por qué y que la prima usa el valor por defecto', async () => {
    await cargar(SIN_PERFIL);

    const perfil = region('Por qué recibiste este precio');
    expect(perfil.getByText('Sin perfil de riesgo')).toBeInTheDocument();
    expect(
      perfil.getByText(
        'Calculada sin tu perfil de riesgo porque no tienes una autorización vigente.',
      ),
    ).toBeInTheDocument();
    expect(perfil.getByText(/valor por defecto del seguro/)).toBeInTheDocument();
    expect(perfil.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Score/ })).not.toBeInTheDocument();
    expect(region('Prima mensual').getByText('$ 70.000')).toBeInTheDocument();
  });

  it.each([
    [
      'SIN_CLIENTE',
      'cliente',
      'Calculada sin perfil de riesgo porque no hay un cliente identificado.',
    ],
    [
      'SIN_CONSENTIMIENTO',
      'asesor',
      'Calculada sin el perfil de riesgo del cliente porque no tiene una autorización vigente.',
    ],
    [
      'PERFIL_NO_DISPONIBLE',
      'asesor',
      'Calculada sin el perfil de riesgo del cliente porque no estuvo disponible a tiempo.',
    ],
    [
      'PERFIL_NO_DISPONIBLE',
      'cliente',
      'Calculada sin tu perfil de riesgo porque no estuvo disponible a tiempo.',
    ],
  ] as const)('sin perfil por %s, el %s ve el motivo', async (motivo, actor, texto) => {
    await cargar({ ...SIN_PERFIL, motivoSinPerfil: motivo }, actor);

    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it('si la oferta no existe, lo dice y ofrece volver a cotizar', async () => {
    const { http } = await renderizar('asesor');

    http
      .expectOne(URL_OFERTA)
      .flush({ codigo: 'COTIZACION_NO_ENCONTRADA' }, { status: 404, statusText: 'Not Found' });

    expect(await screen.findByText('No encontramos esta oferta.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a cotizar' })).toHaveAttribute(
      'href',
      '/asesor/cotizar',
    );
    expect(
      screen.queryByRole('region', { name: 'Resumen de la cobertura' }),
    ).not.toBeInTheDocument();
  });

  it('si el servicio falla, permite reintentar', async () => {
    const { http, usuario } = await renderizar();
    http.expectOne(URL_OFERTA).flush(null, { status: 503, statusText: 'Service Unavailable' });

    await usuario.click(await screen.findByRole('button', { name: 'Reintentar' }));
    http.expectOne(URL_OFERTA).flush(CON_PERFIL);

    expect(await screen.findByRole('region', { name: 'Prima mensual' })).toBeInTheDocument();
    expect(screen.queryByText(/No pudimos cargar/)).not.toBeInTheDocument();
  });

  it('marca el primer paso de la contratación', async () => {
    await cargar(CON_PERFIL);

    const pasos = within(screen.getByRole('list', { name: 'Pasos de la contratación' }));
    expect(pasos.getByText('Cotización').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(pasos.getAllByRole('listitem').map((paso) => paso.textContent?.trim())).toEqual([
      '1Cotización',
      '2Suscripción',
      '3Pago',
      '4Firma',
      '5Emisión',
    ]);
  });
});

describe('PaginaOferta · decisiones del cliente (CA2, CA3)', () => {
  const VENCIDA: Cotizacion = { ...CON_PERFIL, estado: 'VENCIDA' };
  const acciones = () => region('Resumen de la cobertura').getAllByRole('button');
  const espiarNavegacion = () =>
    jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

  it('el cliente puede continuar a la contratación, ajustar los datos o descartar la oferta', async () => {
    await cargar(CON_PERFIL);

    expect(acciones().map((boton) => boton.textContent?.trim())).toEqual([
      'Continuar a la contratación',
      'Ajustar datos',
      'Descartar oferta',
    ]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el asesor registra que el cliente acepta y envía a suscripción', async () => {
    await cargar(CON_PERFIL, 'asesor');

    expect(acciones().map((boton) => boton.textContent?.trim())).toEqual([
      'El cliente acepta · enviar a suscripción',
      'Ajustar datos',
      'Descartar oferta',
    ]);
  });

  it.each<[Actor, string, string]>([
    ['cliente', 'Continuar a la contratación', '/cliente'],
    ['asesor', 'El cliente acepta · enviar a suscripción', '/asesor'],
  ])('el %s continúa al paso de suscripción de esta oferta', async (actor, boton, portal) => {
    const { usuario } = await cargar(CON_PERFIL, actor);
    const navegar = espiarNavegacion();

    await usuario.click(screen.getByRole('button', { name: boton }));

    expect(navegar).toHaveBeenCalledWith(`${portal}/cotizar/oferta/${COTIZACION_ID}/suscripcion`);
  });

  it.each<[Actor, string]>([
    ['cliente', '/cliente'],
    ['asesor', '/asesor'],
  ])('el %s descarta la oferta y vuelve a su tablero, sin llamar al BFF', async (actor, portal) => {
    const { usuario } = await cargar(CON_PERFIL, actor);
    const navegar = espiarNavegacion();

    await usuario.click(screen.getByRole('button', { name: 'Descartar oferta' }));

    expect(navegar).toHaveBeenCalledWith(portal);
  });

  it('«Ajustar datos» abre el cotizador con los datos del crédito de la oferta', async () => {
    const { usuario } = await cargar(CON_PERFIL);
    const navegar = espiarNavegacion();

    await usuario.click(screen.getByRole('button', { name: 'Ajustar datos' }));

    expect(navegar).toHaveBeenCalledWith('/cliente/cotizar', {
      state: { recotizar: { datosBien: CON_PERFIL.datosBien } },
    });
  });

  it('para el asesor, el cotizador también recibe el documento con que buscó al cliente', async () => {
    const busqueda = { tipoDocumento: 'CC', numeroDocumento: '1020305678' };
    history.replaceState({ busqueda }, '');
    const { usuario } = await cargar(CON_PERFIL, 'asesor');
    const navegar = espiarNavegacion();

    await usuario.click(screen.getByRole('button', { name: 'Ajustar datos' }));

    expect(navegar).toHaveBeenCalledWith('/asesor/cotizar', {
      state: { recotizar: { datosBien: CON_PERFIL.datosBien, busqueda } },
    });
  });

  it('una oferta vencida lo indica y ofrece recotizar en lugar de continuar (CA3)', async () => {
    const { usuario } = await cargar(VENCIDA);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Esta oferta venció el 21/10/2026. Recotiza para obtener una prima vigente.',
    );
    expect(region('Prima mensual').getByText(/Oferta vencida el/)).toHaveTextContent(
      'Oferta vencida el 21/10/2026',
    );
    expect(screen.queryByText(/Oferta válida hasta/)).not.toBeInTheDocument();
    expect(acciones().map((boton) => boton.textContent?.trim())).toEqual([
      'Recotizar',
      'Descartar oferta',
    ]);
    expect(screen.queryByRole('button', { name: /Continuar/ })).not.toBeInTheDocument();

    const navegar = espiarNavegacion();
    await usuario.click(screen.getByRole('button', { name: 'Recotizar' }));
    expect(navegar).toHaveBeenCalledWith('/cliente/cotizar', {
      state: { recotizar: { datosBien: VENCIDA.datosBien } },
    });
  });

  it('al asesor tampoco le permite enviar a suscripción una oferta vencida', async () => {
    await cargar(VENCIDA, 'asesor');

    expect(screen.queryByRole('button', { name: /enviar a suscripción/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recotizar' })).toBeInTheDocument();
  });
});
