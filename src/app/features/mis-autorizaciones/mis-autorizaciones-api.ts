import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { Consentimiento, ConsentimientosCliente } from '../autorizacion-datos/modelos';

/** Los consentimientos del cliente de la sesión y su revocación, en el BFF web (SOLVENTAG5-84). */
@Injectable({ providedIn: 'root' })
export class MisAutorizacionesApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  consultar(clienteId: string): Observable<ConsentimientosCliente> {
    const id = encodeURIComponent(clienteId);
    return this.http.get<ConsentimientosCliente>(
      `${this.config.apiBaseUrl}/v1/clientes/${id}/consentimientos`,
    );
  }

  /** Revoca un consentimiento vigente del cliente de la sesión; responde el consentimiento revocado. */
  revocar(consentimientoId: string): Observable<Consentimiento> {
    const id = encodeURIComponent(consentimientoId);
    return this.http.post<Consentimiento>(
      `${this.config.apiBaseUrl}/v1/consentimientos/${id}/revocacion`,
      null,
    );
  }
}
