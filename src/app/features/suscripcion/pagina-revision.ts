import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { fechaBogota, horaBogota, montoCop, numeroConMiles } from '../../core/idioma/formatos';
import { Idioma, idiomaDe } from '../../core/idioma/idioma';
import {
  CLASE_NIVEL,
  NombreSenal,
  ORDEN_SENALES,
  TramoSenal,
  lecturaSenal,
  nombreSenal,
  textoNivel,
  tramoDe,
} from '../cotizacion/senales';
import {
  Cotizante,
  EstadoSolicitudSuscripcion,
  PerfilRiesgoRevision,
  ReglaRevisionSuscripcion,
  RevisionSolicitud,
} from './modelos';
import { reglaLegible, textoMotivo } from './reglas-legibles';
import { RUTA_BANDEJA } from './rutas';
import { SuscripcionApi } from './suscripcion-api';

type Carga =
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' }
  | { tipo: 'lista'; revision: RevisionSolicitud };

interface Dato {
  etiqueta: string;
  valor: string;
  /** Un dato de apoyo bajo el valor, como el usuario de quien cotizó. */
  detalle?: string;
}

interface ReglaVista {
  codigo: string;
  nombre: string;
  limite: string;
  valor: string;
  resultado: string;
  claseResultado: string;
  sinResolver: boolean;
}

interface SenalVista {
  senal: NombreSenal;
  nombre: string;
  valor: number;
  tramo: TramoSenal;
  lectura: string;
}

/** Cómo se muestra el perfil: el del cliente, el valor por defecto o uno que no coincide. */
type PerfilVista =
  | {
      tipo: 'perfil';
      version: number;
      score: number;
      nivel: string;
      claseNivel: string;
      calculadoFecha: string;
      calculadoHora: string;
      vigenteHasta: string;
      desactualizado: boolean;
      senales: SenalVista[];
    }
  | { tipo: 'sin-perfil'; motivo: PerfilRiesgoRevision['motivoSinPerfil'] }
  | { tipo: 'no-coincide' };

/** Qué se muestra en lugar de la tabla cuando no llegan las reglas. */
type SinReglas = 'sin-evaluar' | 'ilegibles' | null;

const ESTADOS: Record<EstadoSolicitudSuscripcion, () => string> = {
  PENDIENTE_EVALUACION: () => $localize`:@@revision.estado.pendiente:Pendiente de evaluación`,
  EVALUADA: () => $localize`:@@revision.estado.evaluada:Evaluada, sin decisión`,
  ACEPTADA: () => $localize`:@@revision.estado.aceptada:Aceptada`,
  AJUSTADA: () => $localize`:@@revision.estado.ajustada:Ajustada`,
  RECHAZADA: () => $localize`:@@revision.estado.rechazada:Rechazada`,
  EN_REVISION: () => $localize`:@@revision.estado.enRevision:En revisión`,
};

const CLASE_ESTADO: Record<EstadoSolicitudSuscripcion, string> = {
  PENDIENTE_EVALUACION: 'chip-gris',
  EVALUADA: 'chip-gris',
  ACEPTADA: 'chip-verde',
  AJUSTADA: 'chip-verde-azulado',
  RECHAZADA: 'chip-rojo',
  EN_REVISION: 'chip-ambar',
};

function producto(ramo: string): string {
  return ramo === 'VIDA_HIPOTECARIO' ? $localize`:@@oferta.vidaHipotecario:Vida hipotecario` : ramo;
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function canal(c: RevisionSolicitud['canal']): string {
  switch (c) {
    case 'web':
      return $localize`:@@revision.canal.web:Portal web`;
    case 'movil':
      return $localize`:@@revision.canal.movil:App móvil`;
    default:
      return $localize`:@@revision.canal.socio:Socio`;
  }
}

/** Quién cotizó: el rol en palabras y su usuario abreviado. El nombre no se registra. */
function cotizadaPor(cotizante: Cotizante | undefined): Pick<Dato, 'valor' | 'detalle'> {
  if (!cotizante) {
    return { valor: $localize`:@@revision.cotizada.sinUsuario:No registrado` };
  }
  const usuario = cotizante.id.slice(0, 8);
  const detalle = $localize`:@@revision.cotizada.usuario:Usuario ${usuario}:usuario:`;
  switch (cotizante.rol) {
    case 'ASESOR':
      return { valor: $localize`:@@revision.cotizada.asesor:Un asesor`, detalle };
    case 'CLIENTE':
      return { valor: $localize`:@@revision.cotizada.cliente:El mismo cliente`, detalle };
    default:
      return { valor: cotizante.rol, detalle };
  }
}

function datos(r: RevisionSolicitud, idioma: Idioma): Dato[] {
  const monto = numero(r.cobertura.datosBien['montoCredito']);
  const plazo = numero(r.cobertura.datosBien['plazoAnios']);
  const prima = montoCop(r.prima, idioma);
  const anios = plazo === null ? '' : numeroConMiles(plazo, idioma);
  return [
    { etiqueta: $localize`:@@revision.dato.producto:Producto`, valor: producto(r.cobertura.ramo) },
    {
      etiqueta: $localize`:@@revision.dato.sumaAsegurada:Suma asegurada`,
      valor: monto === null ? '—' : montoCop(monto, idioma),
    },
    {
      etiqueta: $localize`:@@revision.dato.plazo:Plazo`,
      valor: plazo === null ? '—' : $localize`:@@revision.dato.plazoValor:${anios}:anios: años`,
    },
    {
      etiqueta: $localize`:@@revision.dato.prima:Prima ofertada`,
      valor:
        r.periodicidad === 'MENSUAL'
          ? $localize`:@@revision.dato.primaMensual:${prima}:prima: / mes`
          : prima,
    },
    {
      etiqueta: $localize`:@@revision.dato.cotizadaPor:Cotizada por`,
      ...cotizadaPor(r.cotizadaPor),
    },
    { etiqueta: $localize`:@@revision.dato.canal:Canal`, valor: canal(r.canal) },
    {
      etiqueta: $localize`:@@revision.dato.aceptada:Oferta aceptada`,
      valor: fechaBogota(r.aceptadaEn, idioma),
      detalle: horaBogota(r.aceptadaEn, idioma),
    },
  ];
}

function regla(r: ReglaRevisionSuscripcion, idioma: Idioma): ReglaVista {
  const legible = reglaLegible(r, idioma);
  return {
    codigo: r.codigo,
    nombre: legible.nombre,
    limite: legible.limite,
    valor: legible.valor,
    resultado: r.sinResolver
      ? $localize`:@@revision.regla.sinResolver:Sin resolver`
      : legible.resultado,
    claseResultado: r.sinResolver ? 'chip-ambar' : legible.claseResultado,
    sinResolver: r.sinResolver,
  };
}

function perfil(p: PerfilRiesgoRevision, idioma: Idioma): PerfilVista {
  if (!p.coincide) {
    return { tipo: 'no-coincide' };
  }
  const usado = p.perfil;
  if (!usado) {
    return { tipo: 'sin-perfil', motivo: p.motivoSinPerfil };
  }
  return {
    tipo: 'perfil',
    version: usado.version,
    score: usado.score,
    nivel: textoNivel(usado.nivel),
    claseNivel: CLASE_NIVEL[usado.nivel],
    calculadoFecha: fechaBogota(usado.calculadoEn, idioma),
    calculadoHora: horaBogota(usado.calculadoEn, idioma),
    vigenteHasta: fechaBogota(usado.vigenteHasta, idioma),
    desactualizado: p.desactualizado === true,
    senales: ORDEN_SENALES.map((senal): SenalVista => {
      const valor = usado.senales[senal];
      const tramo = tramoDe(valor);
      return {
        senal,
        nombre: nombreSenal(senal),
        valor,
        tramo,
        lectura: lecturaSenal(senal, tramo),
      };
    }),
  };
}

/**
 * Detalle de revisión de una solicitud (SOLVENTAG5-53): lo que el analista de riesgo necesita para
 * decidir una solicitud que la decisión automática dejó en revisión. Se abre con «Revisar» desde la
 * bandeja (SOLVENTAG5-52). Muestra los datos de la solicitud y quién la cotizó, las reglas evaluadas
 * con las que quedaron sin resolver, y las señales del perfil con que se cotizó, todo tal como quedó
 * registrado. Solo lee: registrar la decisión es de la SOLVENTAG5-54. Un registro que no se puede
 * verificar, un perfil desactualizado o que no coincide, y una solicitud que ya no está en revisión
 * se indican en vez de ocultarse.
 */
@Component({
  selector: 'app-pagina-revision',
  imports: [RouterLink],
  templateUrl: './pagina-revision.html',
  styleUrl: './pagina-revision.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginaRevision {
  readonly solicitudId = input.required<string>();

  private readonly api = inject(SuscripcionApi);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private consulta?: Subscription;

  protected readonly rutaBandeja = RUTA_BANDEJA;
  protected readonly carga = signal<Carga>({ tipo: 'cargando' });

  protected readonly vista = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return null;
    }
    const r = carga.revision;
    const enRevision = r.estado === 'EN_REVISION';
    const reglas = (r.reglasEvaluadas ?? []).map((x) => regla(x, this.idioma));
    const sinResolver = reglas.filter((x) => x.sinResolver).map((x) => x.nombre);
    const determinantes = (r.reglasEvaluadas ?? [])
      .filter((x) => x.determinante === true)
      .map((x) => reglaLegible(x, this.idioma).nombre);
    let sinReglas: SinReglas = null;
    if (!r.reglasEvaluadas) {
      sinReglas = r.estado === 'PENDIENTE_EVALUACION' ? 'sin-evaluar' : 'ilegibles';
    }
    return {
      codigo: r.solicitudId.slice(0, 8),
      solicitudId: r.solicitudId,
      cliente: r.cliente ? `${r.cliente.nombres} ${r.cliente.apellidos}` : null,
      documento: r.cliente?.documentoEnmascarado ?? null,
      estado: ESTADOS[r.estado](),
      claseEstado: CLASE_ESTADO[r.estado],
      enRevision,
      datos: datos(r, this.idioma),
      noVerificable: r.registrosVerificables === false,
      motivo: r.decision
        ? textoMotivo(r.decision.motivo, enRevision ? sinResolver : determinantes)
        : null,
      versionReglas: r.versionReglas ?? null,
      reglas,
      sinReglas,
      perfil: perfil(r.perfilRiesgo, this.idioma),
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.consulta?.unsubscribe());
    effect(() => {
      const id = this.solicitudId();
      untracked(() => this.cargar(id));
    });
  }

  protected reintentar(): void {
    this.cargar(this.solicitudId());
  }

  private cargar(id: string): void {
    this.consulta?.unsubscribe();
    this.carga.set({ tipo: 'cargando' });
    this.consulta = this.api.obtenerRevision(id).subscribe({
      next: (revision) => this.carga.set({ tipo: 'lista', revision }),
      error: (error: HttpErrorResponse) =>
        this.carga.set({ tipo: error.status === 404 ? 'no-encontrada' : 'error' }),
    });
  }
}
