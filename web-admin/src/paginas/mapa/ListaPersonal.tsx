import { SearchIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Input } from '@/components/ui/input'
import { infoEstado, ORDEN_ESTADOS, ESTADOS } from '@/lib/estados'
import { haceCuanto, iniciales } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { contarPorEstado, type Filtro, type TecnicoMapa } from './datos'

interface Props {
  todos: TecnicoMapa[]
  visibles: TecnicoMapa[]
  filtro: Filtro
  busqueda: string
  seleccionado: number | null
  ahora: Date
  alFiltrar(f: Filtro): void
  alBuscar(texto: string): void
  alSeleccionar(id: number): void
}

export function ListaPersonal({ todos, visibles, filtro, busqueda, seleccionado, ahora, alFiltrar, alBuscar, alSeleccionar }: Props) {
  const cuenta = contarPorEstado(todos)
  const lista = useRef<HTMLUListElement>(null)

  // Al elegir a alguien en el mapa, que se vea en la lista
  useEffect(() => {
    if (seleccionado == null) return
    lista.current?.querySelector(`[data-id="${seleccionado}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [seleccionado])

  const chips: { valor: Filtro; etiqueta: string; color?: string }[] = [
    { valor: 'todos', etiqueta: 'Todos' },
    ...ORDEN_ESTADOS.map((e) => ({ valor: e as Filtro, etiqueta: ESTADOS[e].etiqueta, color: ESTADOS[e].color })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="space-y-3 border-b p-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => alBuscar(e.target.value)}
            placeholder="Buscar por nombre, código o cargo"
            aria-label="Buscar personal"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {chips.map(({ valor, etiqueta, color }) => {
            const activo = filtro === valor
            return (
              <button
                key={valor}
                type="button"
                onClick={() => alFiltrar(valor)}
                aria-pressed={activo}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  activo ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                )}
              >
                {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
                {etiqueta}
                <span className={cn('tabular-nums', activo ? 'opacity-80' : 'text-muted-foreground')}>{cuenta[valor]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
        {visibles.length === 1 ? '1 persona' : `${visibles.length} personas`}
      </p>

      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {todos.length === 0 ? 'Aún no hay personal registrado.' : 'Nadie coincide con la búsqueda o el filtro.'}
        </p>
      ) : (
        <ul ref={lista} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {visibles.map((t) => (
            <li key={t.id} data-id={t.id}>
              <FilaTecnico tecnico={t} ahora={ahora} activo={t.id === seleccionado} alSeleccionar={() => alSeleccionar(t.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilaTecnico({ tecnico: t, ahora, activo, alSeleccionar }: { tecnico: TecnicoMapa; ahora: Date; activo: boolean; alSeleccionar(): void }) {
  const estado = infoEstado(t.estado_actual)
  let detalle: string
  if (t.estado_actual === 'fuera_jornada') detalle = estado.etiqueta
  else if (!t.ultima_actualizacion) detalle = 'En jornada · aún sin ubicación'
  else detalle = `${estado.etiqueta} · ${haceCuanto(t.ultima_actualizacion, ahora)}`

  return (
    <button
      type="button"
      onClick={alSeleccionar}
      aria-current={activo || undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        activo ? 'bg-accent' : 'hover:bg-muted',
      )}
    >
      <span className="relative shrink-0">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
          {iniciales(t.nombre)}
        </span>
        <span
          className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card"
          style={{ background: estado.color }}
          aria-hidden
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{t.nombre}</span>
        <span className="block truncate text-xs text-muted-foreground">{detalle}</span>
      </span>
      {t.estado_actual === 'en_trayecto' && t.ultima_velocidad != null && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.round(t.ultima_velocidad)} km/h</span>
      )}
    </button>
  )
}
