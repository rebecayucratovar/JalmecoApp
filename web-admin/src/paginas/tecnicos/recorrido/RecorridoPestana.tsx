import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, MaximizeIcon, RouteIcon, TriangleAlertIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hora } from '@/lib/formato'

import { hoyLaPaz, sumarDias, useRecorrido, type Recorrido } from './datos'
import { construirLinea, distanciaTexto, duracion, posicionEn, type Evento } from './linea'
import { LineaTiempo } from './LineaTiempo'
import { MapaRecorrido, type Enfoque } from './MapaRecorrido'
import { Reproductor, type Velocidad } from './Reproductor'

const fechaLarga = (fecha: string) =>
  new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )

export function RecorridoPestana({ tecnicoId }: { tecnicoId: number }) {
  const hoy = hoyLaPaz()
  const [fecha, setFecha] = useState(hoy)
  const consulta = useRecorrido(tecnicoId, fecha)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={() => setFecha((f) => sumarDias(f, -1))} aria-label="Día anterior">
            <ChevronLeftIcon />
          </Button>
          <Input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            aria-label="Fecha del recorrido"
            className="h-9 w-40"
          />
          <Button variant="outline" size="icon" onClick={() => setFecha((f) => sumarDias(f, 1))} disabled={fecha >= hoy} aria-label="Día siguiente">
            <ChevronRightIcon />
          </Button>
          {fecha !== hoy && (
            <Button variant="ghost" size="sm" onClick={() => setFecha(hoy)}>Hoy</Button>
          )}
          {consulta.isFetching && <Loader2Icon className="ml-1 size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}
        </div>
        {consulta.data && consulta.data.jornadas.length > 0 && <Resumen r={consulta.data} />}
      </div>

      {consulta.isPending ? (
        <div className="flex h-96 items-center justify-center gap-2 rounded-xl border bg-card text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> Cargando recorrido…
        </div>
      ) : consulta.isError ? (
        <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-xl border bg-card text-sm">
          <TriangleAlertIcon className="size-6 text-destructive" />
          {consulta.error.message}
          <Button variant="outline" size="sm" onClick={() => consulta.refetch()}>Reintentar</Button>
        </div>
      ) : consulta.data.jornadas.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center">
          <RouteIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">Sin jornada el {fechaLarga(fecha)}</p>
          <p className="text-sm text-muted-foreground">Solo se registra la ubicación entre la entrada y la salida.</p>
        </div>
      ) : (
        <Vista key={`${tecnicoId}-${fecha}`} r={consulta.data} fecha={fecha} />
      )}
    </div>
  )
}

function Resumen({ r }: { r: Recorrido }) {
  const primera = r.jornadas[0]
  const ultima = r.jornadas[r.jornadas.length - 1]
  const datos: [string, string][] = [
    ['Entrada', hora(primera.inicio)],
    ['Salida', ultima.fin ? hora(ultima.fin) : 'En curso'],
    ['En jornada', duracion(r.resumen.en_jornada_min)],
    ['Paradas', String(r.resumen.paradas)],
    ['Distancia', distanciaTexto(r.resumen.distancia_km * 1000)],
  ]
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {datos.map(([etiqueta, valor]) => (
        <div key={etiqueta}>
          <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
          <dd className="font-semibold tabular-nums">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

function Vista({ r, fecha }: { r: Recorrido; fecha: string }) {
  const eventos = useMemo(() => construirLinea(r), [r])
  const desde = r.puntos.length ? new Date(r.puntos[0].hora).getTime() : 0
  const hasta = r.puntos.length ? new Date(r.puntos[r.puntos.length - 1].hora).getTime() : 0

  const [activo, setActivo] = useState<number | null>(null)
  const [enfoque, setEnfoque] = useState<{ e: Enfoque; n: number }>({ e: { tipo: 'todo' }, n: 0 })
  const [horaRepro, setHoraRepro] = useState<number | null>(null)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [velocidad, setVelocidad] = useState<Velocidad>(5)

  const enfocar = (e: Enfoque) => setEnfoque((x) => ({ e, n: x.n + 1 }))
  const alCambiarHora = useCallback((t: number) => setHoraRepro(t), [])
  const alReproducir = useCallback((si: boolean) => {
    setReproduciendo(si)
    if (si) setHoraRepro((t) => t ?? desde)
  }, [desde])

  function elegir(i: number) {
    setActivo(i)
    const e: Evento = eventos[i]
    if (e.tipo === 'parada') {
      enfocar({ tipo: 'punto', lat: e.parada.lat, lng: e.parada.lng })
      setHoraRepro(e.inicio)
    } else if (e.tipo === 'trayecto' || e.tipo === 'sin_datos' || e.tipo === 'pausa') {
      const zona = r.puntos.filter((p) => {
        const t = new Date(p.hora).getTime()
        return t >= e.inicio - 60_000 && t <= e.fin + 60_000
      })
      if (zona.length) enfocar({ tipo: 'zona', puntos: zona })
      setHoraRepro(e.inicio)
    } else {
      const pos = posicionEn(r.puntos, e.hora)
      if (pos) enfocar({ tipo: 'punto', ...pos })
      setHoraRepro(Math.min(Math.max(e.hora, desde), hasta))
    }
  }

  const paradaActiva = activo != null && eventos[activo]?.tipo === 'parada' ? (eventos[activo] as { numero: number }).numero : null
  const terminada = r.jornadas.every((j) => j.fin != null)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
        <div className="relative h-[420px] lg:h-[540px]">
          {r.puntos.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <TriangleAlertIcon className="size-6 text-aviso" />
              <p className="font-medium">La jornada no tiene ubicaciones</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                El celular no envió datos (app cerrada, sin permisos o sin señal). Si tiene puntos guardados sin
                conexión, aparecerán cuando los envíe.
              </p>
            </div>
          ) : (
            <>
              <MapaRecorrido
                puntos={r.puntos}
                paradas={r.paradas}
                paradaActiva={paradaActiva}
                posicion={horaRepro != null ? posicionEn(r.puntos, horaRepro) : null}
                horaReproduccion={horaRepro}
                enfoque={enfoque.e}
                enfoqueN={enfoque.n}
                terminada={terminada}
                alElegirParada={(n) => {
                  const i = eventos.findIndex((e) => e.tipo === 'parada' && e.numero === n)
                  if (i >= 0) elegir(i)
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="absolute top-3 right-3 z-[1000] bg-card shadow-sm"
                onClick={() => {
                  setActivo(null)
                  enfocar({ tipo: 'todo' })
                }}
                aria-label="Ver todo el recorrido"
              >
                <MaximizeIcon />
              </Button>
            </>
          )}
        </div>
        {r.puntos.length > 1 && (
          <Reproductor
            desde={desde}
            hasta={hasta}
            valor={horaRepro ?? desde}
            reproduciendo={reproduciendo}
            velocidad={velocidad}
            alCambiar={alCambiarHora}
            alReproducir={alReproducir}
            alVelocidad={setVelocidad}
          />
        )}
      </div>

      <section className="flex max-h-[600px] min-h-0 flex-col overflow-hidden rounded-xl border bg-card" aria-label="Línea de tiempo">
        <div className="border-b p-4">
          <h3 className="font-semibold">Línea de tiempo</h3>
          <p className="text-xs text-muted-foreground">
            {fechaLarga(fecha)} · toca un tramo para verlo en el mapa
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LineaTiempo eventos={eventos} activo={activo} alElegir={elegir} />
        </div>
      </section>
    </div>
  )
}
