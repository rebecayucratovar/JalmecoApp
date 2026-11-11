import { useQuery } from '@tanstack/react-query'

import type { EstadoTecnico } from '@/lib/estados'
import { normalizar } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'

/** TecnicoResumen + jornada_inicio (GET /mapa-en-vivo). Fuera de jornada: sin ubicación. */
export interface TecnicoMapa {
  id: number
  codigo: string | null
  nombre: string
  cargo: string | null
  foto_url: string | null
  estado_actual: EstadoTecnico
  ultima_lat: number | null
  ultima_lng: number | null
  ultima_bateria: number | null
  ultima_velocidad: number | null
  ultima_actualizacion: string | null
  celular_modelo: string | null
  celular_numero: string | null
  jornada_inicio: string | null
}

export interface RespuestaMapa {
  actualizado_en: string
  tecnicos: TecnicoMapa[]
}

export const INTERVALO_MAPA_MS = 10_000

/** Consulta el mapa cada 10 s (solo mientras la pestaña está visible). */
export function useMapaEnVivo() {
  const { api } = useSesion()
  return useQuery({
    queryKey: ['mapa-en-vivo'],
    queryFn: ({ signal }) => api.get<RespuestaMapa>('mapa-en-vivo', signal),
    refetchInterval: INTERVALO_MAPA_MS,
  })
}

export type Filtro = 'todos' | EstadoTecnico

export function tieneUbicacion(t: TecnicoMapa): t is TecnicoMapa & { ultima_lat: number; ultima_lng: number } {
  return t.ultima_lat != null && t.ultima_lng != null
}

export function contarPorEstado(tecnicos: TecnicoMapa[]): Record<Filtro, number> {
  const cuenta: Record<Filtro, number> = { todos: tecnicos.length, en_trayecto: 0, en_parada: 0, sin_conexion: 0, fuera_jornada: 0 }
  for (const t of tecnicos) cuenta[t.estado_actual] = (cuenta[t.estado_actual] ?? 0) + 1
  return cuenta
}

/** Filtra por estado y por texto (nombre, código o cargo; sin importar tildes). */
export function filtrar(tecnicos: TecnicoMapa[], filtro: Filtro, busqueda: string): TecnicoMapa[] {
  const q = normalizar(busqueda)
  return tecnicos.filter(
    (t) =>
      (filtro === 'todos' || t.estado_actual === filtro) &&
      (!q || normalizar(`${t.nombre} ${t.codigo ?? ''} ${t.cargo ?? ''}`).includes(q)),
  )
}
