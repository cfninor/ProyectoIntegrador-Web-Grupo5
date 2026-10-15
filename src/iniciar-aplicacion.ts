import { LOCALE_ID } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { Idioma } from './app/core/idioma/idioma';

/** Inicia la aplicación en el idioma ya preparado por `main.ts`, que se provee como `LOCALE_ID`. */
export function iniciarAplicacion(idioma: Idioma) {
  return bootstrapApplication(App, {
    ...appConfig,
    providers: [...appConfig.providers, { provide: LOCALE_ID, useValue: idioma }],
  });
}
