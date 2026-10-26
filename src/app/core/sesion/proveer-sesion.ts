import {
  EnvironmentProviders,
  Injector,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';

import { APP_CONFIG, CONFIG_CARGADA } from '../config/app-config';
import { Inactividad } from './inactividad';
import { SERVICIO_SESION } from './sesion';
import { SesionCognito } from './sesion-cognito';
import { SesionSimulada } from './sesion-simulada';

/**
 * La sesión del portal según `config.json` (D8 de la SOLVENTAG5-207): Cognito si trae `cognito`;
 * si no, la `sesionSimulada`; y sin ninguna de las dos, la sesión vacía (la simulada sin sesión),
 * cuyo ingreso responde `SIN_CONEXION`.
 *
 * `SERVICIO_SESION` se crea la primera vez que se pide, y el inicializador lo pide después de
 * cargar `config.json`: así la elección ve la configuración del ambiente. Luego restaura la sesión
 * guardada y empieza a vigilar la inactividad.
 */
export function provideSesion(): EnvironmentProviders {
  return makeEnvironmentProviders([
    SesionCognito,
    SesionSimulada,
    {
      provide: SERVICIO_SESION,
      useFactory: () =>
        inject(APP_CONFIG).cognito ? inject(SesionCognito) : inject(SesionSimulada),
    },
    provideAppInitializer(async () => {
      const injector = inject(Injector);
      await inject(CONFIG_CARGADA, { optional: true });
      await injector.get(SERVICIO_SESION).restaurar();
      injector.get(Inactividad).vigilar();
    }),
  ]);
}
