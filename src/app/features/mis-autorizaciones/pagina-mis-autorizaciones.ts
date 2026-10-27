import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { fechaBogota } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { SERVICIO_SESION } from '../../core/sesion/sesion';
import { Consentimiento, EstadoConsentimiento } from '../autorizacion-datos/modelos';
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

/** El paso de la revocación de un vigente (CA3): solo uno a la vez. */
type Revocacion =
  | { tipo: 'ninguna' }
  | { tipo: 'confirmando'; id: string }
  | { tipo: 'revocando'; id: string }
  | { tipo: 'error'; id: string; error: ErrorRevocacion };

/** `no-vigente` (409) y `no-encontrado` (404) no se reintentan; `fallo`, sí. */
type ErrorRevocacion = 'no-vigente' | 'no-encontrado' | 'fallo';

const NINGUNA: Revocacion = { tipo: 'ninguna' };

interface ConsentimientoVista {
  consentimientoId: string;
  estado: EstadoConsentimiento;
  finalidad: string;
  destinatario: string;
  datos: string[];
  otorgado: string;
  vence: string;
  /** Solo si está revocado. */
  revocado?: string;
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
  private readonly injector = inject(Injector);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  /** El cliente de la sesión; sin él no hay consentimientos que consultar. */
  private readonly clienteId = inject(SERVICIO_SESION).actual()?.clienteId;
  private consulta?: Subscription;
  private revocacionEnCurso?: Subscription;

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly revocacion = signal<Revocacion>(NINGUNA);
  /** El aviso de que la revocación se hizo, hasta la siguiente acción. */
  protected readonly revocada = signal(false);

  /** CA1: los vigentes, con lo que cubren, a quién autorizan y sus fechas. */
  protected readonly vigentes = computed(() => this.lista((c) => c.estado === 'VIGENTE'));
  /** CA2: los revocados y los vencidos, aparte de los vigentes y en el orden en que llegan. */
  protected readonly historial = computed(() => this.lista((c) => c.estado !== 'VIGENTE'));

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.consulta?.unsubscribe();
      this.revocacionEnCurso?.unsubscribe();
    });
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

  /** La revocación del consentimiento `id`, o `ninguna` si se está revocando otro o ninguno. */
  protected revocacionDe(id: string): Revocacion {
    const revocacion = this.revocacion();
    return revocacion.tipo !== 'ninguna' && revocacion.id === id ? revocacion : NINGUNA;
  }

  /** CA3: antes de revocar se pide confirmación; el foco pasa a la pregunta. */
  protected pedirConfirmacion(id: string): void {
    this.revocada.set(false);
    this.revocacion.set({ tipo: 'confirmando', id });
    this.enfocar(`confirmar-${id}`);
  }

  /** Cierra la confirmación sin revocar y devuelve el foco a su botón. */
  protected cancelar(id: string): void {
    this.revocacion.set(NINGUNA);
    this.enfocar(`revocar-${id}`);
  }

  protected revocar(id: string): void {
    this.revocacionEnCurso?.unsubscribe();
    this.revocacion.set({ tipo: 'revocando', id });
    this.revocacionEnCurso = this.api.revocar(id).subscribe({
      next: (revocado) => this.alRevocar(revocado),
      error: (error: HttpErrorResponse) =>
        this.revocacion.set({ tipo: 'error', id, error: this.errorDe(error) }),
    });
  }

  /** El consentimiento revocado pasa al historial con el estado que respondió el BFF. */
  private alRevocar(revocado: Consentimiento): void {
    const carga = this.carga();
    if (carga.tipo === 'lista') {
      const consentimientos = carga.consentimientos.map((c) =>
        c.consentimientoId === revocado.consentimientoId ? revocado : c,
      );
      this.carga.set({ tipo: 'lista', consentimientos });
    }
    this.revocacion.set(NINGUNA);
    this.revocada.set(true);
    this.enfocar('mis-autorizaciones-aviso');
  }

  private errorDe(error: HttpErrorResponse): ErrorRevocacion {
    if (error.status === 409) {
      return 'no-vigente';
    }
    return error.status === 404 ? 'no-encontrado' : 'fallo';
  }

  private enfocar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }

  private lista(incluir: (c: Consentimiento) => boolean): ConsentimientoVista[] {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return [];
    }
    return carga.consentimientos.filter(incluir).map((c) => this.vista(c));
  }

  private vista(c: Consentimiento): ConsentimientoVista {
    return {
      consentimientoId: c.consentimientoId,
      estado: c.estado,
      finalidad: texto(TEXTOS_FINALIDAD, c.finalidad),
      destinatario: texto(TEXTOS_NOMBRE_DESTINATARIO, c.destinatario),
      datos: c.alcance.map((dato) => TEXTOS_DATO[dato]?.nombre ?? dato),
      otorgado: fechaBogota(c.fechaOtorga, this.idioma),
      vence: fechaBogota(c.fechaVencimiento, this.idioma),
      revocado: c.fechaRevoca ? fechaBogota(c.fechaRevoca, this.idioma) : undefined,
    };
  }
}
