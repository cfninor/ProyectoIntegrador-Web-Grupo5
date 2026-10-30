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
 * reglas de suscripción (SOLVENTAG5-50). La decisión (SOLVENTAG5-51) agrega los siguientes.
 */
export type EstadoSolicitudSuscripcion = 'PENDIENTE_EVALUACION' | 'EVALUADA';

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
