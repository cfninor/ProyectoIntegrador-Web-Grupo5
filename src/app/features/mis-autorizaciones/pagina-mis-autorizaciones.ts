import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { fechaBogota } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { SERVICIO_SESION } from '../../core/sesion/sesion';
import { Consentimiento } from '../autorizacion-datos/modelos';
import {
  TEXTOS_DATO,
  TEXTOS_FINALIDAD,
  TEXTOS_NOMBRE_DESTINATARIO,
  texto,
} from '../autorizacion-datos/textos';
import { MisAutorizacionesApi } from './mis-autorizaciones-api';

type Carga =
  | { tipo: 'cargando' }
  | { tipo: 'sin-cliente' }
  | { tipo: 'error' }
  | { tipo: 'lista'; consentimientos: Consentimiento[] };

interface ConsentimientoVista {
  consentimientoId: string;
  finalidad: string;
  destinatario: string;
  datos: string[];
  otorgado: string;
  vence: string;
}

/**
 * «Mis autorizaciones» del Portal Clientes (SOLVENTAG5-84): los consentimientos que el cliente de
 * la sesión ha otorgado. Se consultan cada vez que se abre la pantalla, sin copia guardada.
 */
@Component({
  selector: 'app-pagina-mis-autorizaciones',
  templateUrl: './pagina-mis-autorizaciones.html',
  styleUrl: './pagina-mis-autorizaciones.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginaMisAutorizaciones {
  private readonly api = inject(MisAutorizacionesApi);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  /** El cliente de la sesión; sin él no hay consentimientos que consultar. */
  private readonly clienteId = inject(SERVICIO_SESION).actual()?.clienteId;
  private consulta?: Subscription;

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });

  /** CA1: los vigentes, con lo que cubren, a quién autorizan y sus fechas. */
  protected readonly vigentes = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return [];
    }
    return carga.consentimientos.filter((c) => c.estado === 'VIGENTE').map((c) => this.vista(c));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.consulta?.unsubscribe());
    this.cargar();
  }

  protected cargar(): void {
    if (!this.clienteId) {
      this.carga.set({ tipo: 'sin-cliente' });
      return;
    }
    this.consulta?.unsubscribe();
    this.carga.set({ tipo: 'cargando' });
    this.consulta = this.api.consultar(this.clienteId).subscribe({
      next: ({ consentimientos }) => this.carga.set({ tipo: 'lista', consentimientos }),
      error: () => this.carga.set({ tipo: 'error' }),
    });
  }

  private vista(c: Consentimiento): ConsentimientoVista {
    return {
      consentimientoId: c.consentimientoId,
      finalidad: texto(TEXTOS_FINALIDAD, c.finalidad),
      destinatario: texto(TEXTOS_NOMBRE_DESTINATARIO, c.destinatario),
      datos: c.alcance.map((dato) => TEXTOS_DATO[dato]?.nombre ?? dato),
      otorgado: fechaBogota(c.fechaOtorga, this.idioma),
      vence: fechaBogota(c.fechaVencimiento, this.idioma),
    };
  }
}
