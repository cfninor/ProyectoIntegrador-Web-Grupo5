import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { CobroPrima, Pago, TokenTarjeta } from './modelos';

/** Datos de tarjeta simulados (nunca reales) para `POST /tokenizaciones` del simulador. */
export interface DatosTarjetaSimulada {
  numero: string;
  vencimiento: string;
}

/**
 * Cobro de la primera prima (SOLVENTAG5-74) y tokenización de la tarjeta (ADR 0004 D8).
 *
 * `tokenizar` llama directo a la pasarela simulada, nunca al BFF: el número de la tarjeta no
 * debe tocar los servidores de Solventa (SAQ A). El interceptor de sesión solo agrega el token
 * de Cognito a `${apiBaseUrl}/v1/`, así que esta llamada nunca lo lleva.
 */
@Injectable({ providedIn: 'root' })
export class PagoApi {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  tokenizar(datos: DatosTarjetaSimulada): Observable<TokenTarjeta> {
    return this.http.post<TokenTarjeta>(`${this.config.pasarelaUrl}/tokenizaciones`, datos);
  }

  /**
   * `POST /v1/polizas/{polizaId}/cobro`. `idempotencyKey` viaja en la cabecera (SOLVENTAG5-121,
   * R2): repetirla con el mismo cuerpo devuelve la misma respuesta, sin cobrar dos veces.
   */
  cobrar(polizaId: string, cuerpo: CobroPrima, idempotencyKey: string): Observable<Pago> {
    return this.http.post<Pago>(
      `${this.config.apiBaseUrl}/v1/polizas/${encodeURIComponent(polizaId)}/cobro`,
      cuerpo,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  }
}
