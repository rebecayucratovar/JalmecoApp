import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'

import type { Parada, PuntoRecorrido } from './datos'
import { tramos } from './linea'

const LA_PAZ: L.LatLngTuple = [-16.5, -68.15]

export type Enfoque =
  | { tipo: 'todo' }
  | { tipo: 'punto'; lat: number; lng: number }
  | { tipo: 'zona'; puntos: { lat: number; lng: number }[] }

function iconoParada(numero: number, activa: boolean) {
  const tam = activa ? 34 : 26
  return L.divIcon({
    className: '',
    html: `<div class="marcador-parada${activa ? ' marcador-activo' : ''}">${numero}</div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  })
}

function iconoExtremo(texto: string, clase: string) {
  return L.divIcon({ className: '', html: `<div class="marcador-extremo ${clase}">${texto}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] })
}

const ICONO_ENTRADA = iconoExtremo('E', 'marcador-entrada')
const ICONO_SALIDA = iconoExtremo('S', 'marcador-salida')
const ICONO_POSICION = L.divIcon({ className: '', html: '<div class="marcador-posicion"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })

interface Props {
  puntos: PuntoRecorrido[]
  paradas: Parada[]
  /** Parada elegida en la línea de tiempo (1..n). */
  paradaActiva: number | null
  /** Posición del reproductor. */
  posicion: { lat: number; lng: number } | null
  /** Hasta dónde ya pasó el reproductor (el recorrido hecho se resalta). */
  horaReproduccion: number | null
  enfoque: Enfoque
  /** Cambia para volver a aplicar el mismo enfoque. */
  enfoqueN: number
  terminada: boolean
  alElegirParada(numero: number): void
}

export function MapaRecorrido({ puntos, paradas, paradaActiva, posicion, horaReproduccion, enfoque, enfoqueN, terminada, alElegirParada }: Props) {
  const lineas = useMemo(() => tramos(puntos).map((t) => t.map((p) => [p.lat, p.lng] as L.LatLngTuple)), [puntos])
  const hechas = useMemo(() => {
    if (horaReproduccion == null) return []
    return tramos(puntos.filter((p) => new Date(p.hora).getTime() <= horaReproduccion)).map((t) =>
      t.map((p) => [p.lat, p.lng] as L.LatLngTuple),
    )
  }, [puntos, horaReproduccion])

  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]

  return (
    <MapContainer center={LA_PAZ} zoom={12} className="size-full">
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      {lineas.map((l, i) => (
        <Polyline key={`l${i}`} positions={l} pathOptions={{ color: '#0185b6', weight: 4, opacity: horaReproduccion == null ? 0.85 : 0.35 }} />
      ))}
      {hechas.map((l, i) => (
        <Polyline key={`h${i}`} positions={l} pathOptions={{ color: '#1c1c62', weight: 5, opacity: 0.9 }} />
      ))}
      {/* Puntos chicos: dónde se registró cada ubicación */}
      {puntos.length <= 1500 &&
        puntos.map((p, i) => (
          <CircleMarker key={i} center={[p.lat, p.lng]} radius={2} pathOptions={{ color: '#0185b6', weight: 1, fillOpacity: 0.8 }} />
        ))}
      {primero && <Marker position={[primero.lat, primero.lng]} icon={ICONO_ENTRADA} title="Primer punto de la jornada" />}
      {ultimo && terminada && <Marker position={[ultimo.lat, ultimo.lng]} icon={ICONO_SALIDA} title="Último punto de la jornada" />}
      {paradas.map((p, i) => (
        <Marker
          key={`p${i}`}
          position={[p.lat, p.lng]}
          icon={iconoParada(i + 1, paradaActiva === i + 1)}
          zIndexOffset={paradaActiva === i + 1 ? 1000 : 500}
          title={`Parada ${i + 1} · ${p.duracion_min} min`}
          eventHandlers={{ click: () => alElegirParada(i + 1) }}
        />
      ))}
      {posicion && <Marker position={[posicion.lat, posicion.lng]} icon={ICONO_POSICION} zIndexOffset={2000} interactive={false} />}
      <Camara puntos={puntos} enfoque={enfoque} enfoqueN={enfoqueN} />
    </MapContainer>
  )
}

function Camara({ puntos, enfoque, enfoqueN }: { puntos: PuntoRecorrido[]; enfoque: Enfoque; enfoqueN: number }) {
  const mapa = useMap()
  useEffect(() => {
    const encuadrar = (coords: L.LatLngTuple[]) => {
      if (coords.length === 0) return
      if (coords.length === 1) mapa.setView(coords[0], 16)
      else mapa.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 17 })
    }
    if (enfoque.tipo === 'punto') mapa.flyTo([enfoque.lat, enfoque.lng], Math.max(mapa.getZoom(), 16), { duration: 0.5 })
    else if (enfoque.tipo === 'zona') encuadrar(enfoque.puntos.map((p) => [p.lat, p.lng]))
    else encuadrar(puntos.map((p) => [p.lat, p.lng]))
    // Solo cuando se pide un enfoque nuevo (no en cada actualización de datos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, enfoqueN])
  return null
}
