import { DOCUMENT, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { RUTA_INGRESAR } from './rol-guard';
import { Rol, SERVICIO_SESION } from './sesion';

/** R8 de la SOLVENTAG5-207: minutos sin actividad que cierran la sesión, por rol. */
export const MINUTOS_INACTIVIDAD: Record<Rol, number> = {
  ASESOR: 15,
  CLIENTE: 30,
  ANALISTA_RIESGO: 15,
  OPERACIONES: 15,
  SOCIO: 15,
};

/** Cuentan como actividad el teclado, el puntero, la rueda o el desplazamiento y el toque. */
export const EVENTOS_ACTIVIDAD = [
  'keydown',
  'pointerdown',
  'pointermove',
  'wheel',
  'scroll',
  'touchstart',
] as const;

/**
 * Cierra la sesión por inactividad (R8). Corre mientras hay sesión: se revisa en cada navegación,
 * porque ingresar y cerrar sesión siempre navegan. Es por pestaña, como los tokens.
 */
@Injectable({ providedIn: 'root' })
export class Inactividad {
  private readonly sesion = inject(SERVICIO_SESION);
  private readonly router = inject(Router);
  private readonly documento = inject(DOCUMENT);

  private activa = false;
  private temporizador?: ReturnType<typeof setTimeout>;
  private readonly alActuar = () => this.reiniciar();

  /** Se llama una vez al arrancar la aplicación. */
  vigilar(): void {
    this.router.events
      .pipe(filter((evento) => evento instanceof NavigationEnd))
      .subscribe(() => this.sincronizar());
    this.sincronizar();
  }

  /** Arranca si hay sesión y no estaba corriendo; se detiene si ya no hay sesión. */
  sincronizar(): void {
    const conSesion = this.sesion.actual() !== null;
    if (conSesion && !this.activa) {
      this.arrancar();
    } else if (!conSesion && this.activa) {
      this.detener();
    }
  }

  private arrancar(): void {
    this.activa = true;
    for (const evento of EVENTOS_ACTIVIDAD) {
      this.documento.addEventListener(evento, this.alActuar, { capture: true, passive: true });
    }
    this.reiniciar();
  }

  private detener(): void {
    this.activa = false;
    clearTimeout(this.temporizador);
    for (const evento of EVENTOS_ACTIVIDAD) {
      this.documento.removeEventListener(evento, this.alActuar, { capture: true });
    }
  }

  private reiniciar(): void {
    clearTimeout(this.temporizador);
    const sesion = this.sesion.actual();
    if (!sesion) {
      this.detener();
      return;
    }
    this.temporizador = setTimeout(
      () => void this.vencer(),
      MINUTOS_INACTIVIDAD[sesion.rol] * 60_000,
    );
  }

  private async vencer(): Promise<void> {
    this.detener();
    await this.sesion.cerrar('inactividad');
    await this.router.navigate([RUTA_INGRESAR], { queryParams: { motivo: 'inactividad' } });
  }
}
