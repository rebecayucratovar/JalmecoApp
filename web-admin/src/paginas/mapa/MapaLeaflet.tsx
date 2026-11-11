import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'

import { infoEstado } from '@/lib/estados'
import { iniciales } from '@/lib/formato'

import { tieneUbicacion, type TecnicoMapa } from './datos'

/** Centro de La Paz / El Alto (si todavía no hay nadie en el mapa). */
const LA_PAZ: L.LatLngTuple = [-16.5, -68.15]

const iconos = new Map<string, L.DivIcon>()

/** Círculo con las iniciales y el color del estado (se reutiliza: no se recrea cada 10 s). */
function icono(t: TecnicoMapa, seleccionado: boolean): L.DivIcon {
  const ini = iniciales(t.nombre)
  const clave = `${ini}|${t.estado_actual}|${seleccionado}`
  let i = iconos.get(clave)
  if (!i) {
    const tam = seleccionado ? 44 : 34
    i = L.divIcon({
      className: '',
      html: `<div class="marcador${seleccionado ? ' marcador-activo' : ''}" style="--color:${infoEstado(t.estado_actual).color}">${ini}</div>`,
      iconSize: [tam, tam],
      iconAnchor: [tam / 2, tam / 2],
    })
    iconos.set(clave, i)
  }
  return i
}

interface Props {
  tecnicos: TecnicoMapa[]
  seleccionado: TecnicoMapa | null
  /** Cambia cada vez que se pide "ver a todos" (para volver a encuadrar). */
  encuadre: number
  alSeleccionar(id: number): void
}

export function MapaLeaflet({ tecnicos, seleccionado, encuadre, alSeleccionar }: Props) {
  const conUbicacion = useMemo(() => tecnicos.filter(tieneUbicacion), [tecnicos])

  return (
    <MapContainer center={LA_PAZ} zoom={12} className="size-full" zoomControl attributionControl>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {conUbicacion.map((t) => (
        <Marker
          key={t.id}
          position={[t.ultima_lat, t.ultima_lng]}
          icon={icono(t, t.id === seleccionado?.id)}
          title={`${t.nombre} · ${infoEstado(t.estado_actual).etiqueta}`}
          alt={t.nombre}
          zIndexOffset={t.id === seleccionado?.id ? 1000 : 0}
          eventHandlers={{ click: () => alSeleccionar(t.id) }}
        />
      ))}
      <Camara puntos={conUbicacion} seleccionado={seleccionado} encuadre={encuadre} />
    </MapContainer>
  )
}

/** Mueve la cámara: encuadra a todos la primera vez (y al pedirlo) y va hacia quien se elige. */
function Camara({ puntos, seleccionado, encuadre }: { puntos: TecnicoMapa[]; seleccionado: TecnicoMapa | null; encuadre: number }) {
  const mapa = useMap()
  const yaEncuadro = useRef(false)
  const ultimoEncuadre = useRef(encuadre)

  useEffect(() => {
    const pedido = encuadre !== ultimoEncuadre.current
    ultimoEncuadre.current = encuadre
    if (yaEncuadro.current && !pedido) return // no mover el mapa en cada actualización de 10 s
    const coords = puntos.filter(tieneUbicacion).map((t) => [t.ultima_lat, t.ultima_lng] as L.LatLngTuple)
    if (coords.length === 0) return
    yaEncuadro.current = true
    if (coords.length === 1) mapa.setView(coords[0], 15)
    else mapa.fitBounds(L.latLngBounds(coords), { padding: [48, 48], maxZoom: 15 })
  }, [mapa, puntos, encuadre])

  const id = seleccionado?.id
  const lat = seleccionado?.ultima_lat
  const lng = seleccionado?.ultima_lng
  useEffect(() => {
    if (id == null || lat == null || lng == null) return
    mapa.flyTo([lat, lng], Math.max(mapa.getZoom(), 15), { duration: 0.6 })
    // Solo al elegir a otra persona (no seguirla en cada actualización)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, id])

  return null
}
