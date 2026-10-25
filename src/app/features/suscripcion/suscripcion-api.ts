import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { PerfilRiesgoSolicitud } from './modelos';

@Injectable({ providedIn: 'root' })
export class SuscripcionApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  obtenerPerfilRiesgo(solicitudId: string): Observable<PerfilRiesgoSolicitud> {
    const id = encodeURIComponent(solicitudId);
    return this.http.get<PerfilRiesgoSolicitud>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/${id}/perfil-riesgo`,
    );
  }
}
