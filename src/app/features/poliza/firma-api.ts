import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { DocumentoParaFirmar, Firma } from './modelos';

/**
 * Las operaciones de la firma electrónica del BFF web (SOLVENTAG5-57): las tres con sesión, para el
 * seguimiento de SOLV-WEB-10, y las dos públicas del enlace que recibe el cliente. Los 404, 409 y
 * 503 llegan como error, con el cuerpo `Error` del contrato.
 */
@Injectable({ providedIn: 'root' })
export class FirmaApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  /**
   * Pide la firma (`enviarFirma`): 201 nueva en PENDIENTE_ENVIO o 200 la que ya tenía. Sin cuerpo.
   * 409 DOCUMENTO_EN_GENERACION, PAGO_NO_APROBADO o CLIENTE_SIN_CONTACTO (R1).
   */
  enviar(polizaId: string): Observable<Firma> {
    return this.http.post<Firma>(this.urlFirma(polizaId), null);
  }

  /** El seguimiento (`obtenerFirma`). 404 FIRMA_NO_ENCONTRADA si la póliza todavía no tiene firma. */
  obtener(polizaId: string): Observable<Firma> {
    return this.http.get<Firma>(this.urlFirma(polizaId));
  }

  /** Reenvía el enlace con un código nuevo (`reenviarFirma`). 409 FIRMA_NO_REENVIABLE (R3). */
  reenviar(polizaId: string): Observable<Firma> {
    return this.http.post<Firma>(`${this.urlFirma(polizaId)}/reenvio`, null);
  }

  /** Pública: el documento a firmar (`abrirFirma`); la primera apertura es el hito «abierto». */
  abrir(firmaId: string): Observable<DocumentoParaFirmar> {
    return this.http.get<DocumentoParaFirmar>(this.urlPublica(firmaId));
  }

  /** Pública: firma con el código de un solo uso (`firmarConCodigo`). 409 con el motivo (R5). */
  firmar(firmaId: string, codigo: string): Observable<Firma> {
    return this.http.post<Firma>(`${this.urlPublica(firmaId)}/validacion`, { codigo });
  }

  private urlFirma(polizaId: string): string {
    return `${this.config.apiBaseUrl}/v1/polizas/${encodeURIComponent(polizaId)}/firma`;
  }

  private urlPublica(firmaId: string): string {
    return `${this.config.apiBaseUrl}/v1/firmas/${encodeURIComponent(firmaId)}`;
  }
}
