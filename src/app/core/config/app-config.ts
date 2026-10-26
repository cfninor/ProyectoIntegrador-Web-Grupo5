import {
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

import { Sesion } from '../sesion/sesion';

/** User pool de Cognito del ambiente y el cliente del portal (SOLVENTAG5-207, D4 y D9). */
export interface ConfigCognito {
  region: string;
  userPoolId: string;
  /** Id del cliente de aplicación `portal-web` del user pool. */
  clienteId: string;
}

/**
 * Configuración que cambia por ambiente (local, dev, qa, prod).
 *
 * Se lee en tiempo de ejecución desde /config.json para que el mismo build se promueva
 * entre ambientes sin recompilar: el pipeline de despliegue solo reemplaza ese archivo.
 */
export interface AppConfig {
  /** URL base del BFF web (conector C1). */
  apiBaseUrl: string;
  /**
   * Inicio de sesión con Cognito (SOLVENTAG5-207). Lo agrega «Publicar portal» en DEV, QA y PROD
   * con los ids del ambiente. Si está, el portal usa Cognito y no la sesión simulada.
   */
  cognito?: ConfigCognito;
  /**
   * Sesión de la implementación simulada (D11 de la SOLVENTAG5-132), solo en local: «Publicar
   * portal» la descarta en los ambientes de AWS (D9 de la SOLVENTAG5-207). Sin ella ni `cognito`
   * no hay sesión y solo se abren las rutas públicas.
   */
  sesionSimulada?: Sesion;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

/**
 * Se resuelve cuando `config.json` ya se cargó en `APP_CONFIG`. Los inicializadores que dependen de
 * la configuración, como el de la sesión, la esperan: Angular arranca todos a la vez.
 */
export const CONFIG_CARGADA = new InjectionToken<Promise<void>>('CONFIG_CARGADA');

const config: AppConfig = { apiBaseUrl: '' };

export async function loadAppConfig(fetchFn: typeof fetch = fetch): Promise<AppConfig> {
  const response = await fetchFn('/config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`No se pudo cargar /config.json (HTTP ${response.status})`);
  }
  return Object.assign(config, (await response.json()) as AppConfig);
}

export function provideAppConfig() {
  return makeEnvironmentProviders([
    { provide: APP_CONFIG, useValue: config },
    { provide: CONFIG_CARGADA, useFactory: () => loadAppConfig().then(() => undefined) },
    provideAppInitializer(() => inject(CONFIG_CARGADA)),
  ]);
}
