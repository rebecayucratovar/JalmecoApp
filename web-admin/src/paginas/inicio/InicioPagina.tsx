import { useQuery } from '@tanstack/react-query'
import { CheckCheckIcon, ChevronRightIcon, KeyRoundIcon, Loader2Icon, Maximize2Icon, TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { infoTipo, useResumenAlertas } from '@/lib/alertas'
import { ESTADOS, ORDEN_ESTADOS } from '@/lib/estados'
import { fechaCorta, hora } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { useAhora } from '@/lib/useAhora'
import { cn } from '@/lib/utils'
import { useMapaEnVivo } from '@/paginas/mapa/datos'
import { MapaLeaflet } from '@/paginas/mapa/MapaLeaflet'

import { GraficoHoras } from './GraficoHoras'

export interface Dashboard {
  actualizado_en: string
  personal: {
    activos: number
    en_jornada: number
    en_trayecto: number
    en_parada: number
    sin_conexion: number
    ubicacion_apagada: number
    trabajaron_hoy: number
    sin_pin: number
  }
  alertas: { nuevas: number; criticas: number; hoy: number }
  verificaciones_hoy: { pedidas: number; exito: number; no_realizadas: number; pendientes: number }
  sin_conexion_min: number
  horas_campo: { fecha: string; horas: number; personas: number }[]
}

export default function InicioPagina() {
  const { api } = useSesion()
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

  const { personal: p, alertas, verificaciones_hoy: v } = consulta.data

  return (
    <div className="space-y-5 p-4 lg:p-6">
      {p.sin_pin > 0 && (
        <Link
          to="/tecnicos?vista=sin_pin"
          className="flex items-center gap-3 rounded-xl border border-aviso/30 bg-aviso/10 px-4 py-3 text-sm outline-none hover:bg-aviso/15 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <KeyRoundIcon className="size-4 shrink-0 text-aviso" aria-hidden />
          <span className="flex-1">
            <strong className="font-medium">{p.sin_pin} {p.sin_pin === 1 ? 'persona no tiene' : 'personas no tienen'} PIN</strong>
            <span className="text-muted-foreground"> · todavía no pueden entrar a la app</span>
          </span>
          <span className="inline-flex items-center font-medium text-aviso">Generar PIN <ChevronRightIcon className="size-4" /></span>
        </Link>
      )}

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4 2xl:grid-cols-6">
        <Indicador a="/mapa" destacado etiqueta="En jornada"
          valor={<>{p.en_jornada}<span className="ml-1.5 text-xl font-normal text-white/60 dark:text-muted-foreground">/ {p.activos}</span></>}
          detalle={`${p.activos - p.en_jornada} fuera de jornada`} />
        <Indicador a="/mapa" etiqueta={ESTADOS.en_trayecto.etiqueta} punto={ESTADOS.en_trayecto.color} valor={p.en_trayecto}
          detalle="en movimiento" />
        <Indicador a="/mapa" etiqueta={ESTADOS.en_parada.etiqueta} punto={ESTADOS.en_parada.color} valor={p.en_parada}
          detalle="quietos en un lugar" />
        {/* Sin datos del celular: por señal (más de N min) o porque apagó la ubicación (al instante) */}
        <Indicador a="/mapa" etiqueta={ESTADOS.sin_conexion.etiqueta} punto={ESTADOS.sin_conexion.color}
          valor={p.sin_conexion + p.ubicacion_apagada} tono={p.sin_conexion + p.ubicacion_apagada > 0 ? 'peligro' : undefined}
          detalle={p.ubicacion_apagada
            ? `${p.ubicacion_apagada} con la ubicación apagada${p.sin_conexion ? ` · ${p.sin_conexion} sin datos` : ''}`
            : `sin datos por más de ${consulta.data.sin_conexion_min} min`} />
        <Indicador a="/alertas?tipo=verificacion_no_realizada&rango=hoy&estado=todas" etiqueta="Sin verificar" punto="#7c3aed"
          valor={v.no_realizadas} tono={v.no_realizadas > 0 ? 'violeta' : undefined}
          detalle={v.pedidas ? `huellas no realizadas hoy · ${v.exito} de ${v.pedidas} confirmadas` : 'aún no se pidieron huellas hoy'} />
        <Indicador a="/alertas" etiqueta="Alertas activas" punto="var(--aviso)" valor={alertas.nuevas}
          tono={alertas.nuevas > 0 ? 'aviso' : undefined}
          detalle={alertas.criticas ? `${alertas.criticas} ${alertas.criticas === 1 ? 'crítica' : 'críticas'} · requieren atención` : 'requieren atención'} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.5fr)]">
        <MapaMini enJornada={p.en_jornada} />
        <UltimasAlertas />
      </div>

      <GraficoHoras dias={consulta.data.horas_campo} />
    </div>
  )
}

const TONOS = {
  peligro: 'text-destructive',
  aviso: 'text-aviso',
  violeta: 'text-violet-600 dark:text-violet-400',
}

function Indicador({ a, etiqueta, valor, detalle, punto, destacado, tono }: {
  a: string
  etiqueta: string
  valor: ReactNode
  detalle: string
  punto?: string
  destacado?: boolean
  tono?: keyof typeof TONOS
}) {
  return (
    <Link
      to={a}
      className={cn(
        'flex min-h-36 flex-col rounded-xl border bg-card p-4 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring lg:p-5',
        destacado && 'border-transparent bg-marino text-white hover:border-transparent hover:bg-marino/90 dark:bg-primary/15 dark:text-foreground',
      )}
    >
      <p className={cn('flex items-center gap-2 text-sm font-medium', destacado ? 'text-white/85 dark:text-muted-foreground' : 'text-muted-foreground')}>
        {punto && <span className="size-2 rounded-full" style={{ background: punto }} aria-hidden />}
        {etiqueta}
      </p>
      <p className={cn('mt-2 text-4xl font-semibold tracking-tight tabular-nums', tono && TONOS[tono])}>{valor}</p>
      <p className={cn('mt-auto pt-3 text-xs leading-snug', destacado ? 'text-white/75 dark:text-muted-foreground' : 'text-muted-foreground')}>{detalle}</p>
    </Link>
  )
}

function MapaMini({ enJornada }: { enJornada: number }) {
  const navegar = useNavigate()
  const mapa = useMapaEnVivo()
  const tecnicos = mapa.data?.tecnicos ?? []

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <span className="size-2 rounded-full bg-exito" aria-hidden />
        <h2 className="text-sm font-semibold">Mapa en vivo</h2>
        <span className="truncate text-sm text-muted-foreground">· {enJornada} en jornada</span>
        <Link to="/mapa" className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-sm font-medium hover:underline">
          <Maximize2Icon className="size-4" aria-hidden /> <span className="hidden sm:inline">Abrir mapa completo</span><span className="sm:hidden">Abrir</span>
        </Link>
      </div>
      {/* isolate: las capas de Leaflet no tapan menús ni diálogos */}
      <div className="isolate h-[340px] sm:h-[420px] xl:h-[460px]">
        <MapaLeaflet tecnicos={tecnicos} seleccionado={null} encuadre={0} alSeleccionar={(id) => navegar(`/mapa?tecnico=${id}`)} />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t px-5 py-3 text-xs text-muted-foreground" aria-label="Leyenda">
        {ORDEN_ESTADOS.map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: ESTADOS[e].color }} aria-hidden /> {ESTADOS[e].etiqueta}
          </li>
        ))}
      </ul>
    </section>
  )
}

function UltimasAlertas() {
  const { data, isPending } = useResumenAlertas()
  const ahora = useAhora(60_000)

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center border-b px-5 py-3.5">
        <h2 className="flex-1 text-sm font-semibold">Alertas sin atender</h2>
        <Link to="/alertas" className="text-sm font-medium hover:underline">Ver todas</Link>
      </div>
      {isPending ? (
        <div className="flex flex-1 items-center justify-center p-10"><Loader2Icon className="size-5 animate-spin text-muted-foreground" /></div>
      ) : !data || data.ultimas.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
          <CheckCheckIcon className="size-8 text-exito" />
          <p className="text-sm text-muted-foreground">No hay alertas sin atender.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {data.ultimas.map((a) => {
            const tipo = infoTipo(a.tipo)
            const Icono = tipo.icono
            const cuando = fechaCorta(a.creada_en, ahora)
            return (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ color: tipo.color, background: `color-mix(in srgb, ${tipo.color} 12%, transparent)` }}>
                  <Icono className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{a.tecnico.nombre}</span>
                    {a.nivel === 'critico' && <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-label="Crítica" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{a.mensaje ?? tipo.etiqueta}</span>
                </span>
                <time dateTime={a.creada_en} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {cuando.startsWith('Hoy') ? hora(a.creada_en) : cuando}
                </time>
                <Button variant="outline" size="sm" asChild>
                  <Link to={a.tecnico.en_jornada ? `/mapa?tecnico=${a.tecnico.id}` : `/alertas?tecnico=${a.tecnico.id}&estado=todas`}
                    aria-label={`Ver ${tipo.etiqueta.toLowerCase()} de ${a.tecnico.nombre}`}>
                    Ver
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {data && data.nuevas > data.ultimas.length && (
        <Link to="/alertas" className="mt-auto border-t px-5 py-3 text-center text-xs font-medium text-muted-foreground hover:text-foreground">
          y {data.nuevas - data.ultimas.length} más sin atender
        </Link>
      )}
    </section>
  )
}
