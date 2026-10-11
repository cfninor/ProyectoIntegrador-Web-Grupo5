import { formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { AutorizacionDatosApi } from './autorizacion-datos-api';
import {
  CodigoDato,
  CodigoEntidad,
  EstadoSolicitud,
  FuenteDatos,
  SolicitudParaCliente,
  TipoDecision,
} from './modelos';
import {
  TEXTOS_BASE_LEGAL,
  TEXTOS_DATO,
  TEXTOS_DESTINATARIO,
  TEXTOS_ENTIDAD,
  TEXTOS_ESTADO_SOLICITUD,
  TEXTOS_FINALIDAD,
  TEXTOS_FUENTE,
  TEXTO_COMO_REVOCAR,
  TextoDato,
  texto,
  textoDuracion,
} from './textos';

/** Pantallas de la página. `resultado` cubre lo recién decidido y lo que ya estaba respondido. */
type Vista = 'cargando' | 'error-carga' | 'no-encontrada' | 'pendiente' | 'resultado';

interface Resultado {
  estado: EstadoSolicitud;
  /** true si ya estaba respondida al cargar o si otra respuesta llegó antes (409). */
  yaRespondida: boolean;
}

/** Bogotá: UTC−05:00, sin horario de verano. */
const ZONA_BOGOTA = '-0500';

/**
 * Formatos numéricos que no dependen de los datos de un idioma: se usan los de en-US, que
 * Angular trae siempre, y el resultado es el mismo dd/mm/aaaa y hh:mm en cualquier idioma.
 */
function fechaBogota(iso: string): string {
  return formatDate(iso, 'dd/MM/yyyy', 'en-US', ZONA_BOGOTA);
}

function horaBogota(iso: string): string {
  return formatDate(iso, 'HH:mm', 'en-US', ZONA_BOGOTA);
}

/** SOLV-WEB-20 «Autorizar consulta de datos»: el cliente autoriza o no la consulta (CA1, CA2). */
@Component({
  selector: 'app-pagina-autorizacion-datos',
  templateUrl: './pagina-autorizacion-datos.html',
  styleUrl: './pagina-autorizacion-datos.scss',
})
export class PaginaAutorizacionDatos implements OnInit {
  /** Llega desde la ruta autorizar/:solicitudId. */
  readonly solicitudId = input.required<string>();

  private readonly api = inject(AutorizacionDatosApi);
  private readonly injector = inject(Injector);
  private readonly tituloResultado = viewChild<ElementRef<HTMLElement>>('tituloResultado');

  protected readonly vista = signal<Vista>('cargando');
  protected readonly solicitud = signal<SolicitudParaCliente | null>(null);
  protected readonly resultado = signal<Resultado | null>(null);
  protected readonly aceptaPolitica = signal(false);
  protected readonly enviando = signal(false);
  protected readonly errorEnvio = signal(false);

  protected readonly origen = computed(() => {
    const solicitud = this.solicitud();
    return solicitud
      ? {
          asesor: solicitud.asesor.nombre,
          fecha: fechaBogota(solicitud.fechaSolicitud),
          hora: horaBogota(solicitud.fechaSolicitud),
        }
      : null;
  });

  protected readonly condiciones = computed(() => {
    const condiciones = this.solicitud()?.condiciones;
    return condiciones
      ? {
          duracion: textoDuracion(condiciones.duracionMeses),
          finalidad: texto(TEXTOS_FINALIDAD, condiciones.finalidad),
          destinatario: texto(TEXTOS_DESTINATARIO, condiciones.destinatario),
          baseLegal: condiciones.baseLegal.map((codigo) => texto(TEXTOS_BASE_LEGAL, codigo)),
        }
      : null;
  });

  protected readonly textoComoRevocar = TEXTO_COMO_REVOCAR;

  ngOnInit(): void {
    this.cargar();
  }

  protected textoFuente(fuente: FuenteDatos): string {
    return texto(TEXTOS_FUENTE, fuente);
  }

  protected textoDato(codigo: CodigoDato): TextoDato {
    return TEXTOS_DATO[codigo] ?? { nombre: codigo };
  }

  protected textoEntidad(entidad: CodigoEntidad): string {
    return texto(TEXTOS_ENTIDAD, entidad);
  }

  protected textoEstado(estado: EstadoSolicitud): string {
    return texto(TEXTOS_ESTADO_SOLICITUD, estado);
  }

  protected cargar(): void {
    this.vista.set('cargando');
    this.api.obtenerSolicitud(this.solicitudId()).subscribe({
      next: (solicitud) => {
        this.solicitud.set(solicitud);
        if (solicitud.estado === 'PENDIENTE') {
          this.vista.set('pendiente');
        } else {
          this.mostrarResultado({ estado: solicitud.estado, yaRespondida: true }, false);
        }
      },
      error: (error: HttpErrorResponse) => {
        // Un 422 al cargar es un enlace con un id mal formado: para el cliente es lo mismo
        // que un enlace que no existe.
        this.vista.set(
          error.status === 404 || error.status === 422 ? 'no-encontrada' : 'error-carga',
        );
      },
    });
  }

  protected alCambiarCasilla(evento: Event): void {
    this.aceptaPolitica.set((evento.target as HTMLInputElement).checked);
  }

  protected decidir(decision: TipoDecision): void {
    const solicitud = this.solicitud();
    if (!solicitud || this.enviando()) {
      return; // un solo envío, aunque se haga doble clic
    }
    this.enviando.set(true);
    this.errorEnvio.set(false);
    this.api
      .decidir(solicitud.solicitudId, {
        decision,
        aceptaPolitica: this.aceptaPolitica(),
        versionPolitica: solicitud.condiciones.versionPolitica,
      })
      .subscribe({
        next: (resultado) => {
          this.enviando.set(false);
          this.mostrarResultado({ estado: resultado.estado, yaRespondida: false }, true);
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 409) {
            this.mostrarYaRespondida();
          } else {
            this.enviando.set(false);
            this.errorEnvio.set(true);
          }
        },
      });
  }

  /** Otra respuesta llegó antes (409): se consulta el estado real para mostrarlo. */
  private mostrarYaRespondida(): void {
    this.api.obtenerSolicitud(this.solicitudId()).subscribe({
      next: (solicitud) => {
        this.enviando.set(false);
        this.solicitud.set(solicitud);
        if (solicitud.estado === 'PENDIENTE') {
          this.errorEnvio.set(true);
        } else {
          this.mostrarResultado({ estado: solicitud.estado, yaRespondida: true }, true);
        }
      },
      error: () => {
        this.enviando.set(false);
        this.errorEnvio.set(true);
      },
    });
  }

  private mostrarResultado(resultado: Resultado, enfocar: boolean): void {
    this.resultado.set(resultado);
    this.vista.set('resultado');
    if (enfocar) {
      afterNextRender(() => this.tituloResultado()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }
}
