import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { fechaBogota, horaBogota, montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { ResultadoSuscripcion, SIN_DECISION, SolicitudSuscripcion } from './modelos';
import { ReglaLegible, duracion, reglaLegible, textoMotivo } from './reglas-legibles';

/** Quién mira la tarjeta: los textos le hablan al asesor del cliente, y al cliente de lo suyo. */
export type ActorResultado = 'asesor' | 'cliente';

/** El chip de cada decisión: verde continúa, rojo no, ámbar espera a un suscriptor. */
const CHIPS: Record<ResultadoSuscripcion, () => { clase: string; texto: string }> = {
  ACEPTADA: () => ({
    clase: 'chip-verde',
    texto: $localize`:@@suscripcion.chip.aceptada:Aceptada`,
  }),
  AJUSTADA: () => ({
    clase: 'chip-verde-azulado',
    texto: $localize`:@@suscripcion.chip.ajustada:Aceptada con ajuste`,
  }),
  RECHAZADA: () => ({
    clase: 'chip-rojo',
    texto: $localize`:@@suscripcion.chip.rechazada:Rechazada`,
  }),
  EN_REVISION: () => ({
    clase: 'chip-ambar',
    texto: $localize`:@@suscripcion.chip.enRevision:Pendiente de revisión`,
  }),
};

/**
 * El resultado de la suscripción (SOLVENTAG5-55, R5), para el asesor y para el cliente: SOLV-WEB-07
 * con la decisión, SOLV-WEB-08 en revisión y el último estado conocido sin decisión (CA4). No llama
 * al BFF: muestra la respuesta que la página de suscripción ya consulta.
 */
@Component({
  selector: 'app-tarjeta-resultado',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tarjeta-resultado.scss',
  templateUrl: './tarjeta-resultado.html',
})
export class TarjetaResultado {
  readonly solicitud = input.required<SolicitudSuscripcion>();
  readonly actor = input.required<ActorResultado>();

  private readonly idioma = idiomaDe(inject(LOCALE_ID));

  protected readonly rutaTablero = computed(() => `/${this.actor()}`);

  protected readonly vista = computed(() => {
    const s = this.solicitud();
    const d = s.decision;
    const sinDecision = SIN_DECISION.includes(s.estado);
    const reglas = (s.reglasEvaluadas ?? []).map((r) => reglaLegible(r, this.idioma));
    const determinantes = reglas.filter((r) => r.determinante);
    const montoCredito = s.cobertura.datosBien['montoCredito'];
    const plazoAnios = s.cobertura.datosBien['plazoAnios'];
    return {
      s,
      d,
      sinDecision,
      // decidida true sin decision: el registro no se pudo leer. El estado sigue siendo cierto.
      ilegible: !sinDecision && d === undefined,
      noVerificable: !sinDecision && (d === undefined || s.registrosVerificables === false),
      chip: sinDecision ? null : CHIPS[s.estado as ResultadoSuscripcion](),
      reglas: reglas as readonly ReglaLegible[],
      determinantes,
      motivo: d
        ? textoMotivo(
            d.motivo,
            determinantes.map((r) => r.nombre),
          )
        : null,
      tiempo: d ? duracion(d.tiempoDecisionMs, this.idioma) : null,
      prima: montoCop(s.prima, this.idioma),
      aceptadaEl: this.fechaHora(s.aceptadaEn),
      actualizadaEl: this.fechaHora(s.actualizadaEn ?? s.aceptadaEn),
      producto:
        s.cobertura.ramo === 'VIDA_HIPOTECARIO'
          ? $localize`:@@oferta.vidaHipotecario:Vida hipotecario`
          : s.cobertura.ramo,
      sumaAsegurada: typeof montoCredito === 'number' ? montoCop(montoCredito, this.idioma) : null,
      // En vida hipotecario, la vigencia es el plazo del crédito.
      plazoAnios: typeof plazoAnios === 'number' ? plazoAnios : null,
      primaCotizada: d ? montoCop(d.primaCotizada, this.idioma) : null,
      primaFinal: d?.primaFinal === undefined ? null : montoCop(d.primaFinal, this.idioma),
      continua: d?.resultado === 'ACEPTADA' || d?.resultado === 'AJUSTADA',
    };
  });

  private fechaHora(iso: string): string {
    const fecha = fechaBogota(iso, this.idioma);
    const hora = horaBogota(iso, this.idioma);
    return $localize`:@@suscripcion.fechaHora:${fecha}:fecha: a las ${hora}:hora:`;
  }
}
