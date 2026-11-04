/** `EstadoPoliza` del contrato del BFF web 1.3.0: PENDIENTE_FIRMA al generarse (SOLVENTAG5-56). */
export type EstadoPoliza = 'PENDIENTE_FIRMA';

/** GENERANDO desde que se crea la póliza hasta que el PDF queda guardado; GENERADO después. */
export type EstadoDocumentoPoliza = 'GENERANDO' | 'GENERADO';

/** Por qué una solicitud no genera su póliza (`MotivoNoEmitible`, D15). */
export type MotivoNoEmitible =
  'PRIMA_AJUSTADA_SIN_ACEPTAR' | 'RECHAZADA' | 'EN_REVISION' | 'SIN_DECISION';

/** `Poliza` del contrato: los datos salen de la solicitud y su decisión, sin recalcular. */
export interface Poliza {
  polizaId: string;
  solicitudId: string;
  cotizacionId: string;
  clienteId: string;
  estado: EstadoPoliza;
  ramo: string;
  sumaAsegurada: number;
  prima: number;
  moneda: string;
  periodicidad: string;
  /** Fecha de calendario (`2026-10-14`); provisional hasta la emisión (SOLVENTAG5-58). */
  vigenciaDesde: string;
  vigenciaHasta: string;
  tomador: { nombres: string; apellidos: string; documentoEnmascarado: string };
  condiciones: { version: string; coberturas: string[]; exclusiones: string[] };
  documento: {
    estado: EstadoDocumentoPoliza;
    /** Solo en GENERADO: la hora del hito «Documento generado». */
    generadoEn?: string;
    /** Solo en GENERADO: certifica la firma (SOLVENTAG5-57). */
    huella?: string;
  };
}

/** El cuerpo `Error` del 409 de `generarPolizaParaFirma`. */
export interface ErrorPoliza {
  /** En el 409: SOLICITUD_NO_EMITIBLE (con `motivo`) o SOLICITUD_SIN_CLIENTE. */
  codigo: string;
  detalle: string;
  /** Siempre en SOLICITUD_NO_EMITIBLE. */
  motivo?: MotivoNoEmitible;
}
