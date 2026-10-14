import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Raíz de la aplicación: solo el `router-outlet`. Cada ruta trae su layout, público o de portal. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {}
