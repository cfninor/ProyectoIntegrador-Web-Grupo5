import { expect, Page, Route, test } from '@playwright/test';

// El detalle de revisión de una solicitud (SOLVENTAG5-53), con el BFF simulado por page.route y
// los ejemplos del contrato 1.5.0. Los clientes son ficticios.

const SESION_ANALISTA = {
  usuario: { id: 'analista-004', nombre: 'Martín Ospina' },
  rol: 'ANALISTA_RIESGO',
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET',
  'access-control-allow-headers': 'Content-Type',
};
const BANDEJA = {
  solicitudes: [
    {
      solicitudId: '9f1b3d5e-0c2e-4f4a-9b7d-1e3f5a7b9c1d',
      cotizacionId: '0a2c4e6f-1d3f-4a5b-8c8e-2f4a6b8c0d2e',
      clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
      cliente: {
        clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
        nombres: 'María Fernanda',
        apellidos: 'López Rojas',
        documentoEnmascarado: 'CC ••••5678',
      },
      cobertura: {
        ramo: 'VIDA_HIPOTECARIO',
        datosBien: {
          montoCredito: 200000000,
          plazoAnios: 20,
          ciudadInmueble: 'Bogotá',
          entidadAcreedora: 'Banco de Ejemplo',
        },
      },
      prima: 70000,
      moneda: 'COP',
      periodicidad: 'MENSUAL',
      canal: 'web',
      aceptadaEn: '2026-10-14T16:30:00Z',
      enRevisionDesde: '2026-10-14T16:30:01.090Z',
      motivo: 'REGLA_DE_REVISION',
      reglaAplicada: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
      reglasSinResolver: [
        {
          codigo: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
          tipo: 'PERFIL_REQUERIDO',
          efecto: 'REVISAR',
          parametros: {},
          senales: {
            origen: 'VALOR_POR_DEFECTO',
            motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
            perfilConsistente: true,
          },
          resultado: 'NO_CUMPLE',
          determinante: true,
        },
      ],
      registrosVerificables: true,
    },
    {
      solicitudId: '4c6e8a0b-2d4f-4e6a-9c8e-3f5a7b9c1d3e',
      cotizacionId: '7e9a1c3e-5b7d-4f9b-8d1f-6a8c0e2a4b6c',
      clienteId: '2d4f6a8c-0e2a-4c4e-9a6c-8e0a2c4e6a8c',
      cliente: {
        clienteId: '2d4f6a8c-0e2a-4c4e-9a6c-8e0a2c4e6a8c',
        nombres: 'Carlos Andrés',
        apellidos: 'Peña Ruiz',
        documentoEnmascarado: 'CC ••••5120',
      },
      cobertura: {
        ramo: 'VIDA_HIPOTECARIO',
        datosBien: {
          montoCredito: 950000000,
          plazoAnios: 20,
          ciudadInmueble: 'Medellín',
          entidadAcreedora: 'Banco de Ejemplo',
        },
      },
      prima: 231900,
      moneda: 'COP',
      periodicidad: 'MENSUAL',
      canal: 'web',
      aceptadaEn: '2026-10-15T14:05:00Z',
      enRevisionDesde: '2026-10-15T14:05:01.240Z',
      motivo: 'REGLA_DE_REVISION',
      reglaAplicada: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      reglasSinResolver: [
        {
          codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
          tipo: 'DATO_BIEN_MAXIMO',
          efecto: 'REVISAR',
          parametros: { campo: 'montoCredito', maximo: 800000000 },
          senales: { montoCredito: 950000000 },
          resultado: 'NO_CUMPLE',
          determinante: true,
        },
      ],
      registrosVerificables: true,
    },
  ],
  total: 2,
  pagina: 1,
  tamano: 20,
};
const EN_REVISION = {
  solicitudId: '4c6e8a0b-2d4f-4e6a-9c8e-3f5a7b9c1d3e',
  cotizacionId: '7e9a1c3e-5b7d-4f9b-8d1f-6a8c0e2a4b6c',
  clienteId: '2d4f6a8c-0e2a-4c4e-9a6c-8e0a2c4e6a8c',
  cliente: {
    clienteId: '2d4f6a8c-0e2a-4c4e-9a6c-8e0a2c4e6a8c',
    nombres: 'Carlos Andrés',
    apellidos: 'Peña Ruiz',
    documentoEnmascarado: 'CC ••••5120',
  },
  estado: 'EN_REVISION',
  cobertura: {
    ramo: 'VIDA_HIPOTECARIO',
    datosBien: {
      montoCredito: 950000000,
      plazoAnios: 20,
      ciudadInmueble: 'Medellín',
      entidadAcreedora: 'Banco de Ejemplo',
    },
  },
  prima: 231900,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  canal: 'web',
  aceptadaEn: '2026-10-15T14:05:00Z',
  cotizadaPor: { id: '3f6a9c2e-8b1d-4e7a-9c5f-2d8e1a4b7c0f', rol: 'ASESOR' },
  decision: {
    resultado: 'EN_REVISION',
    continuaAEmision: false,
    motivo: 'REGLA_DE_REVISION',
    reglaAplicada: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
    versionPolitica: 'VIDA_HIPOTECARIO.DECISION.v1',
    primaCotizada: 231900,
    tiempoDecisionMs: 1240,
    trazaId: 'a6d1d4ea8e5a4fa08e8438c91ab01e2055faf19e5134fddd3a61efc0c133aa46',
  },
  versionReglas: 'VIDA_HIPOTECARIO.SUSCRIPCION.v1',
  reglasEvaluadas: [
    {
      codigo: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
      tipo: 'PERFIL_REQUERIDO',
      efecto: 'REVISAR',
      parametros: {},
      senales: { origen: 'PERFIL', motivoSinPerfil: null, perfilConsistente: true },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
      tipo: 'SCORE_MINIMO',
      efecto: 'RECHAZAR',
      parametros: { minimo: 450 },
      senales: { score: 684 },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
      tipo: 'NIVEL_PERMITIDO',
      efecto: 'AJUSTAR',
      parametros: { permitidos: ['BAJO', 'MEDIO'] },
      senales: { nivel: 'MEDIO' },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.COMPORTAMIENTO_PAGO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: { senal: 'comportamientoPago', minimo: 40 },
      senales: { comportamientoPago: 72 },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.ENDEUDAMIENTO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: { senal: 'endeudamiento', minimo: 30 },
      senales: { endeudamiento: 41 },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      tipo: 'DATO_BIEN_MAXIMO',
      efecto: 'REVISAR',
      parametros: { campo: 'montoCredito', maximo: 800000000 },
      senales: { montoCredito: 950000000 },
      resultado: 'NO_CUMPLE',
      determinante: true,
      sinResolver: true,
    },
  ],
  perfilRiesgo: {
    origen: 'PERFIL',
    coincide: true,
    perfil: {
      perfilId: '6b8d0f2a-4c6e-4a8b-9d0f-1a3c5e7a9b1d',
      version: 2,
      score: 684,
      nivel: 'MEDIO',
      senales: {
        comportamientoPago: 72,
        estabilidadIngresos: 80,
        ubicacion: 66,
        endeudamiento: 41,
      },
      calculadoEn: '2026-10-15T13:14:00Z',
      vigenteHasta: '2026-10-16T13:14:00Z',
    },
    desactualizado: false,
  },
  registrosVerificables: true,
};

async function simularBff(page: Page, revision: object | null): Promise<string[]> {
  const consultas: string[] = [];
  await page.route('**/config.json', (route) =>
    route.fulfill({
      json: { apiBaseUrl: 'http://localhost:8010', sesionSimulada: SESION_ANALISTA },
    }),
  );
  await page.route('**/v1/solicitudes-suscripcion/en-revision**', (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ status: 200, headers: CORS, json: BANDEJA }),
  );
  await page.route('**/v1/solicitudes-suscripcion/*/revision', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    consultas.push(new URL(route.request().url()).pathname);
    if (revision === null) {
      await route.fulfill({
        status: 404,
        headers: CORS,
        json: {
          codigo: 'SOLICITUD_SUSCRIPCION_NO_ENCONTRADA',
          detalle: 'No encontramos la solicitud de suscripción.',
        },
      });
      return;
    }
    await route.fulfill({ status: 200, headers: CORS, json: revision });
  });
  return consultas;
}

test('«Revisar» en la bandeja abre el detalle con las reglas y el perfil', async ({ page }) => {
  const consultas = await simularBff(page, EN_REVISION);

  await page.goto('/riesgo/bandeja');
  await page.getByRole('link', { name: 'Revisar la solicitud 4c6e8a0b' }).click();

  await expect(page).toHaveURL(`/riesgo/bandeja/revision/${EN_REVISION.solicitudId}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Revisión de la solicitud' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Solicitud 4c6e8a0b · Carlos Andrés Peña Ruiz' }),
  ).toBeVisible();
  const suma = page.getByRole('row').filter({ hasText: 'Suma asegurada' });
  await expect(suma).toContainText('Máximo $ 800.000.000');
  await expect(suma).toContainText('Sin resolver');
  await expect(page.getByText('Perfil vigente · 15/10/2026 08:14')).toBeVisible();
  await expect(page.getByText('Un asesor')).toBeVisible();
  expect(consultas).toEqual([`/v1/solicitudes-suscripcion/${EN_REVISION.solicitudId}/revision`]);
});

test('«Volver a la bandeja» regresa a la bandeja', async ({ page }) => {
  await simularBff(page, EN_REVISION);

  await page.goto(`/riesgo/bandeja/revision/${EN_REVISION.solicitudId}`);
  await page.getByRole('link', { name: 'Volver a la bandeja' }).click();

  await expect(page).toHaveURL('/riesgo/bandeja');
});

test('una solicitud que no existe lo dice', async ({ page }) => {
  await simularBff(page, null);

  await page.goto('/riesgo/bandeja/revision/00000000-0000-4000-8000-000000000000');

  await expect(
    page.getByText('No encontramos una solicitud de suscripción con ese id.'),
  ).toBeVisible();
});

test('el detalle en inglés', async ({ page }) => {
  await simularBff(page, EN_REVISION);
  await page.addInitScript(() => localStorage.setItem('solventa.idioma', 'en-US'));

  await page.goto(`/riesgo/bandeja/revision/${EN_REVISION.solicitudId}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Application review' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Sum insured' })).toContainText(
    'Unresolved',
  );
  await expect(page.getByText('Valid profile · Oct 15, 2026 8:14 AM')).toBeVisible();
});
