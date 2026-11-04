import { Poliza } from '../app/features/poliza/modelos';

// Datos de prueba de la póliza para firma, con los números del ejemplo PolizaGenerada del contrato
// 1.3.0 (SOLVENTAG5-56). El tomador es ficticio.

export const SOLICITUD_ID_POLIZA = '7a1c3e5f-2b4d-4c6e-8f1a-3b5d7f9a1c3e';
export const POLIZA_ID = '2b4d6f8a-3c5e-4a7b-9d1f-4e6a8c0b2d4f';
export const HUELLA = '2a08aa0f806720e8212242213f88a6f604b5b0f3c9ccad2ddaa5e35ac4c40e3d';

export const POLIZA_GENERANDO: Poliza = {
  polizaId: POLIZA_ID,
  solicitudId: SOLICITUD_ID_POLIZA,
  cotizacionId: '6f2e4d8c-1a3b-4d5e-9f7a-2c4e6a8b0d1f',
  clienteId: '9b1d4e2a-7c3f-4a8b-8e6d-2f1a3b5c7d9e',
  estado: 'PENDIENTE_FIRMA',
  ramo: 'VIDA_HIPOTECARIO',
  sumaAsegurada: 200_000_000,
  prima: 70_000,
  moneda: 'COP',
  periodicidad: 'MENSUAL',
  vigenciaDesde: '2026-10-14',
  vigenciaHasta: '2046-10-14',
  tomador: {
    nombres: 'María Fernanda',
    apellidos: 'Pérez Gómez',
    documentoEnmascarado: 'CC ••••5678',
  },
  condiciones: {
    version: 'VH-2026.1',
    coberturas: ['Fallecimiento del deudor', 'Incapacidad total y permanente del deudor'],
    exclusiones: [
      'Suicidio durante el primer año de vigencia',
      'Enfermedades o lesiones preexistentes no declaradas',
      'Lesiones causadas intencionalmente por el asegurado',
      'Actos de guerra o terrorismo',
    ],
  },
  documento: { estado: 'GENERANDO' },
};

/** Generada a las 16:32:10 UTC: 11:32 en Bogotá. */
export const POLIZA_GENERADA: Poliza = {
  ...POLIZA_GENERANDO,
  documento: { estado: 'GENERADO', generadoEn: '2026-10-14T16:32:10.850Z', huella: HUELLA },
};

/** El cuerpo de cada 409 de `generarPolizaParaFirma` (R2, D15), como en el contrato. */
export const NO_EMITIBLE = {
  PRIMA_AJUSTADA_SIN_ACEPTAR: {
    codigo: 'SOLICITUD_NO_EMITIBLE',
    motivo: 'PRIMA_AJUSTADA_SIN_ACEPTAR',
    detalle: 'El cliente debe aceptar la nueva prima antes de generar la póliza.',
  },
  RECHAZADA: {
    codigo: 'SOLICITUD_NO_EMITIBLE',
    motivo: 'RECHAZADA',
    detalle: 'La solicitud fue rechazada y no continúa a emisión.',
  },
  EN_REVISION: {
    codigo: 'SOLICITUD_NO_EMITIBLE',
    motivo: 'EN_REVISION',
    detalle: 'La solicitud está en revisión y todavía no continúa a emisión.',
  },
  SIN_DECISION: {
    codigo: 'SOLICITUD_NO_EMITIBLE',
    motivo: 'SIN_DECISION',
    detalle: 'La solicitud todavía no tiene una decisión de suscripción.',
  },
  SIN_CLIENTE: {
    codigo: 'SOLICITUD_SIN_CLIENTE',
    detalle: 'La solicitud no tiene un cliente para la póliza.',
  },
} as const;
