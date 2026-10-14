/// <reference types="@angular/localize" />

import { prepararIdioma } from './app/core/idioma/idioma';

// Los textos con $localize se traducen al cargar sus módulos (títulos de ruta, menú, textos de
// SOLV-WEB-20): la aplicación se importa después de cargar la traducción del idioma elegido (D12).
prepararIdioma()
  .then((idioma) => import('./iniciar-aplicacion').then((m) => m.iniciarAplicacion(idioma)))
  .catch((err) => console.error(err));
