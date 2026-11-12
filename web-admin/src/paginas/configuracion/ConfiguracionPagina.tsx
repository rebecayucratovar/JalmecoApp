import {
  BellIcon,
  ClockIcon,
  DatabaseIcon,
  FingerprintIcon,
  Loader2Icon,
  LocateFixedIcon,
  TriangleAlertIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useConfiguracion, type Configuracion } from './datos'
import { SeccionAlertas, SeccionGps, SeccionHorario, SeccionHuella, SeccionOdoo } from './Secciones'
import { SeccionCuenta } from './SeccionCuenta'

const SECCIONES = [
  { id: 'horario', titulo: 'Horario y almuerzo', icono: ClockIcon },
  { id: 'huella', titulo: 'Verificación por huella', icono: FingerprintIcon },
  { id: 'gps', titulo: 'Captura GPS', icono: LocateFixedIcon },
  { id: 'alertas', titulo: 'Alertas', icono: BellIcon },
  { id: 'odoo', titulo: 'Odoo y datos', icono: DatabaseIcon },
  { id: 'cuenta', titulo: 'Mi cuenta', icono: UserIcon },
] as const satisfies readonly { id: string; titulo: string; icono: LucideIcon }[]

type IdSeccion = (typeof SECCIONES)[number]['id']

export default function ConfiguracionPagina() {
  const [params, setParams] = useSearchParams()
  const pedida = params.get('seccion')
  const actual: IdSeccion = SECCIONES.some((s) => s.id === pedida) ? (pedida as IdSeccion) : 'horario'
  const consulta = useConfiguracion()
  const config = consulta.data

  // En celular el menú se desliza de lado: que la sección elegida quede a la vista
  const menu = useRef<HTMLUListElement>(null)
  useEffect(() => {
    menu.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [actual])

  return (
    <div className="grid gap-5 p-4 lg:grid-cols-[240px_1fr] lg:gap-6 lg:p-6">
      <nav aria-label="Secciones de configuración" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0">
        <ul ref={menu} className="flex gap-1 lg:sticky lg:top-6 lg:flex-col">
          {SECCIONES.map(({ id, titulo, icono: Icono }) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                aria-current={actual === id ? 'page' : undefined}
                onClick={() => setParams({ seccion: id }, { replace: true })}
                className={cn(
                  'flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  actual === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icono className="size-4 shrink-0" aria-hidden />
                {titulo}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0">
        {/* Mi cuenta no depende de la configuración del sistema */}
        <div hidden={actual !== 'cuenta'}><SeccionCuenta /></div>

        {actual !== 'cuenta' && consulta.isPending && (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Cargando configuración…
          </div>
        )}
        {actual !== 'cuenta' && consulta.isError && (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-12 text-center text-sm">
            <TriangleAlertIcon className="size-6 text-destructive" />
            {consulta.error.message}
            <Button variant="outline" size="sm" onClick={() => consulta.refetch()}>Reintentar</Button>
          </div>
        )}
        {config && (
          // Todas montadas (solo se oculta la que no se ve): no se pierde lo escrito al cambiar de sección.
          // La clave reinicia el formulario cuando cambian los datos guardados.
          <>
            <div hidden={actual !== 'horario'}><SeccionHorario key={clave(config, 'horario')} config={config} /></div>
            <div hidden={actual !== 'huella'}><SeccionHuella key={clave(config, 'huella')} config={config} /></div>
            <div hidden={actual !== 'gps'}><SeccionGps key={clave(config, 'gps')} config={config} /></div>
            <div hidden={actual !== 'alertas'}><SeccionAlertas key={clave(config, 'alertas')} config={config} /></div>
            <div hidden={actual !== 'odoo'}><SeccionOdoo key={clave(config, 'odoo')} config={config} /></div>
          </>
        )}
      </div>
    </div>
  )
}

const CAMPOS_POR_SECCION = {
  horario: ['horario_inicio', 'horario_fin', 'almuerzo'],
  huella: ['verificaciones_por_dia', 'verificacion_limite_min'],
  gps: ['gps_distancia_m', 'gps_intervalo_seg'],
  alertas: ['sin_conexion_min', 'bateria_baja_pct', 'alertas_correos'],
  odoo: ['odoo_sync_min', 'retencion_meses'],
} as const

function clave(config: Configuracion, seccion: keyof typeof CAMPOS_POR_SECCION) {
  return JSON.stringify(CAMPOS_POR_SECCION[seccion].map((c) => config[c]))
}
