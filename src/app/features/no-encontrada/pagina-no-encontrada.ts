import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Página no encontrada, en el layout público: rutas que no existen y portales sin sesión. */
@Component({
  selector: 'app-pagina-no-encontrada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tarjeta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 760px;
      margin: 0 auto;
    }

    p {
      margin: 0;
    }
  `,
  template: `
    <section class="tarjeta">
      <h1 i18n="@@portal.noEncontrada.titulo">No encontramos esta página</h1>
      <p class="texto-secundario" i18n="@@portal.noEncontrada.texto">
        Revisa la dirección o vuelve a abrir el enlace que recibiste.
      </p>
    </section>
  `,
})
export class PaginaNoEncontrada {}
