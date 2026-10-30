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
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { fechaBogota, horaBogota, montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { SuscripcionApi } from '../suscripcion/suscripcion-api';
import { CotizacionApi } from './cotizacion-api';
import { Actor } from './formulario-cotizacion';
import { Cotizacion, DatosBienVidaHipotecario, ErrorApi } from './modelos';
import { EstadoNavegacionOferta, estadoNavegacion } from './navegacion-oferta';
import { PasosContratacion } from './pasos-contratacion';
import {
  CLASE_NIVEL,
  NombreSenal,
  ORDEN_SENALES,
  TramoSenal,
  lecturaSenal,
  nombreSenal,
  textoNivel,
  tramoDe,
} from './senales';

type Carga =
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' }
  | { tipo: 'lista'; cotizacion: Cotizacion };

export interface SenalVista {
  senal: NombreSenal;
  nombre: string;
  valor: number;
  tramo: TramoSenal;
  lectura: string;
}

/** Radio del anillo del score, como en el prototipo (SVG de 140 × 140). */
const RADIO_ANILLO = 56;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO_ANILLO;
const SCORE_MAXIMO = 850;

/**
 * Oferta personalizada (SOLVENTAG5-49, marco «Solventa / Cotizar / Oferta» del Figma). Muestra la
 * cotización registrada: prima y periodicidad, por qué recibió ese precio (score y señales del
 * perfil de riesgo), el resumen de la cobertura y hasta cuándo vale la oferta (CA1). Sirve a los
 * dos portales, como el formulario de cotización: textos en tercera persona para el asesor y en
 * segunda para el cliente (D8).
 *
 * Desde aquí se decide (CA2): continuar a la contratación, ajustar los datos o descartar la oferta.
 * Una oferta vencida lo dice y solo permite recotizar (CA3). Continuar acepta la oferta en el BFF
 * (`POST /v1/solicitudes-suscripcion`, SOLVENTAG5-237) y lleva al paso 2 con la solicitud creada;
 * ajustar y descartar no guardan nada.
 */
@Component({
  selector: 'app-pagina-oferta',
  imports: [PasosContratacion, RouterLink],
  templateUrl: './pagina-oferta.html',
  styleUrl: './pagina-oferta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginaOferta implements OnInit {
  /** El `cotizacionId` de la ruta (`withComponentInputBinding`). */
  readonly cotizacionId = input.required<string>();
  /** El `actor` de los datos de la ruta de cada portal. */
  readonly actor = input.required<Actor>();

  private readonly api = inject(CotizacionApi);
  private readonly suscripcion = inject(SuscripcionApi);
  private readonly router = inject(Router);
  /** El documento con que el asesor encontró al cliente, si la oferta se abrió desde el cotizador. */
  private readonly busqueda = estadoNavegacion(this.router).busqueda;
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private consulta?: Subscription;
  private aceptacion?: Subscription;

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  /** Mientras se acepta la oferta, el botón de continuar queda deshabilitado (sin doble envío). */
  protected readonly aceptando = signal(false);
  protected readonly errorAceptacion = signal(false);
  protected readonly circunferencia = CIRCUNFERENCIA;
  protected readonly radioAnillo = RADIO_ANILLO;

  /** La pantalla del formulario de cotización del portal del actor. */
  protected readonly rutaCotizar = computed(() => `/${this.actor()}/cotizar`);

  protected readonly oferta = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return null;
    }
    const cotizacion = carga.cotizacion;
    const plazo = cotizacion.datosBien.plazoAnios;
    return {
      prima: montoCop(cotizacion.prima, this.idioma),
      validaHasta: fechaBogota(cotizacion.vigenteHasta, this.idioma),
      sumaAsegurada: montoCop(cotizacion.datosBien.montoCredito, this.idioma),
      vigenciaPoliza: $localize`:@@cotizacion.panel.vigenciaAnios:${plazo}:plazo: años`,
      beneficiario: cotizacion.datosBien.entidadAcreedora,
      datosBien: cotizacion.datosBien,
      motivoSinPerfil: cotizacion.calculadaSinPerfil ? cotizacion.motivoSinPerfil : undefined,
      perfil: this.perfilDe(cotizacion),
      // El núcleo calcula el estado al consultar: VENCIDA desde vigenteHasta (CA3).
      vencida: cotizacion.estado === 'VENCIDA',
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.consulta?.unsubscribe();
      this.aceptacion?.unsubscribe();
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  /** Consulta la cotización en el BFF web. Un 404 es una oferta que no existe. */
  protected cargar(): void {
    this.consulta?.unsubscribe();
    this.carga.set({ tipo: 'cargando' });
    this.consulta = this.api.obtener(this.cotizacionId()).subscribe({
      next: (cotizacion) => this.carga.set({ tipo: 'lista', cotizacion }),
      error: (error: HttpErrorResponse) =>
        this.carga.set({ tipo: error.status === 404 ? 'no-encontrada' : 'error' }),
    });
  }

  /**
   * CA2: acepta la oferta y abre el paso 2, Suscripción, con la solicitud creada (201) o la que ya
   * existía (200, p. ej. un doble clic). 409 OFERTA_VENCIDA: la oferta se muestra vencida y solo
   * permite recotizar (CA3). 404: la oferta ya no existe.
   */
  protected continuar(): void {
    if (this.aceptando()) {
      return;
    }
    this.aceptando.set(true);
    this.errorAceptacion.set(false);
    this.aceptacion = this.suscripcion.aceptarOferta(this.cotizacionId()).subscribe({
      next: (solicitud) => {
        this.aceptando.set(false);
        const id = encodeURIComponent(solicitud.solicitudId);
        void this.router.navigateByUrl(
          `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}/suscripcion?solicitudId=${id}`,
        );
      },
      error: (error: HttpErrorResponse) => {
        this.aceptando.set(false);
        const codigo = (error.error as ErrorApi | null)?.codigo;
        const carga = this.carga();
        if (error.status === 409 && codigo === 'OFERTA_VENCIDA' && carga.tipo === 'lista') {
          this.carga.set({ tipo: 'lista', cotizacion: { ...carga.cotizacion, estado: 'VENCIDA' } });
        } else if (error.status === 404) {
          this.carga.set({ tipo: 'no-encontrada' });
        } else {
          this.errorAceptacion.set(true);
        }
      },
    });
  }

  /** CA2: descartar la oferta lleva al tablero, como en el prototipo. No se guarda nada. */
  protected descartar(): void {
    void this.router.navigateByUrl(`/${this.actor()}`);
  }

  /**
   * «Ajustar datos» y, con la oferta vencida, «Recotizar» (CA3): el cotizador se abre con los
   * datos de esta cotización y, para el asesor, vuelve a buscar al cliente.
   */
  protected recotizar(datosBien: DatosBienVidaHipotecario): void {
    const state: EstadoNavegacionOferta = {
      recotizar: {
        datosBien,
        ...(this.busqueda ? { busqueda: this.busqueda } : {}),
      },
    };
    void this.router.navigateByUrl(this.rutaCotizar(), { state });
  }

  private perfilDe(cotizacion: Cotizacion) {
    const perfil = cotizacion.perfil;
    if (cotizacion.calculadaSinPerfil || !perfil) {
      return null;
    }
    const senales: SenalVista[] = ORDEN_SENALES.map((senal) => {
      const valor = perfil.senales[senal];
      const tramo = tramoDe(valor);
      return {
        senal,
        nombre: nombreSenal(senal),
        valor,
        tramo,
        lectura: lecturaSenal(senal, tramo),
      };
    });
    const proporcion = Math.min(Math.max(perfil.score / SCORE_MAXIMO, 0), 1);
    const score = perfil.score;
    return {
      score,
      etiquetaAnillo: $localize`:@@oferta.anillo:Score ${score}:score: de 850`,
      nivel: textoNivel(perfil.nivel),
      claseNivel: CLASE_NIVEL[perfil.nivel],
      arco: `${proporcion * CIRCUNFERENCIA} ${CIRCUNFERENCIA}`,
      fecha: fechaBogota(perfil.calculadoEn, this.idioma),
      hora: horaBogota(perfil.calculadoEn, this.idioma),
      senales,
    };
  }
}
