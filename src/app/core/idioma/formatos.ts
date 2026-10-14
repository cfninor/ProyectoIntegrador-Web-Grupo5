import { formatDate, formatNumber } from '@angular/common';

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
 * registrar los datos de es-CO. En los números solo cambia el separador de miles.
 */
const DATOS_IDIOMA = 'en-US';

/** Separador de miles de cada idioma: «280.000.000» en español y «280,000,000» en inglés. */
const SEPARADOR_MILES: Record<Idioma, string> = { 'es-CO': '.', 'en-US': ',' };

/** La fecha de `iso` en hora de Bogotá, con el formato del idioma. */
export function fechaBogota(iso: string, idioma: Idioma): string {
  return formatDate(iso, FORMATOS[idioma].fecha, DATOS_IDIOMA, ZONA_BOGOTA);
}

/** La hora de `iso` en hora de Bogotá, con el formato del idioma. */
export function horaBogota(iso: string, idioma: Idioma): string {
  return formatDate(iso, FORMATOS[idioma].hora, DATOS_IDIOMA, ZONA_BOGOTA);
}

/** Un número entero con el separador de miles del idioma: «280.000.000» o «280,000,000». */
export function numeroConMiles(valor: number, idioma: Idioma): string {
  return formatNumber(valor, DATOS_IDIOMA, '1.0-0').replace(/,/g, SEPARADOR_MILES[idioma]);
}

/** Un monto en COP, sin decimales (D8): «$ 148.500» en español y «$148,500» en inglés. */
export function montoCop(valor: number, idioma: Idioma): string {
  const numero = numeroConMiles(valor, idioma);
  return idioma === 'es-CO' ? `$ ${numero}` : `$${numero}`;
}
