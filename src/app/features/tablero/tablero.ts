import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { SERVICIO_SESION } from '../../core/sesion/sesion';

/**
 * Tablero de cada portal: la bienvenida al usuario. El título y las migas los pone el layout del
 * portal. Las partes 6 y 7 agregan «Nueva cotización» al tablero del asesor y del cliente.
 */
@Component({
  selector: 'app-tablero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .bienvenida {
      margin: 0;
      font-size: 16px;
    }
  `,
  template: `
    <p class="bienvenida" i18n="@@portal.tablero.bienvenida">Hola de nuevo, {{ nombre }}.</p>
  `,
})
export class Tablero {
  protected readonly nombre = inject(SERVICIO_SESION).actual()?.usuario.nombre ?? '';
}
