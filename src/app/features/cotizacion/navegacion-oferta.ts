import { Router } from '@angular/router';

import { BusquedaCliente, DatosBienVidaHipotecario } from './modelos';

/**
 * Lo que viaja entre el cotizador y la oferta en el estado de la navegación (SOLVENTAG5-49), sin
 * guardarse en el backend: se pierde al recargar la página, y entonces cada pantalla sigue sin él.
 */
export interface EstadoNavegacionOferta {
  /** El documento con que el asesor encontró al cliente, para volver a buscarlo al recotizar. */
  busqueda?: BusquedaCliente;
  /** Los datos con que el cotizador se abre al ajustar o recotizar una oferta. */
  recotizar?: DatosRecotizar;
}

export interface DatosRecotizar {
  datosBien: DatosBienVidaHipotecario;
  busqueda?: BusquedaCliente;
}

/**
 * El estado de la navegación en curso o, ya terminada, el que quedó en el historial. Se lee en el
 * constructor de la pantalla, mientras el enrutador todavía la está mostrando.
 */
export function estadoNavegacion(router: Router): EstadoNavegacionOferta {
  const estado = router.currentNavigation()?.extras.state ?? globalThis.history?.state;
  return (estado ?? {}) as EstadoNavegacionOferta;
}
