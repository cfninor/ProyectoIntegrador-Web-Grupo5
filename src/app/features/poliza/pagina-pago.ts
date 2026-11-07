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
import { Subscription } from 'rxjs';

import { montoCop } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { Actor } from '../cotizacion/formulario-cotizacion';
import { PasosContratacion } from '../cotizacion/pasos-contratacion';
import { CobroPrima, ErrorPago, ErrorPoliza, MotivoNoEmitible, Pago, Poliza } from './modelos';
import { PagoApi } from './pago-api';
import { PolizaApi } from './poliza-api';

/** Por qué no hay póliza que pagar: los motivos de SOLICITUD_NO_EMITIBLE y SOLICITUD_SIN_CLIENTE. */
export type MotivoSinPoliza = MotivoNoEmitible | 'SIN_CLIENTE';

type Carga =
  | { tipo: 'sin-solicitud' }
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' }
  | { tipo: 'no-emitible'; motivo: MotivoSinPoliza }
  | { tipo: 'lista'; poliza: Poliza };

/** El intento de cobro en curso: formulario de tarjeta, tokenizando/cobrando, o un resultado. */
type EstadoCobro =
  | { tipo: 'formulario' }
  | { tipo: 'procesando' }
  | { tipo: 'resultado'; pago: Pago }
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

/**
 * SOLV-WEB-09, el pago de la primera prima (SOLVENTAG5-74), paso 3 de la contratación. Se abre
 * por su ruta con el `solicitudId` de la URL, igual que la firma. Pide o crea la póliza
 * (`generarPolizaParaFirma`, la misma llamada de `PaginaFirma`) y, una vez PENDIENTE_FIRMA,
 * muestra el formulario de tarjeta.
 *
 * El número de tarjeta se tokeniza directo contra la pasarela simulada (ADR 0004 D8): nunca pasa
 * por el BFF. El cobro lleva una `Idempotency-Key` generada en el cliente (SOLVENTAG5-121, R2),
 * que se conserva en `sessionStorage` junto con el cuerpo exacto del intento: si la conexión
 * falla o la página se recarga, se reanuda el mismo intento en vez de cobrar dos veces.
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
  private idSolicitud = '';

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly estadoCobro = signal<EstadoCobro>({ tipo: 'formulario' });

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

  protected readonly resultadoPago = computed(() => {
    const estado = this.estadoCobro();
    return estado.tipo === 'resultado' ? estado.pago : null;
  });

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

  /** Pide o crea la póliza; si ya hay un intento de cobro guardado, lo reanuda. */
  protected generar(): void {
    this.carga.set({ tipo: 'cargando' });
    this.peticion = this.polizaApi.generar(this.idSolicitud).subscribe({
      next: (poliza) => {
        this.carga.set({ tipo: 'lista', poliza });
        const guardado = leerIntento(poliza.polizaId);
        if (guardado) {
          this.cobrar(poliza.polizaId, guardado.cuerpo, guardado.idempotencyKey);
        }
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

  /** Tokeniza la tarjeta y, si sale bien, inicia un cobro nuevo con una clave nueva. */
  protected pagar(): void {
    const poliza = this.poliza();
    if (!poliza || this.formulario.invalid) {
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

  /** Vuelve a enviar el mismo cobro con la misma clave: para PROCESANDO o tras un error. */
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
    this.estadoCobro.set({ tipo: 'formulario' });
  }

  private cobrar(polizaId: string, cuerpo: CobroPrima, idempotencyKey: string): void {
    this.estadoCobro.set({ tipo: 'procesando' });
    this.cobroEnCurso?.unsubscribe();
    this.cobroEnCurso = this.pagoApi.cobrar(polizaId, cuerpo, idempotencyKey).subscribe({
      next: (pago) => {
        if (pago.estado !== 'PROCESANDO') {
          borrarIntento(polizaId);
        }
        this.estadoCobro.set({ tipo: 'resultado', pago });
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
}
