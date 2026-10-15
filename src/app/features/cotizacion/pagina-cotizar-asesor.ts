import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { SERVICIO_SESION } from '../../core/sesion/sesion';
import { AutorizacionAsesorApi } from './autorizacion-asesor-api';
import { CotizacionApi } from './cotizacion-api';
import {
  CajaAutorizacion,
  ClienteCotizacion,
  EstadoBusqueda,
  FormularioCotizacion,
} from './formulario-cotizacion';
import { BusquedaCliente } from './modelos';

/** Resultado de «Pedir autorización» o «Reenviar solicitud», que se avisa sobre el formulario. */
type AvisoEnvio = 'pedida' | 'reenviada' | 'error' | null;

/**
 * SOLV-WEB-05 «Cotizar seguro de vida hipotecario» del Portal Asesores (D1). El asesor busca al
 * cliente por su documento (D2, D15), ve el estado de su autorización y la pide o la reenvía
 * (D4, D17), y cotiza con el formulario común cuando la autorización está AUTORIZADA.
 */
@Component({
  selector: 'app-pagina-cotizar-asesor',
  imports: [FormularioCotizacion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .aviso {
      margin: 0 0 16px;
      padding: 12px 16px;
      border-radius: 8px;
    }

    .aviso-enviada {
      border: 1px solid #c6d6d3;
      background: var(--info-container);
    }

    .aviso-error {
      border: 1px solid var(--error);
      background: var(--surface);
    }
  `,
  template: `
    <div role="status">
      @switch (aviso()) {
        @case ('pedida') {
          <p class="aviso aviso-enviada" i18n="@@cotizacion.asesor.aviso.pedida">
            Le enviamos al cliente la solicitud de autorización.
          </p>
        }
        @case ('reenviada') {
          <p class="aviso aviso-enviada" i18n="@@cotizacion.asesor.aviso.reenviada">
            Le reenviamos al cliente la solicitud de autorización.
          </p>
        }
      }
    </div>
    @if (aviso() === 'error') {
      <p
        class="aviso aviso-error mensaje-error"
        role="alert"
        i18n="@@cotizacion.asesor.aviso.error"
      >
        No pudimos enviar la solicitud de autorización. Intenta de nuevo.
      </p>
    }

    <app-formulario-cotizacion
      actor="asesor"
      [cliente]="cliente()"
      [busqueda]="busqueda()"
      [autorizacion]="caja()"
      [envioHabilitado]="autorizada()"
      (buscarCliente)="buscar($event)"
      (pedirAutorizacion)="pedirAutorizacion()"
      (reenviarSolicitud)="pedirAutorizacion()"
      (reintentarAutorizacion)="consultarAutorizacion()"
    />
  `,
})
export class PaginaCotizarAsesor {
  private readonly cotizacionApi = inject(CotizacionApi);
  private readonly autorizacionApi = inject(AutorizacionAsesorApi);
  /** El asesor de la sesión: sus datos van en la solicitud de autorización (D4). */
  private readonly asesor = inject(SERVICIO_SESION).actual()?.usuario ?? null;

  protected readonly cliente = signal<ClienteCotizacion | null>(null);
  protected readonly busqueda = signal<EstadoBusqueda>('inactiva');
  protected readonly caja = signal<CajaAutorizacion>({ tipo: 'cargando' });
  protected readonly aviso = signal<AvisoEnvio>(null);

  /** «Calcular cotización» solo se habilita con la autorización AUTORIZADA (D4). */
  protected readonly autorizada = computed(() => {
    const caja = this.caja();
    return caja.tipo === 'estado' && caja.estado === 'AUTORIZADA';
  });

  /** La búsqueda y la petición de autorización en curso: una nueva cancela la anterior. */
  private busquedaEnCurso?: Subscription;
  private autorizacionEnCurso?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelar());
  }

  /** Busca al cliente por su documento (D2) y, si lo encuentra, consulta su autorización. */
  protected buscar(busqueda: BusquedaCliente): void {
    this.cancelar();
    this.cliente.set(null);
    this.caja.set({ tipo: 'cargando' });
    this.aviso.set(null);
    this.busqueda.set('buscando');
    this.busquedaEnCurso = this.cotizacionApi.buscarCliente(busqueda).subscribe({
      next: (encontrado) => {
        this.busqueda.set('inactiva');
        this.cliente.set({
          clienteId: encontrado.clienteId,
          nombreCompleto: `${encontrado.nombres} ${encontrado.apellidos}`,
          documento: encontrado.documentoEnmascarado,
        });
        this.consultarAutorizacion();
      },
      error: (error: HttpErrorResponse) =>
        this.busqueda.set(error.status === 404 ? 'no-encontrado' : 'error'),
    });
  }

  /** Consulta el estado de la autorización del cliente encontrado (SOLVENTAG5-65). */
  protected consultarAutorizacion(): void {
    const { clienteId } = this.clienteEncontrado();
    this.autorizacionEnCurso?.unsubscribe();
    this.caja.set({ tipo: 'cargando' });
    this.autorizacionEnCurso = this.autorizacionApi.consultarEstado(clienteId).subscribe({
      next: ({ estado, fechaEstado }) => this.caja.set({ tipo: 'estado', estado, fechaEstado }),
      error: () => this.caja.set({ tipo: 'error' }),
    });
  }

  /**
   * «Pedir autorización» y «Reenviar solicitud»: la misma ruta crea la solicitud o reenvía la
   * pendiente. Después se consulta el estado otra vez, que es el que manda.
   */
  protected pedirAutorizacion(): void {
    if (!this.asesor) {
      return;
    }
    const cliente = this.clienteEncontrado();
    const anterior = this.caja();
    this.autorizacionEnCurso?.unsubscribe();
    this.aviso.set(null);
    this.caja.set({ tipo: 'cargando' });
    this.autorizacionEnCurso = this.autorizacionApi
      .pedirAutorizacion(cliente.clienteId, {
        asesor: { id: this.asesor.id, nombre: this.asesor.nombre },
      })
      .subscribe({
        next: (enviada) => {
          this.aviso.set(enviada.reenviada ? 'reenviada' : 'pedida');
          this.consultarAutorizacion();
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 409) {
            // CLIENTE_YA_AUTORIZADO: el cliente autorizó mientras tanto; su estado lo muestra.
            this.consultarAutorizacion();
          } else {
            this.caja.set(anterior);
            this.aviso.set('error');
          }
        },
      });
  }

  /**
   * El cliente de la caja. Las acciones de la caja (consultar, pedir, reenviar, reintentar) solo
   * existen con un cliente encontrado: sin él, la caja del asesor pide buscarlo.
   */
  private clienteEncontrado(): ClienteCotizacion {
    return this.cliente() as ClienteCotizacion;
  }

  private cancelar(): void {
    this.busquedaEnCurso?.unsubscribe();
    this.autorizacionEnCurso?.unsubscribe();
  }
}
