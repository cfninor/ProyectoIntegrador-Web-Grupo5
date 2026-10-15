/**
 * Tipos de la cotización y de la búsqueda de cliente, iguales a los esquemas de
 * contracts/bff-web.openapi.yaml (SOLVENTAG5-47 y SOLVENTAG5-132). La API solo devuelve códigos:
 * los textos están en las plantillas.
 */

export type Ramo = 'VIDA_HIPOTECARIO';
export type TipoDocumento = 'CC' | 'CE' | 'PA' | 'PPT';
export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';
export type EstadoCotizacion = 'VIGENTE' | 'VENCIDA';
export type MotivoSinPerfil = 'SIN_CLIENTE' | 'SIN_CONSENTIMIENTO' | 'PERFIL_NO_DISPONIBLE';
export type EstadoAutorizacion =
  'SIN_SOLICITAR' | 'ESPERANDO_CLIENTE' | 'AUTORIZADA' | 'REVOCADA' | 'VENCIDA';

export interface DatosBienVidaHipotecario {
  montoCredito: number;
  plazoAnios: number;
  ciudadInmueble: string;
  entidadAcreedora: string;
}

export interface SolicitudCotizacion {
  ramo: Ramo;
  datosBien: DatosBienVidaHipotecario;
  /** Opcional: sin él la prima usa el valor por defecto (motivo SIN_CLIENTE). */
  clienteId?: string;
}

export interface SenalesPerfil {
  comportamientoPago: number;
  estabilidadIngresos: number;
  ubicacion: number;
  endeudamiento: number;
}

export interface PerfilUsado {
  perfilId: string;
  version: number;
  score: number;
  nivel: NivelRiesgo;
  senales: SenalesPerfil;
  calculadoEn: string;
  vigenteHasta: string;
}

export interface Cotizacion {
  cotizacionId: string;
  ramo: Ramo;
  datosBien: DatosBienVidaHipotecario;
  clienteId?: string;
  /** Prima mensual en COP, redondeada al peso. */
  prima: number;
  moneda: 'COP';
  periodicidad: 'MENSUAL';
  fechaCotizacion: string;
  /** Fin de la vigencia de la oferta: fechaCotizacion + 7 días. */
  vigenteHasta: string;
  estado: EstadoCotizacion;
  calculadaSinPerfil: boolean;
  /** Solo cuando calculadaSinPerfil es true. */
  motivoSinPerfil?: MotivoSinPerfil;
  /** Solo cuando calculadaSinPerfil es false. */
  perfil?: PerfilUsado;
}

export interface BusquedaCliente {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
}

export interface ClienteEncontrado {
  clienteId: string;
  nombres: string;
  apellidos: string;
  /** El tipo y los cuatro últimos caracteres del número: `CC ••••5678`. */
  documentoEnmascarado: string;
}

/** Estado de la autorización de datos de un cliente, para el asesor (SOLVENTAG5-65). */
export interface EstadoAutorizacionCliente {
  clienteId: string;
  estado: EstadoAutorizacion;
  /** Fecha del evento que fija el estado; no aplica a SIN_SOLICITAR. */
  fechaEstado?: string;
  solicitudId?: string;
  consentimientoId?: string;
  fechaVencimiento?: string;
}

/** Cuerpo de «pedir autorización»: los datos del asesor salen de la sesión (D4). */
export interface PedirAutorizacion {
  asesor: { id: string; nombre: string };
}

/** Respuesta de «pedir autorización»: 201 con una solicitud nueva, 200 si se reenvió. */
export interface SolicitudEnviada {
  solicitudId: string;
  estado: 'PENDIENTE';
  fechaSolicitud: string;
  envios: number;
  reenviada: boolean;
  enlace: string;
}

/** Cuerpo `Error` del contrato. `campos` solo viene en DATOS_BIEN_INVALIDOS. */
export interface ErrorApi {
  codigo: string;
  detalle: string;
  campos?: string[];
}

/** Rangos de DatosBienVidaHipotecario en el contrato: la pantalla valida antes de enviar (D7). */
export const RANGOS = {
  montoCredito: { minimo: 10_000_000, maximo: 1_200_000_000 },
  plazoAnios: { minimo: 5, maximo: 30 },
  ciudadInmueble: { minimo: 2, maximo: 80 },
  entidadAcreedora: { minimo: 2, maximo: 120 },
} as const;

/** CC, CE y PPT: de 6 a 10 dígitos. PA: de 6 a 12 letras o dígitos (contrato de la búsqueda). */
export const PATRON_DOCUMENTO: Record<TipoDocumento, RegExp> = {
  CC: /^\d{6,10}$/,
  CE: /^\d{6,10}$/,
  PPT: /^\d{6,10}$/,
  PA: /^[A-Za-z0-9]{6,12}$/,
};

export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = ['CC', 'CE', 'PA', 'PPT'];
