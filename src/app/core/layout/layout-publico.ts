import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Icono } from '../navegacion/icono';

/**
 * Layout de las páginas públicas, como SOLV-WEB-20: barra superior con la marca y el contenido,
 * sin menú. El selector de idioma ES / EN llega en la parte 4.
 */
@Component({
  selector: 'app-layout-publico',
  imports: [Icono, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .barra {
      display: flex;
      align-items: center;
      min-height: 80px;
      box-sizing: border-box;
      padding: 0 32px 0 29px;
      border-bottom: 1px solid var(--outline-variant);
      background: var(--surface);
    }

    .marca {
      display: flex;
      align-items: center;
      gap: 13px;
      margin: 0;
      font-family: var(--fuente-titulos);
      font-size: 20px;
      font-weight: 700;
    }

    .contenido {
      flex: 1;
      padding: 32px;
    }

    @media (max-width: 900px) {
      .barra,
      .contenido {
        padding-right: 16px;
        padding-left: 16px;
      }
    }
  `,
  template: `
    <header class="barra">
      <p class="marca">
        <app-icono nombre="escudo" [tamano]="22" />
        <span i18n="@@portal.marca">Solventa</span>
      </p>
    </header>

    <main class="contenido">
      <router-outlet />
    </main>
  `,
})
export class LayoutPublico {}
