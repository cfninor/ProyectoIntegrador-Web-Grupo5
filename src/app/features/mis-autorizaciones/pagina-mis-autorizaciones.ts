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

/** `no-encontrado` (404) no se reintenta; `fallo`, sí. El 409 no es un error: ver `Aviso`. */
type ErrorRevocacion = 'no-encontrado' | 'fallo';

/**
 * Lo que pasó con la última revocación (CA4): se hizo, o el consentimiento ya no estaba vigente
 * (409) y la lista se actualizó con su estado real.
 */
type Aviso = 'revocada' | 'ya-no-vigente';

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
  /** El aviso de la última revocación, hasta la siguiente acción. */
  protected readonly aviso = signal<Aviso | null>(null);

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
    this.aviso.set(null);
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
      error: (error: HttpErrorResponse) => this.alFallar(id, error),
    });
  }

  /**
   * CA4: el consentimiento revocado pasa de una vez al historial con el estado que respondió el
   * BFF, y la lista se vuelve a consultar para mostrar lo que hay en la base.
   */
  private alRevocar(revocado: Consentimiento): void {
    const carga = this.carga();
    if (carga.tipo === 'lista') {
      const consentimientos = carga.consentimientos.map((c) =>
        c.consentimientoId === revocado.consentimientoId ? revocado : c,
      );
      this.carga.set({ tipo: 'lista', consentimientos });
    }
    this.avisar('revocada');
  }

  /** Si ya no estaba vigente (409), la lista estaba desactualizada: se vuelve a consultar. */
  private alFallar(id: string, error: HttpErrorResponse): void {
    if (error.status === 409) {
      this.avisar('ya-no-vigente');
      return;
    }
    const tipo = error.status === 404 ? 'no-encontrado' : 'fallo';
    this.revocacion.set({ tipo: 'error', id, error: tipo });
  }

  private avisar(aviso: Aviso): void {
    this.revocacion.set(NINGUNA);
    this.aviso.set(aviso);
    this.enfocar('mis-autorizaciones-aviso');
    this.actualizar();
  }

  /**
   * Vuelve a consultar sin quitar la lista mientras responde. Si la consulta falla se deja la
   * lista como está: el aviso ya dice lo que pasó.
   */
  private actualizar(): void {
    if (!this.clienteId) {
      return;
    }
    this.consulta?.unsubscribe();
    this.consulta = this.api.consultar(this.clienteId).subscribe({
      next: ({ consentimientos }) => this.carga.set({ tipo: 'lista', consentimientos }),
      error: () => undefined,
    });
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
