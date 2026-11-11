import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { Poliza } from './modelos';

/** Las operaciones de la póliza para firma (SOLVENTAG5-56) y de su emisión (SOLVENTAG5-58). */
@Injectable({ providedIn: 'root' })
export class PolizaApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  /**
   * La póliza de la solicitud (`generarPolizaParaFirma`): 201 nueva o 200 la misma, con el
   * documento generándose. Sin cuerpo. 404 y 409 (SOLICITUD_NO_EMITIBLE con su motivo,
   * SOLICITUD_SIN_CLIENTE) llegan como error.
   */
  generar(solicitudId: string): Observable<Poliza> {
    const id = encodeURIComponent(solicitudId);
    return this.http.post<Poliza>(
      `${this.config.apiBaseUrl}/v1/solicitudes-suscripcion/${id}/poliza`,
      null,
    );
  }

  /** La póliza con el estado de su documento (`obtenerPoliza`). */
  obtener(polizaId: string): Observable<Poliza> {
    return this.http.get<Poliza>(
      `${this.config.apiBaseUrl}/v1/polizas/${encodeURIComponent(polizaId)}`,
    );
  }

  /**
   * Emite la póliza firmada (`emitirPoliza`, SOLVENTAG5-58): 201 emitida o 200 la misma si ya estaba
   * VIGENTE, con su número. Sin cuerpo ni Idempotency-Key. 409 POLIZA_NO_EMITIBLE con su `motivo`
   * llega como error.
   */
  emitir(polizaId: string): Observable<Poliza> {
    return this.http.post<Poliza>(
      `${this.config.apiBaseUrl}/v1/polizas/${encodeURIComponent(polizaId)}/emision`,
      null,
    );
  }

  /**
   * El PDF de la póliza (`descargarDocumentoPoliza`), por `HttpClient` para que lleve el token de la
   * sesión. 409 DOCUMENTO_EN_GENERACION llega como error.
   */
  descargarDocumento(polizaId: string): Observable<Blob> {
    return this.http.get(
      `${this.config.apiBaseUrl}/v1/polizas/${encodeURIComponent(polizaId)}/documento`,
      { responseType: 'blob' },
    );
  }
}
