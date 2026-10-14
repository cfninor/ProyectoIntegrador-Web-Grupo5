import { formatDate } from '@angular/common';

import { Idioma } from './idioma';

/** Bogotá: UTC−05:00, sin horario de verano. Las fechas del portal se muestran en esta hora. */
export const ZONA_BOGOTA = '-0500';

/** Formatos de fecha y hora de cada idioma (D8). */
const FORMATOS: Record<Idioma, { fecha: string; hora: string }> = {
  // «el 09/10/2026 a las 09:30»
  'es-CO': { fecha: 'dd/MM/yyyy', hora: 'HH:mm' },
  // «on Oct 9, 2026 at 9:30 AM»
  'en-US': { fecha: 'MMM d, y', hora: 'h:mm a' },
};

/**
 * Datos de idioma con que se formatea: los de en-US, que Angular trae siempre. Los formatos de
 * es-CO son solo numéricos y no dependen de nombres de meses ni de AM/PM, así que funcionan sin
 * registrar los datos de es-CO.
 */
const DATOS_IDIOMA = 'en-US';

/** La fecha de `iso` en hora de Bogotá, con el formato del idioma. */
export function fechaBogota(iso: string, idioma: Idioma): string {
  return formatDate(iso, FORMATOS[idioma].fecha, DATOS_IDIOMA, ZONA_BOGOTA);
}

/** La hora de `iso` en hora de Bogotá, con el formato del idioma. */
export function horaBogota(iso: string, idioma: Idioma): string {
  return formatDate(iso, FORMATOS[idioma].hora, DATOS_IDIOMA, ZONA_BOGOTA);
}
