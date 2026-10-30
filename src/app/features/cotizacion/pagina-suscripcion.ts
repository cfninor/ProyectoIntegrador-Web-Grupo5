import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { fechaBogota, horaBogota, montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { ResultadoSuscripcion, SIN_DECISION, SolicitudSuscripcion } from '../suscripcion/modelos';
import { SuscripcionApi } from '../suscripcion/suscripcion-api';
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

type Fase = 'evaluando' | 'evaluada' | ResultadoSuscripcion;

/** El chip de cada decisión: verde continúa, rojo no, ámbar espera a un suscriptor. */
const CHIPS: Record<ResultadoSuscripcion, { clase: string; texto: string }> = {
  ACEPTADA: { clase: 'chip-verde', texto: $localize`:@@suscripcion.chip.aceptada:Aceptada` },
  AJUSTADA: {
    clase: 'chip-verde-azulado',
    texto: $localize`:@@suscripcion.chip.ajustada:Aceptada con ajuste`,
  },
  RECHAZADA: { clase: 'chip-rojo', texto: $localize`:@@suscripcion.chip.rechazada:Rechazada` },
  EN_REVISION: {
    clase: 'chip-ambar',
    texto: $localize`:@@suscripcion.chip.enRevision:Pendiente de revisión`,
  },
};

function faseDe(estado: SolicitudSuscripcion['estado']): Fase {
  if (estado === 'PENDIENTE_EVALUACION') {
    return 'evaluando';
  }
  return estado === 'EVALUADA' ? 'evaluada' : estado;
}

/**
 * Paso 2 de la contratación, Suscripción (SOLVENTAG5-237). La oferta se aceptó en la pantalla
 * anterior, que trae aquí el `solicitudId` en la URL. La evaluación con las reglas de suscripción
 * corre en el núcleo después de aceptar (SOLVENTAG5-50, ADR 0007), y con ella la decisión
 * automática (SOLVENTAG5-51, BA-12: asíncrona). Mientras la solicitud está en PENDIENTE_EVALUACION
 * o EVALUADA la pantalla la consulta cada pocos segundos con
 * `GET /v1/solicitudes-suscripcion/{solicitudId}`, sin dejar una petición abierta (R8), y al
 * llegar muestra la decisión. «Pendiente de revisión» es un estado, no un error. La tarjeta completa
 * del resultado (SOLV-WEB-07 y 08) es de la SOLVENTAG5-55.
 */
@Component({
  selector: 'app-pagina-suscripcion',
  imports: [PasosContratacion, RouterLink],
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
      max-width: 720px;
    }

    h2,
    p,
    dl,
    dd {
      margin: 0;
    }

    h2 {
      font-size: 16px;
      font-weight: 600;
    }

    .resumen {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;

      dt {
        color: var(--texto-secundario, #5b6472);
      }
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
      @if (vista(); as v) {
        @switch (v.fase) {
          @case ('evaluando') {
            @if (actor() === 'asesor') {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.evaluando.titulo.asesor">
                Evaluando la solicitud del cliente
              </h2>
              <p i18n="@@suscripcion.evaluando.texto.asesor">
                Se aplican las reglas de suscripción con el perfil de riesgo con que se cotizó. Toma
                unos segundos.
              </p>
            } @else {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.evaluando.titulo.cliente">
                Estamos evaluando tu solicitud
              </h2>
              <p i18n="@@suscripcion.evaluando.texto.cliente">
                Aplicamos las reglas de suscripción con el perfil de riesgo con que cotizaste. Toma
                unos segundos.
              </p>
            }
          }
          @case ('evaluada') {
            @if (actor() === 'asesor') {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.evaluada.titulo.asesor">
                Solicitud evaluada
              </h2>
              <p i18n="@@suscripcion.evaluada.texto.asesor">
                La solicitud se evaluó con las reglas de suscripción y espera la decisión.
              </p>
            } @else {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.evaluada.titulo.cliente">
                Evaluamos tu solicitud
              </h2>
              <p i18n="@@suscripcion.evaluada.texto.cliente">
                Revisamos tu solicitud con las reglas de suscripción. Pronto verás aquí la decisión.
              </p>
            }
          }
          @case ('ACEPTADA') {
            @if (actor() === 'asesor') {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.aceptada.titulo.asesor">
                Solicitud aceptada
              </h2>
              <p i18n="@@suscripcion.aceptada.texto.asesor">
                Se aceptó con la prima cotizada y continúa a cobro y emisión.
              </p>
            } @else {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.aceptada.titulo.cliente">
                Aprobamos tu solicitud
              </h2>
              <p i18n="@@suscripcion.aceptada.texto.cliente">
                Tu seguro se puede emitir con la prima que cotizaste. El siguiente paso es el pago.
              </p>
            }
          }
          @case ('AJUSTADA') {
            @if (actor() === 'asesor') {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.ajustada.titulo.asesor">
                Solicitud aceptada con ajuste
              </h2>
              <p i18n="@@suscripcion.ajustada.texto.asesor">
                Se aceptó con condiciones distintas a las cotizadas y continúa a cobro y emisión.
              </p>
            } @else {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.ajustada.titulo.cliente">
                Aprobamos tu solicitud con ajustes
              </h2>
              <p i18n="@@suscripcion.ajustada.texto.cliente">
                Tu seguro se puede emitir con condiciones distintas a las que cotizaste. Revisa el
                detalle antes de pagar.
              </p>
            }
          }
          @case ('RECHAZADA') {
            @if (actor() === 'asesor') {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.rechazada.titulo.asesor">
                Solicitud rechazada
              </h2>
              <p i18n="@@suscripcion.rechazada.texto.asesor">
                No cumple las reglas de suscripción del ramo y no continúa a emisión.
              </p>
            } @else {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.rechazada.titulo.cliente">
                No pudimos aprobar tu solicitud
              </h2>
              <p i18n="@@suscripcion.rechazada.texto.cliente">
                Tu solicitud no cumple las condiciones de suscripción de este seguro, así que no
                podemos emitirlo.
              </p>
            }
          }
          @case ('EN_REVISION') {
            @if (actor() === 'asesor') {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.enRevision.titulo.asesor">
                Solicitud pendiente de revisión
              </h2>
              <p i18n="@@suscripcion.enRevision.texto.asesor">
                Las reglas automáticas no alcanzan para decidirla: la revisa un suscriptor. No
                avanza a cobro mientras no tenga decisión.
              </p>
            } @else {
              <h2 id="suscripcion-titulo" i18n="@@suscripcion.enRevision.titulo.cliente">
                Tu solicitud está en revisión
              </h2>
              <p i18n="@@suscripcion.enRevision.texto.cliente">
                Un suscriptor revisará tu solicitud. Cuando tenga una decisión la verás aquí.
              </p>
            }
          }
        }
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
        <dl
          class="resumen"
          i18n-aria-label="@@suscripcion.resumen"
          aria-label="Resumen de la solicitud"
        >
          <dt i18n="@@suscripcion.numero">Número de solicitud</dt>
          <dd>{{ v.solicitudId }}</dd>
          @if (v.chip; as chip) {
            <dt i18n="@@suscripcion.decision">Decisión</dt>
            <dd>
              <span class="chip {{ chip.clase }}">{{ chip.texto }}</span>
            </dd>
          }
          <dt i18n="@@suscripcion.prima">Prima mensual</dt>
          <dd>{{ v.prima }}</dd>
          <dt i18n="@@suscripcion.aceptadaEl">Aceptada el</dt>
          <dd>{{ v.aceptadaEl }}</dd>
        </dl>
      }
      <div class="acciones">
        <a class="boton-primario" [routerLink]="rutaOferta()" i18n="@@suscripcion.volverOferta"
          >Volver a la oferta</a
        >
        <a class="boton-secundario" [routerLink]="'/' + actor()" i18n="@@suscripcion.irTablero"
          >Ir al tablero</a
        >
      </div>
    </section>
  `,
})
export class PaginaSuscripcion implements OnInit {
  readonly cotizacionId = input.required<string>();
  readonly actor = input.required<Actor>();
  /** El `solicitudId` de la URL (`?solicitudId=`), que pone la oferta al aceptarla. */
  readonly solicitudId = input<string>();

  private readonly api = inject(SuscripcionApi);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private consulta?: Subscription;
  private espera?: ReturnType<typeof setTimeout>;
  private consultas = 0;

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly demorada = signal(false);

  protected readonly rutaOferta = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}`,
  );

  protected readonly vista = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return null;
    }
    const s = carga.solicitud;
    const fase = faseDe(s.estado);
    const fecha = fechaBogota(s.aceptadaEn, this.idioma);
    const hora = horaBogota(s.aceptadaEn, this.idioma);
    return {
      solicitudId: s.solicitudId,
      prima: montoCop(s.prima, this.idioma),
      aceptadaEl: $localize`:@@suscripcion.fechaHora:${fecha}:fecha: a las ${hora}:hora:`,
      fase,
      chip: fase === 'evaluando' || fase === 'evaluada' ? null : CHIPS[fase],
    };
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
