import {
  ReglaEvaluadaSuscripcion,
  ResultadoReglaSuscripcion,
  ResultadoSuscripcion,
  SolicitudSuscripcion,
} from '../app/features/suscripcion/modelos';

// Datos de prueba de la tarjeta, con los números de los ejemplos del contrato 1.2.0 (SOLVENTAG5-55).

export const SOLICITUD_ID = '7a1c3e5f-2b4d-4c6e-8f1a-3b5d7f9a1c3e';
const TRAZA = 'a'.repeat(64);

/** El resultado de una regla que necesita el perfil de riesgo. */
function resultadoConPerfil(sinPerfil: boolean, incumple: boolean): ResultadoReglaSuscripcion {
  if (sinPerfil) {
    return 'NO_APLICA';
  }
  return incumple ? 'NO_CUMPLE' : 'CUMPLE';
}

/** Las seis reglas de VIDA_HIPOTECARIO.SUSCRIPCION.v1, con lo que cambia en cada caso. */
function reglas(
  score: number | null,
  nivel: string | null,
  pago: number | null,
  deuda: number | null,
  sinPerfil = false,
): ReglaEvaluadaSuscripcion[] {
  const noAplica = sinPerfil ? 'NO_APLICA' : 'CUMPLE';
  return [
    {
      codigo: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
      tipo: 'PERFIL_REQUERIDO',
      efecto: 'REVISAR',
      parametros: {},
      senales: sinPerfil
        ? {
            origen: 'VALOR_POR_DEFECTO',
            motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
            perfilConsistente: true,
          }
        : { origen: 'PERFIL', motivoSinPerfil: null, perfilConsistente: true },
      resultado: sinPerfil ? 'NO_CUMPLE' : 'CUMPLE',
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
      tipo: 'SCORE_MINIMO',
      efecto: 'RECHAZAR',
      parametros: { minimo: 450 },
      senales: { score },
      resultado: resultadoConPerfil(sinPerfil, score !== null && score < 450),
    },
    {
      codigo: 'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
      tipo: 'NIVEL_PERMITIDO',
      efecto: 'AJUSTAR',
      parametros: { permitidos: ['BAJO', 'MEDIO'] },
      senales: { nivel },
      resultado: resultadoConPerfil(sinPerfil, nivel === 'ALTO'),
    },
    {
      codigo: 'VIDA_HIPOTECARIO.COMPORTAMIENTO_PAGO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: { senal: 'comportamientoPago', minimo: 40 },
      senales: { comportamientoPago: pago },
      resultado: noAplica,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.ENDEUDAMIENTO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: { senal: 'endeudamiento', minimo: 30 },
      senales: { endeudamiento: deuda },
      resultado: noAplica,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      tipo: 'DATO_BIEN_MAXIMO',
      efecto: 'REVISAR',
      parametros: { campo: 'montoCredito', maximo: 800000000 },
      senales: { montoCredito: 200000000 },
      resultado: 'CUMPLE',
    },
  ];
}

function conDeterminantes(
  lista: ReglaEvaluadaSuscripcion[],
  determinante?: string,
): ReglaEvaluadaSuscripcion[] {
  return lista.map((r) => ({ ...r, determinante: r.codigo === determinante }));
}

export const PENDIENTE: SolicitudSuscripcion = {
  solicitudId: SOLICITUD_ID,
  cotizacionId: 'c-1',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  estado: 'PENDIENTE_EVALUACION',
  cobertura: {
    ramo: 'VIDA_HIPOTECARIO',
    datosBien: { montoCredito: 200_000_000, plazoAnios: 20 },
  },
  prima: 70_000,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  canal: 'web',
  // 16:30 UTC = 11:30 en Bogotá.
  aceptadaEn: '2026-10-14T16:30:00Z',
  decidida: false,
  actualizadaEn: '2026-10-14T16:30:00Z',
};

export const EVALUADA: SolicitudSuscripcion = {
  ...PENDIENTE,
  estado: 'EVALUADA',
  actualizadaEn: '2026-10-14T16:31:00Z',
  reglasEvaluadas: reglas(640, 'MEDIO', 72, 41),
  versionReglas: 'VIDA_HIPOTECARIO.SUSCRIPCION.v1',
  registrosVerificables: true,
};

function decidida(
  estado: ResultadoSuscripcion,
  lista: ReglaEvaluadaSuscripcion[],
  prima: number,
  decision: Partial<NonNullable<SolicitudSuscripcion['decision']>> &
    Pick<NonNullable<SolicitudSuscripcion['decision']>, 'motivo' | 'reglaAplicada'>,
  determinante?: string,
): SolicitudSuscripcion {
  return {
    ...EVALUADA,
    estado,
    prima,
    actualizadaEn: '2026-10-14T16:30:01.240Z',
    reglasEvaluadas: conDeterminantes(lista, determinante),
    decision: {
      resultado: estado,
      continuaAEmision: estado === 'ACEPTADA' || estado === 'AJUSTADA',
      versionPolitica: 'VIDA_HIPOTECARIO.DECISION.v1',
      primaCotizada: prima,
      tiempoDecisionMs: 1240,
      trazaId: TRAZA,
      ...decision,
    },
  };
}

export const ACEPTADA = decidida('ACEPTADA', reglas(640, 'MEDIO', 72, 41), 70_000, {
  motivo: 'CUMPLE_REGLAS',
  reglaAplicada: 'VIDA_HIPOTECARIO.DECISION.v1',
  primaFinal: 70_000,
});

export const AJUSTADA = decidida(
  'AJUSTADA',
  reglas(500, 'ALTO', 60, 45),
  91_000,
  {
    motivo: 'REGLA_DE_AJUSTE',
    reglaAplicada: 'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
    primaFinal: 109_200,
    recargoPorcentaje: 20,
  },
  'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
);

export const RECHAZADA = decidida(
  'RECHAZADA',
  reglas(400, 'ALTO', 55, 35),
  91_000,
  { motivo: 'REGLA_DE_RECHAZO', reglaAplicada: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1' },
  'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
);

export const EN_REVISION = decidida(
  'EN_REVISION',
  reglas(null, null, null, null, true),
  70_000,
  { motivo: 'REGLA_DE_REVISION', reglaAplicada: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1' },
  'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
);

/** `decidida` true sin `decision`: el registro no se pudo leer. */
export const ILEGIBLE: SolicitudSuscripcion = {
  ...PENDIENTE,
  estado: 'ACEPTADA',
  decidida: true,
  actualizadaEn: '2026-10-14T16:30:01.240Z',
  registrosVerificables: false,
};

export const NO_VERIFICABLE: SolicitudSuscripcion = { ...ACEPTADA, registrosVerificables: false };

/** La solicitud en cualquier resultado, para las pruebas de la página. */
export const POR_RESULTADO: Record<ResultadoSuscripcion, SolicitudSuscripcion> = {
  ACEPTADA,
  AJUSTADA,
  RECHAZADA,
  EN_REVISION,
};
