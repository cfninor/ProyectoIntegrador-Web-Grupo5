import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Crear cuenta del cliente, en `/crear-cuenta` (SOLVENTAG5-207, CA8). Provisional: la parte 4
 * solo registra la ruta y sus guards; el formulario «Tus datos» y el código llegan con la parte 5.
 */
@Component({
  selector: 'app-pagina-crear-cuenta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 i18n="@@crearCuenta.titulo">Crea tu cuenta</h1>`,
})
export class PaginaCrearCuenta {}
