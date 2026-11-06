import { BandejaRevision, SolicitudEnRevision } from '../app/features/suscripcion/modelos';

// Datos de prueba de la bandeja, con los ejemplos del contrato 1.4.0 (SOLVENTAG5-52). Los clientes
// son ficticios.

/** Sin perfil: la regla sin resolver es la del perfil de riesgo. */
export const SIN_PERFIL: SolicitudEnRevision = {
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
};

/** Con perfil y un monto por encima del máximo de la regla. */
export const MONTO_ALTO: SolicitudEnRevision = {
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
};

/** El registro de la evaluación no se pudo verificar al decidir: sin reglas sin resolver. */
export const NO_VERIFICABLE: SolicitudEnRevision = {
  ...MONTO_ALTO,
  solicitudId: '6e8a0c2e-4f6a-4b8c-9e0a-5b7d9f1b3d5f',
  motivo: 'EVALUACION_NO_VERIFICABLE',
  reglaAplicada: 'VIDA_HIPOTECARIO.DECISION.v1',
  reglasSinResolver: [],
};

/** El registro de la decisión no se puede leer y la solicitud no tiene cliente. */
export const ILEGIBLE: SolicitudEnRevision = {
  solicitudId: '1a3c5e7a-9b1d-4f3a-8c5e-7a9b1d3f5a7c',
  cotizacionId: '3c5e7a9c-1d3f-4b5a-9e7c-9b1d3f5a7c9e',
  cobertura: SIN_PERFIL.cobertura,
  prima: 70000,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  canal: 'movil',
  aceptadaEn: '2026-10-16T13:00:00Z',
  enRevisionDesde: '2026-10-16T13:00:00Z',
  registrosVerificables: false,
};

/** La página 1 del ejemplo `BandejaRevisionConSolicitudes` del contrato. */
export const BANDEJA: BandejaRevision = {
  solicitudes: [SIN_PERFIL, MONTO_ALTO],
  total: 2,
  pagina: 1,
  tamano: 20,
};

export const VACIA: BandejaRevision = { solicitudes: [], total: 0, pagina: 1, tamano: 20 };
