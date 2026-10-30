import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { SIN_DECISION, SolicitudSuscripcion } from '../suscripcion/modelos';
import { SuscripcionApi } from '../suscripcion/suscripcion-api';
import { TarjetaResultado } from '../suscripcion/tarjeta-resultado';
import { Actor } from './formulario-cotizacion';
import { PasosContratacion } from './pasos-contratacion';

type Carga =
  | { tipo: 'sin-solicitud' }
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' }
  | { tipo: 'lista'; solicitud: SolicitudSuscripcion };

/** Cada cuánto se vuelve a consultar una solicitud que sigue en evaluación. */
export const INTERVALO_CONSULTA_MS = 2000;
/** Consultas antes de decir que la evaluación tarda más de lo normal (≈ 30 s). */
export const MAXIMO_CONSULTAS = 15;

/**
 * Paso 2 de la contratación, Suscripción (SOLVENTAG5-237). La oferta se aceptó en la pantalla
 * anterior, que trae aquí el `solicitudId` en la URL. La evaluación con las reglas de suscripción
 * corre en el núcleo después de aceptar (SOLVENTAG5-50, ADR 0007), y con ella la decisión
 * automática (SOLVENTAG5-51, BA-12: asíncrona). Mientras la solicitud está en PENDIENTE_EVALUACION
 * o EVALUADA la pantalla la consulta cada pocos segundos con
 * `GET /v1/solicitudes-suscripcion/{solicitudId}`, sin dejar una petición abierta (R8), y al
 * llegar muestra la decisión. «Pendiente de revisión» es un estado, no un error. La misma respuesta
 * alimenta la tarjeta del resultado (SOLV-WEB-07 y 08, SOLVENTAG5-55), sin otra llamada al BFF.
 */
@Component({
  selector: 'app-pagina-suscripcion',
  imports: [PasosContratacion, RouterLink, TarjetaResultado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .tarjeta {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      max-width: 860px;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 16px;
      font-weight: 600;
    }

    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;

      a {
        text-decoration: none;
      }
    }
  `,
  template: `
    <app-pasos-contratacion [actual]="2" />
    <section class="tarjeta" aria-labelledby="suscripcion-titulo" aria-live="polite">
      @switch (carga().tipo) {
        @case ('cargando') {
          <h2 id="suscripcion-titulo" i18n="@@suscripcion.cargando">Consultando la solicitud…</h2>
        }
        @case ('sin-solicitud') {
          <h2 id="suscripcion-titulo" i18n="@@suscripcion.sinSolicitud.titulo">
            No hay una solicitud abierta
          </h2>
          <p i18n="@@suscripcion.sinSolicitud.texto">
            Para continuar con la contratación, vuelve a la oferta y acéptala.
          </p>
        }
        @case ('no-encontrada') {
          <h2 id="suscripcion-titulo" i18n="@@suscripcion.noEncontrada">
            No encontramos esta solicitud de suscripción
          </h2>
        }
        @case ('error') {
          <h2 id="suscripcion-titulo" i18n="@@suscripcion.error">
            No pudimos consultar la solicitud
          </h2>
          <button
            type="button"
            class="boton-secundario"
            (click)="consultar()"
            i18n="@@suscripcion.reintentar"
          >
            Reintentar
          </button>
        }
      }
      @if (solicitudLista(); as solicitud) {
        <app-tarjeta-resultado [solicitud]="solicitud" [actor]="actor()" />
        @if (demorada()) {
          <p role="status" i18n="@@suscripcion.demorada">
            La evaluación está tardando más de lo normal. Consulta de nuevo en unos minutos.
          </p>
          <button
            type="button"
            class="boton-secundario"
            (click)="consultar()"
            i18n="@@suscripcion.consultarDeNuevo"
          >
            Consultar de nuevo
          </button>
        }
      }
      <!-- En revisión, la tarjeta lleva «Volver al tablero» (SOLV-WEB-08). -->
      @if (solicitudLista()?.estado !== 'EN_REVISION') {
        <div class="acciones">
          <a class="boton-primario" [routerLink]="rutaOferta()" i18n="@@suscripcion.volverOferta"
            >Volver a la oferta</a
          >
          <a class="boton-secundario" [routerLink]="'/' + actor()" i18n="@@suscripcion.irTablero"
            >Ir al tablero</a
          >
        </div>
      }
    </section>
  `,
})
export class PaginaSuscripcion implements OnInit {
  readonly cotizacionId = input.required<string>();
  readonly actor = input.required<Actor>();
  /** El `solicitudId` de la URL (`?solicitudId=`), que pone la oferta al aceptarla. */
  readonly solicitudId = input<string>();

  private readonly api = inject(SuscripcionApi);
  private consulta?: Subscription;
  private espera?: ReturnType<typeof setTimeout>;
  private consultas = 0;

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly demorada = signal(false);

  protected readonly rutaOferta = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}`,
  );

  protected readonly solicitudLista = computed(() => {
    const carga = this.carga();
    return carga.tipo === 'lista' ? carga.solicitud : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  ngOnInit(): void {
    if (!this.solicitudId()) {
      this.carga.set({ tipo: 'sin-solicitud' });
      return;
    }
    this.consultar();
  }

  /** Consulta la solicitud y, si aún no tiene decisión, programa la siguiente consulta. */
  protected consultar(): void {
    this.detener();
    this.consultas = 0;
    this.demorada.set(false);
    if (this.carga().tipo !== 'lista') {
      this.carga.set({ tipo: 'cargando' });
    }
    this.pedir();
  }

  private pedir(): void {
    this.consultas += 1;
    this.consulta = this.api.obtenerSolicitud(this.solicitudId() ?? '').subscribe({
      next: (solicitud) => {
        this.carga.set({ tipo: 'lista', solicitud });
        if (!SIN_DECISION.includes(solicitud.estado)) {
          return;
        }
        if (this.consultas >= MAXIMO_CONSULTAS) {
          this.demorada.set(true);
          return;
        }
        this.espera = setTimeout(() => this.pedir(), INTERVALO_CONSULTA_MS);
      },
      error: (error: HttpErrorResponse) =>
        this.carga.set({ tipo: error.status === 404 ? 'no-encontrada' : 'error' }),
    });
  }

  private detener(): void {
    this.consulta?.unsubscribe();
    if (this.espera !== undefined) {
      clearTimeout(this.espera);
      this.espera = undefined;
    }
  }
}
