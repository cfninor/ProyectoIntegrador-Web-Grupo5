import { ActivatedRouteSnapshot, Data } from '@angular/router';

/** Lo que la barra superior del portal muestra de cada pantalla: «Solventa / {miga}» y el título. */
export interface DatosPagina {
  miga: string;
  titulo: string;
}

const CLAVE_PAGINA = 'pagina';

/** `data` de la ruta de una pantalla del portal. Si no se da el título, es el de la miga. */
export function datosPagina(miga: string, titulo: string = miga): Data {
  return { [CLAVE_PAGINA]: { miga, titulo } satisfies DatosPagina };
}

/** Los datos de la pantalla más profunda de la ruta activa, o null si no los declara. */
export function paginaActiva(ruta: ActivatedRouteSnapshot): DatosPagina | null {
  let actual = ruta;
  while (actual.firstChild) {
    actual = actual.firstChild;
  }
  return (actual.data[CLAVE_PAGINA] as DatosPagina | undefined) ?? null;
}
