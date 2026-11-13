import { BellIcon, LayoutGridIcon, MapIcon, SettingsIcon, UsersIcon, type LucideIcon } from 'lucide-react'

export interface Seccion {
  ruta: string
  titulo: string
  icono: LucideIcon
  /** Qué tendrá la pantalla (se muestra mientras se construye). */
  descripcion: string
}

/** Menú lateral del panel (en este orden). */
export const SECCIONES: Seccion[] = [
  {
    ruta: '/',
    titulo: 'Inicio',
    icono: LayoutGridIcon,
    descripcion: 'Resumen del día: personal en jornada, sin conexión, alertas activas y horas en campo.',
  },
  {
    ruta: '/mapa',
    titulo: 'Mapa en vivo',
    icono: MapIcon,
    descripcion: 'Dónde está cada persona en jornada, con su estado y batería. Se actualiza cada 10 segundos.',
  },
  {
    ruta: '/tecnicos',
    titulo: 'Técnicos',
    icono: UsersIcon,
    descripcion: 'Lista del personal, celular asignado y detectado, PIN de acceso y recorrido de cada día.',
  },
  {
    ruta: '/alertas',
    titulo: 'Alertas',
    icono: BellIcon,
    descripcion: 'Bandeja de alertas: sin conexión, batería baja, huella no realizada, cambio de equipo y seguimiento detenido.',
  },
  {
    ruta: '/configuracion',
    titulo: 'Configuración',
    icono: SettingsIcon,
    descripcion: 'Horario y almuerzo, verificación por huella, captura GPS, umbrales y correos de alertas, Odoo y tu cuenta.',
  },
]

export function seccionDe(ruta: string): Seccion | undefined {
  return SECCIONES.find((s) => (s.ruta === '/' ? ruta === '/' : ruta === s.ruta || ruta.startsWith(`${s.ruta}/`)))
}
