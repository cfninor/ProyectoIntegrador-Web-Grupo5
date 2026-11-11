import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  LOCALE_ID,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { fechaBogota, fechaCalendario, horaBogota, montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { PasosContratacion } from '../cotizacion/pasos-contratacion';
import { entregarPdf } from './descarga-pdf';
import { Poliza } from './modelos';
import { PolizaApi } from './poliza-api';

type Carga =
  | { tipo: 'sin-solicitud' }
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' }
  /** La solicitud todavía no tiene una póliza VIGENTE: se vuelve a la firma (D12). */
  | { tipo: 'no-vigente' }
  | { tipo: 'emitida'; poliza: Poliza };

type Descarga = 'inactiva' | 'descargando' | 'error';

/**
 * SOLV-WEB-11, la confirmación de la emisión (SOLVENTAG5-58, D12), para el asesor y el cliente. Se
 * abre por su ruta con el `solicitudId` de la URL, como SOLV-WEB-10: «Emitir póliza» de la tarjeta
 * de firma lleva aquí.
 *
 * Al abrir pide la póliza de la solicitud (`generarPolizaParaFirma`, que devuelve la misma si ya
 * existe). Si todavía no está VIGENTE, un estado que lleva a la firma. Emitida, muestra el indicador
 * de pasos completo, el ícono verde y el mensaje en la voz del actor (tercera persona para el asesor
 * y segunda para el cliente), el número de póliza, el tomador con el documento enmascarado, la fecha
 * de inicio y el próximo cobro, y los documentos que recibió el cliente: el certificado de firma y el
 * comprobante de pago. «Ver póliza» entrega el PDF firmado (`descargarDocumentoPoliza`, como la
 * descarga de SOLV-WEB-10). Al cargar, el foco va al título (WCAG 2.1 AA).
 */
@Component({
  selector: 'app-pagina-emision',
  imports: [PasosContratacion, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-emision.scss',
  templateUrl: './pagina-emision.html',
})
export class PaginaEmision implements OnInit {
  readonly cotizacionId = input.required<string>();
  readonly actor = input.required<Actor>();
  /** El `solicitudId` de la URL (`?solicitudId=`). */
  readonly solicitudId = input<string>();

  private readonly api = inject(PolizaApi);
  private readonly documento = inject(DOCUMENT);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private peticion?: Subscription;
  private descargaEnCurso?: Subscription;
  /** El `solicitudId` de la URL, tomado al abrir la página. */
  private idSolicitud = '';

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly descarga = signal<Descarga>('inactiva');

  /** Texto alternativo del ícono de verificación. */
  protected readonly textoIcono = $localize`:@@emision.icono:Póliza emitida`;

  protected readonly rutaFirma = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}/firma`,
  );
  protected readonly rutaCotizar = computed(() => `/${this.actor()}/cotizar`);
  protected readonly rutaTablero = computed(() => `/${this.actor()}`);

  /** Lo que muestra la confirmación, ya formateado en el idioma (D12). */
  protected readonly vista = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'emitida') {
      return null;
    }
    const p = carga.poliza;
    const { nombres, apellidos, documentoEnmascarado } = p.tomador;
    const proximo = p.proximoCobro;
    const certificado = p.documentos?.certificadoFirma;
    const comprobante = p.documentos?.comprobantePago;
    return {
      p,
      numero: p.numeroPoliza ?? p.polizaId,
      tomador: `${nombres} ${apellidos}`,
      documentoEnmascarado,
      inicio: fechaCalendario(p.vigenciaDesde, this.idioma),
      proximo: proximo ? this.proximoCobro(proximo.fecha, proximo.valor) : null,
      certificado: certificado
        ? { fechaHora: this.fechaHora(certificado.firmadaEn), huella: certificado.huella }
        : null,
      comprobante: comprobante
        ? {
            tarjeta: `${comprobante.marca} •••• ${comprobante.ultimos4}`,
            valor: montoCop(comprobante.monto, this.idioma),
            fechaHora: this.fechaHora(comprobante.aprobadoEn),
          }
        : null,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.peticion?.unsubscribe();
      this.descargaEnCurso?.unsubscribe();
    });
  }

  ngOnInit(): void {
    const solicitudId = this.solicitudId();
    if (!solicitudId) {
      this.mostrar({ tipo: 'sin-solicitud' });
      return;
    }
    this.idSolicitud = solicitudId;
    this.cargar();
  }

  /** Pide la póliza de la solicitud; emitida, la confirmación; si no, el estado que corresponde. */
  protected cargar(): void {
    this.peticion?.unsubscribe();
    this.carga.set({ tipo: 'cargando' });
    this.peticion = this.api.generar(this.idSolicitud).subscribe({
      next: (poliza) =>
        this.mostrar(
          poliza.estado === 'VIGENTE' ? { tipo: 'emitida', poliza } : { tipo: 'no-vigente' },
        ),
      error: (error: HttpErrorResponse) => {
        if (error.status === 404) {
          this.mostrar({ tipo: 'no-encontrada' });
        } else if (error.status === 409) {
          // La solicitud no genera póliza (SOLVENTAG5-56, R2): tampoco hay una emitida.
          this.mostrar({ tipo: 'no-vigente' });
        } else {
          this.mostrar({ tipo: 'error' });
        }
      },
    });
  }

  /** «Ver póliza»: el PDF firmado, con el token de la sesión (D12). */
  protected verPoliza(): void {
    const vista = this.vista();
    if (!vista || this.descarga() === 'descargando') {
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

  /** Muestra el estado y lleva el foco a su título. */
  private mostrar(carga: Carga): void {
    this.carga.set(carga);
    afterNextRender(
      () => this.elemento.nativeElement.querySelector<HTMLElement>('#emision-titulo')?.focus(),
      { injector: this.injector },
    );
  }

  private proximoCobro(fecha: string, valor: number): string {
    const dia = fechaCalendario(fecha, this.idioma);
    const monto = montoCop(valor, this.idioma);
    return $localize`:@@emision.proximoCobro.valor:${dia}:fecha: por ${monto}:valor:`;
  }

  private fechaHora(iso: string): string {
    const fecha = fechaBogota(iso, this.idioma);
    const hora = horaBogota(iso, this.idioma);
    return $localize`:@@suscripcion.fechaHora:${fecha}:fecha: a las ${hora}:hora:`;
  }
}
