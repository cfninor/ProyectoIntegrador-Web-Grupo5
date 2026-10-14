import { translations as ingles } from '../../../../public/i18n/en-US.json';
import { locale, translations as fuente } from '../../../locale/messages.json';

/** Marcadores de un mensaje, como {$INTERPOLATION} o {$meses}, en orden alfabético. */
function marcadores(mensaje: string): string[] {
  return (mensaje.match(/\{\$[A-Za-z0-9_]+\}/g) ?? []).sort();
}

const textosFuente: Record<string, string> = fuente;
const textosIngles: Record<string, string> = ingles;

describe('traducción al inglés (D12)', () => {
  it('messages.json es la extracción en el idioma fuente es-CO', () => {
    expect(locale).toBe('es-CO');
    expect(Object.keys(textosFuente).length).toBeGreaterThan(0);
  });

  it('todo id de messages.json tiene traducción en en-US.json', () => {
    const sinTraduccion = Object.keys(textosFuente).filter((id) => !textosIngles[id]?.trim());

    expect(sinTraduccion).toEqual([]);
  });

  it('en-US.json no tiene ids que ya no existen en messages.json', () => {
    const sobrantes = Object.keys(textosIngles).filter((id) => !(id in textosFuente));

    expect(sobrantes).toEqual([]);
  });

  it('cada traducción tiene los mismos marcadores que su texto fuente', () => {
    const distintos = Object.keys(textosFuente).filter(
      (id) => marcadores(textosFuente[id]).join() !== marcadores(textosIngles[id] ?? '').join(),
    );

    expect(distintos).toEqual([]);
  });
});
