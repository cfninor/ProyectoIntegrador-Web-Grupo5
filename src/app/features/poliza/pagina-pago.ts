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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, Subscription, catchError, exhaustMap, take, timer } from 'rxjs';

import { montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { PasosContratacion } from '../cotizacion/pasos-contratacion';
import {
  CobroPoliza,
  CobroPrima,
  ErrorPago,
  ErrorPoliza,
  EstadoPago,
  MotivoNoEmitible,
  Pago,
  Poliza,
} from './modelos';
import { PagoApi } from './pago-api';
import { PolizaApi } from './poliza-api';

/** Por qué no hay póliza que pagar: los motivos de SOLICITUD_NO_EMITIBLE y SOLICITUD_SIN_CLIENTE. */
export type MotivoSinPoliza = MotivoNoEmitible | 'SIN_CLIENTE';

/** Cada cuánto y cuántas veces la pantalla consulta sola un pago PROCESANDO (SOLVENTAG5-75). */
export const SEGUIMIENTO_INTERVALO_MS = 5000;
export const SEGUIMIENTO_MAXIMO = 6;

type Carga =
  | { tipo: 'sin-solicitud' }
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' }
  | { tipo: 'no-emitible'; motivo: MotivoSinPoliza }
  | { tipo: 'lista'; poliza: Poliza };

/**
 * El cobro de la póliza: consultando si ya tiene un pago, el formulario de tarjeta (con el aviso de
 * un rechazo anterior), tokenizando o cobrando, o un resultado. `existente`: la póliza ya tenía ese
 * pago cuando se pidió el cobro (el 200 de `cobrarPrimaPoliza`, CA3).
 */
type EstadoCobro =
  | { tipo: 'consultando' }
  | { tipo: 'error-consulta' }
  | { tipo: 'formulario'; rechazoAnterior: boolean }
  | { tipo: 'procesando' }
  | { tipo: 'resultado'; pago: Pago; existente: boolean }
  | { tipo: 'en-curso' }
  | { tipo: 'error-tokenizacion' }
  | { tipo: 'error-cobro' };

/** La clave de idempotencia y el cuerpo exacto con que se llamó (SOLVENTAG5-121, R2): se
 * conservan juntos para reanudar el mismo intento si la conexión falla o la página se recarga,
 * sin volver a tokenizar la tarjeta.
 */
interface IntentoDePago {
  idempotencyKey: string;
  cuerpo: CobroPrima;
}

function claveAlmacenamiento(polizaId: string): string {
  return `solventa.pago.intento.${polizaId}`;
}

function leerIntento(polizaId: string): IntentoDePago | null {
  const crudo = sessionStorage.getItem(claveAlmacenamiento(polizaId));
  if (!crudo) {
    return null;
  }
  try {
    return JSON.parse(crudo) as IntentoDePago;
  } catch {
    return null;
  }
}

function guardarIntento(polizaId: string, intento: IntentoDePago): void {
  sessionStorage.setItem(claveAlmacenamiento(polizaId), JSON.stringify(intento));
}

function borrarIntento(polizaId: string): void {
  sessionStorage.removeItem(claveAlmacenamiento(polizaId));
}

/** El motivo del 409 de `generarPolizaParaFirma` (igual que en `PaginaFirma`), o null si no es uno. */
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

/** El 404 de la consulta cuando la póliza todavía no tiene intentos de cobro. */
function sinIntentos(error: HttpErrorResponse): boolean {
  const cuerpo = error.error as Partial<ErrorPago> | null;
  return error.status === 404 && cuerpo?.codigo === 'COBRO_NO_ENCONTRADO';
}

/**
 * SOLV-WEB-09, el pago de la primera prima (SOLVENTAG5-74), paso 3 de la contratación. Se abre
 * por su ruta con el `solicitudId` de la URL, igual que la firma. Pide o crea la póliza
 * (`generarPolizaParaFirma`, la misma llamada de `PaginaFirma`) y, antes de mostrar el formulario
 * de tarjeta, consulta su cobro (SOLVENTAG5-75, CA2): una póliza ya pagada o con un pago en proceso
 * no se vuelve a cobrar.
 *
 * El número de tarjeta se tokeniza directo contra la pasarela simulada (ADR 0004 D8): nunca pasa
 * por el BFF. El cobro lleva una `Idempotency-Key` generada en el cliente (SOLVENTAG5-121, R2),
 * que se conserva en `sessionStorage` junto con el cuerpo exacto del intento: si la conexión
 * falla o la página se recarga y el cobro no llegó (la consulta responde 404
 * COBRO_NO_ENCONTRADO), se reenvía el mismo intento en vez de cobrar dos veces. Un pago
 * PROCESANDO se sigue con la consulta, nunca reenviando el cobro: la misma clave devolvería la
 * misma respuesta (D8).
 */
@Component({
  selector: 'app-pagina-pago',
  imports: [PasosContratacion, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-pago.scss',
  templateUrl: './pagina-pago.html',
})
export class PaginaPago implements OnInit {
  readonly cotizacionId = input.required<string>();
  readonly actor = input.required<Actor>();
  /** El `solicitudId` de la URL (`?solicitudId=`). */
  readonly solicitudId = input<string>();

  private readonly polizaApi = inject(PolizaApi);
  private readonly pagoApi = inject(PagoApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private peticion?: Subscription;
  private cobroEnCurso?: Subscription;
  private seguimiento?: Subscription;
  private idSolicitud = '';

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly estadoCobro = signal<EstadoCobro>({ tipo: 'consultando' });

  protected readonly rutaSuscripcion = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}/suscripcion`,
  );
  protected readonly rutaFirma = computed(
    () => `/${this.actor()}/cotizar/oferta/${this.cotizacionId()}/firma`,
  );
  protected readonly rutaTablero = computed(() => `/${this.actor()}`);

  protected readonly poliza = computed(() => {
    const carga = this.carga();
    return carga.tipo === 'lista' ? carga.poliza : null;
  });

  protected readonly motivoSinPoliza = computed(() => {
    const carga = this.carga();
    return carga.tipo === 'no-emitible' ? carga.motivo : null;
  });

  protected readonly prima = computed(() => {
    const poliza = this.poliza();
    return poliza ? montoCop(poliza.prima, this.idioma) : '';
  });

  protected readonly resultado = computed(() => {
    const estado = this.estadoCobro();
    return estado.tipo === 'resultado' ? estado : null;
  });

  protected readonly rechazoAnterior = computed(() => {
    const estado = this.estadoCobro();
    return estado.tipo === 'formulario' && estado.rechazoAnterior;
  });

  /** El nombre del estado de un pago existente, en el idioma de la sesión. */
  protected readonly nombresEstado: Record<EstadoPago, string> = {
    APROBADO: $localize`:@@pago.estado.aprobado:Aprobado`,
    PROCESANDO: $localize`:@@pago.estado.procesando:Procesando`,
    RECHAZADO: $localize`:@@pago.estado.rechazado:Rechazado`,
    REVERSADO: $localize`:@@pago.estado.reversado:Devuelto`,
  };

  protected readonly formulario = this.fb.group({
    numero: this.fb.control('', [Validators.required, Validators.pattern(/^\d{13,19}$/)]),
    vencimiento: this.fb.control('', [
      Validators.required,
      Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/),
    ]),
  });

  /** El mensaje del campo si ya se tocó y tiene un error, como en `PaginaCrearCuenta`. */
  protected errorCampo(campo: 'numero' | 'vencimiento'): string | null {
    const control = this.formulario.controls[campo];
    if (!control.errors || !control.touched) {
      return null;
    }
    if (campo === 'numero') {
      return control.errors['required']
        ? $localize`:@@pago.campo.numero.requerido:Escribe el número de la tarjeta.`
        : $localize`:@@pago.campo.numero.formato:El número de tarjeta tiene entre 13 y 19 dígitos.`;
    }
    return control.errors['required']
      ? $localize`:@@pago.campo.vencimiento.requerido:Escribe el vencimiento.`
      : $localize`:@@pago.campo.vencimiento.formato:El vencimiento tiene el formato MM/AA.`;
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.peticion?.unsubscribe();
      this.cobroEnCurso?.unsubscribe();
      this.seguimiento?.unsubscribe();
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

  /** Pide o crea la póliza y, antes de mostrar el formulario, consulta su cobro (CA2). */
  protected generar(): void {
    this.carga.set({ tipo: 'cargando' });
    this.peticion = this.polizaApi.generar(this.idSolicitud).subscribe({
      next: (poliza) => {
        this.carga.set({ tipo: 'lista', poliza });
        this.consultar(poliza.polizaId);
      },
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

  /**
   * Consulta el cobro de la póliza: al entrar, con «Consultar de nuevo» y al reintentar tras un
   * error. Sin intentos (404 COBRO_NO_ENCONTRADO), reenvía el intento guardado con su misma clave
   * (la solicitud original pudo no llegar) o muestra el formulario.
   */
  protected consultar(polizaId: string): void {
    if (this.estadoCobro().tipo !== 'resultado') {
      this.estadoCobro.set({ tipo: 'consultando' });
    }
    this.cobroEnCurso?.unsubscribe();
    this.cobroEnCurso = this.pagoApi.obtenerCobro(polizaId).subscribe({
      next: (cobro) => this.aplicarCobro(polizaId, cobro),
      error: (error: HttpErrorResponse) => {
        if (!sinIntentos(error)) {
          this.estadoCobro.set({ tipo: 'error-consulta' });
          return;
        }
        const guardado = leerIntento(polizaId);
        if (guardado) {
          this.cobrar(polizaId, guardado.cuerpo, guardado.idempotencyKey);
        } else {
          this.estadoCobro.set({ tipo: 'formulario', rechazoAnterior: false });
        }
      },
    });
  }

  /**
   * Tokeniza la tarjeta y, si sale bien, inicia un cobro nuevo con una clave nueva. Mientras se
   * tokeniza o se cobra no hace nada: el segundo clic de un doble clic puede llegar antes de que
   * el botón se vea deshabilitado.
   */
  protected pagar(): void {
    const poliza = this.poliza();
    if (!poliza || this.formulario.invalid || this.estadoCobro().tipo === 'procesando') {
      return;
    }
    const { numero, vencimiento } = this.formulario.getRawValue();
    this.estadoCobro.set({ tipo: 'procesando' });
    this.cobroEnCurso?.unsubscribe();
    this.cobroEnCurso = this.pagoApi.tokenizar({ numero, vencimiento }).subscribe({
      next: (tokenTarjeta) => {
        const cuerpo: CobroPrima = { medioPago: 'TARJETA', token: tokenTarjeta.token };
        const idempotencyKey = crypto.randomUUID();
        guardarIntento(poliza.polizaId, { idempotencyKey, cuerpo });
        this.cobrar(poliza.polizaId, cuerpo, idempotencyKey);
      },
      error: () => this.estadoCobro.set({ tipo: 'error-tokenizacion' }),
    });
  }

  /** Vuelve a enviar el mismo cobro con la misma clave: tras un error de red o una clave en curso. */
  protected volverAIntentar(): void {
    const poliza = this.poliza();
    const guardado = poliza ? leerIntento(poliza.polizaId) : null;
    if (poliza && guardado) {
      this.cobrar(poliza.polizaId, guardado.cuerpo, guardado.idempotencyKey);
    }
  }

  /** Tras un RECHAZADO: borra el intento (R2: uno nuevo usa otra clave) y vuelve al formulario. */
  protected intentarConOtroMedio(): void {
    const poliza = this.poliza();
    if (poliza) {
      borrarIntento(poliza.polizaId);
    }
    this.formulario.reset();
    this.estadoCobro.set({ tipo: 'formulario', rechazoAnterior: false });
  }

  private cobrar(polizaId: string, cuerpo: CobroPrima, idempotencyKey: string): void {
    this.estadoCobro.set({ tipo: 'procesando' });
    this.cobroEnCurso?.unsubscribe();
    this.cobroEnCurso = this.pagoApi.cobrar(polizaId, cuerpo, idempotencyKey).subscribe({
      next: ({ pago, existente }) => {
        if (pago.estado !== 'PROCESANDO') {
          borrarIntento(polizaId);
        }
        this.estadoCobro.set({ tipo: 'resultado', pago, existente });
        if (pago.estado === 'PROCESANDO') {
          this.seguir(polizaId);
        }
      },
      error: (error: HttpErrorResponse) => {
        const cuerpoError = error.error as Partial<ErrorPago> | null;
        if (cuerpoError?.codigo === 'CLAVE_IDEMPOTENCIA_EN_CURSO') {
          this.estadoCobro.set({ tipo: 'en-curso' });
          return;
        }
        this.estadoCobro.set({ tipo: 'error-cobro' });
      },
    });
  }

  /**
   * El estado que muestra la consulta del cobro. APROBADO y REVERSADO terminan el pago; PROCESANDO
   * se sigue consultando; RECHAZADO muestra el formulario para un intento nuevo, con otra clave
   * (CA5). Un pago existente (CA3) lo sigue siendo mientras se consulta.
   */
  private aplicarCobro(polizaId: string, { pago }: CobroPoliza): void {
    const actual = this.estadoCobro();
    const existente = actual.tipo === 'resultado' && actual.existente;
    if (pago.estado === 'PROCESANDO') {
      this.estadoCobro.set({ tipo: 'resultado', pago, existente });
      this.seguir(polizaId);
      return;
    }
    this.seguimiento?.unsubscribe();
    borrarIntento(polizaId);
    if (pago.estado === 'RECHAZADO') {
      this.formulario.reset();
      this.estadoCobro.set({ tipo: 'formulario', rechazoAnterior: true });
    } else {
      this.estadoCobro.set({ tipo: 'resultado', pago, existente });
    }
  }

  /**
   * Consulta sola un pago PROCESANDO cada `SEGUIMIENTO_INTERVALO_MS`, hasta `SEGUIMIENTO_MAXIMO`
   * veces, mientras siga PROCESANDO. Un error en una de estas consultas no cambia la pantalla: la
   * siguiente, o «Consultar de nuevo», lo intenta otra vez.
   */
  private seguir(polizaId: string): void {
    if (this.seguimiento && !this.seguimiento.closed) {
      return;
    }
    this.seguimiento = timer(SEGUIMIENTO_INTERVALO_MS, SEGUIMIENTO_INTERVALO_MS)
      .pipe(
        take(SEGUIMIENTO_MAXIMO),
        exhaustMap(() => this.pagoApi.obtenerCobro(polizaId).pipe(catchError(() => EMPTY))),
      )
      .subscribe((cobro) => this.aplicarCobro(polizaId, cobro));
  }
}
