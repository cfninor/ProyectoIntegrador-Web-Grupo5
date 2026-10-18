import { NivelRiesgo, SenalesPerfil } from './modelos';

/**
 * Cómo se lee cada señal del perfil de riesgo en la oferta (SOLVENTAG5-49). Las señales van de 0 a
 * 100 y en todas 100 es lo más favorable (ms-perfilamiento, SOLVENTAG5-66): en `endeudamiento`, 100
 * es poca deuda frente al ingreso.
 */
export type TramoSenal = 'favorable' | 'medio' | 'desfavorable';

/** Desde 70 la señal es favorable y desde 40, media. */
export function tramoDe(valor: number): TramoSenal {
  if (valor >= 70) {
    return 'favorable';
  }
  return valor >= 40 ? 'medio' : 'desfavorable';
}

export type NombreSenal = keyof SenalesPerfil;

/** El orden de las señales en la pantalla, como en el marco «Cotizar / Oferta» del Figma. */
export const ORDEN_SENALES: readonly NombreSenal[] = [
  'comportamientoPago',
  'estabilidadIngresos',
  'ubicacion',
  'endeudamiento',
];

export function nombreSenal(senal: NombreSenal): string {
  return {
    comportamientoPago: $localize`:@@oferta.senal.comportamientoPago:Comportamiento de pago`,
    estabilidadIngresos: $localize`:@@oferta.senal.estabilidadIngresos:Estabilidad de ingresos`,
    ubicacion: $localize`:@@oferta.senal.ubicacion:Ubicación del inmueble`,
    endeudamiento: $localize`:@@oferta.senal.endeudamiento:Endeudamiento actual`,
  }[senal];
}

/** La lectura de la señal en palabras: «Muy bueno», «Alta», «Riesgo bajo», «Medio»… */
export function lecturaSenal(senal: NombreSenal, tramo: TramoSenal): string {
  switch (`${senal}.${tramo}`) {
    case 'comportamientoPago.favorable':
      return $localize`:@@oferta.senal.comportamientoPago.favorable:Muy bueno`;
    case 'comportamientoPago.medio':
      return $localize`:@@oferta.senal.comportamientoPago.medio:Regular`;
    case 'comportamientoPago.desfavorable':
      return $localize`:@@oferta.senal.comportamientoPago.desfavorable:Deficiente`;
    case 'estabilidadIngresos.favorable':
      return $localize`:@@oferta.senal.estabilidadIngresos.favorable:Alta`;
    case 'estabilidadIngresos.medio':
      return $localize`:@@oferta.senal.estabilidadIngresos.medio:Media`;
    case 'estabilidadIngresos.desfavorable':
      return $localize`:@@oferta.senal.estabilidadIngresos.desfavorable:Baja`;
    case 'ubicacion.favorable':
      return $localize`:@@oferta.senal.ubicacion.favorable:Riesgo bajo`;
    case 'ubicacion.medio':
      return $localize`:@@oferta.senal.ubicacion.medio:Riesgo medio`;
    case 'ubicacion.desfavorable':
      return $localize`:@@oferta.senal.ubicacion.desfavorable:Riesgo alto`;
    case 'endeudamiento.favorable':
      return $localize`:@@oferta.senal.endeudamiento.favorable:Bajo`;
    case 'endeudamiento.medio':
      return $localize`:@@oferta.senal.endeudamiento.medio:Medio`;
    default:
      return $localize`:@@oferta.senal.endeudamiento.desfavorable:Alto`;
  }
}

/** El nivel del perfil como chip: «Riesgo bajo», «Riesgo medio» o «Riesgo alto». */
export function textoNivel(nivel: NivelRiesgo): string {
  return {
    BAJO: $localize`:@@oferta.nivel.bajo:Riesgo bajo`,
    MEDIO: $localize`:@@oferta.nivel.medio:Riesgo medio`,
    ALTO: $localize`:@@oferta.nivel.alto:Riesgo alto`,
  }[nivel];
}

export const CLASE_NIVEL: Record<NivelRiesgo, string> = {
  BAJO: 'chip-verde',
  MEDIO: 'chip-ambar',
  ALTO: 'chip-rojo',
};
