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

import { fechaBogota, horaBogota } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { FirmaApi } from './firma-api';
import {
  CodigoFirmaNoHabilitada,
  ErrorFirma,
  FIRMA_EN_CURSO,
  FIRMA_REENVIABLE,
  EstadoFirma,
  Firma,
} from './modelos';

type Carga =
  | { tipo: 'consultando' }
  | { tipo: 'error' }
  | { tipo: 'sin-firma' }
  | { tipo: 'no-habilitada'; codigo: CodigoFirmaNoHabilitada }
  | { tipo: 'lista'; firma: Firma };

/** El resultado del último envío o reenvío, que se anuncia debajo de los botones. */
type Accion = 'inactiva' | 'enviando' | 'reenviando' | 'reenviada' | 'error' | 'no-reenviable';

/** Cada cuánto se vuelve a consultar una firma en curso (D14). */
export const INTERVALO_SEGUIMIENTO_MS = 5000;
/** Consultas antes de ofrecer «Actualizar seguimiento» (≈ 5 minutos). */
export const MAXIMO_SEGUIMIENTO = 60;

/** Los 409 de R1. El código del cuerpo puede faltar: `has` lo recibe tal cual. */
const NO_HABILITADA: ReadonlySet<string | undefined> = new Set<CodigoFirmaNoHabilitada>([
  'DOCUMENTO_EN_GENERACION',
  'PAGO_NO_APROBADO',
  'CLIENTE_SIN_CONTACTO',
]);

/** El chip de cada estado (D14): ámbar en curso, verde firmado, gris vencido. */
const CHIPS: Record<EstadoFirma, () => { clase: string; texto: string }> = {
  PENDIENTE_ENVIO: () => ({ clase: 'chip-ambar', texto: ESPERANDO() }),
  ENVIADA: () => ({ clase: 'chip-ambar', texto: ESPERANDO() }),
  ABIERTA: () => ({ clase: 'chip-ambar', texto: ESPERANDO() }),
  FIRMADA: () => ({
    clase: 'chip-verde',
    texto: $localize`:@@firma.electronica.chip.firmado:Firmado`,
  }),
  VENCIDA: () => ({
    clase: 'chip-gris',
    texto: $localize`:@@firma.electronica.chip.vencido:Vencido`,
  }),
};

function ESPERANDO(): string {
  return $localize`:@@firma.electronica.chip.esperando:Esperando firma`;
}

/** Un hito del seguimiento: hecho (con su hora), el siguiente (paso actual) o pendiente. */
interface Hito {
  texto: string;
  hora: string | null;
  actual: boolean;
}

function codigoDe(error: HttpErrorResponse): string | undefined {
  return (error.error as Partial<ErrorFirma> | null)?.codigo;
}

/**
 * La tarjeta de la firma electrónica de SOLV-WEB-10 (SOLVENTAG5-57, D14), debajo de la vista previa,
 * con el documento ya GENERADO.
 *
 * Al abrir consulta la firma (`obtenerFirma`). Sin firma (404) ofrece «Enviar enlace de firma»; un
 * 409 de R1 se muestra como estado, y PAGO_NO_APROBADO ofrece «Ir al pago». Con firma muestra el
 * seguimiento con la hora de cada hito, el chip del estado, «Reenviar enlace» en ENVIADA y ABIERTA
 * y el certificado en FIRMADA. Mientras la firma está en curso la consulta cada 5 segundos, sin
 * dejar una petición abierta, hasta 60 veces; luego ofrece «Actualizar seguimiento», como la página
 * de suscripción. Si una consulta falla, conserva el último estado y sigue consultando.
 */
@Component({
  selector: 'app-tarjeta-firma',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tarjeta-firma.scss',
  templateUrl: './tarjeta-firma.html',
})
export class TarjetaFirma implements OnInit {
  readonly polizaId = input.required<string>();
  readonly actor = input.required<Actor>();
  /** La hora del hito «Documento generado», de la póliza. */
  readonly generadoEn = input.required<string>();
  readonly huella = input<string>();
  /** La página de pago de la SOLVENTAG5-74, para «Ir al pago». */
  readonly rutaPago = input.required<string>();
  readonly solicitudId = input<string>();

  private readonly api = inject(FirmaApi);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private consulta?: Subscription;
  private accionEnCurso?: Subscription;
  private espera?: ReturnType<typeof setTimeout>;
  private consultas = 0;

  protected readonly carga = signal<Carga>({ tipo: 'consultando' });
  protected readonly accion = signal<Accion>('inactiva');
  protected readonly detenido = signal(false);
  /** Cuándo vence el enlace, en hora de Bogotá, de la última firma mostrada. */
  protected readonly vence = signal('');

  protected readonly firma = computed(() => {
    const carga = this.carga();
    return carga.tipo === 'lista' ? carga.firma : null;
  });

  protected readonly chip = computed(() => {
    const firma = this.firma();
    return firma ? CHIPS[firma.estado]() : null;
  });

  protected readonly reenviable = computed(() => {
    const firma = this.firma();
    return firma !== null && FIRMA_REENVIABLE.includes(firma.estado);
  });

  protected readonly enCurso = computed(() => {
    const firma = this.firma();
    return firma !== null && FIRMA_EN_CURSO.includes(firma.estado);
  });

  protected readonly certificado = computed(() => {
    const certificado = this.firma()?.certificado;
    return certificado
      ? { ...certificado, fechaHora: this.fechaHora(certificado.firmadaEn) }
      : null;
  });

  /**
   * Los hitos del seguimiento (CA4): documento generado, enviado, abierto y firmado, o vencido. Los
   * hechos llevan su hora. Con la firma en curso, el siguiente es el paso actual; una firma vencida
   * solo muestra lo que alcanzó a ocurrir.
   */
  protected readonly hitos = computed<Hito[]>(() => {
    const hitos: Hito[] = [
      {
        texto: $localize`:@@firma.hito.generado:Documento generado`,
        hora: this.fechaHora(this.generadoEn()),
        actual: false,
      },
    ];
    const firma = this.firma();
    if (!firma) {
      return hitos;
    }
    const siguientes: [string, string | undefined][] = [
      [$localize`:@@firma.electronica.hito.enviado:Enlace enviado`, firma.enviadaEn],
      [$localize`:@@firma.electronica.hito.abierto:Enlace abierto`, firma.abiertaEn],
    ];
    if (firma.estado === 'VENCIDA') {
      for (const [texto, hora] of siguientes) {
        if (hora) {
          hitos.push({ texto, hora: this.fechaHora(hora), actual: false });
        }
      }
      hitos.push({
        texto: $localize`:@@firma.electronica.hito.vencido:Enlace vencido`,
        hora: firma.vencidaEn ? this.fechaHora(firma.vencidaEn) : this.fechaHora(firma.venceEn),
        actual: false,
      });
      return hitos;
    }
    siguientes.push([
      $localize`:@@firma.electronica.hito.firmado:Documento firmado`,
      firma.firmadaEn,
    ]);
    // El paso actual es el primero que todavía no ocurre.
    const actual = siguientes.findIndex(([, hora]) => !hora);
    siguientes.forEach(([texto, hora], i) =>
      hitos.push({ texto, hora: hora ? this.fechaHora(hora) : null, actual: i === actual }),
    );
    return hitos;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.detener();
      this.accionEnCurso?.unsubscribe();
    });
  }

  ngOnInit(): void {
    this.actualizar();
  }

  /** Consulta la firma ya, con otra tanda de consultas («Actualizar seguimiento», «Reintentar»). */
  protected actualizar(): void {
    this.detener();
    this.consultas = 0;
    this.detenido.set(false);
    if (this.carga().tipo === 'error') {
      this.carga.set({ tipo: 'consultando' });
    }
    this.consultar();
  }

  /** «Enviar enlace de firma»: pide la firma (R1) y empieza el seguimiento. */
  protected enviar(): void {
    if (this.accion() === 'enviando') {
      return;
    }
    this.accion.set('enviando');
    this.accionEnCurso?.unsubscribe();
    this.accionEnCurso = this.api.enviar(this.polizaId()).subscribe({
      next: (firma) => {
        this.accion.set('inactiva');
        this.mostrar(firma, true);
      },
      error: (error: HttpErrorResponse) => {
        const codigo = codigoDe(error);
        if (error.status === 409 && NO_HABILITADA.has(codigo)) {
          this.accion.set('inactiva');
          this.carga.set({ tipo: 'no-habilitada', codigo: codigo as CodigoFirmaNoHabilitada });
        } else {
          this.accion.set('error');
        }
      },
    });
  }

  /** «Reenviar enlace» (R3): código nuevo, mismo enlace y mismo vencimiento. */
  protected reenviar(): void {
    if (this.accion() === 'reenviando') {
      return;
    }
    this.accion.set('reenviando');
    this.accionEnCurso?.unsubscribe();
    this.accionEnCurso = this.api.reenviar(this.polizaId()).subscribe({
      next: (firma) => {
        this.accion.set('reenviada');
        this.mostrar(firma, true);
      },
      error: (error: HttpErrorResponse) => {
        if (error.status === 409) {
          // El estado cambió (firmada o vencida): se consulta para mostrarlo.
          this.accion.set('no-reenviable');
          this.actualizar();
        } else {
          this.accion.set('error');
        }
      },
    });
  }

  private consultar(): void {
    this.consultas += 1;
    this.consulta = this.api.obtener(this.polizaId()).subscribe({
      next: (firma) => this.mostrar(firma, false),
      error: (error: HttpErrorResponse) => {
        const carga = this.carga();
        if (carga.tipo === 'lista') {
          // Degradación elegante: se conserva el último estado y se sigue consultando.
          this.programar();
        } else if (error.status === 404) {
          this.carga.set({ tipo: 'sin-firma' });
        } else {
          this.carga.set({ tipo: 'error' });
        }
      },
    });
  }

  private mostrar(firma: Firma, nuevaTanda: boolean): void {
    this.carga.set({ tipo: 'lista', firma });
    this.vence.set(this.fechaHora(firma.venceEn));
    if (nuevaTanda) {
      this.detener();
      this.consultas = 0;
      this.detenido.set(false);
    }
    if (FIRMA_EN_CURSO.includes(firma.estado)) {
      this.programar();
    }
  }

  private programar(): void {
    if (this.consultas >= MAXIMO_SEGUIMIENTO) {
      this.detenido.set(true);
      return;
    }
    this.espera = setTimeout(() => this.consultar(), INTERVALO_SEGUIMIENTO_MS);
  }

  private detener(): void {
    this.consulta?.unsubscribe();
    if (this.espera !== undefined) {
      clearTimeout(this.espera);
      this.espera = undefined;
    }
  }

  private fechaHora(iso: string): string {
    const fecha = fechaBogota(iso, this.idioma);
    const hora = horaBogota(iso, this.idioma);
    return $localize`:@@suscripcion.fechaHora:${fecha}:fecha: a las ${hora}:hora:`;
  }
}
