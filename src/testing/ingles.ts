import { LOCALE_ID } from '@angular/core';
import { loadTranslations } from '@angular/localize';

import { translations } from '../../public/i18n/en-US.json';

/**
 * Carga la traducción al inglés (D12) para las pruebas en inglés. Debe ser la primera importación
 * de la prueba: los textos con $localize se traducen al cargar sus módulos. Jest aísla los módulos
 * por archivo, así que las demás pruebas siguen en español.
 */
loadTranslations(translations);

/** `LOCALE_ID` del portal en inglés, como lo provee `iniciar-aplicacion.ts`. */
export const IDIOMA_INGLES = { provide: LOCALE_ID, useValue: 'en-US' };
