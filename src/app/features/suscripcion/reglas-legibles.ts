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

const NIVELES: readonly string[] = ['BAJO', 'MEDIO', 'ALTO'];

/** El nivel en palabras; un nivel que esta versión no conoce se muestra tal como viene. */
function nivel(valor: unknown): string {
  return NIVELES.includes(String(valor)) ? textoNivel(valor as NivelRiesgo) : String(valor);
}

function nombreDeSenal(senal: unknown): string {
  return ORDEN_SENALES.includes(senal as NombreSenal)
    ? nombreSenal(senal as NombreSenal)
    : String(senal);
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
  return $localize`:@@suscripcion.tarjeta.regla.deCien:${String(valor)}:valor: de 100`;
}

/** Un dato del bien: montoCredito es dinero; cualquier otro número, con separador de miles. */
function datoBien(campo: unknown, valor: unknown, idioma: Idioma): string {
  if (typeof valor !== 'number') {
    return String(valor);
  }
  return campo === 'montoCredito' ? montoCop(valor, idioma) : numeroConMiles(valor, idioma);
}

function nombreDatoBien(campo: unknown): string {
  return campo === 'montoCredito'
    ? $localize`:@@cotizacion.panel.sumaAsegurada:Suma asegurada`
    : String(campo);
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
      const minimo = String(p['minimo']);
      const score = r.senales['score'];
      return {
        nombre: $localize`:@@suscripcion.tarjeta.regla.score:Puntaje de riesgo`,
        limite: $localize`:@@suscripcion.tarjeta.regla.minimo:Mínimo ${minimo}:minimo:`,
        valor: score === null || score === undefined ? sinDato() : String(score),
      };
    }
    case 'NIVEL_PERMITIDO': {
      const permitidos = Array.isArray(p['permitidos']) ? p['permitidos'] : [];
      const lista = permitidos.map(nivel);
      const valor = r.senales['nivel'];
      return {
        nombre: $localize`:@@suscripcion.tarjeta.regla.nivel:Nivel de riesgo`,
        limite: lista.join(' · '),
        valor: valor === null || valor === undefined ? sinDato() : nivel(valor),
      };
    }
    case 'SENAL_MINIMA': {
      const minimo = String(p['minimo']);
      const valor = r.senales[String(p['senal'])];
      return {
        nombre: nombreDeSenal(p['senal']),
        limite: $localize`:@@suscripcion.tarjeta.regla.minimoDeCien:Mínimo ${minimo}:minimo: de 100`,
        valor: valor === null || valor === undefined ? sinDato() : deCien(valor),
      };
    }
    case 'DATO_BIEN_MAXIMO': {
      const maximo = datoBien(p['campo'], p['maximo'], idioma);
      const valor = r.senales[String(p['campo'])];
      return {
        nombre: nombreDatoBien(p['campo']),
        limite: $localize`:@@suscripcion.tarjeta.regla.maximo:Máximo ${maximo}:maximo:`,
        valor:
          valor === null || valor === undefined ? sinDato() : datoBien(p['campo'], valor, idioma),
      };
    }
    case 'SIN_REGLAS':
      return {
        nombre: $localize`:@@suscripcion.tarjeta.regla.sinReglas:Ramo sin reglas configuradas`,
        limite: '—',
        valor: String(r.senales['ramo'] ?? '—'),
      };
    default:
      // Un tipo que esta versión del portal no conoce no rompe la tarjeta.
      return { nombre: r.codigo, limite: '—', valor: '—' };
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
      return String(motivo);
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
