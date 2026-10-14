import { getLocaleId } from '@angular/common';
import { clearTranslations } from '@angular/localize';

import {
  Almacen,
  CLAVE_PREFERENCIA,
  RUTA_TRADUCCION_INGLES,
  almacenDelNavegador,
  cargarTraducciones,
  guardarPreferencia,
  idiomaDe,
  idiomaInicial,
  leerPreferencia,
  prepararIdioma,
} from './idioma';

const INGLES = { locale: 'en-US', translations: { 'prueba.saludo': 'Hello' } };

function almacenEnMemoria(inicial: Record<string, string> = {}): Almacen & {
  datos: Record<string, string>;
} {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (clave) => datos[clave] ?? null,
    setItem: (clave, valor) => {
      datos[clave] = valor;
    },
  };
}

const almacenQueFalla: Almacen = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
};

function fetchQueResponde(cuerpo: unknown, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({ ok, status, json: async () => cuerpo });
}

afterEach(() => {
  clearTranslations();
  document.documentElement.lang = '';
});

describe('idiomaInicial', () => {
  it.each([
    ['en-US', 'es-CO', 'en-US'],
    ['es-CO', 'en-GB', 'es-CO'],
    [null, 'en-GB', 'en-US'],
    [null, 'EN', 'en-US'],
    [null, 'es-419', 'es-CO'],
    [null, 'fr-FR', 'es-CO'],
    [null, '', 'es-CO'],
    ['de-DE', 'en-US', 'en-US'],
  ])('guardado %s y navegador %s → %s', (guardado, navegador, esperado) => {
    expect(idiomaInicial(guardado, navegador)).toBe(esperado);
  });
});

describe('idiomaDe', () => {
  it.each([
    ['es-CO', 'es-CO'],
    ['en-US', 'en-US'],
    ['en', 'es-CO'],
    ['fr-FR', 'es-CO'],
  ])('LOCALE_ID %s → %s', (locale, esperado) => {
    expect(idiomaDe(locale)).toBe(esperado);
  });
});

describe('preferencia en localStorage', () => {
  it('lee y guarda la preferencia con la clave solventa.idioma', () => {
    const almacen = almacenEnMemoria();

    expect(leerPreferencia(almacen)).toBeNull();
    expect(guardarPreferencia('en-US', almacen)).toBe(true);
    expect(almacen.datos[CLAVE_PREFERENCIA]).toBe('en-US');
    expect(leerPreferencia(almacen)).toBe('en-US');
  });

  it('sin localStorage, o si falla, no hay preferencia ni se puede guardar', () => {
    expect(leerPreferencia(null)).toBeNull();
    expect(leerPreferencia(almacenQueFalla)).toBeNull();
    expect(guardarPreferencia('en-US', null)).toBe(false);
    expect(guardarPreferencia('en-US', almacenQueFalla)).toBe(false);
  });

  it('almacenDelNavegador da localStorage, o null si el navegador no lo deja usar', () => {
    expect(almacenDelNavegador()).toBe(globalThis.localStorage);

    expect(
      almacenDelNavegador(() => {
        throw new DOMException('Acceso denegado', 'SecurityError');
      }),
    ).toBeNull();
    expect(almacenDelNavegador(() => undefined)).toBeNull();
  });
});

describe('cargarTraducciones', () => {
  it('en español no descarga nada: es el idioma fuente', async () => {
    const fetchFn = fetchQueResponde(INGLES);

    await cargarTraducciones('es-CO', fetchFn as unknown as typeof fetch);

    expect(fetchFn).not.toHaveBeenCalled();
    expect($localize`:@@prueba.saludo:Hola`).toBe('Hola');
  });

  it('en inglés descarga /i18n/en-US.json y lo carga con loadTranslations', async () => {
    const fetchFn = fetchQueResponde(INGLES);

    await cargarTraducciones('en-US', fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledWith(RUTA_TRADUCCION_INGLES, { cache: 'no-cache' });
    expect($localize`:@@prueba.saludo:Hola`).toBe('Hello');
  });

  it('falla de forma explícita si el archivo no está disponible', async () => {
    const fetchFn = fetchQueResponde(null, false, 404);

    await expect(cargarTraducciones('en-US', fetchFn as unknown as typeof fetch)).rejects.toThrow(
      'HTTP 404',
    );
  });
});

describe('prepararIdioma', () => {
  it('con la preferencia en inglés carga la traducción, registra el idioma y pone <html lang>', async () => {
    const fetchFn = fetchQueResponde(INGLES);

    const idioma = await prepararIdioma({
      almacen: almacenEnMemoria({ [CLAVE_PREFERENCIA]: 'en-US' }),
      idiomaNavegador: 'es-CO',
      fetchFn: fetchFn as unknown as typeof fetch,
      documento: document,
    });

    expect(idioma).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
    expect(getLocaleId('en-US')).toBe('en');
    expect($localize`:@@prueba.saludo:Hola`).toBe('Hello');
  });

  it('sin preferencia y con el navegador en español, inicia en español sin descargar nada', async () => {
    const fetchFn = fetchQueResponde(INGLES);

    const idioma = await prepararIdioma({
      almacen: almacenEnMemoria(),
      idiomaNavegador: 'es-ES',
      fetchFn: fetchFn as unknown as typeof fetch,
      documento: document,
    });

    expect(idioma).toBe('es-CO');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(document.documentElement.lang).toBe('es-CO');
    expect(getLocaleId('es-CO')).toBe('es-CO');
  });

  it('si la traducción no se puede descargar, sigue en español', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchFn = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const idioma = await prepararIdioma({
      almacen: null,
      idiomaNavegador: 'en-US',
      fetchFn: fetchFn as unknown as typeof fetch,
      documento: document,
    });

    expect(idioma).toBe('es-CO');
    expect(document.documentElement.lang).toBe('es-CO');
    expect($localize`:@@prueba.saludo:Hola`).toBe('Hola');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('sin opciones usa localStorage, el idioma del navegador, fetch y document', async () => {
    localStorage.setItem(CLAVE_PREFERENCIA, 'es-CO');

    await expect(prepararIdioma()).resolves.toBe('es-CO');

    expect(document.documentElement.lang).toBe('es-CO');
    localStorage.removeItem(CLAVE_PREFERENCIA);
  });

  it('sin opciones y con la preferencia en inglés, descarga con el fetch del navegador', async () => {
    localStorage.setItem(CLAVE_PREFERENCIA, 'en-US');
    // jsdom no trae fetch: se simula el del navegador.
    const fetchFn = fetchQueResponde(INGLES);
    globalThis.fetch = fetchFn as unknown as typeof fetch;

    await expect(prepararIdioma()).resolves.toBe('en-US');

    expect(fetchFn).toHaveBeenCalledWith(RUTA_TRADUCCION_INGLES, { cache: 'no-cache' });
    expect(document.documentElement.lang).toBe('en-US');
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    localStorage.removeItem(CLAVE_PREFERENCIA);
  });
});
