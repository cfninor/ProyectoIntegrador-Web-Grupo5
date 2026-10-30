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
}
