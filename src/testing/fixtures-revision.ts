import { RevisionSolicitud } from '../app/features/suscripcion/modelos';

// Datos de prueba del detalle de revisión, con los ejemplos del contrato 1.5.0 (SOLVENTAG5-53). Los
// clientes son ficticios.

/** En revisión porque la suma asegurada supera el máximo; la cotizó un asesor. */
export const EN_REVISION: RevisionSolicitud = {
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
  cotizadaPor: {
    id: '3f6a9c2e-8b1d-4e7a-9c5f-2d8e1a4b7c0f',
    rol: 'ASESOR',
  },
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
      senales: {
        origen: 'PERFIL',
        motivoSinPerfil: null,
        perfilConsistente: true,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
      tipo: 'SCORE_MINIMO',
      efecto: 'RECHAZAR',
      parametros: {
        minimo: 450,
      },
      senales: {
        score: 684,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
      tipo: 'NIVEL_PERMITIDO',
      efecto: 'AJUSTAR',
      parametros: {
        permitidos: ['BAJO', 'MEDIO'],
      },
      senales: {
        nivel: 'MEDIO',
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.COMPORTAMIENTO_PAGO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'comportamientoPago',
        minimo: 40,
      },
      senales: {
        comportamientoPago: 72,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.ENDEUDAMIENTO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'endeudamiento',
        minimo: 30,
      },
      senales: {
        endeudamiento: 41,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      tipo: 'DATO_BIEN_MAXIMO',
      efecto: 'REVISAR',
      parametros: {
        campo: 'montoCredito',
        maximo: 800000000,
      },
      senales: {
        montoCredito: 950000000,
      },
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

/** En revisión porque se cotizó sin perfil; la cotizó el mismo cliente. */
export const SIN_PERFIL: RevisionSolicitud = {
  solicitudId: '9f1b3d5e-0c2e-4f4a-9b7d-1e3f5a7b9c1d',
  cotizacionId: '0a2c4e6f-1d3f-4a5b-8c8e-2f4a6b8c0d2e',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  cliente: {
    clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
    nombres: 'María Fernanda',
    apellidos: 'López Rojas',
    documentoEnmascarado: 'CC ••••5678',
  },
  estado: 'EN_REVISION',
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
  cotizadaPor: {
    id: 'b0772cee-ddb2-4c4c-b349-ce1d8a32ff14',
    rol: 'CLIENTE',
  },
  decision: {
    resultado: 'EN_REVISION',
    continuaAEmision: false,
    motivo: 'REGLA_DE_REVISION',
    reglaAplicada: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
    versionPolitica: 'VIDA_HIPOTECARIO.DECISION.v1',
    primaCotizada: 70000,
    tiempoDecisionMs: 1090,
    trazaId: '3e3b227afb28e75f0b3fb02a61f8dc178f6128acbb354ed27310dc4638738677',
  },
  versionReglas: 'VIDA_HIPOTECARIO.SUSCRIPCION.v1',
  reglasEvaluadas: [
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
      sinResolver: true,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
      tipo: 'SCORE_MINIMO',
      efecto: 'RECHAZAR',
      parametros: {
        minimo: 450,
      },
      senales: {
        score: null,
      },
      resultado: 'NO_APLICA',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
      tipo: 'NIVEL_PERMITIDO',
      efecto: 'AJUSTAR',
      parametros: {
        permitidos: ['BAJO', 'MEDIO'],
      },
      senales: {
        nivel: null,
      },
      resultado: 'NO_APLICA',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.COMPORTAMIENTO_PAGO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'comportamientoPago',
        minimo: 40,
      },
      senales: {
        comportamientoPago: null,
      },
      resultado: 'NO_APLICA',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.ENDEUDAMIENTO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'endeudamiento',
        minimo: 30,
      },
      senales: {
        endeudamiento: null,
      },
      resultado: 'NO_APLICA',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      tipo: 'DATO_BIEN_MAXIMO',
      efecto: 'REVISAR',
      parametros: {
        campo: 'montoCredito',
        maximo: 800000000,
      },
      senales: {
        montoCredito: 200000000,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
  ],
  perfilRiesgo: {
    origen: 'VALOR_POR_DEFECTO',
    coincide: true,
    motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
  },
  registrosVerificables: true,
};

/** La huella de un registro no coincide y el perfil venció antes de aceptar; sin usuario. */
export const CON_AVISOS: RevisionSolicitud = {
  solicitudId: '22b36d8b-7e75-43fb-af36-623872c40358',
  cotizacionId: '86728024-5f16-4e8d-96f8-929f3450cd42',
  clienteId: '984bee60-672c-40f8-81b8-956d4fa85257',
  cliente: {
    clienteId: '984bee60-672c-40f8-81b8-956d4fa85257',
    nombres: 'Laura Valentina',
    apellidos: 'Gómez Díaz',
    documentoEnmascarado: 'CC ••••3391',
  },
  estado: 'EN_REVISION',
  cobertura: {
    ramo: 'VIDA_HIPOTECARIO',
    datosBien: {
      montoCredito: 450000000,
      plazoAnios: 15,
      ciudadInmueble: 'Cali',
      entidadAcreedora: 'Banco de Ejemplo',
    },
  },
  prima: 128400,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  canal: 'movil',
  aceptadaEn: '2026-10-20T15:40:00Z',
  decision: {
    resultado: 'EN_REVISION',
    continuaAEmision: false,
    motivo: 'REGLA_DE_REVISION',
    reglaAplicada: 'VIDA_HIPOTECARIO.ENDEUDAMIENTO.v1',
    versionPolitica: 'VIDA_HIPOTECARIO.DECISION.v1',
    primaCotizada: 128400,
    tiempoDecisionMs: 1150,
    trazaId: 'c64a4543ce76fcbcade5797b53bedc08e6d81e9e031a72380c03a07cb788efce',
  },
  versionReglas: 'VIDA_HIPOTECARIO.SUSCRIPCION.v1',
  reglasEvaluadas: [
    {
      codigo: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
      tipo: 'PERFIL_REQUERIDO',
      efecto: 'REVISAR',
      parametros: {},
      senales: {
        origen: 'PERFIL',
        motivoSinPerfil: null,
        perfilConsistente: true,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
      tipo: 'SCORE_MINIMO',
      efecto: 'RECHAZAR',
      parametros: {
        minimo: 450,
      },
      senales: {
        score: 590,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
      tipo: 'NIVEL_PERMITIDO',
      efecto: 'AJUSTAR',
      parametros: {
        permitidos: ['BAJO', 'MEDIO'],
      },
      senales: {
        nivel: 'MEDIO',
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.COMPORTAMIENTO_PAGO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'comportamientoPago',
        minimo: 40,
      },
      senales: {
        comportamientoPago: 55,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.ENDEUDAMIENTO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'endeudamiento',
        minimo: 30,
      },
      senales: {
        endeudamiento: 28,
      },
      resultado: 'NO_CUMPLE',
      determinante: true,
      sinResolver: true,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      tipo: 'DATO_BIEN_MAXIMO',
      efecto: 'REVISAR',
      parametros: {
        campo: 'montoCredito',
        maximo: 800000000,
      },
      senales: {
        montoCredito: 450000000,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
  ],
  perfilRiesgo: {
    origen: 'PERFIL',
    coincide: true,
    perfil: {
      perfilId: '0d5f1b7c-3e9a-4c2d-8f6b-5a1e7c3d9b2f',
      version: 1,
      score: 590,
      nivel: 'MEDIO',
      senales: {
        comportamientoPago: 55,
        estabilidadIngresos: 61,
        ubicacion: 70,
        endeudamiento: 28,
      },
      calculadoEn: '2026-10-17T09:12:00Z',
      vigenteHasta: '2026-10-18T09:12:00Z',
    },
    desactualizado: true,
  },
  registrosVerificables: false,
};

/** Rechazada por la decisión automática: ya no está en revisión. */
export const YA_DECIDIDA: RevisionSolicitud = {
  solicitudId: 'fe6a2073-4498-4389-9320-7bc6adcc2ab4',
  cotizacionId: 'a8571d8f-d3e7-4962-a8eb-ae3911cc6e9e',
  clienteId: '92319d15-3c75-47cb-b2ef-7624d5add7fe',
  cliente: {
    clienteId: '92319d15-3c75-47cb-b2ef-7624d5add7fe',
    nombres: 'Andrés Felipe',
    apellidos: 'Mora Castro',
    documentoEnmascarado: 'CC ••••8842',
  },
  estado: 'RECHAZADA',
  cobertura: {
    ramo: 'VIDA_HIPOTECARIO',
    datosBien: {
      montoCredito: 300000000,
      plazoAnios: 25,
      ciudadInmueble: 'Barranquilla',
      entidadAcreedora: 'Banco de Ejemplo',
    },
  },
  prima: 98600,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  canal: 'web',
  aceptadaEn: '2026-10-21T11:20:00Z',
  cotizadaPor: {
    id: 'd242691c-78c7-4c4c-87ad-1a816c8a0752',
    rol: 'ASESOR',
  },
  decision: {
    resultado: 'RECHAZADA',
    continuaAEmision: false,
    motivo: 'REGLA_DE_RECHAZO',
    reglaAplicada: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
    versionPolitica: 'VIDA_HIPOTECARIO.DECISION.v1',
    primaCotizada: 98600,
    tiempoDecisionMs: 980,
    trazaId: 'f26df72f284b3a7324ebd95bd742f3a790f4127d2013a6d9a5dc3839a3d0c70a',
  },
  versionReglas: 'VIDA_HIPOTECARIO.SUSCRIPCION.v1',
  reglasEvaluadas: [
    {
      codigo: 'VIDA_HIPOTECARIO.PERFIL_REQUERIDO.v1',
      tipo: 'PERFIL_REQUERIDO',
      efecto: 'REVISAR',
      parametros: {},
      senales: {
        origen: 'PERFIL',
        motivoSinPerfil: null,
        perfilConsistente: true,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SCORE_MINIMO.v1',
      tipo: 'SCORE_MINIMO',
      efecto: 'RECHAZAR',
      parametros: {
        minimo: 450,
      },
      senales: {
        score: 410,
      },
      resultado: 'NO_CUMPLE',
      determinante: true,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.NIVEL_PERMITIDO.v1',
      tipo: 'NIVEL_PERMITIDO',
      efecto: 'AJUSTAR',
      parametros: {
        permitidos: ['BAJO', 'MEDIO'],
      },
      senales: {
        nivel: 'ALTO',
      },
      resultado: 'NO_CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.COMPORTAMIENTO_PAGO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'comportamientoPago',
        minimo: 40,
      },
      senales: {
        comportamientoPago: 35,
      },
      resultado: 'NO_CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.ENDEUDAMIENTO.v1',
      tipo: 'SENAL_MINIMA',
      efecto: 'REVISAR',
      parametros: {
        senal: 'endeudamiento',
        minimo: 30,
      },
      senales: {
        endeudamiento: 44,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
    {
      codigo: 'VIDA_HIPOTECARIO.SUMA_ASEGURADA_MAXIMA.v1',
      tipo: 'DATO_BIEN_MAXIMO',
      efecto: 'REVISAR',
      parametros: {
        campo: 'montoCredito',
        maximo: 800000000,
      },
      senales: {
        montoCredito: 300000000,
      },
      resultado: 'CUMPLE',
      determinante: false,
      sinResolver: false,
    },
  ],
  perfilRiesgo: {
    origen: 'PERFIL',
    coincide: true,
    perfil: {
      perfilId: '7c1e3a5b-9d2f-4b8e-a6c0-4e2a8c6b0d3f',
      version: 1,
      score: 410,
      nivel: 'ALTO',
      senales: {
        comportamientoPago: 35,
        estabilidadIngresos: 50,
        ubicacion: 62,
        endeudamiento: 44,
      },
      calculadoEn: '2026-10-21T10:02:00Z',
      vigenteHasta: '2026-10-22T10:02:00Z',
    },
    desactualizado: false,
  },
  registrosVerificables: true,
};

/** El perfil de la cotización no coincide con el de la solicitud. */
export const PERFIL_NO_COINCIDE: RevisionSolicitud = {
  ...EN_REVISION,
  perfilRiesgo: { origen: 'PERFIL', coincide: false },
};

/** El registro de la decisión no se puede leer: no llegan las reglas ni la decisión. */
export const ILEGIBLE: RevisionSolicitud = {
  ...EN_REVISION,
  decision: undefined,
  versionReglas: undefined,
  reglasEvaluadas: undefined,
  registrosVerificables: false,
};

/** Aceptada hace un momento: todavía no se evalúa ni tiene registros. */
export const PENDIENTE: RevisionSolicitud = {
  ...ILEGIBLE,
  estado: 'PENDIENTE_EVALUACION',
  registrosVerificables: undefined,
};
