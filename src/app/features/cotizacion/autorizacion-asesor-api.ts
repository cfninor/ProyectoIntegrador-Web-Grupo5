import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { EstadoAutorizacionCliente, PedirAutorizacion, SolicitudEnviada } from './modelos';

/**
 * Operaciones del asesor sobre la autorización de datos de un cliente, en el BFF web (rutas de la
 * SOLVENTAG5-65 con tag `asesor`). SOLV-WEB-05 las usa para la caja de autorización (D4, D17).
 */
@Injectable({ providedIn: 'root' })
export class AutorizacionAsesorApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  consultarEstado(clienteId: string): Observable<EstadoAutorizacionCliente> {
    return this.http.get<EstadoAutorizacionCliente>(
      `${this.urlCliente(clienteId)}/autorizacion-datos`,
    );
  }

  /** Crea la solicitud (201) o, si ya hay una pendiente, la reenvía (200). */
  pedirAutorizacion(clienteId: string, peticion: PedirAutorizacion): Observable<SolicitudEnviada> {
    return this.http.post<SolicitudEnviada>(
      `${this.urlCliente(clienteId)}/solicitudes-autorizacion`,
      peticion,
    );
  }

  private urlCliente(clienteId: string): string {
    return `${this.config.apiBaseUrl}/v1/clientes/${encodeURIComponent(clienteId)}`;
  }
}
