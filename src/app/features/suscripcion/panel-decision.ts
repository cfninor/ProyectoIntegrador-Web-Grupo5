import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';

import { montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { DecisionAnalistaPeticion, ResultadoDecisionAnalista, RevisionSolicitud } from './modelos';
import { SuscripcionApi } from './suscripcion-api';

/** Los límites del contrato para la decisión del analista (`DecisionAnalistaPeticion`). */
export const RECARGO_MINIMO = 1;
export const RECARGO_MAXIMO = 100;
export const JUSTIFICACION_MAXIMA = 1000;

/**
 * La nueva prima de un ajuste: la cotizada con el recargo, redondeada al peso. Es solo la vista
 * previa: la prima que vale es la que calcula el núcleo con la misma regla y llega en la respuesta.
 */
export function primaConRecargo(prima: number, recargoPorcentaje: number): number {
  return Math.round((prima * (100 + recargoPorcentaje)) / 100);
}

/** El envío: en curso, la solicitud ya decidida por otra persona (409) u otro error. */
type Envio = 'inactivo' | 'enviando' | 'ya-decidida' | 'error';

type Campo = 'resultado' | 'recargo' | 'justificacion';

/** Obligatoria y con algo más que espacios, como la valida el BFF. */
function conTexto(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { required: true };
}

const VALIDADORES_RECARGO = [
  Validators.required,
  Validators.min(RECARGO_MINIMO),
  Validators.max(RECARGO_MAXIMO),
  Validators.pattern(/^\d+$/),
];

/**
 * El panel «Registrar decisión» del detalle de revisión (SOLVENTAG5-54): el analista de riesgo
 * acepta la solicitud sin cambios, la ajusta con un recargo sobre la prima cotizada (ve la nueva
 * prima antes de confirmar) o la rechaza, siempre con su justificación. Al registrarla avisa a la
 * página con el detalle ya decidido (`decidida`). Si otra persona la decidió primero (409
 * SOLICITUD_NO_EN_REVISION), lo dice y ofrece verla (`recargar`).
 */
@Component({
  selector: 'app-panel-decision',
  imports: [ReactiveFormsModule],
  templateUrl: './panel-decision.html',
  styleUrl: './panel-decision.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelDecision {
  readonly revision = input.required<RevisionSolicitud>();
  /** La decisión quedó registrada: el detalle de revisión ya decidido. */
  readonly decidida = output<RevisionSolicitud>();
  /** Otra persona la decidió primero: la página vuelve a pedir el detalle. */
  readonly recargar = output<void>();

  private readonly api = inject(SuscripcionApi);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private readonly fb = inject(NonNullableFormBuilder);
  private peticion?: Subscription;

  protected readonly justificacionMaxima = JUSTIFICACION_MAXIMA;
  protected readonly envio = signal<Envio>('inactivo');

  protected readonly formulario = this.fb.group({
    resultado: this.fb.control<ResultadoDecisionAnalista | ''>('', Validators.required),
    recargo: this.fb.control(''),
    justificacion: this.fb.control('', [conTexto, Validators.maxLength(JUSTIFICACION_MAXIMA)]),
  });

  private readonly resultado = toSignal(this.formulario.controls.resultado.valueChanges, {
    initialValue: this.formulario.controls.resultado.value,
  });
  private readonly recargo = toSignal(this.formulario.controls.recargo.valueChanges, {
    initialValue: this.formulario.controls.recargo.value,
  });

  protected readonly ajustar = computed(() => this.resultado() === 'AJUSTADA');

  /** La nueva prima con el recargo escrito, o «—» mientras el recargo no sea válido. */
  protected readonly nuevaPrima = computed(() => {
    const texto = this.recargo().trim();
    const recargo = Number(texto);
    if (!/^\d+$/.test(texto) || recargo < RECARGO_MINIMO || recargo > RECARGO_MAXIMO) {
      return '—';
    }
    const r = this.revision();
    const prima = montoCop(primaConRecargo(r.prima, recargo), this.idioma);
    return r.periodicidad === 'MENSUAL'
      ? $localize`:@@revision.dato.primaMensual:${prima}:prima: / mes`
      : prima;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.peticion?.unsubscribe());
    // El recargo solo se pide al ajustar; al cambiar de decisión se borra.
    this.formulario.controls.resultado.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((resultado) => {
        const recargo = this.formulario.controls.recargo;
        if (resultado === 'AJUSTADA') {
          recargo.setValidators(VALIDADORES_RECARGO);
        } else {
          recargo.clearValidators();
          recargo.reset('');
        }
        recargo.updateValueAndValidity();
      });
  }

  /** El mensaje del campo si ya se tocó y tiene un error, como en `PaginaPago`. */
  protected errorCampo(campo: Campo): string | null {
    const control = this.formulario.controls[campo];
    if (!control.errors || !control.touched) {
      return null;
    }
    switch (campo) {
      case 'resultado':
        return $localize`:@@decisionAnalista.error.resultado:Elige una decisión.`;
      case 'recargo':
        return control.errors['required']
          ? $localize`:@@decisionAnalista.error.recargoRequerido:Escribe el recargo.`
          : $localize`:@@decisionAnalista.error.recargoRango:El recargo es un número entero entre 1 y 100 %.`;
      default:
        return control.errors['required']
          ? $localize`:@@decisionAnalista.error.justificacionRequerida:Escribe la justificación.`
          : $localize`:@@decisionAnalista.error.justificacionLarga:La justificación tiene máximo 1.000 caracteres.`;
    }
  }

  protected registrar(): void {
    if (this.envio() === 'enviando') {
      return;
    }
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { resultado, recargo, justificacion } = this.formulario.getRawValue();
    if (resultado === '') {
      return;
    }
    const decision: DecisionAnalistaPeticion = {
      resultado,
      justificacion: justificacion.trim(),
      ...(resultado === 'AJUSTADA' ? { recargoPorcentaje: Number(recargo) } : {}),
    };
    this.envio.set('enviando');
    this.peticion = this.api.registrarDecision(this.revision().solicitudId, decision).subscribe({
      next: (decidida) => {
        this.envio.set('inactivo');
        this.decidida.emit(decidida);
      },
      error: (error: HttpErrorResponse) =>
        this.envio.set(error.status === 409 ? 'ya-decidida' : 'error'),
    });
  }
}
