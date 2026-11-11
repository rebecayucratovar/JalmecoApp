import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { EstadoTecnico } from '@/lib/estados'
import { normalizar } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'

/** TecnicoAdmin del contrato (lista y ficha del panel). */
export interface TecnicoAdmin {
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
  usuario: string
  activo: boolean
  tiene_pin: boolean
  pin_generado_en: string | null
  equipo_modelo: string | null
  equipo_registrado_en: string | null
  odoo_employee_id: number | null
  creado_en: string
}

export interface DatosTecnico {
  nombre: string
  codigo?: string | null
  usuario?: string
  cargo?: string | null
  celular_modelo?: string | null
  celular_numero?: string | null
  activo?: boolean
}

export function useTecnicos() {
  const { api } = useSesion()
  return useQuery({
    queryKey: ['tecnicos'],
    queryFn: ({ signal }) => api.get<{ tecnicos: TecnicoAdmin[] }>('tecnicos', signal).then((r) => r.tecnicos),
    refetchInterval: 30_000, // el estado y la hora de entrada cambian durante el día
  })
}

export function useTecnico(id: number) {
  const { api } = useSesion()
  return useQuery({
    queryKey: ['tecnicos', id],
    queryFn: ({ signal }) => api.get<TecnicoAdmin>(`tecnicos/${id}`, signal),
    refetchInterval: 30_000,
  })
}

/** Al cambiar a alguien se refrescan la lista, su ficha y el mapa. */
function useRefrescar() {
  const consultas = useQueryClient()
  return (t: TecnicoAdmin) => {
    consultas.setQueryData(['tecnicos', t.id], t)
    void consultas.invalidateQueries({ queryKey: ['tecnicos'] })
    void consultas.invalidateQueries({ queryKey: ['mapa-en-vivo'] })
  }
}

export function useGuardarTecnico(id?: number) {
  const { api } = useSesion()
  const refrescar = useRefrescar()
  return useMutation({
    mutationFn: (datos: Partial<DatosTecnico>) =>
      id == null ? api.post<TecnicoAdmin>('tecnicos', datos) : api.put<TecnicoAdmin>(`tecnicos/${id}`, datos),
    onSuccess: refrescar,
  })
}

export function useGenerarPin(id: number) {
  const { api } = useSesion()
  const consultas = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ pin: string; generado_en: string }>(`tecnicos/${id}/pin`),
    onSuccess: () => consultas.invalidateQueries({ queryKey: ['tecnicos'] }),
  })
}

/** Errores por campo que devuelve el backend (400 DATOS_INVALIDOS → detalle). */
export { erroresPorCampo } from '@/lib/api'

/** "+591 71245830" → "+591 712 45830". */
export function formatoCelular(numero: string | null): string {
  if (!numero) return ''
  const m = numero.match(/^\+591 ?(\d{3})(\d{5})$/)
  return m ? `+591 ${m[1]} ${m[2]}` : numero
}

export type Vista = 'activos' | 'sin_pin' | 'inactivos'

export function contarVistas(tecnicos: TecnicoAdmin[]): Record<Vista, number> {
  return {
    activos: tecnicos.filter((t) => t.activo).length,
    sin_pin: tecnicos.filter((t) => t.activo && !t.tiene_pin).length,
    inactivos: tecnicos.filter((t) => !t.activo).length,
  }
}

/** Filtra por vista, estado y texto (nombre, código, usuario, cargo o celular). */
export function filtrarTecnicos(tecnicos: TecnicoAdmin[], vista: Vista, estado: EstadoTecnico | 'todos', busqueda: string) {
  const q = normalizar(busqueda)
  const qDigitos = busqueda.replace(/\D/g, '')
  return tecnicos.filter((t) => {
    if (vista === 'inactivos' ? t.activo : !t.activo) return false
    if (vista === 'sin_pin' && t.tiene_pin) return false
    if (estado !== 'todos' && t.estado_actual !== estado) return false
    if (!q) return true
    const texto = normalizar(`${t.nombre} ${t.codigo ?? ''} ${t.usuario} ${t.cargo ?? ''} ${t.celular_modelo ?? ''}`)
    return texto.includes(q) || (qDigitos.length >= 3 && (t.celular_numero ?? '').replace(/\D/g, '').includes(qDigitos))
  })
}
