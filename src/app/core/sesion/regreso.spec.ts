import { destinoAlIngresar } from './regreso';

describe('destinoAlIngresar (R11)', () => {
  it.each([
    ['/asesor', 'ASESOR'],
    ['/asesor/cotizar', 'ASESOR'],
    ['/asesor/cotizar/oferta/c-1?vista=2#resumen', 'ASESOR'],
    ['/cliente/cotizar', 'CLIENTE'],
    ['/riesgo', 'ANALISTA_RIESGO'],
  ] as const)('%s es una ruta del portal de %s: vuelve ahí', (volver, rol) => {
    expect(destinoAlIngresar(volver, rol)).toBe(volver);
  });

  it.each([
    ['sin volver', null],
    ['vacío', ''],
    ['de otro portal', '/cliente/cotizar'],
    ['un prefijo que se parece', '/asesores'],
    ['la raíz', '/'],
    ['una ruta pública', '/autorizar/s-1'],
    ['//dominio', '//evil.example/asesor'],
    ['// en medio', '/asesor//evil.example'],
    ['una URL absoluta', 'https://evil.example/asesor'],
    ['un esquema', 'javascript:alert(1)'],
    ['relativa', 'asesor/cotizar'],
    ['con barra invertida', '/\\evil.example'],
    ['con un tabulador', '/\t/evil.example'],
    ['que sube de nivel', '/asesor/../cliente'],
    ['con un punto', '/asesor/./cotizar'],
  ])('%s → el tablero del rol', (_caso, volver) => {
    expect(destinoAlIngresar(volver, 'ASESOR')).toBe('/asesor');
  });

  it('un ".." después de la consulta no cuenta como segmento', () => {
    expect(destinoAlIngresar('/asesor?buscar=..', 'ASESOR')).toBe('/asesor?buscar=..');
  });
});
