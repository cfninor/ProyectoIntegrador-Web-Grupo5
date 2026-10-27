/**
 * Tipos de la autorización de datos, iguales a los esquemas de contracts/bff-web.openapi.yaml.
 * La API solo devuelve códigos: los textos están en textos.ts.
 */

export type EstadoSolicitud = 'PENDIENTE' | 'AUTORIZADA' | 'NO_AUTORIZADA';
export type EstadoConsentimiento = 'VIGENTE' | 'REVOCADO' | 'VENCIDO';
export type TipoDecision = 'AUTORIZAR' | 'NO_AUTORIZAR';
export type FuenteDatos = 'OPEN_FINANCE' | 'OPEN_DATA';
export type CodigoDato =
  | 'COMPORTAMIENTO_PAGO'
  | 'ESTABILIDAD_INGRESOS'
  | 'SOCIODEMOGRAFICA_TERRITORIAL'
  | 'SALUD_ACTUARIAL_AGREGADA'
  | 'INMUEBLE_UBICACION';
export type CodigoEntidad = 'ENTIDADES_FINANZAS_ABIERTAS' | 'DANE' | 'MINSALUD' | 'IGAC';
export type Finalidad = 'PERFILAMIENTO_VIDA_HIPOTECARIO';
export type Destinatario = 'SOLVENTA';
export type BaseLegal = 'LEY_1581_2012' | 'DECRETO_1297_2022';

export interface DatoCatalogo {
  codigo: CodigoDato;
  entidades: CodigoEntidad[];
}

export interface FuenteCatalogo {
  fuente: FuenteDatos;
  datos: DatoCatalogo[];
}

export interface Catalogo {
  version: string;
  fuentes: FuenteCatalogo[];
}

export interface Condiciones {
  duracionMeses: number;
  finalidad: Finalidad;
  destinatario: Destinatario;
  baseLegal: BaseLegal[];
  versionPolitica: string;
}

/** Sin clienteId ni el id del asesor (minimización). */
export interface SolicitudParaCliente {
  solicitudId: string;
  estado: EstadoSolicitud;
  asesor: { nombre: string };
  /** ISO 8601 en UTC. */
  fechaSolicitud: string;
  catalogo: Catalogo;
  condiciones: Condiciones;
  fechaDecision?: string;
}

export interface DecisionSolicitud {
  decision: TipoDecision;
  aceptaPolitica: boolean;
  versionPolitica: string;
}

export interface Consentimiento {
  consentimientoId: string;
  estado: EstadoConsentimiento;
  alcance: CodigoDato[];
  finalidad: Finalidad;
  destinatario: Destinatario;
  versionCatalogo: string;
  versionPolitica: string;
  fechaOtorga: string;
  fechaVencimiento: string;
  fechaRevoca?: string;
}

/** Los consentimientos del cliente, los vigentes primero (SOLVENTAG5-84). */
export interface ConsentimientosCliente {
  clienteId: string;
  consentimientos: Consentimiento[];
}

export interface ResultadoDecision {
  solicitudId: string;
  estado: EstadoSolicitud;
  consentimiento?: Consentimiento;
}

/** Cuerpo de los errores 404, 409, 422 (de dominio) y 503 del BFF. */
export interface ErrorApi {
  codigo: string;
  detalle: string;
}
