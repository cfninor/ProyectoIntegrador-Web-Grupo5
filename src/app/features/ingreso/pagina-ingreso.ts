import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { destinoAlIngresar } from '../../core/sesion/regreso';
import { RUTA_CREAR_CUENTA } from '../../core/sesion/rol-guard';
import { ErrorIngreso, SERVICIO_SESION } from '../../core/sesion/sesion';
import { PATRON_CORREO, errorVisible, patron, requerido } from './validaciones';

type Campo = 'correo' | 'contrasena';

/** R9: el mensaje de cada error del ingreso. `SIN_CONFIRMAR` no se muestra aquí: va a crear cuenta. */
const MENSAJES: Record<Exclude<ErrorIngreso, 'SIN_CONFIRMAR'>, string> = {
  CREDENCIALES: $localize`:@@ingreso.error.credenciales:El correo o la contraseña no son correctos.`,
  BLOQUEO: $localize`:@@ingreso.error.bloqueo:Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.`,
  SIN_CONEXION: $localize`:@@ingreso.error.sinConexion:No pudimos conectarnos. Intenta de nuevo.`,
  SIN_PORTAL: $localize`:@@ingreso.error.sinPortal:Tu usuario no tiene un portal asignado. Comunícate con el administrador.`,
};

/**
 * R9: por qué se llegó a ingresar sin pedirlo (`?motivo=`), como aviso informativo. `confirmada`
 * viene de crear cuenta cuando el correo se confirmó sin poder ingresar.
 */
const AVISOS: Record<string, string> = {
  inactividad: $localize`:@@ingreso.aviso.inactividad:Tu sesión se cerró por inactividad.`,
  expirada: $localize`:@@ingreso.aviso.expirada:Tu sesión expiró. Ingresa de nuevo.`,
  confirmada: $localize`:@@ingreso.aviso.confirmada:Tu correo quedó confirmado. Ingresa con tu contraseña.`,
};

/**
 * SOLV-WEB-01 «Login unificado», en `/ingresar` (SOLVENTAG5-207, D10 y D12): correo y contraseña
 * para los cinco perfiles. Lleva a `volver` si es una ruta del portal del rol (R11) o al tablero;
 * una cuenta de cliente sin registrar o sin confirmar (R2 y D32) sigue en crear cuenta.
 */
@Component({
  selector: 'app-pagina-ingreso',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './pagina-ingreso.html',
  styleUrl: './acceso.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginaIngreso {
  /** `?volver=`: la ruta del portal que se pidió sin sesión (D10). */
  readonly volver = input<string>();
  /** `?motivo=`: `inactividad` o `expirada`. */
  readonly motivo = input<string>();

  private readonly servicio = inject(SERVICIO_SESION);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly injector = inject(Injector);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly regionMensajes = viewChild.required<ElementRef<HTMLElement>>('mensajes');

  protected readonly formulario = this.fb.group({
    correo: this.fb.control('', [requerido, patron(PATRON_CORREO)]),
    contrasena: this.fb.control('', [requerido]),
  });

  protected readonly mostrarContrasena = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** «Regístrate como cliente» solo con Cognito (parte 4): la sesión simulada no crea cuentas. */
  protected readonly puedeCrearCuenta = this.servicio.puedeCrearCuenta();
  protected readonly aviso = computed(() => AVISOS[this.motivo() ?? ''] ?? null);

  protected errorCampo(campo: Campo): string | null {
    const clave = errorVisible(this.formulario.controls[campo]);
    if (!clave) {
      return null;
    }
    switch (`${campo}.${clave}`) {
      case 'correo.requerido':
        return $localize`:@@ingreso.error.correo.requerido:Escribe tu correo.`;
      case 'correo.formato':
        return $localize`:@@ingreso.error.correo.formato:Escribe un correo válido, como nombre@correo.com.`;
      default:
        return $localize`:@@ingreso.error.contrasena.requerido:Escribe tu contraseña.`;
    }
  }

  protected alternarContrasena(): void {
    this.mostrarContrasena.update((mostrar) => !mostrar);
  }

  protected async ingresar(): Promise<void> {
    if (this.enviando()) {
      return; // un solo envío, aunque se haga doble clic
    }
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) {
      this.error.set(null);
      this.enfocar('[aria-invalid="true"]');
      return;
    }
    const { correo, contrasena } = this.formulario.getRawValue();
    this.enviando.set(true);
    this.error.set(null);
    const resultado = await this.servicio.iniciar(correo.trim(), contrasena);
    if (resultado.tipo === 'sesion') {
      await this.router.navigateByUrl(destinoAlIngresar(this.volver(), resultado.sesion.rol));
    } else if (resultado.tipo === 'sinRegistrar' || resultado.error === 'SIN_CONFIRMAR') {
      // Crear cuenta sigue con el correo de la cuenta: termina el registro o pide el código.
      await this.router.navigateByUrl(RUTA_CREAR_CUENTA);
    } else {
      this.enviando.set(false);
      this.error.set(MENSAJES[resultado.error]);
      this.formulario.controls.contrasena.reset();
      afterNextRender(() => this.regionMensajes().nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

  private enfocar(selector: string): void {
    afterNextRender(
      () => this.elemento.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
      { injector: this.injector },
    );
  }
}
