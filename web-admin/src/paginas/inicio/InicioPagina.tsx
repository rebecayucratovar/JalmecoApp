import { useQuery } from '@tanstack/react-query'
import {
  BatteryLowIcon,
  BellIcon,
  CheckCheckIcon,
  ChevronRightIcon,
  FingerprintIcon,
  KeyRoundIcon,
  Loader2Icon,
  MapPinIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { ESTADOS } from '@/lib/estados'
import { haceCuanto, hora, iniciales } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { useAhora } from '@/lib/useAhora'
import { cn } from '@/lib/utils'

import { GraficoHoras } from './GraficoHoras'

export interface Dashboard {
  actualizado_en: string
  personal: {
    activos: number
    en_jornada: number
    en_trayecto: number
    en_parada: number
    sin_conexion: number
    trabajaron_hoy: number
    sin_pin: number
  }
  alertas: { nuevas: number; criticas: number; hoy: number }
  verificaciones_hoy: { pedidas: number; exito: number; no_realizadas: number; pendientes: number }
  atencion: {
    id: number
    nombre: string
    codigo: string | null
    motivos: ('sin_conexion' | 'bateria_baja')[]
    ultima_bateria: number | null
    ultima_actualizacion: string | null
  }[]
  horas_campo: { fecha: string; horas: number; personas: number }[]
}

export default function InicioPagina() {
  const { api } = useSesion()
  const ahora = useAhora(30_000)
  const consulta = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api.get<Dashboard>('dashboard', signal),
    refetchInterval: 30_000,
  })

  if (consulta.isPending) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Cargando resumen…
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <TriangleAlertIcon className="size-6 text-destructive" />
        {consulta.error.message}
        <Button variant="outline" size="sm" onClick={() => consulta.refetch()}>Reintentar</Button>
      </div>
    )
  }

  const { personal: p, alertas, verificaciones_hoy: v, atencion, horas_campo } = consulta.data

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
      <p className="text-xs text-muted-foreground">
        Personal en vivo · actualizado a las {hora(consulta.data.actualizado_en)} · se actualiza cada 30 s
      </p>

      {/* Personal ahora */}
      <section aria-label="Personal ahora" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador a="/mapa" etiqueta="En jornada" valor={p.en_jornada} detalle={`de ${p.activos} con la app`} destacado />
        <Indicador a="/mapa" etiqueta={ESTADOS.en_trayecto.etiqueta} color={ESTADOS.en_trayecto.color} valor={p.en_trayecto} detalle="en movimiento" />
        <Indicador a="/mapa" etiqueta={ESTADOS.en_parada.etiqueta} color={ESTADOS.en_parada.color} valor={p.en_parada} detalle="quietos en un lugar" />
        <Indicador a="/mapa" etiqueta={ESTADOS.sin_conexion.etiqueta} color={ESTADOS.sin_conexion.color} valor={p.sin_conexion}
          detalle="en jornada, sin datos" alerta={p.sin_conexion > 0} />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Tarjeta titulo="Alertas sin atender" icono={BellIcon} a="/alertas" enlace="Ver bandeja">
          <div className="flex items-baseline gap-2">
            <span className={cn('text-3xl font-semibold tabular-nums', alertas.nuevas > 0 && 'text-aviso')}>{alertas.nuevas}</span>
            <span className="text-sm text-muted-foreground">{alertas.nuevas === 1 ? 'nueva' : 'nuevas'}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {alertas.criticas > 0 ? (
              <span className="font-medium text-destructive">{alertas.criticas} {alertas.criticas === 1 ? 'crítica' : 'críticas'}</span>
            ) : (
              'Ninguna crítica'
            )}
            {' · '}
            {alertas.hoy} {alertas.hoy === 1 ? 'generada' : 'generadas'} hoy
          </p>
        </Tarjeta>

        <Tarjeta titulo="Verificaciones de huella hoy" icono={FingerprintIcon}>
          <Verificaciones v={v} />
        </Tarjeta>

        <Tarjeta titulo="Personal" icono={KeyRoundIcon} a={p.sin_pin > 0 ? '/tecnicos?vista=sin_pin' : '/tecnicos'}
          enlace={p.sin_pin > 0 ? 'Generar PIN' : 'Ver personal'}>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{p.trabajaron_hoy}</span>
            <span className="text-sm text-muted-foreground">{p.trabajaron_hoy === 1 ? 'persona marcó' : 'personas marcaron'} entrada hoy</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.sin_pin > 0 ? (
              <span className="font-medium text-aviso">{p.sin_pin} sin PIN: aún no pueden entrar a la app</span>
            ) : (
              'Todos tienen PIN para la app'
            )}
          </p>
        </Tarjeta>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Tarjeta titulo="Necesitan atención" icono={TriangleAlertIcon} className="lg:col-span-1">
          {atencion.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCheckIcon className="size-7 text-exito" />
              <p className="text-sm text-muted-foreground">
                {p.en_jornada ? 'Todo el personal en jornada está conectado y con batería.' : 'Nadie está en jornada ahora.'}
              </p>
            </div>
          ) : (
            <ul className="-mx-2 divide-y">
              {atencion.map((t) => (
                <li key={t.id}>
                  <Link to={`/mapa?tecnico=${t.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{iniciales(t.nombre)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.nombre}</span>
                      <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {t.motivos.includes('sin_conexion') && (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <WifiOffIcon className="size-3.5" aria-hidden /> Sin conexión
                            {t.ultima_actualizacion && ` · ${haceCuanto(t.ultima_actualizacion, ahora)}`}
                          </span>
                        )}
                        {t.motivos.includes('bateria_baja') && (
                          <span className="inline-flex items-center gap-1 text-aviso">
                            <BatteryLowIcon className="size-3.5" aria-hidden /> Batería {t.ultima_bateria}%
                          </span>
                        )}
                      </span>
                    </span>
                    <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Ver en el mapa" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Horas en campo · últimos 7 días" className="lg:col-span-2">
          <GraficoHoras dias={horas_campo} />
        </Tarjeta>
      </div>
    </div>
  )
}

function Indicador({ a, etiqueta, valor, detalle, color, destacado, alerta }: {
  a: string
  etiqueta: string
  valor: number
  detalle: string
  color?: string
  destacado?: boolean
  alerta?: boolean
}) {
  return (
    <Link
      to={a}
      className={cn(
        'group rounded-xl border bg-card p-4 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring',
        destacado && 'border-transparent bg-marino text-white dark:bg-primary/15 dark:text-foreground',
        alerta && 'border-destructive/40',
      )}
    >
      <p className={cn('flex items-center gap-2 text-sm font-medium', destacado ? 'text-white/80 dark:text-muted-foreground' : 'text-muted-foreground')}>
        {color && <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />}
        {etiqueta}
      </p>
      <p className={cn('mt-2 text-3xl font-semibold tabular-nums', alerta && 'text-destructive')}>{valor}</p>
      <p className={cn('mt-0.5 text-xs', destacado ? 'text-white/70 dark:text-muted-foreground' : 'text-muted-foreground')}>{detalle}</p>
    </Link>
  )
}

function Tarjeta({ titulo, icono: Icono, a, enlace, children, className }: {
  titulo: string
  icono?: typeof BellIcon
  a?: string
  enlace?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col rounded-xl border bg-card p-5', className)}>
      <div className="mb-4 flex items-center gap-2">
        {Icono && <Icono className="size-4 text-muted-foreground" aria-hidden />}
        <h2 className="flex-1 text-sm font-semibold">{titulo}</h2>
        {a && enlace && (
          <Link to={a} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
            {enlace} <ChevronRightIcon className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function Verificaciones({ v }: { v: Dashboard['verificaciones_hoy'] }) {
  if (v.pedidas === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Todavía no se pidió ninguna hoy. Se sortean durante la jornada.</p>
  }
  const partes = [
    { clave: 'exito', etiqueta: 'Confirmadas', n: v.exito, clase: 'bg-exito' },
    { clave: 'no', etiqueta: 'No realizadas', n: v.no_realizadas, clase: 'bg-destructive' },
    { clave: 'pend', etiqueta: 'Esperando', n: v.pendientes, clase: 'bg-muted-foreground/40' },
  ]
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{v.exito}</span>
        <span className="text-sm text-muted-foreground">de {v.pedidas} confirmadas</span>
      </div>
      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {partes.filter((x) => x.n > 0).map((x) => (
          <div key={x.clave} className={x.clase} style={{ flexGrow: x.n }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {partes.map((x) => (
          <li key={x.clave} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', x.clase)} aria-hidden />
            {x.etiqueta} <span className="font-medium text-foreground tabular-nums">{x.n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
