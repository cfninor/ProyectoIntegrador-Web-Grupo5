import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { SERVICIO_SESION } from '../../core/sesion/sesion';
import { AutorizacionAsesorApi } from './autorizacion-asesor-api';
import { CajaAutorizacion, ClienteCotizacion, FormularioCotizacion } from './formulario-cotizacion';

/**
 * Cotización del Portal Clientes, destino de «Cotizar otro seguro» de SOLV-WEB-21 (D1). El cliente
 * cotiza para sí mismo: nombre, documento y `clienteId` salen de la sesión y son de solo lectura
 * (CA4). La caja dice si su autorización está vigente (D17); sin ella la prima se calcula sin
 * perfil, así que «Calcular cotización» no depende de la autorización.
 */
@Component({
  selector: 'app-pagina-cotizar-cliente',
  imports: [FormularioCotizacion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-formulario-cotizacion
      actor="cliente"
      [cliente]="cliente"
      [autorizacion]="caja()"
      (reintentarAutorizacion)="consultarAutorizacion()"
    />
  `,
})
export class PaginaCotizarCliente {
  private readonly autorizacionApi = inject(AutorizacionAsesorApi);

  /** El cliente de la sesión (D11, CA4); null si la sesión no trae su `clienteId`. */
  protected readonly cliente: ClienteCotizacion | null = this.clienteDeLaSesion();
  protected readonly caja = signal<CajaAutorizacion>({ tipo: 'cargando' });

  private consultaEnCurso?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.consultaEnCurso?.unsubscribe());
    this.consultarAutorizacion();
  }

  /** Consulta el estado de la autorización del cliente (SOLVENTAG5-65). */
  protected consultarAutorizacion(): void {
    if (!this.cliente) {
      // Sin cliente identificado no hay autorización que consultar: la prima va sin perfil.
      this.caja.set({ tipo: 'estado', estado: 'SIN_SOLICITAR' });
      return;
    }
    this.consultaEnCurso?.unsubscribe();
    this.caja.set({ tipo: 'cargando' });
    this.consultaEnCurso = this.autorizacionApi.consultarEstado(this.cliente.clienteId).subscribe({
      next: ({ estado, fechaEstado }) => this.caja.set({ tipo: 'estado', estado, fechaEstado }),
      error: () => this.caja.set({ tipo: 'error' }),
    });
  }

  private clienteDeLaSesion(): ClienteCotizacion | null {
    const sesion = inject(SERVICIO_SESION).actual();
    if (!sesion?.clienteId) {
      return null;
    }
    return {
      clienteId: sesion.clienteId,
      nombreCompleto: sesion.usuario.nombre,
      documento: sesion.documentoEnmascarado ?? '',
    };
  }
}
