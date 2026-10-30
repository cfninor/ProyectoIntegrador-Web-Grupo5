import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { PerfilRiesgoSolicitud, SolicitudSuscripcion } from './modelos';

@Injectable({ providedIn: 'root' })
export class SuscripcionApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  /**
   * Acepta la oferta de la cotización (operación `aceptarOferta`, SOLVENTAG5-237): 201 con la
   * solicitud nueva, o 200 con la misma si ya se había aceptado (doble clic). El canal lo pone el
   * BFF. 409 OFERTA_VENCIDA y 404 COTIZACION_NO_ENCONTRADA llegan como error.
   */
  aceptarOferta(cotizacionId: string): Observable<SolicitudSuscripcion> {
    return this.http.post<SolicitudSuscripcion>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion`,
      { cotizacionId },
    );
  }

  /** La solicitud con su estado (`obtenerSolicitudSuscripcion`). Un 404 llega como error. */
  obtenerSolicitud(solicitudId: string): Observable<SolicitudSuscripcion> {
    return this.http.get<SolicitudSuscripcion>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/${encodeURIComponent(solicitudId)}`,
    );
  }

  obtenerPerfilRiesgo(solicitudId: string): Observable<PerfilRiesgoSolicitud> {
    const id = encodeURIComponent(solicitudId);
    return this.http.get<PerfilRiesgoSolicitud>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/${id}/perfil-riesgo`,
    );
  }
}
