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
import { CotizacionApi } from './cotizacion-api';
import { Actor } from './formulario-cotizacion';
import { Cotizacion } from './modelos';
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
 */
@Component({
  selector: 'app-pagina-oferta',
  imports: [RouterLink],
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
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private consulta?: Subscription;

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
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
      motivoSinPerfil: cotizacion.calculadaSinPerfil ? cotizacion.motivoSinPerfil : undefined,
      perfil: this.perfilDe(cotizacion),
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.consulta?.unsubscribe());
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
