import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Íconos del portal, como los del componente `Sidebar` del Figma. */
export type NombreIcono = 'cuadricula' | 'documento' | 'escudo' | 'mas' | 'menu';

/**
 * Ícono SVG en línea, de trazo y con el color del texto (`currentColor`). Es decorativo: el texto
 * que lo acompaña, o el `aria-label` de su botón, da el significado.
 */
@Component({
  selector: 'app-icono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.width]="tamano()"
      [attr.height]="tamano()"
      focusable="false"
    >
      @switch (nombre()) {
        @case ('cuadricula') {
          <rect x="2" y="2" width="8.5" height="8.5" rx="1.5" />
          <rect x="13.5" y="2" width="8.5" height="8.5" rx="1.5" />
          <rect x="2" y="13.5" width="8.5" height="8.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="8.5" height="8.5" rx="1.5" />
        }
        @case ('documento') {
          <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
          <path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h7" />
        }
        @case ('mas') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('escudo') {
          <path d="M12 2 3 5.5v6c0 5 3.8 9.4 9 10.5 5.2-1.1 9-5.5 9-10.5v-6z" />
        }
        @case ('menu') {
          <path d="M4 6h16M4 12h16M4 18h16" />
        }
      }
    </svg>
  `,
})
export class Icono {
  readonly nombre = input.required<NombreIcono>();
  /** Lado en px. */
  readonly tamano = input(18);
}
