import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  LOCALE_ID,
  OnInit,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { fechaBogota, horaBogota } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { FirmaApi } from '../poliza/firma-api';
import {
  CertificadoFirma,
  CodigoFirmaRechazada,
  DocumentoParaFirmar,
  ErrorFirma,
} from '../poliza/modelos';
import { VistaPreviaPoliza } from '../poliza/vista-previa-poliza';

type Vista = 'cargando' | 'error-carga' | 'no-encontrada' | 'documento' | 'resultado';

/** Cómo terminó la firma: firmada, o un motivo por el que ya no se puede firmar con este código. */
type Resultado =
  | { tipo: 'firmada' }
  | { tipo: 'ya-firmada' }
  | { tipo: 'codigo-vencido' }
  | { tipo: 'enlace-vencido' }
  | { tipo: 'documento-alterado' };

/** Lo que se dice junto al campo del código, sin salir del formulario. */
type ErrorCodigo =
  { tipo: 'formato' } | { tipo: 'invalido'; intentosRestantes: number } | { tipo: 'no-disponible' };

/** El código: 6 dígitos, puede empezar por cero (`CodigoFirma` del contrato). */
const PATRON_CODIGO = /^[0-9]{6}$/;

/** Los 409 de R5 que terminan la página, con su resultado. CODIGO_INVALIDO se queda en el formulario. */
const RESULTADOS: Record<Exclude<CodigoFirmaRechazada, 'CODIGO_INVALIDO'>, Resultado> = {
  ENLACE_VENCIDO: { tipo: 'enlace-vencido' },
  CODIGO_USADO: { tipo: 'ya-firmada' },
  CODIGO_VENCIDO: { tipo: 'codigo-vencido' },
  DOCUMENTO_ALTERADO: { tipo: 'documento-alterado' },
};

/**
 * La página pública para firmar la póliza (SOLVENTAG5-57, D14), en el layout público como
 * `autorizar/:solicitudId`. El cliente llega sin sesión por el enlace que recibió por correo y por
 * SMS (`PORTAL_WEB_URL/firmar/{firmaId}`).
 *
 * Al abrir pide el documento (`abrirFirma`, que marca el hito «abierto»): la vista previa de la
 * SOLVENTAG5-56, la huella y cuándo vence el enlace. Con el código de 6 dígitos firma
 * (`firmarConCodigo`). Cada resultado es un estado y no un error genérico: firmada con su
 * certificado, código errado con los intentos que quedan, código vencido o ya usado, enlace vencido,
 * documento alterado, enlace que no existe y servicio no disponible con «Intentar de nuevo».
 */
@Component({
  selector: 'app-pagina-firmar',
  imports: [VistaPreviaPoliza],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagina-firmar.html',
  styleUrl: './pagina-firmar.scss',
})
export class PaginaFirmar implements OnInit {
  /** Llega desde la ruta firmar/:firmaId. */
  readonly firmaId = input.required<string>();

  private readonly api = inject(FirmaApi);
  private readonly injector = inject(Injector);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private readonly tituloResultado = viewChild<ElementRef<HTMLElement>>('tituloResultado');

  protected readonly vista = signal<Vista>('cargando');
  protected readonly documento = signal<DocumentoParaFirmar | null>(null);
  protected readonly resultado = signal<Resultado | null>(null);
  protected readonly codigo = signal('');
  protected readonly errorCodigo = signal<ErrorCodigo | null>(null);
  protected readonly firmando = signal(false);
  /** Cuándo vence el enlace, en hora de Bogotá; se fija al abrir el documento. */
  protected readonly vence = signal('');

  /** El certificado de la firma recién hecha, con su fecha y hora en hora de Bogotá (CA3). */
  protected readonly certificado = signal<(CertificadoFirma & { fechaHora: string }) | null>(null);

  ngOnInit(): void {
    this.cargar();
  }

  protected cargar(): void {
    this.vista.set('cargando');
    this.api.abrir(this.firmaId()).subscribe({
      next: (documento) => {
        this.documento.set(documento);
        this.vence.set(this.fechaHora(documento.venceEn));
        if (documento.estado === 'VENCIDA') {
          this.terminar({ tipo: 'enlace-vencido' }, false);
        } else if (documento.estado === 'FIRMADA') {
          this.terminar({ tipo: 'ya-firmada' }, false);
        } else {
          this.vista.set('documento');
        }
      },
      // Un 422 es un enlace con un id mal formado: para el cliente es lo mismo que uno que no existe.
      error: (error: HttpErrorResponse) =>
        this.vista.set(
          error.status === 404 || error.status === 422 ? 'no-encontrada' : 'error-carga',
        ),
    });
  }

  protected alEscribir(evento: Event): void {
    this.codigo.set((evento.target as HTMLInputElement).value.trim());
    if (this.errorCodigo()?.tipo === 'formato') {
      this.errorCodigo.set(null);
    }
  }

  /** «Firmar» e «Intentar de nuevo»: un solo envío a la vez, aunque se haga doble clic. */
  protected firmar(evento?: Event): void {
    evento?.preventDefault();
    if (this.firmando()) {
      return;
    }
    const codigo = this.codigo();
    if (!PATRON_CODIGO.test(codigo)) {
      this.errorCodigo.set({ tipo: 'formato' });
      return;
    }
    this.firmando.set(true);
    this.errorCodigo.set(null);
    this.api.firmar(this.firmaId(), codigo).subscribe({
      next: (firma) => {
        this.firmando.set(false);
        const certificado = firma.certificado;
        this.certificado.set(
          certificado ? { ...certificado, fechaHora: this.fechaHora(certificado.firmadaEn) } : null,
        );
        this.terminar({ tipo: 'firmada' }, true);
      },
      error: (error: HttpErrorResponse) => {
        this.firmando.set(false);
        this.alFallar(error);
      },
    });
  }

  private alFallar(error: HttpErrorResponse): void {
    const cuerpo = error.error as Partial<ErrorFirma> | null;
    if (error.status === 404) {
      this.vista.set('no-encontrada');
    } else if (error.status === 422) {
      this.errorCodigo.set({ tipo: 'formato' });
    } else if (error.status === 409 && cuerpo?.codigo === 'CODIGO_INVALIDO') {
      this.errorCodigo.set({ tipo: 'invalido', intentosRestantes: cuerpo.intentosRestantes ?? 0 });
    } else if (error.status === 409 && cuerpo?.codigo && cuerpo.codigo in RESULTADOS) {
      this.terminar(RESULTADOS[cuerpo.codigo as keyof typeof RESULTADOS], true);
    } else {
      this.errorCodigo.set({ tipo: 'no-disponible' });
    }
  }

  private terminar(resultado: Resultado, enfocar: boolean): void {
    this.resultado.set(resultado);
    this.vista.set('resultado');
    if (enfocar) {
      afterNextRender(() => this.tituloResultado()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

  private fechaHora(iso: string): string {
    const fecha = fechaBogota(iso, this.idioma);
    const hora = horaBogota(iso, this.idioma);
    return $localize`:@@suscripcion.fechaHora:${fecha}:fecha: a las ${hora}:hora:`;
  }
}
