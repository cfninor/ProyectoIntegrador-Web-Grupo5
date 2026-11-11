import { DocumentoParaFirmar, Firma } from '../app/features/poliza/modelos';
import { HUELLA, POLIZA_GENERADA, POLIZA_ID } from './fixtures-poliza';

// Datos de prueba de la firma electrónica (SOLVENTAG5-57), con los ejemplos del contrato 1.6.0
// (FirmaPendienteEnvio, FirmaEnviada, FirmaAbierta, FirmaFirmada, FirmaVencida y
// DocumentoParaFirmarAbierto). Las horas en UTC; en Bogotá son 5 horas menos.

export const FIRMA_ID = '8c1e3a5f-7b9d-4f2a-8e4c-6a8b0d2f4e6a';

/** Pedida; el envío todavía no sale. Vence el 09/11/2026 a las 10:02 en Bogotá. */
export const FIRMA_PENDIENTE_ENVIO: Firma = {
  firmaId: FIRMA_ID,
  polizaId: POLIZA_ID,
  estado: 'PENDIENTE_ENVIO',
  venceEn: '2026-11-09T15:02:00.000Z',
  documentoGeneradoEn: '2026-10-14T16:32:10.850Z',
};

/** Enviada el 06/11/2026 a las 10:02. */
export const FIRMA_ENVIADA: Firma = {
  ...FIRMA_PENDIENTE_ENVIO,
  estado: 'ENVIADA',
  enviadaEn: '2026-11-06T15:02:01.400Z',
};

/** Abierta el 06/11/2026 a las 10:20. */
export const FIRMA_ABIERTA: Firma = {
  ...FIRMA_ENVIADA,
  estado: 'ABIERTA',
  abiertaEn: '2026-11-06T15:20:12.300Z',
};

/** Firmada el 06/11/2026 a las 10:23, con su certificado. */
export const FIRMA_FIRMADA: Firma = {
  ...FIRMA_ABIERTA,
  estado: 'FIRMADA',
  firmadaEn: '2026-11-06T15:23:45.120Z',
  certificado: {
    firmadaEn: '2026-11-06T15:23:45.120Z',
    ip: '203.0.113.24',
    huella: HUELLA,
    referencia: '4d6f8a1c-3e5b-4c7d-9f1a-2b4c6d8e0f1a',
  },
};

/** Vencida: procesada el 09/11/2026 a las 10:02. */
export const FIRMA_VENCIDA: Firma = {
  ...FIRMA_ABIERTA,
  estado: 'VENCIDA',
  vencidaEn: '2026-11-09T15:02:30.000Z',
};

/** Lo que ve el cliente al abrir el enlace: la vista previa de la póliza generada, sin sus ids. */
export const DOCUMENTO_PARA_FIRMAR: DocumentoParaFirmar = {
  firmaId: FIRMA_ID,
  estado: 'ABIERTA',
  venceEn: '2026-11-09T15:02:00.000Z',
  huella: HUELLA,
  tomador: POLIZA_GENERADA.tomador,
  ramo: POLIZA_GENERADA.ramo,
  sumaAsegurada: POLIZA_GENERADA.sumaAsegurada,
  prima: POLIZA_GENERADA.prima,
  moneda: POLIZA_GENERADA.moneda,
  periodicidad: POLIZA_GENERADA.periodicidad,
  vigenciaDesde: POLIZA_GENERADA.vigenciaDesde,
  vigenciaHasta: POLIZA_GENERADA.vigenciaHasta,
  condiciones: POLIZA_GENERADA.condiciones,
};

/** Un cuerpo `Error` de la firma, como en el contrato. */
export function errorFirma(codigo: string, intentosRestantes?: number) {
  return {
    codigo,
    detalle: `Detalle de ${codigo}.`,
    ...(intentosRestantes === undefined ? {} : { intentosRestantes }),
  };
}
