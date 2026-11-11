import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { Admin } from '@/lib/api'
import { useSesion } from '@/lib/sesion'

/** GET /config */
export interface Configuracion {
  horario_inicio: string
  horario_fin: string
  almuerzo: { inicio: string; fin: string } | null
  verificaciones_por_dia: number
  verificacion_limite_min: number
  gps_distancia_m: number
  gps_intervalo_seg: number
  sin_conexion_min: number
  bateria_baja_pct: number
  alertas_correos: string
  /** Solo lectura: a quién llegan hoy (los de alertas_correos o los administradores). */
  alertas_destinatarios: string[]
  /** Solo lectura: hay servidor de correo (SMTP) en backend/.env. */
  correo_activo: boolean
  retencion_meses: number
  odoo_sync_min: number
  espejo_odoo_min: number
}

export type CambiosConfiguracion = Partial<Omit<Configuracion, 'alertas_destinatarios' | 'correo_activo'>>

export interface EstadoOdoo {
  url: string | null
  db: string | null
  usuario: string | null
  faltan: string[]
  ultima_sync_ok: string | null
  historial: { id: number; fecha: string; tipo: string; resultado: 'ok' | 'error'; registros: number; mensaje: string | null }[]
}

export function useConfiguracion() {
  const { api } = useSesion()
  return useQuery({ queryKey: ['config'], queryFn: ({ signal }) => api.get<Configuracion>('config', signal) })
}

export function useGuardarConfiguracion() {
  const { api } = useSesion()
  const consultas = useQueryClient()
  return useMutation({
    mutationFn: (cambios: CambiosConfiguracion) => api.put<Configuracion>('config', cambios),
    onSuccess: (config) => {
      consultas.setQueryData(['config'], config)
      toast.success('Cambios guardados')
    },
  })
}

export function useEstadoOdoo() {
  const { api } = useSesion()
  return useQuery({
    queryKey: ['odoo-estado'],
    queryFn: ({ signal }) => api.get<EstadoOdoo>('odoo/estado', signal),
    refetchInterval: 60_000,
  })
}

export function useProbarOdoo() {
  const { api } = useSesion()
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; version?: string; mensaje: string }>('odoo/probar'),
  })
}

export function useGuardarCuenta() {
  const { api } = useSesion()
  return useMutation({
    mutationFn: (datos: Partial<Pick<Admin, 'nombre' | 'email'>>) => api.put<Admin>('mi-cuenta', datos),
    onSuccess: (admin) => api.actualizarSesion({ admin }),
  })
}

export function useCambiarPassword() {
  const { api } = useSesion()
  return useMutation({
    mutationFn: (datos: { actual: string; nueva: string }) =>
      api.post<{ access: string; refresh: string }>('mi-cuenta/password', datos),
    // Esta sesión sigue con los tokens nuevos; las demás quedan cerradas
    onSuccess: (tokens) => api.actualizarSesion(tokens),
  })
}

/** Qué campos cambiaron respecto de los originales (para enviar solo eso). */
export function cambios<T extends object>(original: T, actual: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(actual).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(original[k as keyof T])),
  ) as Partial<T>
}

/** Correos escritos a mano → lista (separados por coma, punto y coma, espacios o saltos de línea). */
export function listaCorreos(texto: string): string[] {
  return texto.split(/[\s,;]+/).filter(Boolean)
}
