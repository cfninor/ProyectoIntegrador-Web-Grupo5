import { InjectionToken, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';

/**
 * Configuración que cambia por ambiente (local, dev, qa, prod).
 *
 * Se lee en tiempo de ejecución desde /config.json para que el mismo build se promueva
 * entre ambientes sin recompilar: el pipeline de despliegue solo reemplaza ese archivo.
 */
export interface AppConfig {
  /** URL base del BFF web (conector C1). */
  apiBaseUrl: string;
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
