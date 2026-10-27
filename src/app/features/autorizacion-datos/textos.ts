import {
  BaseLegal,
  CodigoDato,
  CodigoEntidad,
  Destinatario,
  EstadoSolicitud,
  Finalidad,
  FuenteDatos,
} from './modelos';

/**
 * Textos del catálogo v1 de la autorización de datos. La API devuelve códigos y aquí se
 * traducen, todos con $localize e id explícito.
 */

export interface TextoDato {
  nombre: string;
  descripcion?: string;
}

export const TEXTOS_FUENTE: Record<FuenteDatos, string> = {
  OPEN_FINANCE: $localize`:@@autorizacion.fuente.openFinance:Open Finance`,
  OPEN_DATA: $localize`:@@autorizacion.fuente.openData:Open Data`,
};

export const TEXTOS_DATO: Record<CodigoDato, TextoDato> = {
  COMPORTAMIENTO_PAGO: {
    nombre: $localize`:@@autorizacion.dato.comportamientoPago.nombre:Comportamiento de pago y endeudamiento`,
    descripcion: $localize`:@@autorizacion.dato.comportamientoPago.descripcion:Cómo pagas tus créditos y cuánto debes hoy`,
  },
  ESTABILIDAD_INGRESOS: {
    nombre: $localize`:@@autorizacion.dato.estabilidadIngresos.nombre:Estabilidad de ingresos`,
    descripcion: $localize`:@@autorizacion.dato.estabilidadIngresos.descripcion:Cómo han variado tus ingresos en el tiempo`,
  },
  SOCIODEMOGRAFICA_TERRITORIAL: {
    nombre: $localize`:@@autorizacion.dato.sociodemograficaTerritorial.nombre:Información sociodemográfica y territorial de tu zona`,
  },
  SALUD_ACTUARIAL_AGREGADA: {
    nombre: $localize`:@@autorizacion.dato.saludActuarialAgregada.nombre:Salud pública y datos actuariales agregados`,
    descripcion: $localize`:@@autorizacion.dato.saludActuarialAgregada.descripcion:Indicadores de la población, no tu historia clínica`,
  },
  INMUEBLE_UBICACION: {
    nombre: $localize`:@@autorizacion.dato.inmuebleUbicacion.nombre:Datos del inmueble y su ubicación`,
  },
};

export const TEXTOS_ENTIDAD: Record<CodigoEntidad, string> = {
  ENTIDADES_FINANZAS_ABIERTAS: $localize`:@@autorizacion.entidad.entidadesFinanzasAbiertas:Entidades financieras del esquema de finanzas abiertas (simulado)`,
  DANE: $localize`:@@autorizacion.entidad.dane:DANE`,
  MINSALUD: $localize`:@@autorizacion.entidad.minsalud:Ministerio de Salud y Protección Social`,
  IGAC: $localize`:@@autorizacion.entidad.igac:Instituto Geográfico Agustín Codazzi`,
};

export const TEXTOS_FINALIDAD: Record<Finalidad, string> = {
  PERFILAMIENTO_VIDA_HIPOTECARIO: $localize`:@@autorizacion.condiciones.finalidad.perfilamientoVidaHipotecario:Para calcular tu perfil de riesgo y el precio personalizado de tu seguro de vida hipotecario`,
};

export const TEXTOS_DESTINATARIO: Record<Destinatario, string> = {
  SOLVENTA: $localize`:@@autorizacion.condiciones.destinatario.solventa:Solventa usa el resultado para calcular tu prima. Tu asesor ve el estado de la autorización y la prima, no tus datos`,
};

/** A quién autoriza el consentimiento, en una palabra, para «Mis autorizaciones» (SOLVENTAG5-84). */
export const TEXTOS_NOMBRE_DESTINATARIO: Record<Destinatario, string> = {
  SOLVENTA: $localize`:@@autorizacion.destinatario.solventa:Solventa`,
};

export const TEXTOS_BASE_LEGAL: Record<BaseLegal, string> = {
  LEY_1581_2012: $localize`:@@autorizacion.condiciones.baseLegal.ley15812012:Ley 1581 de 2012`,
  DECRETO_1297_2022: $localize`:@@autorizacion.condiciones.baseLegal.decreto12972022:Decreto 1297 de 2022`,
};

export const TEXTO_COMO_REVOCAR = $localize`:@@autorizacion.condiciones.comoRevocar:Desde «Mis autorizaciones», cuando quieras. Dejamos de consultar tus datos en máximo 5 minutos y tus pólizas vigentes siguen activas`;

export function textoDuracion(meses: number): string {
  return $localize`:@@autorizacion.condiciones.duracion:La autorización dura ${meses}:meses: meses`;
}

export const TEXTOS_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  PENDIENTE: $localize`:@@autorizacion.estado.pendiente:Pendiente`,
  AUTORIZADA: $localize`:@@autorizacion.estado.autorizada:Autorizada`,
  NO_AUTORIZADA: $localize`:@@autorizacion.estado.noAutorizada:No autorizada`,
};

/**
 * Texto de un código. Si la API trae un código que esta versión del portal no conoce (por
 * ejemplo, de un catálogo nuevo), se muestra el código en vez de dejar el espacio vacío.
 */
export function texto<C extends string>(textos: Record<C, string>, codigo: C): string {
  return textos[codigo] ?? codigo;
}
