import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { tableroDe } from '../../core/sesion/roles';
import { RUTA_INGRESAR } from '../../core/sesion/rol-guard';
import {
  DatosCuenta,
  DetalleValidacion,
  ErrorCuenta,
  SERVICIO_SESION,
  TipoDocumento,
} from '../../core/sesion/sesion';
import { PATRON_DOCUMENTO, TIPOS_DOCUMENTO } from '../cotizacion/modelos';
import {
  LARGO_NOMBRE,
  PATRON_CELULAR,
  PATRON_CODIGO,
  PATRON_CORREO,
  PATRON_NOMBRE,
  cumplePolitica,
  errorVisible,
  largo,
  patron,
  requerido,
} from './validaciones';

type Paso = 'datos' | 'codigo';

/** Aviso informativo del paso «Código». */
type AvisoCodigo = 'sinConfirmar' | 'reenviado';

type CampoDatos =
  | 'numeroDocumento'
  | 'nombres'
  | 'apellidos'
  | 'celular'
  | 'correo'
  | 'contrasena'
  | 'confirmacion';

/** R13: el mensaje de cada error de crear cuenta. */
const MENSAJES: Record<ErrorCuenta, string> = {
  CORREO_EXISTE: $localize`:@@crearCuenta.error.correoExiste:Ya existe una cuenta con ese correo. Ingresa con tu contraseña.`,
  CONTRASENA_INVALIDA: $localize`:@@crearCuenta.error.contrasenaInvalida:La contraseña debe tener al menos 12 caracteres, con mayúsculas, minúsculas y números.`,
  CODIGO_ERRADO: $localize`:@@crearCuenta.error.codigoErrado:El código no es correcto.`,
  CODIGO_VENCIDO: $localize`:@@crearCuenta.error.codigoVencido:El código venció. Pide uno nuevo.`,
  DEMASIADOS_INTENTOS: $localize`:@@crearCuenta.error.demasiadosIntentos:Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.`,
  CUENTA_NO_ENLAZABLE: $localize`:@@crearCuenta.error.cuentaNoEnlazable:No pudimos crear tu cuenta con esos datos. Si ya te registraste en la app, usa el mismo correo; si no, comunícate con tu asesor.`,
  VALIDACION: $localize`:@@crearCuenta.error.validacion:Revisa los datos marcados.`,
  SIN_CONEXION: $localize`:@@crearCuenta.error.sinConexion:No pudimos conectarnos. Intenta de nuevo.`,
  NO_DISPONIBLE: $localize`:@@crearCuenta.error.noDisponible:Crear cuenta no está disponible en este ambiente.`,
};

/** Campo del formulario de cada `loc` de un 422 del BFF (`["body", "documento", "numero"]`). */
const CAMPOS_DEL_BFF: Record<string, CampoDatos> = {
  'documento.numero': 'numeroDocumento',
  'documento.tipo': 'numeroDocumento',
  'nombre.nombres': 'nombres',
  'nombre.apellidos': 'apellidos',
  celular: 'celular',
};

/** La confirmación es igual a la contraseña. */
function coincide(control: AbstractControl<string>): ValidationErrors | null {
  const contrasena = control.parent?.get('contrasena')?.value as string | undefined;
  return control.value && contrasena !== undefined && control.value !== contrasena
    ? { distinta: true }
    : null;
}

function politica(control: AbstractControl<string>): ValidationErrors | null {
  return !control.value || cumplePolitica(control.value) ? null : { politica: true };
}

/**
 * Crear cuenta del cliente, en `/crear-cuenta` (SOLVENTAG5-207, CA8, D20, D21 y D32), con dos
 * pasos:
 *
 * - «Tus datos»: documento, nombres, apellidos, celular, correo y contraseña. Con la cuenta de un
 *   cliente sin registrar (R2), el correo es el de la cuenta y no se piden contraseñas.
 * - «Código»: el de 6 dígitos que Cognito envía al correo.
 *
 * Una cuenta nueva pasa por los dos y, al confirmar, se registra con los datos que ya escribió. Una
 * cuenta sin confirmar que llega del ingreso (D32) empieza en «Código» y sigue a «Tus datos».
 */
@Component({
  selector: 'app-pagina-crear-cuenta',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './pagina-crear-cuenta.html',
  styleUrl: './acceso.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginaCrearCuenta {
  private readonly servicio = inject(SERVICIO_SESION);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly injector = inject(Injector);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly tiposDocumento = TIPOS_DOCUMENTO;

  protected readonly formulario = this.fb.group({
    tipoDocumento: this.fb.control<TipoDocumento>('CC'),
    numeroDocumento: this.fb.control('', [
      requerido,
      (control: AbstractControl<string>) => {
        const tipo = control.parent?.get('tipoDocumento')?.value as TipoDocumento | undefined;
        const numero = control.value.trim();
        return !numero || !tipo || PATRON_DOCUMENTO[tipo].test(numero) ? null : { formato: true };
      },
    ]),
    nombres: this.fb.control('', [requerido, largo(LARGO_NOMBRE), patron(PATRON_NOMBRE)]),
    apellidos: this.fb.control('', [requerido, largo(LARGO_NOMBRE), patron(PATRON_NOMBRE)]),
    celular: this.fb.control('', [requerido, patron(PATRON_CELULAR)]),
    correo: this.fb.control('', [requerido, patron(PATRON_CORREO)]),
    contrasena: this.fb.control('', [requerido, politica]),
    confirmacion: this.fb.control('', [requerido, coincide]),
  });

  protected readonly formularioCodigo = this.fb.group({
    codigo: this.fb.control('', [requerido, patron(PATRON_CODIGO)]),
  });

  protected readonly paso = signal<Paso>('datos');
  /** La cuenta ya existe e ingresó, sin rol (R2): no se piden correo ni contraseñas. */
  protected readonly cuentaExistente = signal(false);
  /** El correo al que Cognito envió el código. */
  protected readonly correoCodigo = signal('');
  protected readonly avisoCodigo = signal<AvisoCodigo | null>(null);
  protected readonly mostrarContrasena = signal(false);
  protected readonly mostrarConfirmacion = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  /**
   * Los campos que rechazó el BFF (422). Van aparte de los errores del formulario porque volver a
   * «Tus datos» monta otra vez los controles y los valida de nuevo; se quitan al cambiar el campo.
   */
  protected readonly rechazados = signal<ReadonlySet<CampoDatos>>(new Set());

  /** Los datos de una cuenta nueva, que se registran en el BFF después de confirmar el código. */
  private pendientes: DatosCuenta | null = null;

  constructor() {
    const { tipoDocumento, numeroDocumento, contrasena, confirmacion } = this.formulario.controls;
    // El número depende del tipo, y la confirmación de la contraseña: se validan otra vez.
    tipoDocumento.valueChanges.subscribe(() => numeroDocumento.updateValueAndValidity());
    contrasena.valueChanges.subscribe(() => confirmacion.updateValueAndValidity());
    for (const campo of new Set(Object.values(CAMPOS_DEL_BFF))) {
      this.formulario.controls[campo].valueChanges.subscribe(() =>
        this.rechazados.update((campos) => new Set([...campos].filter((otro) => otro !== campo))),
      );
    }

    const sinRegistrar = this.servicio.cuentaSinRegistrar();
    const porConfirmar = this.servicio.correoPorConfirmar();
    if (sinRegistrar) {
      this.usarCuentaExistente(sinRegistrar);
    } else if (porConfirmar) {
      // D32: el ingreso encontró la cuenta sin confirmar y ya pidió un código nuevo.
      this.correoCodigo.set(porConfirmar);
      this.avisoCodigo.set('sinConfirmar');
      this.paso.set('codigo');
    }
  }

  protected textoTipo(tipo: TipoDocumento): string {
    return {
      CC: $localize`:@@crearCuenta.tipoDocumento.cc:CC`,
      CE: $localize`:@@crearCuenta.tipoDocumento.ce:CE`,
      PA: $localize`:@@crearCuenta.tipoDocumento.pa:PA`,
      PPT: $localize`:@@crearCuenta.tipoDocumento.ppt:PPT`,
    }[tipo];
  }

  protected errorCampo(campo: CampoDatos): string | null {
    if (this.rechazados().has(campo)) {
      return $localize`:@@crearCuenta.error.servidor:El servicio no aceptó este dato. Revísalo.`;
    }
    const clave = errorVisible(this.formulario.controls[campo]);
    return clave ? this.mensajeCampo(campo, clave) : null;
  }

  protected errorCodigo(): string | null {
    const clave = errorVisible(this.formularioCodigo.controls.codigo);
    if (!clave) {
      return null;
    }
    return clave === 'requerido'
      ? $localize`:@@crearCuenta.error.codigo.requerido:Escribe el código.`
      : $localize`:@@crearCuenta.error.codigo.formato:El código tiene 6 dígitos.`;
  }

  protected alternar(campo: 'contrasena' | 'confirmacion'): void {
    const mostrar = campo === 'contrasena' ? this.mostrarContrasena : this.mostrarConfirmacion;
    mostrar.update((valor) => !valor);
  }

  /** «Tus datos»: registra la cuenta en Cognito o, si ya existe, completa el registro. */
  protected async enviarDatos(): Promise<void> {
    if (this.enviando()) {
      return;
    }
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) {
      this.error.set(null);
      this.enfocar('[aria-invalid="true"]');
      return;
    }
    const datos = this.datosCuenta();
    if (this.cuentaExistente()) {
      await this.completar(datos);
      return;
    }
    const { correo, contrasena } = this.formulario.getRawValue();
    this.empezar();
    const resultado = await this.servicio.registrar(correo.trim(), contrasena);
    this.enviando.set(false);
    if (resultado.tipo === 'error') {
      this.mostrarError(resultado.error);
      return;
    }
    this.pendientes = datos;
    this.correoCodigo.set(correo.trim());
    this.avisoCodigo.set(null);
    this.irA('codigo');
  }

  /** «Código»: confirma el correo e ingresa, y sigue con el registro de los datos. */
  protected async enviarCodigo(): Promise<void> {
    if (this.enviando()) {
      return;
    }
    const { codigo } = this.formularioCodigo.controls;
    codigo.markAsTouched();
    if (codigo.invalid) {
      this.error.set(null);
      this.enfocar('[aria-invalid="true"]');
      return;
    }
    this.empezar();
    const resultado = await this.servicio.confirmar(this.correoCodigo(), codigo.value.trim());
    if (resultado.tipo === 'error') {
      this.enviando.set(false);
      this.mostrarError(resultado.error);
      return;
    }
    const sinRegistrar = this.servicio.cuentaSinRegistrar();
    if (!sinRegistrar) {
      // Confirmada, pero sin sesión: sin las credenciales en memoria (por ejemplo, se recargó) o
      // porque el ingreso con ellas no pasó. El cliente ingresa con su contraseña.
      await this.router.navigateByUrl(`${RUTA_INGRESAR}?motivo=confirmada`);
      return;
    }
    const pendientes = this.pendientes;
    if (pendientes) {
      await this.completar(pendientes);
      return;
    }
    // D32: la cuenta sin confirmar ya ingresó; falta «Tus datos», sin contraseñas.
    this.enviando.set(false);
    this.usarCuentaExistente(sinRegistrar);
    this.irA('datos');
  }

  protected async reenviar(): Promise<void> {
    if (this.enviando()) {
      return;
    }
    this.empezar();
    this.avisoCodigo.set(null);
    const resultado = await this.servicio.reenviarCodigo(this.correoCodigo());
    this.enviando.set(false);
    if (resultado.tipo === 'error') {
      this.mostrarError(resultado.error);
    } else {
      this.avisoCodigo.set('reenviado');
    }
  }

  /** `POST /v1/cuenta` con la cuenta que ya ingresó, y al tablero del cliente. */
  private async completar(datos: DatosCuenta): Promise<void> {
    this.empezar();
    const resultado = await this.servicio.completarRegistro(datos);
    if (resultado.tipo === 'sesion') {
      await this.router.navigateByUrl(tableroDe(resultado.sesion.rol));
      return;
    }
    this.enviando.set(false);
    this.pendientes = null;
    const correo = this.servicio.cuentaSinRegistrar();
    if (correo && !this.cuentaExistente()) {
      // La cuenta ya ingresó: se corrigen los datos sin volver a pedir contraseñas.
      this.usarCuentaExistente(correo);
      this.paso.set('datos');
    }
    if (resultado.error === 'VALIDACION') {
      this.marcarRechazados(resultado.detalle ?? []);
    }
    this.mostrarError(resultado.error);
  }

  private usarCuentaExistente(correo: string): void {
    const { controls } = this.formulario;
    this.cuentaExistente.set(true);
    controls.correo.setValue(correo);
    for (const control of [controls.contrasena, controls.confirmacion]) {
      control.clearValidators();
      control.reset();
    }
  }

  private datosCuenta(): DatosCuenta {
    const valor = this.formulario.getRawValue();
    return {
      documento: { tipo: valor.tipoDocumento, numero: valor.numeroDocumento.trim() },
      nombre: { nombres: valor.nombres.trim(), apellidos: valor.apellidos.trim() },
      celular: valor.celular.trim(),
    };
  }

  /** R13: un 422 del BFF marca los campos que rechazó, con el mensaje bajo cada uno. */
  private marcarRechazados(detalle: DetalleValidacion[]): void {
    const campos = detalle.map(({ loc }) => CAMPOS_DEL_BFF[loc.slice(1).join('.')]);
    this.rechazados.set(new Set(campos.filter((campo) => campo !== undefined)));
  }

  private empezar(): void {
    this.enviando.set(true);
    this.error.set(null);
    this.rechazados.set(new Set());
  }

  private mostrarError(error: ErrorCuenta): void {
    this.error.set(MENSAJES[error]);
    this.enfocar('.mensajes');
  }

  /** Cambia de paso y lleva el foco a su título, para que el lector de pantalla lo anuncie. */
  private irA(paso: Paso): void {
    this.paso.set(paso);
    this.enfocar('h2');
  }

  private enfocar(selector: string): void {
    afterNextRender(
      () => this.elemento.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
      { injector: this.injector },
    );
  }

  private mensajeCampo(campo: CampoDatos, clave: string): string {
    switch (`${campo}.${clave}`) {
      case 'numeroDocumento.requerido':
        return $localize`:@@crearCuenta.error.documento.requerido:Escribe el número de documento.`;
      case 'numeroDocumento.formato':
        return this.formulario.controls.tipoDocumento.value === 'PA'
          ? $localize`:@@crearCuenta.error.documento.formatoPasaporte:Debe tener de 6 a 12 letras o números.`
          : $localize`:@@crearCuenta.error.documento.formato:Debe tener de 6 a 10 dígitos.`;
      case 'nombres.requerido':
        return $localize`:@@crearCuenta.error.nombres.requerido:Escribe tus nombres.`;
      case 'apellidos.requerido':
        return $localize`:@@crearCuenta.error.apellidos.requerido:Escribe tus apellidos.`;
      case 'nombres.largo':
      case 'apellidos.largo':
        return $localize`:@@crearCuenta.error.nombre.largo:Debe tener entre 2 y 60 caracteres.`;
      case 'nombres.formato':
      case 'apellidos.formato':
        return $localize`:@@crearCuenta.error.nombre.formato:Usa solo letras, separadas por un espacio, un apóstrofo o un guion.`;
      case 'celular.requerido':
        return $localize`:@@crearCuenta.error.celular.requerido:Escribe tu celular.`;
      case 'celular.formato':
        return $localize`:@@crearCuenta.error.celular.formato:Debe tener 10 dígitos y empezar por 3, sin indicativo ni espacios.`;
      case 'correo.requerido':
        return $localize`:@@crearCuenta.error.correo.requerido:Escribe tu correo.`;
      case 'correo.formato':
        return $localize`:@@crearCuenta.error.correo.formato:Escribe un correo válido, como nombre@correo.com.`;
      case 'contrasena.requerido':
        return $localize`:@@crearCuenta.error.contrasena.requerido:Escribe una contraseña.`;
      case 'contrasena.politica':
        return MENSAJES.CONTRASENA_INVALIDA;
      case 'confirmacion.requerido':
        return $localize`:@@crearCuenta.error.confirmacion.requerido:Escribe otra vez la contraseña.`;
      default:
        return $localize`:@@crearCuenta.error.confirmacion.distinta:Las contraseñas no coinciden.`;
    }
  }
}
