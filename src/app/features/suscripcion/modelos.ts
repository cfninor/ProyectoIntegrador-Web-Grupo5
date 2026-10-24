import { MotivoSinPerfil, PerfilUsado } from '../cotizacion/modelos';

export type OrigenPerfil = 'PERFIL' | 'VALOR_POR_DEFECTO';

export interface PerfilRiesgoSolicitud {
  solicitudId: string;
  cotizacionId: string;
  origen: OrigenPerfil;
  perfil?: PerfilUsado;
  motivoSinPerfil?: MotivoSinPerfil;
}
