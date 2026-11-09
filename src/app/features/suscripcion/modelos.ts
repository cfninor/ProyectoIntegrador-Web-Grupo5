import { ClienteEncontrado, MotivoSinPerfil, PerfilUsado } from '../cotizacion/modelos';

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
  /**
   * Solo en AJUSTADA, cuando el cliente titular ya aceptó la nueva prima (SOLVENTAG5-56): cuándo la
   * aceptó. No cambia si la acepta otra vez.
   */
  primaAjustadaAceptadaEn?: string;
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

/**
 * `SolicitudEnRevision` del contrato: una solicitud de la bandeja de suscripción asistida
 * (SOLVENTAG5-52), con el motivo que la mandó a revisión tal como quedó en su registro.
 */
export interface SolicitudEnRevision {
  solicitudId: string;
  cotizacionId: string;
  clienteId?: string;
  /** Ausente si la solicitud no tiene cliente o identidad no lo encuentra. */
  cliente?: ClienteEncontrado;
  cobertura: { ramo: string; datosBien: Record<string, unknown> };
  prima: number;
  moneda: string;
  periodicidad: string;
  canal: 'web' | 'movil' | 'socio';
  aceptadaEn: string;
  /** Cuándo la decisión automática la dejó en EN_REVISION. */
  enRevisionDesde: string;
  /** Ausente si el registro de la decisión no se puede leer. */
  motivo?: MotivoDecisionSuscripcion;
  /** Ausente si el registro de la decisión no se puede leer. */
  reglaAplicada?: string;
  /** Las reglas determinantes. Vacía con EVALUACION_NO_VERIFICABLE; ausente si no se puede leer. */
  reglasSinResolver?: ReglaEvaluadaSuscripcion[];
  /** False si un registro no se pudo leer o verificar al consultar. */
  registrosVerificables: boolean;
}

/** `BandejaRevision` del contrato: una página de la bandeja y el total de pendientes. */
export interface BandejaRevision {
  solicitudes: SolicitudEnRevision[];
  total: number;
  pagina: number;
  tamano: number;
}

/** `Rol` del contrato: el grupo de Cognito del usuario. */
export type RolUsuario = 'ASESOR' | 'CLIENTE' | 'ANALISTA_RIESGO' | 'OPERACIONES' | 'SOCIO';

/**
 * `Solicitante` del contrato: quién pidió la cotización, con su usuario y su rol, tal como quedó en
 * el registro de la decisión de precio. El nombre no se registra (SOLVENTAG5-53).
 */
export interface Cotizante {
  id: string;
  rol: RolUsuario;
}

/** `ReglaRevisionSuscripcion` del contrato: la regla evaluada y si quedó sin resolver. */
export interface ReglaRevisionSuscripcion extends ReglaEvaluadaSuscripcion {
  /** Determinante de la decisión automática y la solicitud sigue EN_REVISION. */
  sinResolver: boolean;
}

/**
 * `PerfilRiesgoRevision` del contrato: el perfil con que se cotizó la solicitud, de la misma fuente
 * que la consulta del perfil (SOLVENTAG5-67).
 */
export interface PerfilRiesgoRevision {
  origen: OrigenPerfil;
  /** False si la foto de la cotización no coincide con la de la solicitud: no llega el perfil. */
  coincide: boolean;
  /** Solo con origen PERFIL y `coincide`. */
  perfil?: PerfilUsado;
  /** Solo con perfil: ya no estaba vigente cuando el cliente aceptó la oferta. */
  desactualizado?: boolean;
  /** Solo con origen VALOR_POR_DEFECTO. */
  motivoSinPerfil?: MotivoSinPerfil;
}

/**
 * `RevisionSolicitud` del contrato: lo que el analista de riesgo necesita para revisar una
 * solicitud (SOLVENTAG5-53), tal como quedó en sus registros. Solo lee.
 */
export interface RevisionSolicitud {
  solicitudId: string;
  cotizacionId: string;
  clienteId?: string;
  /** Ausente si la solicitud no tiene cliente o identidad no lo encuentra. */
  cliente?: ClienteEncontrado;
  estado: EstadoSolicitudSuscripcion;
  cobertura: { ramo: string; datosBien: Record<string, unknown> };
  prima: number;
  moneda: string;
  periodicidad: string;
  canal: 'web' | 'movil' | 'socio';
  aceptadaEn: string;
  /** Ausente si la cotización llegó sin usuario o su registro no se puede leer. */
  cotizadaPor?: Cotizante;
  /** La decisión automática; ausente sin decisión o si su registro no se puede leer. */
  decision?: DecisionSuscripcion;
  /** Ausente sin evaluación o si su registro no se puede leer. */
  versionReglas?: string;
  /** En el orden del catálogo. Ausente sin evaluación o si su registro no se puede leer. */
  reglasEvaluadas?: ReglaRevisionSuscripcion[];
  perfilRiesgo: PerfilRiesgoRevision;
  /** Solo con evaluación. False si un registro falta o no se pudo verificar al consultar. */
  registrosVerificables?: boolean;
}
