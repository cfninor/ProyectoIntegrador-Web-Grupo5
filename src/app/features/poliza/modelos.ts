/**
 * `EstadoPoliza` del contrato del BFF web 1.6.0: PENDIENTE_FIRMA al generarse (SOLVENTAG5-56) y
 * CANCELADA si el cliente no firma en 72 horas (SOLVENTAG5-57, CA5).
 */
export type EstadoPoliza = 'PENDIENTE_FIRMA' | 'CANCELADA';

/** GENERANDO desde que se crea la póliza hasta que el PDF queda guardado; GENERADO después. */
export type EstadoDocumentoPoliza = 'GENERANDO' | 'GENERADO';

/** Por qué una solicitud no genera su póliza (`MotivoNoEmitible`, D15). */
export type MotivoNoEmitible =
  'PRIMA_AJUSTADA_SIN_ACEPTAR' | 'RECHAZADA' | 'EN_REVISION' | 'SIN_DECISION';

/**
 * Lo que muestra la vista previa del documento: los campos de la póliza que ve el cliente. Los
 * traen la `Poliza` y el `DocumentoParaFirmar` de la página pública (SOLVENTAG5-57, R10).
 */
export interface DatosVistaPrevia {
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
}

/** `Poliza` del contrato: los datos salen de la solicitud y su decisión, sin recalcular. */
export interface Poliza extends DatosVistaPrevia {
  polizaId: string;
  solicitudId: string;
  cotizacionId: string;
  clienteId: string;
  estado: EstadoPoliza;
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

// --- Firma electrónica (SOLVENTAG5-57) -------------------------------------------------------

/**
 * `EstadoFirma` del contrato (R2). PENDIENTE_ENVIO, ENVIADA y ABIERTA se muestran como «Esperando
 * firma»; VENCIDA llega a las 72 horas desde cualquiera de los tres.
 */
export type EstadoFirma = 'PENDIENTE_ENVIO' | 'ENVIADA' | 'ABIERTA' | 'FIRMADA' | 'VENCIDA';

/** Los estados en curso: se consulta el seguimiento mientras la firma está en uno de ellos. */
export const FIRMA_EN_CURSO: readonly EstadoFirma[] = ['PENDIENTE_ENVIO', 'ENVIADA', 'ABIERTA'];

/** Los estados en que se puede reenviar el enlace (R3). */
export const FIRMA_REENVIABLE: readonly EstadoFirma[] = ['ENVIADA', 'ABIERTA'];

/** `CertificadoFirma` del contrato (CA3, D8). */
export interface CertificadoFirma {
  firmadaEn: string;
  ip: string;
  huella: string;
  referencia: string;
}

/** `Firma` del contrato: el estado y sus hitos, cada uno desde que ocurre (R10). */
export interface Firma {
  firmaId: string;
  polizaId: string;
  estado: EstadoFirma;
  venceEn: string;
  documentoGeneradoEn: string;
  enviadaEn?: string;
  abiertaEn?: string;
  firmadaEn?: string;
  vencidaEn?: string;
  /** Solo en FIRMADA. */
  certificado?: CertificadoFirma;
}

/** `DocumentoParaFirmar` del contrato: lo que ve el cliente en la página pública (R4, R10). */
export interface DocumentoParaFirmar extends DatosVistaPrevia {
  firmaId: string;
  estado: EstadoFirma;
  venceEn: string;
  huella: string;
}

/** Los 409 de `enviarFirma` (R1): la firma todavía no se puede pedir. */
export type CodigoFirmaNoHabilitada =
  'DOCUMENTO_EN_GENERACION' | 'PAGO_NO_APROBADO' | 'CLIENTE_SIN_CONTACTO';

/** Los 409 de `firmarConCodigo` (R5). */
export type CodigoFirmaRechazada =
  'ENLACE_VENCIDO' | 'CODIGO_USADO' | 'CODIGO_VENCIDO' | 'DOCUMENTO_ALTERADO' | 'CODIGO_INVALIDO';

/** El cuerpo `Error` de las rutas de la firma; `intentosRestantes` solo en CODIGO_INVALIDO. */
export interface ErrorFirma {
  codigo: string;
  detalle: string;
  intentosRestantes?: number;
}
