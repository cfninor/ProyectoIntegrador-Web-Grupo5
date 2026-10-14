import { registerLocaleData } from '@angular/common';
import localeEn from '@angular/common/locales/en';
import localeEsCo from '@angular/common/locales/es-CO';
import { loadTranslations } from '@angular/localize';

/**
 * Idioma del portal con un solo build (D12): español (`es-CO`, idioma fuente) e inglés
 * (`en-US`). La traducción se carga al iniciar con `loadTranslations`, antes de importar la
 * aplicación, porque los textos con `$localize` se traducen al cargar sus módulos.
 */
export const IDIOMAS = ['es-CO', 'en-US'] as const;

export type Idioma = (typeof IDIOMAS)[number];

export const IDIOMA_FUENTE: Idioma = 'es-CO';

/** Clave de `localStorage` con la preferencia que guarda el selector ES / EN. */
export const CLAVE_PREFERENCIA = 'solventa.idioma';

/** Archivo con la traducción al inglés, con los mismos ids de `src/locale/messages.json`. */
export const RUTA_TRADUCCION_INGLES = '/i18n/en-US.json';

/** Formato de `messages.json` y de `en-US.json`: el que genera `ng extract-i18n --format json`. */
export interface ArchivoTraducciones {
  locale: string;
  translations: Record<string, string>;
}

/** Lo mínimo de `localStorage` que se usa: así las pruebas lo sustituyen. */
export type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

export function esIdioma(valor: unknown): valor is Idioma {
  return (IDIOMAS as readonly unknown[]).includes(valor);
}

/** El idioma del portal para un `LOCALE_ID`; uno que el portal no maneja es el idioma fuente. */
export function idiomaDe(locale: string): Idioma {
  return esIdioma(locale) ? locale : IDIOMA_FUENTE;
}

/**
 * `localStorage`, o null si el navegador no lo deja usar: con las cookies bloqueadas, leer
 * `localStorage` lanza una excepción. `obtener` solo se pasa en las pruebas.
 */
export function almacenDelNavegador(
  obtener: () => Almacen | undefined = () => globalThis.localStorage,
): Almacen | null {
  try {
    return obtener() ?? null;
  } catch {
    return null;
  }
}

export function leerPreferencia(almacen: Almacen | null): string | null {
  try {
    return almacen?.getItem(CLAVE_PREFERENCIA) ?? null;
  } catch {
    return null;
  }
}

/**
 * Guarda la preferencia. Devuelve false si no se pudo (sin `localStorage`): entonces recargar no
 * cambiaría el idioma.
 */
export function guardarPreferencia(idioma: Idioma, almacen: Almacen | null): boolean {
  try {
    almacen?.setItem(CLAVE_PREFERENCIA, idioma);
    return almacen !== null;
  } catch {
    return false;
  }
}

/** La preferencia guardada; si no hay, `en-US` con el navegador en inglés y `es-CO` si no. */
export function idiomaInicial(guardado: string | null, idiomaNavegador: string): Idioma {
  if (esIdioma(guardado)) {
    return guardado;
  }
  return idiomaNavegador.toLowerCase().startsWith('en') ? 'en-US' : IDIOMA_FUENTE;
}

/** Descarga la traducción al inglés y la carga. El español es el idioma fuente: no se carga nada. */
export async function cargarTraducciones(
  idioma: Idioma,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (idioma === IDIOMA_FUENTE) {
    return;
  }
  const respuesta = await fetchFn(RUTA_TRADUCCION_INGLES, { cache: 'no-cache' });
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar ${RUTA_TRADUCCION_INGLES} (HTTP ${respuesta.status})`);
  }
  const archivo = (await respuesta.json()) as ArchivoTraducciones;
  loadTranslations(archivo.translations);
}

/** Registra los datos del idioma para fechas y números, y pone `<html lang>`. */
export function aplicarIdioma(idioma: Idioma, documento: Document): void {
  registerLocaleData(idioma === 'en-US' ? localeEn : localeEsCo, idioma);
  documento.documentElement.lang = idioma;
}

export interface OpcionesIdioma {
  almacen?: Almacen | null;
  idiomaNavegador?: string;
  fetchFn?: typeof fetch;
  documento?: Document;
}

/**
 * Elige el idioma, carga su traducción y lo aplica. Si la traducción no se puede descargar, el
 * portal sigue en español: es mejor que no abrir.
 */
export async function prepararIdioma(opciones: OpcionesIdioma = {}): Promise<Idioma> {
  const {
    almacen = almacenDelNavegador(),
    idiomaNavegador = globalThis.navigator?.language ?? '',
    // Perezoso: en español no se descarga nada y no se toca `fetch`.
    fetchFn = (...argumentos: Parameters<typeof fetch>) => fetch(...argumentos),
    documento = document,
  } = opciones;
  let idioma = idiomaInicial(leerPreferencia(almacen), idiomaNavegador);
  try {
    await cargarTraducciones(idioma, fetchFn);
  } catch (error) {
    console.error('No se pudo cargar la traducción; el portal sigue en español.', error);
    idioma = IDIOMA_FUENTE;
  }
  aplicarIdioma(idioma, documento);
  return idioma;
}
