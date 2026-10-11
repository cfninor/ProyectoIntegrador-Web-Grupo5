import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { DecisionSolicitud, ResultadoDecision, SolicitudParaCliente } from './modelos';

/** Operaciones del cliente sobre su solicitud de autorización, en el BFF web. */
@Injectable({ providedIn: 'root' })
export class AutorizacionDatosApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  obtenerSolicitud(solicitudId: string): Observable<SolicitudParaCliente> {
    return this.http.get<SolicitudParaCliente>(this.urlSolicitud(solicitudId));
  }

  decidir(solicitudId: string, decision: DecisionSolicitud): Observable<ResultadoDecision> {
    return this.http.post<ResultadoDecision>(
      `${this.urlSolicitud(solicitudId)}/decision`,
      decision,
    );
  }

  private urlSolicitud(solicitudId: string): string {
    return `${this.config.apiBaseUrl}/v1/solicitudes-autorizacion/${encodeURIComponent(solicitudId)}`;
  }
}
