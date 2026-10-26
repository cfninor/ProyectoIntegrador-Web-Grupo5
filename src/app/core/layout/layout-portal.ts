import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith, tap } from 'rxjs';

import { SelectorIdioma } from '../idioma/selector-idioma';
import { Icono } from '../navegacion/icono';
import { MENU } from '../navegacion/menu';
import { NOMBRE_ROL } from '../sesion/roles';
import { RUTA_INGRESAR } from '../sesion/rol-guard';
import { SERVICIO_SESION } from '../sesion/sesion';
import { paginaActiva } from './pagina';

/** Las iniciales de las dos primeras palabras del nombre: «Ana Sofía Reyes» → «AS». */
export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0).toLocaleUpperCase('es-CO'))
    .join('');
}

/**
 * Layout de los portales por rol (D18, componente `Sidebar` del Figma): menú lateral con las
 * opciones del rol y la tarjeta del usuario, barra superior con las migas, el título de la
 * pantalla y el selector de idioma, y el contenido. En pantallas angostas el menú se pliega tras un botón.
 */
@Component({
  selector: 'app-layout-portal',
  imports: [Icono, RouterLink, RouterLinkActive, RouterOutlet, SelectorIdioma],
  templateUrl: './layout-portal.html',
  styleUrl: './layout-portal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Escape cierra el menú plegado.
  host: { '(document:keydown.escape)': 'cerrarMenu()' },
})
export class LayoutPortal {
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  private readonly servicioSesion = inject(SERVICIO_SESION);

  /** El `rolGuard` del portal ya comprobó que hay sesión con el rol del portal. */
  protected readonly sesion = this.servicioSesion.actual();
  protected readonly menu = this.sesion ? MENU[this.sesion.rol] : [];
  protected readonly nombreRol = this.sesion ? NOMBRE_ROL[this.sesion.rol] : '';
  protected readonly iniciales = iniciales(this.sesion?.usuario.nombre ?? '');

  protected readonly menuAbierto = signal(false);

  protected readonly pagina = toSignal(
    this.router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      // Al cambiar de pantalla, el menú plegado se cierra.
      tap(() => this.menuAbierto.set(false)),
      startWith(null),
      map(() => paginaActiva(this.ruta.snapshot)),
    ),
    { requireSync: true },
  );

  protected readonly miga = computed(() => this.pagina()?.miga ?? '');
  protected readonly titulo = computed(() => this.pagina()?.titulo ?? '');

  protected alternarMenu(): void {
    this.menuAbierto.update((abierto) => !abierto);
  }

  protected cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  /** «Cerrar sesión» (D11 de la SOLVENTAG5-207): revoca el refresco y vuelve a `/ingresar`. */
  protected async cerrarSesion(): Promise<void> {
    await this.servicioSesion.cerrar();
    await this.router.navigateByUrl(RUTA_INGRESAR);
  }
}
