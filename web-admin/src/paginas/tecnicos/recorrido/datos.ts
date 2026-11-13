import { useQuery } from '@tanstack/react-query'

import { useSesion } from '@/lib/sesion'

export interface PuntoRecorrido {
  lat: number
  lng: number
  hora: string
  velocidad: number | null
  bateria: number | null
}

export interface Parada {
  lat: number
  lng: number
  inicio: string
  fin: string
  duracion_min: number
}

export interface Recorrido {
  fecha: string
  jornadas: { id: number; inicio: string; fin: string | null; estado: 'activa' | 'cerrada'; cierre_automatico?: boolean }[]
  resumen: { en_jornada_min: number; en_paradas_min: number; paradas: number; distancia_km: number; puntos: number }
  puntos: PuntoRecorrido[]
  paradas: Parada[]
  pausas: { nombre: string; inicio: string; fin: string }[]
}

export { hoyLaPaz, sumarDias } from '@/lib/formato'

export function useRecorrido(id: number, fecha: string) {
  const { api } = useSesion()
  return useQuery({
    queryKey: ['recorrido', id, fecha],
    queryFn: ({ signal }) => api.get<Recorrido>(`tecnicos/${id}/recorrido?fecha=${fecha}`, signal),
    // Hoy con la jornada abierta, se va completando
    refetchInterval: (q) => (q.state.data?.jornadas.some((j) => j.fin == null) ? 30_000 : false),
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior?.queryKey[1] === id ? anterior : undefined, // sin parpadeo al cambiar de día
  })
}
