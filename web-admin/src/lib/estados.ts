/** Estados del personal (los calcula el sistema). "En punto de trabajo" y "En sucursal" son Fase 2. */

export type EstadoTecnico = 'en_trayecto' | 'en_parada' | 'sin_conexion' | 'fuera_jornada'

export interface InfoEstado {
  etiqueta: string
  /** Color del marcador y del punto (se usa como CSS). */
  color: string
}

export const ESTADOS: Record<EstadoTecnico, InfoEstado> = {
  en_trayecto: { etiqueta: 'En trayecto', color: '#2563eb' },
  en_parada: { etiqueta: 'En parada', color: '#d97706' },
  sin_conexion: { etiqueta: 'Sin conexión', color: '#dc2626' },
  fuera_jornada: { etiqueta: 'Fuera de jornada', color: '#94a3b8' },
}

/** Orden de los filtros y de la leyenda. */
export const ORDEN_ESTADOS: EstadoTecnico[] = ['en_trayecto', 'en_parada', 'sin_conexion', 'fuera_jornada']

export function infoEstado(estado: string): InfoEstado {
  return ESTADOS[estado as EstadoTecnico] ?? ESTADOS.fuera_jornada
}
