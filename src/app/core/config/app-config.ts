import { InjectionToken, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';

import { Sesion } from '../sesion/sesion';

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
   * Sesión de la implementación simulada (D11). Mientras no haya inicio de sesión real la llevan
   * local y todos los ambientes (DEV, QA y PROD), porque las demostraciones se hacen ahí y los
   * datos son de prueba. Sin ella no hay sesión y solo se abren las rutas públicas.
   */
  sesionSimulada?: Sesion;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

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
    provideAppInitializer(() => loadAppConfig().then(() => undefined)),
  ]);
}
