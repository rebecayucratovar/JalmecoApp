import { EyeIcon, Loader2Icon, MapPinIcon, PlusIcon, SearchIcon, TriangleAlertIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { AvatarEstado, EstadoChip } from '@/components/EstadoChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ESTADOS, ORDEN_ESTADOS, type EstadoTecnico } from '@/lib/estados'
import { hora } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { contarVistas, filtrarTecnicos, formatoCelular, useTecnicos, type TecnicoAdmin, type Vista } from './datos'
import { FormularioTecnico } from './FormularioTecnico'

const VISTAS: { valor: Vista; etiqueta: string }[] = [
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'sin_pin', etiqueta: 'Sin PIN' },
  { valor: 'inactivos', etiqueta: 'Desactivados' },
]

export default function TecnicosPagina() {
  const consulta = useTecnicos()
  const navegar = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<EstadoTecnico | 'todos'>('todos')
  const [vista, setVista] = useState<Vista>('activos')
  const [creando, setCreando] = useState(false)

  const todos = useMemo(() => consulta.data ?? [], [consulta.data])
  const visibles = useMemo(() => filtrarTecnicos(todos, vista, estado, busqueda), [todos, vista, estado, busqueda])
  const cuenta = contarVistas(todos)

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Personal con la app</h2>
          <p className="text-sm text-muted-foreground">
            {consulta.data
              ? `${cuenta.activos} activos${cuenta.sin_pin ? ` · ${cuenta.sin_pin} sin PIN` : ''}`
              : 'Cargando…'}
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <PlusIcon /> Nuevo técnico
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="relative lg:w-80">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, código, cargo o celular"
              aria-label="Buscar personal"
              className="h-9 pl-9"
            />
          </div>
          <Select value={estado} onValueChange={(v) => setEstado(v as EstadoTecnico | 'todos')}>
            <SelectTrigger className="h-9 lg:w-48" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {ORDEN_ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>{ESTADOS[e].etiqueta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-lg border p-0.5 lg:ml-auto" role="group" aria-label="Vista">
            {VISTAS.map(({ valor, etiqueta }) => (
              <button
                key={valor}
                type="button"
                aria-pressed={vista === valor}
                onClick={() => setVista(valor)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  vista === valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {etiqueta} <span className="tabular-nums opacity-75">{cuenta[valor]}</span>
              </button>
            ))}
          </div>
        </div>

        {consulta.isPending ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Cargando personal…
          </div>
        ) : consulta.isError ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-sm">
            <TriangleAlertIcon className="size-6 text-destructive" />
            {consulta.error.message}
            <Button variant="outline" size="sm" onClick={() => consulta.refetch()}>Reintentar</Button>
          </div>
        ) : visibles.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground">
            {todos.length === 0
              ? 'Aún no hay personal. Agrégalo con «Nuevo técnico» (o se importará de Odoo).'
              : vista === 'sin_pin' && !busqueda && estado === 'todos'
                ? 'Todo el personal activo tiene PIN.'
                : 'Nadie coincide con la búsqueda o el filtro.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Técnico</TableHead>
                <TableHead>Código</TableHead>
                <TableHead className="hidden lg:table-cell">Cargo</TableHead>
                <TableHead className="hidden md:table-cell">Celular asignado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Entrada</TableHead>
                <TableHead className="hidden sm:table-cell">PIN</TableHead>
                <TableHead className="pr-4 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((t) => (
                <Fila key={t.id} tecnico={t} alAbrir={() => navegar(`/tecnicos/${t.id}`)} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <FormularioTecnico abierto={creando} alCambiar={setCreando} alGuardar={(t) => navegar(`/tecnicos/${t.id}`)} />
    </div>
  )
}

function Fila({ tecnico: t, alAbrir }: { tecnico: TecnicoAdmin; alAbrir(): void }) {
  const enMapa = t.ultima_lat != null && t.ultima_lng != null
  return (
    <TableRow className={cn('cursor-pointer', !t.activo && 'opacity-60')} onClick={alAbrir}>
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          <AvatarEstado nombre={t.nombre} estado={t.activo ? t.estado_actual : undefined} tamano="sm" />
          <Link to={`/tecnicos/${t.id}`} className="font-medium outline-none hover:underline focus-visible:underline" onClick={(e) => e.stopPropagation()}>
            {t.nombre}
          </Link>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{t.codigo ?? '—'}</TableCell>
      <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">{t.cargo ?? '—'}</TableCell>
      <TableCell className="hidden md:table-cell">
        {t.celular_modelo || t.celular_numero ? (
          <div className="leading-tight">
            <div>{t.celular_modelo ?? '—'}</div>
            <div className="text-xs text-muted-foreground tabular-nums">{formatoCelular(t.celular_numero)}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">Sin asignar</span>
        )}
      </TableCell>
      <TableCell>{t.activo ? <EstadoChip estado={t.estado_actual} /> : <span className="text-xs text-muted-foreground">Desactivado</span>}</TableCell>
      <TableCell className="hidden tabular-nums sm:table-cell">{t.jornada_inicio ? hora(t.jornada_inicio) : <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="hidden sm:table-cell">
        {t.tiene_pin ? (
          <span className="text-xs font-medium text-exito">Activo</span>
        ) : (
          <span className="rounded-full bg-aviso/12 px-2 py-0.5 text-xs font-medium text-aviso">Sin PIN</span>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" asChild>
                <Link to={`/tecnicos/${t.id}`} aria-label={`Ver ficha de ${t.nombre}`}><EyeIcon /></Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver ficha</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              {enMapa ? (
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link to={`/mapa?tecnico=${t.id}`} aria-label={`Ver a ${t.nombre} en el mapa`}><MapPinIcon /></Link>
                </Button>
              ) : (
                <span tabIndex={0} className="inline-flex">
                  <Button variant="ghost" size="icon-sm" disabled aria-label="Sin ubicación"><MapPinIcon /></Button>
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent>{enMapa ? 'Ver en el mapa' : 'Sin ubicación (fuera de jornada)'}</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  )
}
