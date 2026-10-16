import {
  CLASE_NIVEL,
  ORDEN_SENALES,
  lecturaSenal,
  nombreSenal,
  textoNivel,
  tramoDe,
} from './senales';

describe('señales del perfil en la oferta', () => {
  it.each([
    [100, 'favorable'],
    [70, 'favorable'],
    [69, 'medio'],
    [40, 'medio'],
    [39, 'desfavorable'],
    [0, 'desfavorable'],
  ])('la señal %i es %s', (valor, tramo) => {
    expect(tramoDe(valor)).toBe(tramo);
  });

  it('se muestran en el orden del Figma, con su nombre', () => {
    expect(ORDEN_SENALES.map(nombreSenal)).toEqual([
      'Comportamiento de pago',
      'Estabilidad de ingresos',
      'Ubicación del inmueble',
      'Endeudamiento actual',
    ]);
  });

  it.each([
    ['comportamientoPago', ['Muy bueno', 'Regular', 'Deficiente']],
    ['estabilidadIngresos', ['Alta', 'Media', 'Baja']],
    ['ubicacion', ['Riesgo bajo', 'Riesgo medio', 'Riesgo alto']],
    // 100 en endeudamiento es poca deuda: la lectura favorable es «Bajo».
    ['endeudamiento', ['Bajo', 'Medio', 'Alto']],
  ] as const)('%s se lee en palabras según su tramo', (senal, lecturas) => {
    const tramos = ['favorable', 'medio', 'desfavorable'] as const;

    expect(tramos.map((tramo) => lecturaSenal(senal, tramo))).toEqual(lecturas);
  });

  it('el nivel del perfil es un chip con su color', () => {
    expect([textoNivel('BAJO'), textoNivel('MEDIO'), textoNivel('ALTO')]).toEqual([
      'Riesgo bajo',
      'Riesgo medio',
      'Riesgo alto',
    ]);
    expect(CLASE_NIVEL).toEqual({ BAJO: 'chip-verde', MEDIO: 'chip-ambar', ALTO: 'chip-rojo' });
  });
});
