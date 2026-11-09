import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, map } from 'rxjs';

import { fechaBogota, horaBogota, montoCop, numeroConMiles } from '../../core/idioma/formatos';
import { Idioma, idiomaDe } from '../../core/idioma/idioma';
import { BandejaRevision, SolicitudEnRevision } from './modelos';
import { RUTA_PERFIL_RIESGO } from './pagina-perfil-riesgo';
import { RUTA_BANDEJA, RUTA_REVISION } from './rutas';
import { reglaLegible, textoMotivo } from './reglas-legibles';
import { SuscripcionApi } from './suscripcion-api';

export { RUTA_BANDEJA };

/** Solicitudes por página: el tamaño por defecto del contrato. */
export const TAMANO_PAGINA = 20;

type Carga = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'lista'; bandeja: BandejaRevision };

interface FilaBandeja {
  solicitudId: string;
  /** Los primeros ocho caracteres del id, para reconocerla en la tabla. */
  codigo: string;
  cliente: string | null;
  documento: string | null;
  producto: string;
  sumaAsegurada: string | null;
  /** Una línea por regla sin resolver: «Suma asegurada: $ 950.000.000 (límite: Máximo …)». */
  reglas: string[];
  /** Sin reglas sin resolver: el motivo general, o que no se pudo leer. */
  motivo: string | null;
  sinVerificar: boolean;
  recibidaFecha: string;
  recibidaHora: string;
  rutaPerfil: string;
  /** El nombre accesible de «Ver perfil», con el código de la solicitud. */
  etiquetaPerfil: string;
  /** El detalle de revisión de la solicitud (SOLVENTAG5-53). */
  rutaRevision: string;
  /** El nombre accesible de «Revisar», con el código de la solicitud. */
  etiquetaRevision: string;
}

/** La página pedida en `?pagina=`: un entero desde 1; cualquier otro valor es la primera. */
export function paginaDe(valor: string | undefined): number {
  const pagina = Number(valor);
  return Number.isInteger(pagina) && pagina >= 1 ? pagina : 1;
}

function producto(ramo: string): string {
  return ramo === 'VIDA_HIPOTECARIO' ? $localize`:@@oferta.vidaHipotecario:Vida hipotecario` : ramo;
}

function fila(s: SolicitudEnRevision, idioma: Idioma): FilaBandeja {
  const codigo = s.solicitudId.slice(0, 8);
  const monto = s.cobertura.datosBien['montoCredito'];
  const reglas = (s.reglasSinResolver ?? []).map((r) => {
    const legible = reglaLegible(r, idioma);
    return $localize`:@@bandeja.motivo.regla:${legible.nombre}:nombre:: ${legible.valor}:valor: (límite: ${legible.limite}:limite:)`;
  });
  let motivo: string | null = null;
  if (s.motivo === undefined) {
    motivo = $localize`:@@bandeja.motivo.ilegible:No pudimos leer el motivo en el registro de la decisión.`;
  } else if (reglas.length === 0) {
    motivo = textoMotivo(s.motivo, []);
  }
  return {
    solicitudId: s.solicitudId,
    codigo,
    cliente: s.cliente ? `${s.cliente.nombres} ${s.cliente.apellidos}` : null,
    documento: s.cliente?.documentoEnmascarado ?? null,
    producto: producto(s.cobertura.ramo),
    sumaAsegurada:
      typeof monto === 'number' && Number.isFinite(monto) ? montoCop(monto, idioma) : null,
    reglas,
    motivo,
    sinVerificar: !s.registrosVerificables,
    recibidaFecha: fechaBogota(s.enRevisionDesde, idioma),
    recibidaHora: horaBogota(s.enRevisionDesde, idioma),
    rutaPerfil: `${RUTA_PERFIL_RIESGO}/${s.solicitudId}`,
    etiquetaPerfil: $localize`:@@bandeja.verPerfil.etiqueta:Ver el perfil de riesgo de la solicitud ${codigo}:codigo:`,
    rutaRevision: `${RUTA_REVISION}/${s.solicitudId}`,
    etiquetaRevision: $localize`:@@bandeja.revisar.etiqueta:Revisar la solicitud ${codigo}:codigo:`,
  };
}

/**
 * Bandeja de suscripción asistida (SOLVENTAG5-52): las solicitudes que la decisión automática dejó
 * en revisión, de la que lleva más tiempo esperando a la más reciente, con el motivo que sale de
 * su registro y el total de pendientes. Solo lee: «Revisar» abre el detalle de revisión de cada
 * solicitud (SOLVENTAG5-53), y la decisión del analista es de la SOLVENTAG5-54. La página va en `?pagina=`: se lee de la ruta y no como input, porque
 * `pagina` ya es la clave de los datos de la barra superior (`datosPagina`).
 */
@Component({
  selector: 'app-pagina-bandeja',
  imports: [RouterLink],
  templateUrl: './pagina-bandeja.html',
  styleUrl: './pagina-bandeja.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginaBandeja {
  private readonly api = inject(SuscripcionApi);
  private readonly router = inject(Router);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private consulta?: Subscription;
  private readonly paginaRuta = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((p) => p.get('pagina') ?? undefined)),
  );

  protected readonly carga = signal<Carga>({ tipo: 'cargando' });
  protected readonly numeroPagina = computed(() => paginaDe(this.paginaRuta()));

  protected readonly vista = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return null;
    }
    const { solicitudes, total, pagina, tamano } = carga.bandeja;
    const desde = (pagina - 1) * tamano + 1;
    const hasta = desde + solicitudes.length - 1;
    return {
      total,
      totalTexto: numeroConMiles(total, this.idioma),
      filas: solicitudes.map((s) => fila(s, this.idioma)),
      desde: numeroConMiles(desde, this.idioma),
      hasta: numeroConMiles(hasta, this.idioma),
      hayAnterior: pagina > 1,
      haySiguiente: pagina * tamano < total,
      pagina,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.consulta?.unsubscribe());
    effect(() => {
      const pagina = this.numeroPagina();
      untracked(() => this.cargar(pagina));
    });
  }

  protected reintentar(): void {
    this.cargar(this.numeroPagina());
  }

  protected irA(pagina: number): void {
    void this.router.navigate([RUTA_BANDEJA], {
      queryParams: { pagina: pagina > 1 ? pagina : null },
    });
  }

  private cargar(pagina: number): void {
    this.consulta?.unsubscribe();
    this.carga.set({ tipo: 'cargando' });
    this.consulta = this.api.listarEnRevision(pagina, TAMANO_PAGINA).subscribe({
      next: (bandeja) => this.carga.set({ tipo: 'lista', bandeja }),
      error: () => this.carga.set({ tipo: 'error' }),
    });
  }
}
