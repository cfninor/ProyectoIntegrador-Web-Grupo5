import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  LOCALE_ID,
  inject,
} from '@angular/core';

import {
  Almacen,
  IDIOMA_FUENTE,
  Idioma,
  almacenDelNavegador,
  esIdioma,
  guardarPreferencia,
} from './idioma';

/** Dónde se guarda la preferencia de idioma: `localStorage`. Las pruebas lo sustituyen. */
export const ALMACEN_IDIOMA = new InjectionToken<Almacen | null>('ALMACEN_IDIOMA', {
  providedIn: 'root',
  factory: () => almacenDelNavegador(),
});

/** Recarga la página para iniciar en el idioma elegido (D12). Las pruebas lo sustituyen. */
export const RECARGAR_PAGINA = new InjectionToken<() => void>('RECARGAR_PAGINA', {
  providedIn: 'root',
  factory: () => {
    const documento = inject(DOCUMENT);
    return () => documento.location.reload();
  },
});

interface OpcionIdioma {
  idioma: Idioma;
  /** Código corto visible: ES o EN. */
  corto: string;
  /** Nombre del idioma en ese mismo idioma, para el lector de pantalla. */
  nombre: string;
  /** `lang` del botón, para que el lector de pantalla pronuncie bien el nombre. */
  lang: string;
}

/**
 * Selector de idioma ES / EN, como el componente `LangToggle` del Figma: una píldora con las dos
 * opciones y la activa con fondo `--primary`. Elegir el otro idioma guarda la preferencia y
 * recarga la página, que inicia en ese idioma.
 */
@Component({
  selector: 'app-selector-idioma',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .selector {
      display: inline-flex;
      gap: 1px;
      padding: 5px;
      border-radius: 999px;
      background: #eef2f5;
    }

    .opcion {
      width: 38px;
      height: 23px;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--on-surface-variant);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;

      &:hover:not(.activa) {
        color: var(--on-surface);
      }

      &.activa {
        background: var(--primary);
        color: var(--surface);
        cursor: default;
      }
    }
  `,
  template: `
    <div class="selector" role="group" aria-label="Idioma" i18n-aria-label="@@idioma.selector">
      @for (opcion of opciones; track opcion.idioma) {
        <button
          type="button"
          class="opcion"
          [class.activa]="opcion.idioma === activo"
          [attr.aria-pressed]="opcion.idioma === activo"
          [attr.aria-label]="opcion.nombre"
          [attr.lang]="opcion.lang"
          (click)="elegir(opcion.idioma)"
        >
          {{ opcion.corto }}
        </button>
      }
    </div>
  `,
})
export class SelectorIdioma {
  private readonly almacen = inject(ALMACEN_IDIOMA);
  private readonly recargar = inject(RECARGAR_PAGINA);
  private readonly locale = inject(LOCALE_ID);

  protected readonly activo: Idioma = esIdioma(this.locale) ? this.locale : IDIOMA_FUENTE;

  protected readonly opciones: readonly OpcionIdioma[] = [
    {
      idioma: 'es-CO',
      corto: $localize`:@@idioma.es.corto:ES`,
      nombre: $localize`:@@idioma.es.nombre:Español`,
      lang: 'es',
    },
    {
      idioma: 'en-US',
      corto: $localize`:@@idioma.en.corto:EN`,
      nombre: $localize`:@@idioma.en.nombre:English`,
      lang: 'en',
    },
  ];

  protected elegir(idioma: Idioma): void {
    if (idioma === this.activo) {
      return;
    }
    // Sin dónde guardar la preferencia, recargar volvería al mismo idioma.
    if (guardarPreferencia(idioma, this.almacen)) {
      this.recargar();
    }
  }
}
