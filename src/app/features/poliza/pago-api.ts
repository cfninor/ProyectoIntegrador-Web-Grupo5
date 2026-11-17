import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { APP_CONFIG } from '../../core/config/app-config';
import { CobroPoliza, CobroPrima, Pago, ResultadoCobro, TokenTarjeta } from './modelos';

/** Datos de tarjeta simulados (nunca reales) para `POST /tokenizaciones` del simulador. */
export interface DatosTarjetaSimulada {
  numero: string;
  vencimiento: string;
}

/**
 * Cobro de la primera prima (SOLVENTAG5-74), su consulta (SOLVENTAG5-75) y tokenización de la
 * tarjeta (ADR 0004 D8).
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
   * R2): repetirla con el mismo cuerpo devuelve la misma respuesta, sin cobrar dos veces. Un 200
   * es el pago que la póliza ya tenía (`existente`, SOLVENTAG5-75 D2); un 201, un intento nuevo.
   */
  cobrar(polizaId: string, cuerpo: CobroPrima, idempotencyKey: string): Observable<ResultadoCobro> {
    return this.http
      .post<Pago>(this.urlCobro(polizaId), cuerpo, {
        headers: { 'Idempotency-Key': idempotencyKey },
        observe: 'response',
      })
      .pipe(
        map((respuesta) => ({ pago: respuesta.body as Pago, existente: respuesta.status === 200 })),
      );
  }

  /**
   * `GET /v1/polizas/{polizaId}/cobro` (SOLVENTAG5-75, D6): el pago vigente de la póliza y sus
   * intentos. No mueve dinero, así que no lleva `Idempotency-Key`. Sin intentos, 404
   * COBRO_NO_ENCONTRADO.
   */
  obtenerCobro(polizaId: string): Observable<CobroPoliza> {
    return this.http.get<CobroPoliza>(this.urlCobro(polizaId));
  }

  private urlCobro(polizaId: string): string {
    return `${this.config.apiBaseUrl}/v1/polizas/${encodeURIComponent(polizaId)}/cobro`;
  }
}
