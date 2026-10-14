import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icono } from '../../core/navegacion/icono';
import { tableroDe } from '../../core/sesion/roles';
import { Rol, SERVICIO_SESION } from '../../core/sesion/sesion';

/** Roles cuyo tablero lleva «Nueva cotización» (SOLVENTAG5-132). La parte 7 agrega el cliente. */
const COTIZAN: readonly Rol[] = ['ASESOR'];

/**
 * Tablero de cada portal: la bienvenida al usuario y, para quien cotiza, «Nueva cotización». El
 * título y las migas los pone el layout del portal.
 */
@Component({
  selector: 'app-tablero',
  imports: [Icono, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .bienvenida {
      margin: 0;
      font-size: 16px;
    }

    .nueva-cotizacion {
      box-sizing: border-box;
      gap: 8px;
      min-height: 40px;
      margin-top: 24px;
      text-decoration: none;
    }
  `,
  template: `
    <p class="bienvenida" i18n="@@portal.tablero.bienvenida">Hola de nuevo, {{ nombre }}.</p>
    @if (rutaCotizar; as ruta) {
      <a class="boton-primario nueva-cotizacion" [routerLink]="ruta">
        <app-icono nombre="mas" [tamano]="16" />
        <span i18n="@@portal.tablero.nuevaCotizacion">Nueva cotización</span>
      </a>
    }
  `,
})
export class Tablero {
  private readonly sesion = inject(SERVICIO_SESION).actual();
  protected readonly nombre = this.sesion?.usuario.nombre ?? '';
  protected readonly rutaCotizar =
    this.sesion && COTIZAN.includes(this.sesion.rol)
      ? `${tableroDe(this.sesion.rol)}/cotizar`
      : null;
}
