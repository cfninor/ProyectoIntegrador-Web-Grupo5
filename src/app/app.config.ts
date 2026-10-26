import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { provideAppConfig } from './core/config/app-config';
import { interceptorToken } from './core/sesion/interceptor-token';
import { provideSesion } from './core/sesion/proveer-sesion';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // El ID token va en las llamadas al BFF web (D10 de la SOLVENTAG5-207).
    provideHttpClient(withFetch(), withInterceptors([interceptorToken])),
    provideAppConfig(),
    // Cognito si config.json trae `cognito`; si no, la sesión simulada (D8).
    provideSesion(),
  ],
};
