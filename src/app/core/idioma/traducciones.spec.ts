import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { translations as ingles } from '../../../../public/i18n/en-US.json';
import { locale, translations as fuente } from '../../../locale/messages.json';

/** Marcadores de un mensaje, como {$INTERPOLATION} o {$meses}, en orden alfabético. */
function marcadores(mensaje: string): string[] {
  return (mensaje.match(/\{\$[A-Za-z0-9_]+\}/g) ?? []).sort();
}

/**
 * Los ids de i18n que usa el código (`@@id` en plantillas y en $localize), sin las pruebas.
 * `ng extract-i18n` solo ve lo que ya tiene ruta; esto ve también lo que todavía no la tiene,
 * como el formulario de cotización antes de las partes 6 y 7.
 */
function idsDelCodigo(carpeta: string): Set<string> {
  const ids = new Set<string>();
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      idsDelCodigo(ruta).forEach((id) => ids.add(id));
    } else if (/\.(ts|html)$/.test(entrada.name) && !entrada.name.endsWith('.spec.ts')) {
      for (const [, id] of readFileSync(ruta, 'utf-8').matchAll(/@@([A-Za-z0-9_.]+)/g)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

const textosFuente: Record<string, string> = fuente;
const textosIngles: Record<string, string> = ingles;
const usados = idsDelCodigo(join(__dirname, '../..'));

describe('traducción al inglés (D12)', () => {
  it('messages.json es la extracción en el idioma fuente es-CO', () => {
    expect(locale).toBe('es-CO');
    expect(Object.keys(textosFuente).length).toBeGreaterThan(0);
  });

  it('todo id de messages.json tiene traducción en en-US.json', () => {
    const sinTraduccion = Object.keys(textosFuente).filter((id) => !textosIngles[id]?.trim());

    expect(sinTraduccion).toEqual([]);
  });

  it('todo id del código tiene traducción, también el de pantallas que aún no tienen ruta', () => {
    const sinTraduccion = [...usados].filter((id) => !textosIngles[id]?.trim());

    expect(usados.size).toBeGreaterThanOrEqual(Object.keys(textosFuente).length);
    expect(sinTraduccion).toEqual([]);
  });

  it('en-US.json no tiene ids que el código ya no usa', () => {
    const sobrantes = Object.keys(textosIngles).filter((id) => !usados.has(id));

    expect(sobrantes).toEqual([]);
  });

  it('cada traducción tiene los mismos marcadores que su texto fuente', () => {
    const distintos = Object.keys(textosFuente).filter(
      (id) => marcadores(textosFuente[id]).join() !== marcadores(textosIngles[id] ?? '').join(),
    );

    expect(distintos).toEqual([]);
  });
});
