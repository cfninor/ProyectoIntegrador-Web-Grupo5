import { MotivoSinPerfil, PerfilUsado } from '../cotizacion/modelos';

export type OrigenPerfil = 'PERFIL' | 'VALOR_POR_DEFECTO';

export interface PerfilRiesgoSolicitud {
  solicitudId: string;
  cotizacionId: string;
  origen: OrigenPerfil;
  perfil?: PerfilUsado;
  motivoSinPerfil?: MotivoSinPerfil;
}

/**
 * PENDIENTE_EVALUACION al aceptar la oferta; EVALUADA cuando la evaluación automática aplicó las
 * reglas de suscripción (SOLVENTAG5-50). Luego, el de la decisión automática (SOLVENTAG5-51):
 * ACEPTADA y AJUSTADA continúan a cobro y emisión, RECHAZADA no, y EN_REVISION espera a un
 * suscriptor (SOLVENTAG5-52): es un estado, no un error.
 */
export type EstadoSolicitudSuscripcion = 'PENDIENTE_EVALUACION' | 'EVALUADA' | ResultadoSuscripcion;

/** Los estados de la decisión automática (SOLVENTAG5-51). */
export type ResultadoSuscripcion = 'ACEPTADA' | 'AJUSTADA' | 'RECHAZADA' | 'EN_REVISION';

/** Mientras la solicitud está en uno de estos estados, la decisión aún no llega (ADR 0007, R8). */
export const SIN_DECISION: readonly EstadoSolicitudSuscripcion[] = [
  'PENDIENTE_EVALUACION',
  'EVALUADA',
];

/** `SolicitudSuscripcion` del contrato del BFF web (SOLVENTAG5-133). */
export interface SolicitudSuscripcion {
  solicitudId: string;
  cotizacionId: string;
  clienteId?: string;
  estado: EstadoSolicitudSuscripcion;
  cobertura: { ramo: string; datosBien: Record<string, unknown> };
  prima: number;
  moneda: string;
  periodicidad: string;
  perfilRiesgo?: { perfilId: string; version: number };
  motivoSinPerfil?: MotivoSinPerfil;
  canal: 'web' | 'movil' | 'socio';
  aceptadaEn: string;
  // El resultado (SOLVENTAG5-55): solo los envía la consulta, nunca `aceptarOferta`.
  /** True cuando existe la decisión automática, también en EN_REVISION. */
  decidida?: boolean;
  /** Cuándo cambió el estado por última vez. */
  actualizadaEn?: string;
  /** Con evaluación. */
  reglasEvaluadas?: ReglaEvaluadaSuscripcion[];
  /** Con evaluación. */
  versionReglas?: string;
  /** Con evaluación. False si un registro no se pudo verificar al consultar. */
  registrosVerificables?: boolean;
  /** Cuando `decidida` es true y su registro se puede leer. */
  decision?: DecisionSuscripcion;
}

export type MotivoDecisionSuscripcion =
  | 'CUMPLE_REGLAS'
  | 'REGLA_DE_RECHAZO'
  | 'REGLA_DE_REVISION'
  | 'REGLA_DE_AJUSTE'
  | 'REGLAS_NO_ALCANZAN'
  | 'EVALUACION_NO_VERIFICABLE';

export type TipoReglaSuscripcion =
  | 'PERFIL_REQUERIDO'
  | 'SCORE_MINIMO'
  | 'NIVEL_PERMITIDO'
  | 'SENAL_MINIMA'
  | 'DATO_BIEN_MAXIMO'
  | 'SIN_REGLAS';

export type EfectoReglaSuscripcion = 'RECHAZAR' | 'AJUSTAR' | 'REVISAR';

export type ResultadoReglaSuscripcion = 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA';

/** `ReglaEvaluadaSuscripcion` del contrato: la regla tal como quedó registrada (SOLVENTAG5-55). */
export interface ReglaEvaluadaSuscripcion {
  codigo: string;
  tipo: TipoReglaSuscripcion;
  efecto: EfectoReglaSuscripcion;
  parametros: Record<string, unknown>;
  /** Un valor es null si la regla no aplica. */
  senales: Record<string, unknown>;
  resultado: ResultadoReglaSuscripcion;
  /** Si determinó la decisión. Solo con decisión. */
  determinante?: boolean;
}

/** `DecisionSuscripcion` del contrato: la decisión automática como quedó en su registro. */
export interface DecisionSuscripcion {
  resultado: ResultadoSuscripcion;
  continuaAEmision: boolean;
  motivo: MotivoDecisionSuscripcion;
  reglaAplicada: string;
  versionPolitica: string;
  primaCotizada: number;
  /** Solo en ACEPTADA y AJUSTADA. */
  primaFinal?: number;
  /** Solo en AJUSTADA. */
  recargoPorcentaje?: number;
  tiempoDecisionMs: number;
  trazaId: string;
}
