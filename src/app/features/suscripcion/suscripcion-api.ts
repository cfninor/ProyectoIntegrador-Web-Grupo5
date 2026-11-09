import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import {
  BandejaRevision,
  PerfilRiesgoSolicitud,
  RevisionSolicitud,
  SolicitudSuscripcion,
} from './modelos';

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

  /**
   * El cliente titular acepta la nueva prima de su solicitud AJUSTADA (`aceptarPrimaAjustada`,
   * SOLVENTAG5-56): 200 con la solicitud y `primaAjustadaAceptadaEn`, también si ya la había
   * aceptado. Sin cuerpo: el canal lo pone el BFF. 404 y 409 AJUSTE_NO_APLICA llegan como error.
   */
  aceptarPrimaAjustada(solicitudId: string): Observable<SolicitudSuscripcion> {
    const id = encodeURIComponent(solicitudId);
    return this.http.post<SolicitudSuscripcion>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/${id}/aceptacion-prima`,
      null,
    );
  }

  obtenerPerfilRiesgo(solicitudId: string): Observable<PerfilRiesgoSolicitud> {
    const id = encodeURIComponent(solicitudId);
    return this.http.get<PerfilRiesgoSolicitud>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/${id}/perfil-riesgo`,
    );
  }

  /**
   * Una página de la bandeja de suscripción asistida (`listarSolicitudesEnRevision`,
   * SOLVENTAG5-52): las solicitudes en EN_REVISION, de la que lleva más tiempo esperando a la más
   * reciente, con el total. Solo para el analista de riesgo.
   */
  listarEnRevision(pagina: number, tamano: number): Observable<BandejaRevision> {
    return this.http.get<BandejaRevision>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/en-revision`,
      { params: new HttpParams().set('pagina', pagina).set('tamano', tamano) },
    );
  }

  /**
   * El detalle de revisión de una solicitud (`obtenerRevisionSolicitud`, SOLVENTAG5-53): sus datos,
   * quién la cotizó, las reglas evaluadas con las que quedaron sin resolver y el perfil con que se
   * cotizó. Solo para el analista de riesgo. Un 404 llega como error.
   */
  obtenerRevision(solicitudId: string): Observable<RevisionSolicitud> {
    const id = encodeURIComponent(solicitudId);
    return this.http.get<RevisionSolicitud>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/${id}/revision`,
    );
  }
}
