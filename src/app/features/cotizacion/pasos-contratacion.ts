import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Paso del journey de contratación: 1 Cotización, 2 Suscripción, 3 Pago, 4 Firma, 5 Emisión. */
export type PasoContratacion = 1 | 2 | 3 | 4 | 5;

/**
 * Pasos de la contratación, como en los marcos «Cotizar / Oferta» y «Cotizar / Suscripción» del
 * Figma: los anteriores al actual, completados; el actual, resaltado (SOLVENTAG5-49). Con
 * `completo`, los cinco hechos y ninguno actual: la póliza ya se emitió (SOLV-WEB-11, SOLVENTAG5-58).
 */
@Component({
  selector: 'app-pasos-contratacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pasos-contratacion.scss',
  template: `
    <ol class="pasos" i18n-aria-label="@@oferta.pasos" aria-label="Pasos de la contratación">
      @for (paso of pasos; track paso.numero; let ultimo = $last) {
        <li
          class="paso"
          [class.actual]="!completo() && paso.numero === actual()"
          [class.hecho]="completo() || paso.numero < actual()"
          [attr.aria-current]="!completo() && paso.numero === actual() ? 'step' : null"
        >
          <span class="numero">{{ paso.numero }}</span
          ><span>{{ paso.nombre }}</span>
        </li>
        @if (!ultimo) {
          <li class="separador" aria-hidden="true"></li>
        }
      }
    </ol>
  `,
})
export class PasosContratacion {
  readonly actual = input.required<PasoContratacion>();
  /** Todos los pasos completados (SOLVENTAG5-58). */
  readonly completo = input(false);

  protected readonly pasos: readonly { numero: PasoContratacion; nombre: string }[] = [
    { numero: 1, nombre: $localize`:@@oferta.paso.cotizacion:Cotización` },
    { numero: 2, nombre: $localize`:@@oferta.paso.suscripcion:Suscripción` },
    { numero: 3, nombre: $localize`:@@oferta.paso.pago:Pago` },
    { numero: 4, nombre: $localize`:@@oferta.paso.firma:Firma` },
    { numero: 5, nombre: $localize`:@@oferta.paso.emision:Emisión` },
  ];
}
