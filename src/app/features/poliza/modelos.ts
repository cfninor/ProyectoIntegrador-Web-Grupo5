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

// --- Cobro de la primera prima (SOLVENTAG5-74) -----------------------------------------------

/** Único medio soportado por ahora (D2 de la SOLVENTAG5-74). */
export type MedioPago = 'TARJETA';

/** `EstadoPago` del contrato: PROCESANDO mientras la pasarela no responde a tiempo (R3). */
export type EstadoPago = 'PROCESANDO' | 'APROBADO' | 'RECHAZADO';

/** El token que entrega `POST /tokenizaciones` del simulador de la pasarela (nunca el PAN). */
export interface TokenTarjeta {
  token: string;
  marca: string;
  ultimos4: string;
  vencimiento: string;
}

/** Cuerpo de `POST /v1/polizas/{polizaId}/cobro`. */
export interface CobroPrima {
  medioPago: MedioPago;
  token: string;
}

/** `Pago` del contrato: el resultado del intento de cobro. */
export interface Pago {
  pagoId: string;
  polizaId: string;
  estado: EstadoPago;
  monto: number;
  moneda: string;
  medio: MedioPago;
  creadoEn: string;
  actualizadoEn?: string;
  /** Solo cuando la pasarela ya respondió (APROBADO o RECHAZADO); en PROCESANDO, ausente. */
  referenciaPasarela?: string;
  marca?: string;
  ultimos4?: string;
  vencimiento?: string;
}

/** El cuerpo `Error` de los 409/422 del cobro (SOLVENTAG5-121: clave de idempotencia). */
export interface ErrorPago {
  codigo:
    'POLIZA_NO_PAGABLE' | 'CLAVE_IDEMPOTENCIA_EN_CURSO' | 'CLAVE_IDEMPOTENCIA_REUTILIZADA' | string;
  detalle: string;
}
