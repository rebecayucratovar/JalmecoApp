import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BatteryLowIcon,
  FingerprintIcon,
  LocateOffIcon,
  SmartphoneIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react'

import { useSesion } from './sesion'

export type TipoAlerta = 'sin_conexion' | 'bateria_baja' | 'verificacion_no_realizada' | 'cambio_equipo' | 'seguimiento_detenido'

export const TIPOS_ALERTA: Record<TipoAlerta, { etiqueta: string; icono: LucideIcon; color: string }> = {
  sin_conexion: { etiqueta: 'Sin conexión', icono: WifiOffIcon, color: '#dc2626' },
  bateria_baja: { etiqueta: 'Batería baja', icono: BatteryLowIcon, color: '#d97706' },
  verificacion_no_realizada: { etiqueta: 'Verificación no realizada', icono: FingerprintIcon, color: '#7c3aed' },
  cambio_equipo: { etiqueta: 'Cambio de equipo', icono: SmartphoneIcon, color: '#0185b6' },
  seguimiento_detenido: { etiqueta: 'Seguimiento detenido', icono: LocateOffIcon, color: '#dc2626' },
}

export function infoTipo(tipo: string) {
  return TIPOS_ALERTA[tipo as TipoAlerta] ?? { etiqueta: tipo, icono: WifiOffIcon, color: '#64748b' }
}

export interface Alerta {
  id: number
  tecnico: { id: number; nombre: string; codigo: string | null; cargo: string | null; celular_numero: string | null; en_jornada: boolean }
  tipo: TipoAlerta
  mensaje: string | null
  nivel: 'info' | 'advertencia' | 'critico'
  creada_en: string
  estado: 'nueva' | 'atendida'
  atendida_por: string | null
  atendida_en: string | null
}

export interface ResumenAlertas {
  nuevas: number
  criticas: number
  ultimas: Alerta[]
}

/** Alertas nuevas (campana y menú). Se consulta cada 30 s. */
export function useResumenAlertas() {
  const { api, admin } = useSesion()
  return useQuery({
    queryKey: ['alertas-resumen'],
    queryFn: ({ signal }) => api.get<ResumenAlertas>('alertas/resumen', signal),
    refetchInterval: 30_000,
    enabled: admin != null,
  })
}

function useRefrescarAlertas() {
  const consultas = useQueryClient()
  return () => {
    void consultas.invalidateQueries({ queryKey: ['alertas'] })
    void consultas.invalidateQueries({ queryKey: ['alertas-resumen'] })
  }
}

export function useAtenderAlerta() {
  const { api } = useSesion()
  const refrescar = useRefrescarAlertas()
  return useMutation({ mutationFn: (id: number) => api.post<Alerta>(`alertas/${id}/atender`), onSuccess: refrescar })
}

export function useAtenderVarias() {
  const { api } = useSesion()
  const refrescar = useRefrescarAlertas()
  return useMutation({
    mutationFn: (ids: number[]) => api.post<{ atendidas: number }>('alertas/atender-todas', { ids }),
    onSuccess: refrescar,
  })
}
