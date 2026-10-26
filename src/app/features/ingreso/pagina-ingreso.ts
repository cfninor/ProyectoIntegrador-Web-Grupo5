import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * SOLV-WEB-01 «Login unificado», en `/ingresar` (SOLVENTAG5-207). Provisional: la parte 4 solo
 * registra la ruta y sus guards; el formulario y los mensajes de R9 llegan con la parte 5.
 */
@Component({
  selector: 'app-pagina-ingreso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 i18n="@@ingreso.titulo">Iniciar sesión</h1>`,
})
export class PaginaIngreso {}
