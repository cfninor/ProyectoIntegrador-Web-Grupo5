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
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { fechaBogota, horaBogota } from '../../core/idioma/formatos';
import { idiomaDe } from '../../core/idioma/idioma';
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
import { PerfilRiesgoSolicitud } from './modelos';
import { SuscripcionApi } from './suscripcion-api';

type Carga =
  | { tipo: 'inicial' }
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrada' }
  | { tipo: 'no-coincide' }
  | { tipo: 'error' }
  | { tipo: 'lista'; perfil: PerfilRiesgoSolicitud };

interface SenalVista {
  senal: NombreSenal;
  nombre: string;
  valor: number;
  tramo: TramoSenal;
  lectura: string;
}

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RUTA_PERFIL_RIESGO = '/riesgo/perfil-riesgo';

function formatoUuid(control: AbstractControl<string>): ValidationErrors | null {
  return PATRON_UUID.test(control.value.trim()) ? null : { formato: true };
}

@Component({
  selector: 'app-pagina-perfil-riesgo',
  imports: [ReactiveFormsModule],
  templateUrl: './pagina-perfil-riesgo.html',
  styleUrl: './pagina-perfil-riesgo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginaPerfilRiesgo {
  readonly solicitudId = input<string>();

  private readonly api = inject(SuscripcionApi);
  private readonly router = inject(Router);
  private readonly idioma = idiomaDe(inject(LOCALE_ID));
  private consulta?: Subscription;

  protected readonly campoSolicitud = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, formatoUuid],
  });
  protected readonly formulario = new FormGroup({ solicitud: this.campoSolicitud });
  protected readonly enviado = signal(false);
  protected readonly carga = signal<Carga>({ tipo: 'inicial' });

  protected readonly vista = computed(() => {
    const carga = this.carga();
    if (carga.tipo !== 'lista') {
      return null;
    }
    const resultado = carga.perfil;
    const perfil = resultado.perfil;
    return {
      solicitudId: resultado.solicitudId,
      cotizacionId: resultado.cotizacionId,
      motivoSinPerfil: resultado.motivoSinPerfil,
      perfil: perfil
        ? {
            perfilId: perfil.perfilId,
            version: perfil.version,
            score: perfil.score,
            nivel: textoNivel(perfil.nivel),
            claseNivel: CLASE_NIVEL[perfil.nivel],
            calculadoFecha: fechaBogota(perfil.calculadoEn, this.idioma),
            calculadoHora: horaBogota(perfil.calculadoEn, this.idioma),
            vigenteHasta: fechaBogota(perfil.vigenteHasta, this.idioma),
            senales: ORDEN_SENALES.map((senal): SenalVista => {
              const valor = perfil.senales[senal];
              const tramo = tramoDe(valor);
              return {
                senal,
                nombre: nombreSenal(senal),
                valor,
                tramo,
                lectura: lecturaSenal(senal, tramo),
              };
            }),
          }
        : null,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.consulta?.unsubscribe());
    effect(() => {
      const id = this.solicitudId();
      untracked(() => {
        if (id) {
          this.campoSolicitud.setValue(id);
          this.cargar(id);
        } else {
          this.consulta?.unsubscribe();
          this.carga.set({ tipo: 'inicial' });
        }
      });
    });
  }

  protected campoInvalido(): boolean {
    return this.enviado() && this.campoSolicitud.invalid;
  }

  protected consultar(): void {
    this.enviado.set(true);
    if (this.campoSolicitud.invalid) {
      return;
    }
    const id = this.campoSolicitud.value.trim().toLowerCase();
    if (id === this.solicitudId()) {
      this.cargar(id);
      return;
    }
    void this.router.navigateByUrl(`${RUTA_PERFIL_RIESGO}/${id}`);
  }

  protected reintentar(): void {
    const id = this.solicitudId();
    if (id) {
      this.cargar(id);
    }
  }

  private cargar(id: string): void {
    this.consulta?.unsubscribe();
    this.carga.set({ tipo: 'cargando' });
    this.consulta = this.api.obtenerPerfilRiesgo(id).subscribe({
      next: (perfil) => this.carga.set({ tipo: 'lista', perfil }),
      error: (error: HttpErrorResponse) => this.carga.set({ tipo: this.tipoDeError(error) }),
    });
  }

  private tipoDeError(error: HttpErrorResponse): 'no-encontrada' | 'no-coincide' | 'error' {
    if (error.status === 404) {
      return 'no-encontrada';
    }
    return error.status === 409 ? 'no-coincide' : 'error';
  }
}
