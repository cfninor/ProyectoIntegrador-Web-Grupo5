import { ReglaEvaluadaSuscripcion } from './modelos';
import { duracion, reglaLegible, textoMotivo } from './reglas-legibles';

// Cómo se lee cada tipo de regla en la tabla de la tarjeta (SOLVENTAG5-55).

const base = {
  codigo: 'VIDA_HIPOTECARIO.X.v1',
  efecto: 'REVISAR',
  resultado: 'CUMPLE',
} as const;

function legible(r: Partial<ReglaEvaluadaSuscripcion>) {
  return reglaLegible({ ...base, parametros: {}, senales: {}, tipo: 'SIN_REGLAS', ...r }, 'es-CO');
}

describe('reglaLegible', () => {
  it.each([
    [{ origen: 'PERFIL', perfilConsistente: true }, 'Con perfil'],
    [
      { origen: 'VALOR_POR_DEFECTO', motivoSinPerfil: 'SIN_CLIENTE', perfilConsistente: true },
      'Sin perfil: la cotización se hizo sin un cliente identificado',
    ],
    [
      {
        origen: 'VALOR_POR_DEFECTO',
        motivoSinPerfil: 'SIN_CONSENTIMIENTO',
        perfilConsistente: true,
      },
      'Sin perfil: no había una autorización de datos vigente',
    ],
    [
      {
        origen: 'VALOR_POR_DEFECTO',
        motivoSinPerfil: 'PERFIL_NO_DISPONIBLE',
        perfilConsistente: true,
      },
      'Sin perfil: el perfil no estuvo disponible a tiempo',
    ],
    [{ origen: 'VALOR_POR_DEFECTO', motivoSinPerfil: null }, 'Sin perfil'],
    [{ origen: 'PERFIL', perfilConsistente: false }, 'El perfil no coincide'],
  ])('PERFIL_REQUERIDO con %j', (senales, valor) => {
    const r = legible({ tipo: 'PERFIL_REQUERIDO', senales });

    expect(r.nombre).toBe('Perfil de riesgo');
    expect(r.limite).toBe('Con perfil de riesgo');
    expect(r.valor).toBe(valor);
  });

  it('SCORE_MINIMO', () => {
    const r = legible({
      tipo: 'SCORE_MINIMO',
      parametros: { minimo: 450 },
      senales: { score: 640 },
    });

    expect([r.nombre, r.limite, r.valor]).toEqual(['Puntaje de riesgo', 'Mínimo 450', '640']);
  });

  it('NIVEL_PERMITIDO con nombres legibles, y un nivel desconocido tal como viene', () => {
    const r = legible({
      tipo: 'NIVEL_PERMITIDO',
      parametros: { permitidos: ['BAJO', 'MEDIO', 'OTRO'] },
      senales: { nivel: 'ALTO' },
    });

    expect(r.nombre).toBe('Nivel de riesgo');
    expect(r.limite).toBe('Riesgo bajo · Riesgo medio · OTRO');
    expect(r.valor).toBe('Riesgo alto');
    expect(legible({ tipo: 'NIVEL_PERMITIDO', senales: { nivel: 'BAJO' } }).limite).toBe('');
  });

  it('SENAL_MINIMA con el nombre de la señal, y una señal desconocida con su código', () => {
    const r = legible({
      tipo: 'SENAL_MINIMA',
      parametros: { senal: 'comportamientoPago', minimo: 40 },
      senales: { comportamientoPago: 72 },
    });
    expect([r.nombre, r.limite, r.valor]).toEqual([
      'Comportamiento de pago',
      'Mínimo 40 de 100',
      '72 de 100',
    ]);

    const otra = legible({
      tipo: 'SENAL_MINIMA',
      parametros: { senal: 'otraSenal', minimo: 10 },
      senales: { otraSenal: 20 },
    });
    expect(otra.nombre).toBe('otraSenal');
  });

  it('DATO_BIEN_MAXIMO: el monto como dinero y otro campo como número', () => {
    const r = legible({
      tipo: 'DATO_BIEN_MAXIMO',
      parametros: { campo: 'montoCredito', maximo: 800_000_000 },
      senales: { montoCredito: 200_000_000 },
    });
    expect([r.nombre, r.limite, r.valor]).toEqual([
      'Suma asegurada',
      'Máximo $ 800.000.000',
      '$ 200.000.000',
    ]);

    const otro = legible({
      tipo: 'DATO_BIEN_MAXIMO',
      parametros: { campo: 'plazoAnios', maximo: 30 },
      senales: { plazoAnios: 'veinte' },
    });
    expect([otro.nombre, otro.limite, otro.valor]).toEqual(['plazoAnios', 'Máximo 30', 'veinte']);
    const mil = legible({
      tipo: 'DATO_BIEN_MAXIMO',
      parametros: { campo: 'otro', maximo: 1000 },
      senales: { otro: 2000 },
    });
    expect([mil.limite, mil.valor]).toEqual(['Máximo 1.000', '2.000']);
  });

  it.each([
    ['SCORE_MINIMO', { minimo: 450 }, { score: null }],
    ['NIVEL_PERMITIDO', { permitidos: ['BAJO'] }, { nivel: null }],
    ['SENAL_MINIMA', { senal: 'endeudamiento', minimo: 30 }, { endeudamiento: null }],
    ['DATO_BIEN_MAXIMO', { campo: 'montoCredito', maximo: 1 }, { montoCredito: null }],
  ] as const)('%s sin dato dice «No disponible»', (tipo, parametros, senales) => {
    expect(legible({ tipo, parametros, senales }).valor).toBe('No disponible');
  });

  it('SIN_REGLAS y un tipo desconocido no rompen la tabla', () => {
    const sin = legible({ tipo: 'SIN_REGLAS', senales: { ramo: 'VIAJE' } });
    expect([sin.nombre, sin.limite, sin.valor]).toEqual([
      'Ramo sin reglas configuradas',
      '—',
      'VIAJE',
    ]);
    expect(legible({ tipo: 'SIN_REGLAS' }).valor).toBe('—');

    const nuevo = legible({ tipo: 'NUEVO' as ReglaEvaluadaSuscripcion['tipo'] });
    expect([nuevo.nombre, nuevo.limite, nuevo.valor]).toEqual([base.codigo, '—', '—']);
  });

  it.each([
    ['CUMPLE', 'Cumple', 'chip-verde'],
    ['NO_CUMPLE', 'No cumple', 'chip-rojo'],
    ['NO_APLICA', 'No aplica', 'chip-gris'],
  ] as const)('el resultado %s', (resultado, texto, clase) => {
    const r = legible({ resultado, determinante: true });

    expect([r.resultado, r.claseResultado, r.determinante]).toEqual([texto, clase, true]);
  });

  it('sin decisión ninguna regla es determinante', () => {
    expect(legible({}).determinante).toBe(false);
  });

  it('en inglés el monto usa el formato de Estados Unidos', () => {
    const r = reglaLegible(
      {
        ...base,
        tipo: 'DATO_BIEN_MAXIMO',
        parametros: { campo: 'montoCredito', maximo: 800_000_000 },
        senales: { montoCredito: 200_000_000 },
      },
      'en-US',
    );

    expect(r.valor).toBe('$200,000,000');
  });
});

describe('textoMotivo', () => {
  it.each([
    ['CUMPLE_REGLAS', [], 'Cumple todas las reglas de suscripción.'],
    ['REGLA_DE_RECHAZO', ['A'], 'No cumple una regla de rechazo: A.'],
    ['REGLA_DE_REVISION', ['A', 'B'], 'Necesita la revisión de un suscriptor por: A, B.'],
    ['REGLA_DE_AJUSTE', ['A'], 'Se acepta con ajuste por: A.'],
    [
      'REGLAS_NO_ALCANZAN',
      ['A'],
      'Las reglas automáticas no alcanzan para decidir. No se pudo resolver: A.',
    ],
    [
      'REGLAS_NO_ALCANZAN',
      [],
      'Las reglas automáticas no alcanzan para decidir: este producto no tiene reglas evaluadas.',
    ],
    [
      'EVALUACION_NO_VERIFICABLE',
      [],
      'El registro de la evaluación no se pudo verificar al decidir, así que la decide un suscriptor.',
    ],
  ] as const)('%s', (motivo, reglas, texto) => {
    expect(textoMotivo(motivo, reglas)).toBe(texto);
  });

  it('un motivo desconocido se muestra tal como viene', () => {
    expect(textoMotivo('NUEVO' as never, [])).toBe('NUEVO');
  });
});

describe('duracion', () => {
  it.each([
    [8, 'es-CO', '8 ms'],
    [999, 'es-CO', '999 ms'],
    [1240, 'es-CO', '1,2 s'],
    [1240, 'en-US', '1.2 s'],
  ] as const)('%d ms en %s', (ms, idioma, texto) => {
    expect(duracion(ms, idioma)).toBe(texto);
  });
});
