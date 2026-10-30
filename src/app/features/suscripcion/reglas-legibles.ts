import { montoCop, numeroConMiles } from '../../core/idioma/formatos';
import { Idioma } from '../../core/idioma/idioma';
import { MotivoSinPerfil, NivelRiesgo } from '../cotizacion/modelos';
import { NombreSenal, ORDEN_SENALES, nombreSenal, textoNivel } from '../cotizacion/senales';
import {
  MotivoDecisionSuscripcion,
  ReglaEvaluadaSuscripcion,
  ResultadoReglaSuscripcion,
} from './modelos';

/** Una regla evaluada en palabras, para la tabla y el motivo de la tarjeta (SOLVENTAG5-55). */
export interface ReglaLegible {
  codigo: string;
  nombre: string;
  limite: string;
  valor: string;
  resultado: string;
  claseResultado: string;
  determinante: boolean;
}

/** Lo que viene sin dato: la regla no aplica porque no hay perfil de riesgo. */
const sinDato = (): string => $localize`:@@suscripcion.tarjeta.regla.sinDato:No disponible`;

/** Sin dato en una celda que no es el valor del cliente. */
const SIN_VALOR = '—';

const NIVELES: ReadonlySet<string> = new Set(['BAJO', 'MEDIO', 'ALTO']);

/**
 * Un valor de la regla como texto, solo si es un texto o un número finito; si no, `siNo`. Los
 * parámetros y las señales son JSON abierto: así nunca sale «[object Object]».
 */
function textoDe(valor: unknown, siNo: string): string {
  if (typeof valor === 'string') {
    return valor;
  }
  return typeof valor === 'number' && Number.isFinite(valor) ? String(valor) : siNo;
}

/** El nivel en palabras; un nivel que esta versión no conoce se muestra tal como viene. */
function nivel(valor: unknown, siNo: string): string {
  const texto = textoDe(valor, siNo);
  return NIVELES.has(texto) ? textoNivel(texto as NivelRiesgo) : texto;
}

function nombreDeSenal(senal: unknown): string {
  return ORDEN_SENALES.includes(senal as NombreSenal)
    ? nombreSenal(senal as NombreSenal)
    : textoDe(senal, SIN_VALOR);
}

function motivoSinPerfil(motivo: unknown): string | null {
  switch (motivo as MotivoSinPerfil | null) {
    case 'SIN_CLIENTE':
      return $localize`:@@suscripcion.tarjeta.sinPerfil.sinCliente:la cotización se hizo sin un cliente identificado`;
    case 'SIN_CONSENTIMIENTO':
      return $localize`:@@suscripcion.tarjeta.sinPerfil.sinConsentimiento:no había una autorización de datos vigente`;
    case 'PERFIL_NO_DISPONIBLE':
      return $localize`:@@suscripcion.tarjeta.sinPerfil.noDisponible:el perfil no estuvo disponible a tiempo`;
    default:
      return null;
  }
}

function valorPerfil(senales: Record<string, unknown>): string {
  if (senales['perfilConsistente'] === false) {
    return $localize`:@@suscripcion.tarjeta.regla.perfil.noCoincide:El perfil no coincide`;
  }
  if (senales['origen'] === 'PERFIL') {
    return $localize`:@@suscripcion.tarjeta.regla.perfil.con:Con perfil`;
  }
  const motivo = motivoSinPerfil(senales['motivoSinPerfil']);
  return motivo === null
    ? $localize`:@@suscripcion.tarjeta.regla.perfil.sin:Sin perfil`
    : $localize`:@@suscripcion.tarjeta.regla.perfil.sinMotivo:Sin perfil: ${motivo}:motivo:`;
}

function deCien(valor: unknown): string {
  const sin = sinDato();
  const texto = textoDe(valor, sin);
  return texto === sin
    ? sin
    : $localize`:@@suscripcion.tarjeta.regla.deCien:${texto}:valor: de 100`;
}

/** Un dato del bien: montoCredito es dinero; cualquier otro número, con separador de miles. */
function datoBien(campo: unknown, valor: unknown, idioma: Idioma, siNo: string): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return textoDe(valor, siNo);
  }
  return campo === 'montoCredito' ? montoCop(valor, idioma) : numeroConMiles(valor, idioma);
}

function nombreDatoBien(campo: unknown): string {
  return campo === 'montoCredito'
    ? $localize`:@@cotizacion.panel.sumaAsegurada:Suma asegurada`
    : textoDe(campo, SIN_VALOR);
}

function textos(
  r: ReglaEvaluadaSuscripcion,
  idioma: Idioma,
): Pick<ReglaLegible, 'nombre' | 'limite' | 'valor'> {
  const p = r.parametros;
  switch (r.tipo) {
    case 'PERFIL_REQUERIDO':
      return {
        nombre: $localize`:@@suscripcion.tarjeta.regla.perfil:Perfil de riesgo`,
        limite: $localize`:@@suscripcion.tarjeta.regla.perfil.limite:Con perfil de riesgo`,
        valor: valorPerfil(r.senales),
      };
    case 'SCORE_MINIMO': {
      const minimo = textoDe(p['minimo'], SIN_VALOR);
      return {
        nombre: $localize`:@@suscripcion.tarjeta.regla.score:Puntaje de riesgo`,
        limite: $localize`:@@suscripcion.tarjeta.regla.minimo:Mínimo ${minimo}:minimo:`,
        valor: textoDe(r.senales['score'], sinDato()),
      };
    }
    case 'NIVEL_PERMITIDO': {
      const permitidos = Array.isArray(p['permitidos']) ? p['permitidos'] : [];
      const lista = permitidos.map((permitido) => nivel(permitido, SIN_VALOR));
      return {
        nombre: $localize`:@@suscripcion.tarjeta.regla.nivel:Nivel de riesgo`,
        limite: lista.join(' · '),
        valor: nivel(r.senales['nivel'], sinDato()),
      };
    }
    case 'SENAL_MINIMA': {
      const minimo = textoDe(p['minimo'], SIN_VALOR);
      return {
        nombre: nombreDeSenal(p['senal']),
        limite: $localize`:@@suscripcion.tarjeta.regla.minimoDeCien:Mínimo ${minimo}:minimo: de 100`,
        valor: deCien(r.senales[textoDe(p['senal'], SIN_VALOR)]),
      };
    }
    case 'DATO_BIEN_MAXIMO': {
      const maximo = datoBien(p['campo'], p['maximo'], idioma, SIN_VALOR);
      const valor = r.senales[textoDe(p['campo'], SIN_VALOR)];
      return {
        nombre: nombreDatoBien(p['campo']),
        limite: $localize`:@@suscripcion.tarjeta.regla.maximo:Máximo ${maximo}:maximo:`,
        valor: datoBien(p['campo'], valor, idioma, sinDato()),
      };
    }
    case 'SIN_REGLAS':
      return {
        nombre: $localize`:@@suscripcion.tarjeta.regla.sinReglas:Ramo sin reglas configuradas`,
        limite: SIN_VALOR,
        valor: textoDe(r.senales['ramo'], SIN_VALOR),
      };
    default:
      // Un tipo que esta versión del portal no conoce no rompe la tarjeta.
      return { nombre: r.codigo, limite: SIN_VALOR, valor: SIN_VALOR };
  }
}

const RESULTADOS: Record<ResultadoReglaSuscripcion, () => { texto: string; clase: string }> = {
  CUMPLE: () => ({
    texto: $localize`:@@suscripcion.tarjeta.resultado.cumple:Cumple`,
    clase: 'chip-verde',
  }),
  NO_CUMPLE: () => ({
    texto: $localize`:@@suscripcion.tarjeta.resultado.noCumple:No cumple`,
    clase: 'chip-rojo',
  }),
  NO_APLICA: () => ({
    texto: $localize`:@@suscripcion.tarjeta.resultado.noAplica:No aplica`,
    clase: 'chip-gris',
  }),
};

export function reglaLegible(r: ReglaEvaluadaSuscripcion, idioma: Idioma): ReglaLegible {
  const resultado = RESULTADOS[r.resultado]();
  return {
    codigo: r.codigo,
    ...textos(r, idioma),
    resultado: resultado.texto,
    claseResultado: resultado.clase,
    determinante: r.determinante === true,
  };
}

/** Por qué se decidió así, con los nombres de las reglas determinantes. */
export function textoMotivo(motivo: MotivoDecisionSuscripcion, reglas: readonly string[]): string {
  const nombres = reglas.join(', ');
  switch (motivo) {
    case 'CUMPLE_REGLAS':
      return $localize`:@@suscripcion.tarjeta.motivo.cumple:Cumple todas las reglas de suscripción.`;
    case 'REGLA_DE_RECHAZO':
      return $localize`:@@suscripcion.tarjeta.motivo.rechazo:No cumple una regla de rechazo: ${nombres}:reglas:.`;
    case 'REGLA_DE_REVISION':
      return $localize`:@@suscripcion.tarjeta.motivo.revision:Necesita la revisión de un suscriptor por: ${nombres}:reglas:.`;
    case 'REGLA_DE_AJUSTE':
      return $localize`:@@suscripcion.tarjeta.motivo.ajuste:Se acepta con ajuste por: ${nombres}:reglas:.`;
    case 'REGLAS_NO_ALCANZAN':
      return nombres
        ? $localize`:@@suscripcion.tarjeta.motivo.noAlcanzan:Las reglas automáticas no alcanzan para decidir. No se pudo resolver: ${nombres}:reglas:.`
        : $localize`:@@suscripcion.tarjeta.motivo.sinReglas:Las reglas automáticas no alcanzan para decidir: este producto no tiene reglas evaluadas.`;
    case 'EVALUACION_NO_VERIFICABLE':
      return $localize`:@@suscripcion.tarjeta.motivo.noVerificable:El registro de la evaluación no se pudo verificar al decidir, así que la decide un suscriptor.`;
    default:
      return textoDe(motivo, SIN_VALOR);
  }
}

/** La duración de la decisión: «8 ms» o «1,2 s» («1.2 s» en inglés). */
export function duracion(ms: number, idioma: Idioma): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const segundos = (ms / 1000).toFixed(1);
  return `${idioma === 'es-CO' ? segundos.replace('.', ',') : segundos} s`;
}
