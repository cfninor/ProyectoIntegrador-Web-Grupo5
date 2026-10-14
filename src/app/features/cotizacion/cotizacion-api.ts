import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { BusquedaCliente, ClienteEncontrado, Cotizacion, SolicitudCotizacion } from './modelos';

/**
 * Cotización y búsqueda de cliente en el BFF web. El BFF reenvía al mismo servicio de cotización
 * del núcleo que usan el canal móvil y la API de socios (CA3): aquí no hay lógica de negocio.
 */
@Injectable({ providedIn: 'root' })
export class CotizacionApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  cotizar(solicitud: SolicitudCotizacion): Observable<Cotizacion> {
    return this.http.post<Cotizacion>(`${this.config.apiBaseUrl}/v1/cotizaciones`, solicitud);
  }

  /** Búsqueda exacta por documento (D2). Un 404 CLIENTE_NO_ENCONTRADO llega como error. */
  buscarCliente(busqueda: BusquedaCliente): Observable<ClienteEncontrado> {
    return this.http.post<ClienteEncontrado>(
      `${this.config.apiBaseUrl}/v1/clientes/busqueda`,
      busqueda,
    );
  }
}
