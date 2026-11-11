import { DOCUMENT } from '@angular/common';
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

import { Actor } from '../cotizacion/formulario-cotizacion';
import { PasosContratacion } from '../cotizacion/pasos-contratacion';
import { entregarPdf } from './descarga-pdf';
import { ErrorPoliza, MotivoNoEmitible, Poliza } from './modelos';
import { PolizaApi } from './poliza-api';
import { TarjetaFirma } from './tarjeta-firma';
import { VistaPreviaPoliza } from './vista-previa-poliza';

/** Por qué no hay póliza: los motivos de SOLICITUD_NO_EMITIBLE y SOLICITUD_SIN_CLIENTE. */
export type MotivoSinPoliza = MotivoNoEmitible | 'SIN_CLIENTE';

type Carga =
  | { tipo: 'sin-solicitud' }
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' }
  | { tipo: 'no-emitible'; motivo: MotivoSinPoliza }
  | { tipo: 'lista'; poliza: Poliza };

type Descarga = 'inactiva' | 'descargando' | 'error';

/** Cada cuánto se vuelve a consultar una póliza con el documento en GENERANDO (D4). */
export const INTERVALO_CONSULTA_MS = 1000;
/** Consultas antes de decir que el documento sigue generándose (≈ 30 s). */
export const MAXIMO_CONSULTAS = 30;

/** El chip de cada motivo: rojo si no continúa (rechazada), ámbar si espera algo (sección 4). */
const CHIPS_MOTIVO: Record<MotivoSinPoliza, () => { clase: string; texto: string }> = {
  PRIMA_AJUSTADA_SIN_ACEPTAR: () => ({
    clase: 'chip-ambar',
    texto: $localize`:@@firma.chip.primaSinAceptar:Nueva prima sin aceptar`,
  }),
  EN_REVISION: () => ({
    clase: 'chip-ambar',
    texto: $localize`:@@suscripcion.chip.enRevision:Pendiente de revisión`,
  }),
  SIN_DECISION: () => ({
    clase: 'chip-ambar',
    texto: $localize`:@@firma.chip.sinDecision:Sin decisión`,
  }),
  SIN_CLIENTE: () => ({
    clase: 'chip-ambar',
    texto: $localize`:@@firma.chip.sinCliente:Sin cliente`,
  }),
  RECHAZADA: () => ({
    clase: 'chip-rojo',
    texto: $localize`:@@suscripcion.chip.rechazada:Rechazada`,
  }),
};

/** El motivo del 409 de `generarPolizaParaFirma` (R2, D15), o null si no es uno de ellos. */
function motivoDe(error: HttpErrorResponse): MotivoSinPoliza | null {
  if (error.status !== 409) {
    return null;
  }
  const cuerpo = error.error as Partial<ErrorPoliza> | null;
  if (cuerpo?.codigo === 'SOLICITUD_SIN_CLIENTE') {
    return 'SIN_CLIENTE';
  }
  return cuerpo?.codigo === 'SOLICITUD_NO_EMITIBLE' && cuerpo.motivo ? cuerpo.motivo : null;
}

/**
 * SOLV-WEB-10, la póliza para firma (SOLVENTAG5-56), paso 4 de la contratación, para el asesor y
 * el cliente. Se abre por su ruta con el `solicitudId` de la URL (D17): «Continuar a la firma» del
 * pago (SOLVENTAG5-74) lleva aquí.
 *
 * Al abrir pide la póliza (`generarPolizaParaFirma`, que devuelve la misma si ya existe) y, mientras
 * el documento está en GENERANDO, la consulta cada segundo con `obtenerPoliza`, sin dejar una
 * petición abierta (D4). Después de 30 consultas dice que el documento sigue generándose, como
 * estado. Si una consulta falla se conserva lo último que se vio. Un 409 de R2 se muestra con su
 * motivo, como estado y no como error genérico.
 *
 * Con el documento GENERADO, debajo de la vista previa va la tarjeta de la firma electrónica
 * (`TarjetaFirma`, SOLVENTAG5-57, D14): enviar el enlace, el seguimiento y el certificado. Con la
 * firma FIRMADA, la tarjeta emite la póliza o lleva a su confirmación (SOLVENTAG5-58, D12).
 */
@Component({
  selector: 'app-pagina-firma',
  imports: [PasosContratacion, RouterLink, TarjetaFirma, VistaPreviaPoliza],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-firma.scss',
  templateUrl: './pagina-firma.html',
})
export class PaginaFirma implements OnInit {
  readonly cotizacionId = input.required<string>();
  readonly actor = input.required<Actor>();
  /** El `solicitudId` de la URL (`?solicitudId=`). */
  readonly solicitudId = input<string>();

  private readonly api = inject(PolizaApi);
  private readonly documento = inject(DOCUMENT);
  private peticion?: Subscription;
  private descargaEnCurso?: Subscription;
  private espera?: ReturnType<typeof setTimeout>;
  private consultas = 0;
  /** El `solicitudId` de la URL, tomado al abrir la página. */
  private idSolicitud = '';

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly demorada = signal(false);
  protected readonly descarga = signal<Descarga>('inactiva');

  protected readonly rutaSuscripcion = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}/suscripcion`,
  );
  protected readonly rutaTablero = computed(() => `/${this.actor()}`);

  protected readonly motivo = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'no-emitible') {
      return null;
    }
    return { motivo: carga.motivo, chip: CHIPS_MOTIVO[carga.motivo]() };
  });

  /** SOLV-WEB-11 (SOLVENTAG5-58): la confirmación de la emisión, desde la tarjeta de firma. */
  protected readonly rutaEmision = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}/emision`,
  );

  /** La página de pago de la SOLVENTAG5-74: «Ir al pago» de la firma sin pago aprobado (D14). */
  protected readonly rutaPago = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}/pago`,
  );

  /** La póliza mostrada; la vista previa y la tarjeta de firma la formatean (D14). */
  protected readonly vista = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return null;
    }
    const p = carga.poliza;
    const generado = p.documento.estado === 'GENERADO';
    return {
      p,
      generado,
      chip: generado
        ? $localize`:@@firma.chip.generado:Generado`
        : $localize`:@@firma.chip.generando:Generando`,
      /** La tarjeta de firma aparece con el documento GENERADO (D14). */
      generadoEn: generado ? p.documento.generadoEn : undefined,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.detener();
      this.descargaEnCurso?.unsubscribe();
    });
  }

  ngOnInit(): void {
    const solicitudId = this.solicitudId();
    if (!solicitudId) {
      this.carga.set({ tipo: 'sin-solicitud' });
      return;
    }
    this.idSolicitud = solicitudId;
    this.generar();
  }

  /** Pide la póliza; si el documento se está generando, empieza a consultarla. */
  protected generar(): void {
    this.detener();
    this.carga.set({ tipo: 'cargando' });
    this.peticion = this.api.generar(this.idSolicitud).subscribe({
      next: (poliza) => this.mostrar(poliza, true),
      error: (error: HttpErrorResponse) => {
        const motivo = motivoDe(error);
        if (motivo) {
          this.carga.set({ tipo: 'no-emitible', motivo });
        } else {
          this.carga.set({ tipo: error.status === 404 ? 'no-encontrada' : 'error' });
        }
      },
    });
  }

  /** «Volver a consultar» después de las 30 consultas: otra tanda, empezando ya. */
  protected volverAConsultar(polizaId: string): void {
    this.detener();
    this.consultar(polizaId, true);
  }

  /** Descarga el PDF con el token de la sesión y libera el blob después (CA4). */
  protected descargar(): void {
    const vista = this.vista();
    if (!vista?.generado) {
      return;
    }
    const polizaId = vista.p.polizaId;
    this.descarga.set('descargando');
    this.descargaEnCurso?.unsubscribe();
    this.descargaEnCurso = this.api.descargarDocumento(polizaId).subscribe({
      next: (pdf) => {
        entregarPdf(this.documento, pdf, polizaId);
        this.descarga.set('inactiva');
      },
      error: () => this.descarga.set('error'),
    });
  }

  private mostrar(poliza: Poliza, nuevaTanda: boolean): void {
    this.carga.set({ tipo: 'lista', poliza });
    if (poliza.documento.estado === 'GENERANDO') {
      this.programar(poliza.polizaId, nuevaTanda);
    }
  }

  private programar(polizaId: string, nuevaTanda = false): void {
    if (nuevaTanda) {
      this.nuevaTanda();
    }
    if (this.consultas >= MAXIMO_CONSULTAS) {
      this.demorada.set(true);
      return;
    }
    this.espera = setTimeout(() => this.consultar(polizaId), INTERVALO_CONSULTA_MS);
  }

  private consultar(polizaId: string, nuevaTanda = false): void {
    if (nuevaTanda) {
      this.nuevaTanda();
    }
    this.consultas += 1;
    this.peticion = this.api.obtener(polizaId).subscribe({
      next: (poliza) => this.mostrar(poliza, false),
      // Degradación elegante: se conserva el último estado conocido y se sigue consultando.
      error: () => this.programar(polizaId),
    });
  }

  private nuevaTanda(): void {
    this.consultas = 0;
    this.demorada.set(false);
  }

  private detener(): void {
    this.peticion?.unsubscribe();
    if (this.espera !== undefined) {
      clearTimeout(this.espera);
      this.espera = undefined;
    }
  }
}
