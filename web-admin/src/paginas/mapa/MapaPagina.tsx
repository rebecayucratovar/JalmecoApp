import { Loader2Icon, MaximizeIcon, TriangleAlertIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ESTADOS, ORDEN_ESTADOS } from '@/lib/estados'
import { haceCuanto } from '@/lib/formato'
import { useAhora } from '@/lib/useAhora'

import { filtrar, useMapaEnVivo, type Filtro } from './datos'
import { FichaTecnico } from './FichaTecnico'
import { ListaPersonal } from './ListaPersonal'
import { MapaLeaflet } from './MapaLeaflet'

export default function MapaPagina() {
  const consulta = useMapaEnVivo()
  const ahora = useAhora(1000)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  // La persona elegida va en la dirección (/mapa?tecnico=12): se puede enlazar desde Alertas
  const [parametros, setParametros] = useSearchParams()
  const seleccionadoId = Number(parametros.get('tecnico')) || null
  const setSeleccionadoId = (id: number | null) =>
    setParametros(id == null ? {} : { tecnico: String(id) }, { replace: true })
  const [encuadre, setEncuadre] = useState(0)

  const todos = useMemo(() => consulta.data?.tecnicos ?? [], [consulta.data])
  const visibles = useMemo(() => filtrar(todos, filtro, busqueda), [todos, filtro, busqueda])
  const seleccionado = todos.find((t) => t.id === seleccionadoId) ?? null

  if (consulta.isPending) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Cargando el mapa…
      </div>
    )
  }

  if (consulta.isError && !consulta.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <p className="max-w-sm text-sm">{consulta.error.message}</p>
        <Button variant="outline" onClick={() => consulta.refetch()}>Reintentar</Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className="h-[42%] shrink-0 border-b lg:h-full lg:w-80 lg:border-r lg:border-b-0 xl:w-96">
        <ListaPersonal
          todos={todos}
          visibles={visibles}
          filtro={filtro}
          busqueda={busqueda}
          seleccionado={seleccionadoId}
          ahora={ahora}
          alFiltrar={setFiltro}
          alBuscar={setBusqueda}
          alSeleccionar={setSeleccionadoId}
        />
      </aside>

      <div className="relative min-h-0 flex-1">
        {/* El mapa muestra a quienes pasan el filtro (la búsqueda también filtra el mapa) */}
        <MapaLeaflet tecnicos={visibles} seleccionado={seleccionado} encuadre={encuadre} alSeleccionar={setSeleccionadoId} />

        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex items-start justify-end gap-3 pl-12">
          <div className="pointer-events-auto flex items-center gap-2">
            <EstadoActualizacion actualizadoEn={consulta.data?.actualizado_en} error={consulta.isError} ahora={ahora} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="bg-card shadow-sm" onClick={() => setEncuadre((n) => n + 1)} aria-label="Ver a todos en el mapa">
                  <MaximizeIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver a todos</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {seleccionado && (
          <div className="absolute top-16 right-3 z-[1000]">
            <FichaTecnico tecnico={seleccionado} ahora={ahora} alCerrar={() => setSeleccionadoId(null)} />
          </div>
        )}

        <ul className="absolute bottom-6 left-1/2 z-[1000] hidden -translate-x-1/2 items-center gap-4 rounded-full border bg-card/95 px-4 py-2 text-xs shadow-sm sm:flex" aria-label="Leyenda">
          {ORDEN_ESTADOS.filter((e) => e !== 'fuera_jornada').map((e) => (
            <li key={e} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="size-2.5 rounded-full" style={{ background: ESTADOS[e].color }} />
              {ESTADOS[e].etiqueta}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function EstadoActualizacion({ actualizadoEn, error, ahora }: { actualizadoEn?: string; error: boolean; ahora: Date }) {
  if (error) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-card px-3 py-1.5 text-xs font-medium text-destructive shadow-sm">
        <TriangleAlertIcon className="size-3.5" /> Sin conexión con el servidor · reintentando
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-exito opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-exito" />
      </span>
      En vivo{actualizadoEn ? ` · ${haceCuanto(actualizadoEn, ahora)}` : ''}
    </span>
  )
}
