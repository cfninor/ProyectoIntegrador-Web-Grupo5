import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Actor } from './formulario-cotizacion';
import { PasosContratacion } from './pasos-contratacion';

/**
 * Destino de «Continuar a la contratación» en la oferta (SOLVENTAG5-49, CA2): el paso 2,
 * Suscripción. La evaluación con las reglas de suscripción llega con la SOLVENTAG5-50; mientras
 * tanto la pantalla lo dice y permite volver a la oferta. No guarda nada en el backend.
 */
@Component({
  selector: 'app-pagina-suscripcion',
  imports: [PasosContratacion, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .tarjeta {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      max-width: 720px;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 16px;
      font-weight: 600;
    }

    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;

      a {
        text-decoration: none;
      }
    }
  `,
  template: `
    <app-pasos-contratacion [actual]="2" />
    <section class="tarjeta" aria-labelledby="suscripcion-titulo">
      <h2 id="suscripcion-titulo" i18n="@@suscripcion.titulo">La suscripción llega pronto</h2>
      @if (actor() === 'asesor') {
        <p i18n="@@suscripcion.texto.asesor">
          El cliente aceptó la oferta. El siguiente paso, la evaluación con las reglas de
          suscripción, todavía no está disponible en el portal.
        </p>
      } @else {
        <p i18n="@@suscripcion.texto.cliente">
          Elegiste continuar con tu oferta. El siguiente paso, la evaluación de tu solicitud,
          todavía no está disponible en el portal.
        </p>
      }
      <div class="acciones">
        <a class="boton-primario" [routerLink]="rutaOferta()" i18n="@@suscripcion.volverOferta"
          >Volver a la oferta</a
        >
        <a class="boton-secundario" [routerLink]="'/' + actor()" i18n="@@suscripcion.irTablero"
          >Ir al tablero</a
        >
      </div>
    </section>
  `,
})
export class PaginaSuscripcion {
  readonly cotizacionId = input.required<string>();
  readonly actor = input.required<Actor>();

  protected readonly rutaOferta = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}`,
  );
}
