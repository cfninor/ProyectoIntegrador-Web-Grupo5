import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';

import { fechaBogota, horaBogota, montoCop, numeroConMiles } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
import { CotizacionApi } from './cotizacion-api';
import {
  BusquedaCliente,
  Cotizacion,
  DatosBienVidaHipotecario,
  ErrorApi,
  EstadoAutorizacion,
  PATRON_DOCUMENTO,
  RANGOS,
  TIPOS_DOCUMENTO,
  TipoDocumento,
} from './modelos';
import { DatosRecotizar } from './navegacion-oferta';

/** Quién cotiza: el asesor para un cliente (SOLV-WEB-05) o el cliente para sí mismo (D1). */
export type Actor = 'asesor' | 'cliente';

/** El cliente de la cotización, como lo da el contenedor. */
export interface ClienteCotizacion {
  clienteId: string;
  nombreCompleto: string;
  /** El documento que se muestra: el enmascarado de la sesión o el que buscó el asesor. */
  documento: string;
}

/** Estado de la búsqueda del cliente por documento (D15), que lleva el contenedor del asesor. */
export type EstadoBusqueda = 'inactiva' | 'buscando' | 'no-encontrado' | 'error';

/** Estado de la autorización de datos (SOLVENTAG5-65) para la caja de autorización (D17). */
export type CajaAutorizacion =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'estado'; estado: EstadoAutorizacion; fechaEstado?: string };

/** Lo que muestra la caja: sin cliente (asesor), cargando, error o el estado de la autorización. */
type VistaCaja = 'sin-cliente' | 'cargando' | 'error' | EstadoAutorizacion;

type EstadoCalculo = 'inicial' | 'calculando' | 'resultado' | 'error' | 'rechazada';

type Campo = 'numeroDocumento' | keyof DatosBienVidaHipotecario;

const CAMPOS_DEL_BIEN: readonly (keyof DatosBienVidaHipotecario)[] = [
  'montoCredito',
  'plazoAnios',
  'ciudadInmueble',
  'entidadAcreedora',
];

/** Un entero escrito con o sin separadores de miles y signo pesos; null si no es un entero. */
export function leerEntero(texto: string): number | null {
  const limpio = texto.replace(/[\s$.,]/g, '');
  return /^\d+$/.test(limpio) ? Number(limpio) : null;
}

function requerido(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { requerido: true };
}

function entero(rango: { minimo: number; maximo: number }): ValidatorFn {
  return (control: AbstractControl<string>) => {
    if (!control.value.trim()) {
      return null;
    }
    const valor = leerEntero(control.value);
    if (valor === null) {
      return { formato: true };
    }
    return valor < rango.minimo || valor > rango.maximo ? { rango: true } : null;
  };
}

function largo(rango: { minimo: number; maximo: number }): ValidatorFn {
  return (control: AbstractControl<string>) => {
    const texto = control.value.trim();
    return texto && (texto.length < rango.minimo || texto.length > rango.maximo)
      ? { largo: true }
      : null;
  };
}

/**
 * Formulario común de cotización del seguro de vida hipotecario, con su panel de prima (marco
 * «Cotizador Interactivo» del Figma; CA1, CA2, CA3, CA5; D6, D7, D8, D16, D17). Sirve a los dos
 * actores: el contenedor le da el cliente, el estado de la búsqueda y de la autorización, y si
 * puede enviar; el formulario valida, cotiza con la API y avisa lo que el contenedor debe hacer.
 */
@Component({
  selector: 'app-formulario-cotizacion',
  imports: [ReactiveFormsModule],
  templateUrl: './formulario-cotizacion.html',
  styleUrl: './formulario-cotizacion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormularioCotizacion implements OnInit {
  /** Textos en tercera persona para el asesor y en segunda para el cliente (D8). */
  readonly actor = input.required<Actor>();
  /** Con el actor asesor, null hasta que la búsqueda encuentre al cliente. */
  readonly cliente = input<ClienteCotizacion | null>(null);
  readonly busqueda = input<EstadoBusqueda>('inactiva');
  readonly autorizacion = input<CajaAutorizacion>({ tipo: 'cargando' });
  /** El asesor solo calcula con la autorización AUTORIZADA (D4); el cliente, siempre. */
  readonly envioHabilitado = input(true);
  /**
   * Datos con que se abre al ajustar o recotizar una oferta (SOLVENTAG5-49, CA3). Con el actor
   * asesor y el documento del cliente, lo vuelve a buscar.
   */
  readonly inicial = input<DatosRecotizar | null>(null);

  /** El asesor escribió un documento válido: el contenedor busca al cliente (D2, D15). */
  readonly buscarCliente = output<BusquedaCliente>();
  readonly pedirAutorizacion = output<void>();
  readonly reenviarSolicitud = output<void>();
  readonly reintentarAutorizacion = output<void>();
  readonly cotizada = output<Cotizacion>();
  /** «Ver la oferta» del panel: el contenedor abre la oferta de la cotización (SOLVENTAG5-49). */
  readonly verOferta = output<Cotizacion>();

  private readonly api = inject(CotizacionApi);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly tiposDocumento = TIPOS_DOCUMENTO;

  protected readonly formulario = this.fb.group({
    tipoDocumento: this.fb.control<TipoDocumento>('CC'),
    numeroDocumento: this.fb.control(''),
    montoCredito: this.fb.control('', [requerido, entero(RANGOS.montoCredito)]),
    plazoAnios: this.fb.control('', [requerido, entero(RANGOS.plazoAnios)]),
    ciudadInmueble: this.fb.control('', [requerido, largo(RANGOS.ciudadInmueble)]),
    entidadAcreedora: this.fb.control('', [requerido, largo(RANGOS.entidadAcreedora)]),
  });

  protected readonly etiquetas: Record<Campo | 'nombre', string> = {
    nombre: $localize`:@@cotizacion.campo.nombre:Nombre completo`,
    numeroDocumento: $localize`:@@cotizacion.campo.documento:Documento de identidad`,
    montoCredito: $localize`:@@cotizacion.campo.monto:Monto del crédito (COP)`,
    plazoAnios: $localize`:@@cotizacion.campo.plazo:Plazo (años)`,
    ciudadInmueble: $localize`:@@cotizacion.campo.ciudad:Ciudad del inmueble`,
    entidadAcreedora: $localize`:@@cotizacion.campo.entidad:Entidad acreedora`,
  };

  /** Un resultado o un error deja de valer si cambia el cliente, salvo con un cálculo en curso. */
  protected readonly estado = linkedSignal<ClienteCotizacion | null, EstadoCalculo>({
    source: this.cliente,
    computation: (_cliente, anterior) =>
      anterior?.value === 'calculando' ? 'calculando' : 'inicial',
  });
  protected readonly cotizacion = linkedSignal<ClienteCotizacion | null, Cotizacion | null>({
    source: this.cliente,
    computation: () => null,
  });
  /** `tipo:número` de la última búsqueda pedida al contenedor. */
  private readonly documentoBuscado = signal<string | null>(null);

  /**
   * Cambia con cada evento del formulario (valor, validez, tocado), también de cada campo. Un
   * objeto nuevo en cada evento: los `computed` que lo leen se recalculan aunque el estado global
   * siga siendo INVALID.
   */
  private readonly cambios = toSignal(this.formulario.events, { initialValue: null });

  /** El documento escrito, como `tipo:número`, para saber si ya se buscó. */
  private readonly documentoActual = computed(() => {
    this.cambios();
    return this.claveDocumento();
  });

  /** Campos que impiden calcular, por su etiqueta, en el orden del formulario (CA2). */
  protected readonly faltantes = computed(() => {
    this.cambios();
    const campos: Campo[] = [
      ...(this.actor() === 'asesor' ? (['numeroDocumento'] as const) : []),
      ...CAMPOS_DEL_BIEN,
    ];
    return campos
      .filter((campo) => this.formulario.controls[campo].invalid)
      .map((campo) => this.etiquetas[campo]);
  });

  /** Con el actor asesor, el cliente es el del documento que está escrito (D15). */
  protected readonly clienteListo = computed(
    () =>
      this.actor() === 'cliente' ||
      (this.cliente() !== null && this.documentoActual() === this.documentoBuscado()),
  );

  protected readonly puedeEnviar = computed(
    () =>
      this.envioHabilitado() &&
      this.clienteListo() &&
      this.faltantes().length === 0 &&
      this.estado() !== 'calculando',
  );

  /** Por qué no se puede calcular, para decirlo junto al botón (CA2, D4). */
  protected readonly bloqueo = computed(() => {
    if (this.estado() === 'calculando') {
      return null;
    }
    if (this.faltantes().length > 0) {
      return 'campos';
    }
    if (!this.clienteListo()) {
      return 'cliente';
    }
    return this.envioHabilitado() ? null : 'autorizacion';
  });

  protected readonly vistaCaja = computed<VistaCaja>(() => {
    if (this.actor() === 'asesor' && this.cliente() === null) {
      return 'sin-cliente';
    }
    const caja = this.autorizacion();
    return caja.tipo === 'estado' ? caja.estado : caja.tipo;
  });

  /** Fecha y hora de la autorización, en hora de Bogotá y con el formato del idioma (D8). */
  protected readonly fechaAutorizacion = computed(() => {
    const caja = this.autorizacion();
    return caja.tipo === 'estado' && caja.fechaEstado
      ? {
          fecha: fechaBogota(caja.fechaEstado, this.idioma),
          hora: horaBogota(caja.fechaEstado, this.idioma),
        }
      : null;
  });

  /** El panel de prima (D6): montos en COP y la fecha hasta la que vale la oferta. */
  protected readonly resumen = computed(() => {
    const cotizacion = this.cotizacion();
    if (!cotizacion) {
      return null;
    }
    const plazo = cotizacion.datosBien.plazoAnios;
    return {
      prima: montoCop(cotizacion.prima, this.idioma),
      sumaAsegurada: montoCop(cotizacion.datosBien.montoCredito, this.idioma),
      vigencia: $localize`:@@cotizacion.panel.vigenciaAnios:${plazo}:plazo: años`,
      validaHasta: fechaBogota(cotizacion.vigenteHasta, this.idioma),
      motivoSinPerfil: cotizacion.calculadaSinPerfil ? cotizacion.motivoSinPerfil : undefined,
    };
  });

  constructor() {
    // Un resultado o un error deja de valer si cambian los datos.
    this.formulario.valueChanges.subscribe(() => this.volverAlInicio());
  }

  ngOnInit(): void {
    if (this.actor() === 'asesor') {
      const { tipoDocumento, numeroDocumento } = this.formulario.controls;
      numeroDocumento.setValidators([
        requerido,
        (control) =>
          !control.value.trim() || PATRON_DOCUMENTO[tipoDocumento.value].test(control.value.trim())
            ? null
            : { formato: true },
      ]);
      numeroDocumento.updateValueAndValidity();
      // El patrón del número depende del tipo: al cambiarlo se valida otra vez y se busca.
      tipoDocumento.valueChanges.subscribe(() => {
        numeroDocumento.updateValueAndValidity();
        if (numeroDocumento.value.trim()) {
          this.buscar();
        }
      });
    }
    const inicial = this.inicial();
    if (inicial) {
      this.llenarCon(inicial);
    }
  }

  /** Los datos del crédito de la oferta y, para el asesor, el documento con que se buscó. */
  private llenarCon({ datosBien, busqueda }: DatosRecotizar): void {
    const { controls } = this.formulario;
    controls.montoCredito.setValue(numeroConMiles(datosBien.montoCredito, this.idioma));
    controls.plazoAnios.setValue(String(datosBien.plazoAnios));
    controls.ciudadInmueble.setValue(datosBien.ciudadInmueble);
    controls.entidadAcreedora.setValue(datosBien.entidadAcreedora);
    if (this.actor() === 'asesor' && busqueda) {
      // Primero el tipo, con el número vacío: así cambiar el tipo no busca todavía.
      controls.tipoDocumento.setValue(busqueda.tipoDocumento);
      controls.numeroDocumento.setValue(busqueda.numeroDocumento);
      this.buscar();
    }
  }

  /** Muestra el error de un campo cuando ya se tocó o cuando el servicio lo rechazó. */
  protected error(campo: Campo): string | null {
    const control = this.formulario.controls[campo];
    if (!control.errors || !(control.touched || control.errors['servidor'])) {
      return null;
    }
    const clave = Object.keys(control.errors)[0];
    return this.mensaje(campo, clave);
  }

  protected textoTipo(tipo: TipoDocumento): string {
    return {
      CC: $localize`:@@cotizacion.tipoDocumento.cc:CC`,
      CE: $localize`:@@cotizacion.tipoDocumento.ce:CE`,
      PA: $localize`:@@cotizacion.tipoDocumento.pa:PA`,
      PPT: $localize`:@@cotizacion.tipoDocumento.ppt:PPT`,
    }[tipo];
  }

  /** Busca al salir del campo, con Enter o al cambiar el tipo, si el documento es válido. */
  protected buscar(): void {
    const control = this.formulario.controls.numeroDocumento;
    control.markAsTouched();
    const documento = this.claveDocumento();
    const repetida = documento === this.documentoBuscado() && this.busqueda() !== 'error';
    if (control.invalid || repetida) {
      return;
    }
    this.documentoBuscado.set(documento);
    this.buscarCliente.emit({
      tipoDocumento: this.formulario.controls.tipoDocumento.value,
      numeroDocumento: control.value.trim(),
    });
  }

  /** Enter en el documento busca al cliente y no envía el formulario. */
  protected alPresionarEnter(evento: Event): void {
    evento.preventDefault();
    this.buscar();
  }

  /** «Ver la oferta» solo aparece con un resultado: siempre hay una cotización que abrir. */
  protected abrirOferta(): void {
    this.verOferta.emit(this.cotizacion() as Cotizacion);
  }

  /** Al salir del monto lo muestra con separador de miles, como se lee en el idioma. */
  protected formatearMonto(): void {
    const control = this.formulario.controls.montoCredito;
    control.markAsTouched();
    const valor = leerEntero(control.value);
    const formateado = valor === null ? null : numeroConMiles(valor, this.idioma);
    if (formateado !== null && formateado !== control.value) {
      control.setValue(formateado);
    }
  }

  /** Cotiza con los datos del formulario. Si el servicio falla, los datos se conservan (CA5). */
  protected calcular(): void {
    if (!this.puedeEnviar()) {
      return;
    }
    const valor = this.formulario.getRawValue();
    const clienteId = this.cliente()?.clienteId;
    this.estado.set('calculando');
    this.api
      .cotizar({
        ramo: 'VIDA_HIPOTECARIO',
        datosBien: {
          // El formulario es válido: los dos son enteros dentro de su rango.
          montoCredito: leerEntero(valor.montoCredito) as number,
          plazoAnios: leerEntero(valor.plazoAnios) as number,
          ciudadInmueble: valor.ciudadInmueble.trim(),
          entidadAcreedora: valor.entidadAcreedora.trim(),
        },
        ...(clienteId ? { clienteId } : {}),
      })
      .subscribe({
        next: (cotizacion) => {
          this.cotizacion.set(cotizacion);
          this.estado.set('resultado');
          this.cotizada.emit(cotizacion);
        },
        error: (error: HttpErrorResponse) => this.alFallar(error),
      });
  }

  /** DATOS_BIEN_INVALIDOS marca los campos que el servicio rechazó; lo demás permite reintentar. */
  private alFallar(error: HttpErrorResponse): void {
    const cuerpo = error.error as Partial<ErrorApi> | null;
    const rechazados = (cuerpo?.campos ?? []).filter((campo): campo is Campo =>
      (CAMPOS_DEL_BIEN as readonly string[]).includes(campo),
    );
    if (error.status === 422 && rechazados.length > 0) {
      for (const campo of rechazados) {
        const control = this.formulario.controls[campo];
        control.setErrors({ ...control.errors, servidor: true });
      }
      this.estado.set('rechazada');
    } else {
      this.estado.set('error');
    }
  }

  private claveDocumento(): string {
    const { tipoDocumento, numeroDocumento } = this.formulario.controls;
    return `${tipoDocumento.value}:${numeroDocumento.value.trim()}`;
  }

  /** Mientras calcula, los campos están deshabilitados: no hay cambios que descartar. */
  private volverAlInicio(): void {
    this.estado.set('inicial');
    this.cotizacion.set(null);
  }

  private mensaje(campo: Campo, clave: string): string {
    if (clave === 'servidor') {
      return $localize`:@@cotizacion.error.servidor:El servicio no aceptó este dato. Revísalo.`;
    }
    switch (`${campo}.${clave}`) {
      case 'numeroDocumento.requerido':
        return $localize`:@@cotizacion.error.documento.requerido:Escribe el número de documento.`;
      case 'numeroDocumento.formato':
        return this.formulario.controls.tipoDocumento.value === 'PA'
          ? $localize`:@@cotizacion.error.documento.formatoPasaporte:Debe tener de 6 a 12 letras o números.`
          : $localize`:@@cotizacion.error.documento.formato:Debe tener de 6 a 10 dígitos.`;
      case 'montoCredito.requerido':
        return $localize`:@@cotizacion.error.monto.requerido:Escribe el monto del crédito.`;
      case 'montoCredito.formato':
        return $localize`:@@cotizacion.error.monto.formato:Escribe solo números.`;
      case 'montoCredito.rango': {
        const minimo = montoCop(RANGOS.montoCredito.minimo, this.idioma);
        const maximo = montoCop(RANGOS.montoCredito.maximo, this.idioma);
        return $localize`:@@cotizacion.error.monto.rango:Debe estar entre ${minimo}:minimo: y ${maximo}:maximo:.`;
      }
      case 'plazoAnios.requerido':
        return $localize`:@@cotizacion.error.plazo.requerido:Escribe el plazo en años.`;
      case 'plazoAnios.formato':
        return $localize`:@@cotizacion.error.plazo.formato:Escribe un número entero de años.`;
      case 'plazoAnios.rango':
        return $localize`:@@cotizacion.error.plazo.rango:Debe estar entre 5 y 30 años.`;
      case 'ciudadInmueble.requerido':
        return $localize`:@@cotizacion.error.ciudad.requerido:Escribe la ciudad del inmueble.`;
      case 'ciudadInmueble.largo':
        return $localize`:@@cotizacion.error.ciudad.largo:Debe tener entre 2 y 80 caracteres.`;
      case 'entidadAcreedora.requerido':
        return $localize`:@@cotizacion.error.entidad.requerido:Escribe la entidad acreedora.`;
      default:
        return $localize`:@@cotizacion.error.entidad.largo:Debe tener entre 2 y 120 caracteres.`;
    }
  }
}
