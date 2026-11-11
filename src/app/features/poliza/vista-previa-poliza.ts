import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from '@angular/core';

import { fechaCalendario, montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { DatosVistaPrevia } from './modelos';

/**
 * La vista previa del documento de la póliza (SOLVENTAG5-56, D14): tomador, producto, montos,
 * vigencia y condiciones. La usan SOLV-WEB-10, con la `Poliza`, y la página pública para firmar,
 * con el `DocumentoParaFirmar` (SOLVENTAG5-57, R10). El título va en la voz del `actor`.
 */
@Component({
  selector: 'app-vista-previa-poliza',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }

    h3,
    h4,
    p,
    ul,
    dl,
    dd {
      margin: 0;
    }

    h3,
    h4 {
      font-size: 14px;
      font-weight: 600;
    }

    .vista-previa {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      border: 1px solid var(--outline-variant);
      border-radius: var(--radio-control);
    }

    .resumen {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;

      dt {
        color: var(--on-surface-variant);
      }

      dd {
        overflow-wrap: anywhere;
      }
    }

    .condiciones {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px 24px;

      ul {
        padding-left: 20px;
      }
    }

    .bloque {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
  template: `
    @let v = vista();
    <article class="vista-previa" aria-labelledby="firma-resumen">
      @if (actor() === 'asesor') {
        <h3 id="firma-resumen" i18n="@@firma.resumen.asesor">Resumen de la póliza</h3>
      } @else {
        <h3 id="firma-resumen" i18n="@@firma.resumen.cliente">Resumen de tu póliza</h3>
      }
      <dl class="resumen">
        <dt i18n="@@firma.tomador">Tomador</dt>
        <dd>{{ v.tomador }}</dd>
        <dt i18n="@@firma.documentoIdentidad">Documento de identidad</dt>
        <dd>{{ v.d.tomador.documentoEnmascarado }}</dd>
        <dt i18n="@@suscripcion.tarjeta.producto">Producto</dt>
        <dd>{{ v.producto }}</dd>
        <dt i18n="@@cotizacion.panel.sumaAsegurada">Suma asegurada</dt>
        <dd>{{ v.sumaAsegurada }}</dd>
        @if (v.mensual) {
          <dt i18n="@@suscripcion.prima">Prima mensual</dt>
        } @else {
          <dt i18n="@@firma.prima">Prima</dt>
        }
        <dd>{{ v.prima }}</dd>
        <dt i18n="@@suscripcion.tarjeta.vigencia">Vigencia</dt>
        <dd>{{ v.vigencia }}</dd>
      </dl>
      <div class="condiciones">
        <div class="bloque">
          <h4 id="firma-coberturas" i18n="@@firma.coberturas">Coberturas</h4>
          <ul aria-labelledby="firma-coberturas">
            @for (cobertura of v.d.condiciones.coberturas; track cobertura) {
              <li>{{ cobertura }}</li>
            }
          </ul>
        </div>
        <div class="bloque">
          <h4 id="firma-exclusiones" i18n="@@firma.exclusiones">Exclusiones</h4>
          <ul aria-labelledby="firma-exclusiones">
            @for (exclusion of v.d.condiciones.exclusiones; track exclusion) {
              <li>{{ exclusion }}</li>
            }
          </ul>
        </div>
      </div>
      <p class="texto-secundario" i18n="@@firma.condiciones.version">
        Condiciones del producto, versión {{ v.d.condiciones.version }}.
      </p>
    </article>
  `,
})
export class VistaPreviaPoliza {
  readonly datos = input.required<DatosVistaPrevia>();
  readonly actor = input.required<Actor>();

  private readonly idioma = idiomaDe(inject(LOCALE_ID));

  /** Los datos formateados (D14, CA4 de la SOLVENTAG5-56). */
  protected readonly vista = computed(() => {
    const d = this.datos();
    const desde = fechaCalendario(d.vigenciaDesde, this.idioma);
    const hasta = fechaCalendario(d.vigenciaHasta, this.idioma);
    return {
      d,
      tomador: `${d.tomador.nombres} ${d.tomador.apellidos}`,
      producto:
        d.ramo === 'VIDA_HIPOTECARIO'
          ? $localize`:@@oferta.vidaHipotecario:Vida hipotecario`
          : d.ramo,
      sumaAsegurada: montoCop(d.sumaAsegurada, this.idioma),
      prima: montoCop(d.prima, this.idioma),
      mensual: d.periodicidad === 'MENSUAL',
      vigencia: $localize`:@@firma.vigencia.rango:Del ${desde}:desde: al ${hasta}:hasta:`,
    };
  });
}
