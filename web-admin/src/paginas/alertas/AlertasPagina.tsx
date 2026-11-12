import { useQuery } from '@tanstack/react-query'
import { CheckCheckIcon, CheckIcon, Loader2Icon, MapPinIcon, TriangleAlertIcon, UserIcon, XIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { infoTipo, TIPOS_ALERTA, useAtenderAlerta, useAtenderVarias, type Alerta, type TipoAlerta } from '@/lib/alertas'
import { fechaCorta, hora, hoyLaPaz, sumarDias } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { useAhora } from '@/lib/useAhora'
import { cn } from '@/lib/utils'

type Estado = 'todas' | 'nueva' | 'atendida'
const RANGOS = { hoy: 'Hoy', '7': 'Últimos 7 días', '30': 'Últimos 30 días' } as const
type Rango = keyof typeof RANGOS

interface Respuesta {
  desde: string
  hasta: string
  limitado: boolean
  conteo: { todas: number; nuevas: number; atendidas: number }
  alertas: Alerta[]
}

export default function AlertasPagina() {
  const { api } = useSesion()
  // Filtros en la dirección: se pueden enlazar (p. ej. /alertas?tecnico=12)
  const [params, setParams] = useSearchParams()
  const estado = (params.get('estado') as Estado) || 'nueva'
  const tipo = (params.get('tipo') as TipoAlerta | null) ?? 'todos'
  const rango = ((params.get('rango') as Rango) in RANGOS ? params.get('rango') : '7') as Rango
  const tecnico = params.get('tecnico')
  const cambiar = (clave: string, valor: string | null) => {
    const p = new URLSearchParams(params)
    if (valor == null) p.delete(clave)
    else p.set(clave, valor)
    setParams(p, { replace: true })
  }

  const hasta = hoyLaPaz()
  const desde = rango === 'hoy' ? hasta : sumarDias(hasta, -(Number(rango) - 1))
  const consulta = useQuery({
    queryKey: ['alertas', { estado, tipo, desde, hasta, tecnico }],
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({ desde, hasta })
      if (estado !== 'todas') q.set('estado', estado)
      if (tipo !== 'todos') q.set('tipo', tipo)
      if (tecnico) q.set('tecnico', tecnico)
      return api.get<Respuesta>(`alertas?${q}`, signal)
    },
    refetchInterval: 30_000,
    placeholderData: (anterior) => anterior,
  })
  const atenderVarias = useAtenderVarias()
  const datos = consulta.data
  const nuevasVisibles = (datos?.alertas ?? []).filter((a) => a.estado === 'nueva').map((a) => a.id)
  const nombreFiltrado = tecnico && datos?.alertas.find((a) => String(a.tecnico.id) === tecnico)?.tecnico.nombre

  const pestanas: { valor: Estado; etiqueta: string; n?: number }[] = [
    { valor: 'todas', etiqueta: 'Todas', n: datos?.conteo.todas },
    { valor: 'nueva', etiqueta: 'Nuevas', n: datos?.conteo.nuevas },
    { valor: 'atendida', etiqueta: 'Atendidas', n: datos?.conteo.atendidas },
  ]

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bandeja de alertas</h2>
          <p className="text-sm text-muted-foreground">
            {datos ? (datos.conteo.nuevas === 1 ? '1 alerta nueva sin atender' : `${datos.conteo.nuevas} alertas nuevas sin atender`) : 'Cargando…'}
            {' · '}
            {RANGOS[rango].toLowerCase()}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={nuevasVisibles.length === 0 || atenderVarias.isPending}
          onClick={() =>
            atenderVarias.mutate(nuevasVisibles, {
              onSuccess: (r) => toast.success(r.atendidas === 1 ? '1 alerta marcada como atendida' : `${r.atendidas} alertas marcadas como atendidas`),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          {atenderVarias.isPending ? <Loader2Icon className="animate-spin" /> : <CheckCheckIcon />}
          Marcar {nuevasVisibles.length > 1 ? `las ${nuevasVisibles.length}` : ''} como atendidas
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Estado">
          {pestanas.map(({ valor, etiqueta, n }) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={estado === valor}
              onClick={() => cambiar('estado', valor)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
                estado === valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {etiqueta} {n != null && <span className="text-xs tabular-nums opacity-75">{n}</span>}
            </button>
          ))}
        </div>
        <Select value={rango} onValueChange={(v) => cambiar('rango', v)}>
          <SelectTrigger className="h-9 bg-card lg:w-44" aria-label="Período"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(RANGOS).map(([v, e]) => <SelectItem key={v} value={v}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={(v) => cambiar('tipo', v === 'todos' ? null : v)}>
          <SelectTrigger className="h-9 bg-card lg:w-60" aria-label="Tipo de alerta"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {Object.entries(TIPOS_ALERTA).map(([v, { etiqueta }]) => <SelectItem key={v} value={v}>{etiqueta}</SelectItem>)}
          </SelectContent>
        </Select>
        {tecnico && (
          <Button variant="secondary" size="sm" onClick={() => cambiar('tecnico', null)} className="self-start lg:self-auto">
            <UserIcon /> {nombreFiltrado ?? 'Una persona'} <XIcon />
          </Button>
        )}
        {consulta.isFetching && !consulta.isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {consulta.isPending ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Cargando alertas…
          </div>
        ) : consulta.isError ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-sm">
            <TriangleAlertIcon className="size-6 text-destructive" />
            {consulta.error.message}
            <Button variant="outline" size="sm" onClick={() => consulta.refetch()}>Reintentar</Button>
          </div>
        ) : datos!.alertas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <CheckCheckIcon className="size-8 text-exito" />
            <p className="font-medium">{estado === 'nueva' ? 'No hay alertas sin atender' : 'No hay alertas'}</p>
            <p className="text-sm text-muted-foreground">en {RANGOS[rango].toLowerCase()} con estos filtros.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {datos!.alertas.map((a) => <FilaAlerta key={a.id} alerta={a} />)}
          </ul>
        )}
        {datos?.limitado && (
          <p className="border-t p-3 text-center text-xs text-muted-foreground">Se muestran las 500 más recientes. Acorta el período para ver el resto.</p>
        )}
      </div>
    </div>
  )
}

function FilaAlerta({ alerta: a }: { alerta: Alerta }) {
  const tipo = infoTipo(a.tipo)
  const Icono = tipo.icono
  const atender = useAtenderAlerta()
  const ahora = useAhora(60_000)
  const nueva = a.estado === 'nueva'

  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap', !nueva && 'opacity-70')}>
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg"
        style={{ color: tipo.color, background: `color-mix(in srgb, ${tipo.color} 12%, transparent)` }}
      >
        <Icono className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <Link to={`/tecnicos/${a.tecnico.id}`} className="font-semibold hover:underline">{a.tecnico.nombre}</Link>
          {a.tecnico.codigo && <span className="font-mono text-xs text-muted-foreground">{a.tecnico.codigo}</span>}
          {a.nivel === 'critico' && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Crítica</span>
          )}
        </p>
        <p className="text-sm">
          <span className="font-medium">{tipo.etiqueta}</span>
          {a.mensaje && <span className="text-muted-foreground"> · {a.mensaje}</span>}
        </p>
        {!nueva && a.atendida_en && (
          <p className="text-xs text-muted-foreground">
            Atendida{a.atendida_por ? ` por ${a.atendida_por}` : ''} · {fechaCorta(a.atendida_en, ahora)}
          </p>
        )}
      </div>
      <time dateTime={a.creada_en} className="shrink-0 text-sm text-muted-foreground tabular-nums">
        {fechaCorta(a.creada_en, ahora).startsWith('Hoy') ? hora(a.creada_en) : fechaCorta(a.creada_en, ahora)}
      </time>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', nueva ? 'bg-aviso/12 text-aviso' : 'bg-muted text-muted-foreground')}>
        {nueva ? '● Nueva' : 'Atendida'}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            {a.tecnico.en_jornada ? (
              <Button variant="ghost" size="icon-sm" asChild>
                <Link to={`/mapa?tecnico=${a.tecnico.id}`} aria-label={`Ver a ${a.tecnico.nombre} en el mapa`}><MapPinIcon /></Link>
              </Button>
            ) : (
              <span tabIndex={0} className="inline-flex">
                <Button variant="ghost" size="icon-sm" disabled aria-label="Fuera de jornada"><MapPinIcon /></Button>
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>{a.tecnico.en_jornada ? 'Ver en el mapa' : 'Fuera de jornada: sin ubicación'}</TooltipContent>
        </Tooltip>
        {nueva && (
          <Button variant="outline" size="sm" disabled={atender.isPending} onClick={() => atender.mutate(a.id, { onError: (e) => toast.error(e.message) })}>
            {atender.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Marcar atendida
          </Button>
        )}
      </div>
    </li>
  )
}
