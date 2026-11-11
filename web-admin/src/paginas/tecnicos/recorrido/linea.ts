/** Línea de tiempo y reproducción del recorrido (lógica pura, sin interfaz). */
import type { Parada, PuntoRecorrido, Recorrido } from './datos'

/** Igual que el backend: un hueco más largo corta el trayecto (no se dibuja una recta a través). */
export const MAX_HUECO_MS = 20 * 60_000
const MIN_TRAMO_MS = 60_000

export type Evento =
  | { tipo: 'entrada'; hora: number }
  | { tipo: 'salida'; hora: number }
  | { tipo: 'en_curso'; hora: number }
  | { tipo: 'parada'; inicio: number; fin: number; numero: number; parada: Parada }
  | { tipo: 'trayecto'; inicio: number; fin: number; metros: number }
  | { tipo: 'sin_datos'; inicio: number; fin: number }
  | { tipo: 'pausa'; inicio: number; fin: number; nombre: string }

const ms = (iso: string) => new Date(iso).getTime()

export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6_371_000
  const rad = Math.PI / 180
  const df = (b.lat - a.lat) * rad
  const dl = (b.lng - a.lng) * rad
  const h = Math.sin(df / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

/** Tramos continuos para dibujar (se corta en los huecos largos). */
export function tramos(puntos: PuntoRecorrido[]): PuntoRecorrido[][] {
  const salida: PuntoRecorrido[][] = []
  let actual: PuntoRecorrido[] = []
  for (const p of puntos) {
    if (actual.length && ms(p.hora) - ms(actual[actual.length - 1].hora) > MAX_HUECO_MS) {
      salida.push(actual)
      actual = []
    }
    actual.push(p)
  }
  if (actual.length) salida.push(actual)
  return salida
}

/** Metros recorridos entre dos horas (sin cruzar huecos largos). */
export function metrosEntre(puntos: PuntoRecorrido[], desde: number, hasta: number) {
  let total = 0
  for (let i = 1; i < puntos.length; i++) {
    const a = ms(puntos[i - 1].hora)
    const b = ms(puntos[i].hora)
    if (a >= desde && b <= hasta && b - a <= MAX_HUECO_MS) total += distanciaM(puntos[i - 1], puntos[i])
  }
  return total
}

/**
 * Arma la línea de tiempo: entrada → trayecto → parada → … → almuerzo → … → salida (o "en curso").
 * `ahora` se usa para la jornada que sigue abierta.
 */
export function construirLinea(r: Recorrido, ahora: number = Date.now()): Evento[] {
  const eventos: Evento[] = []
  let numero = 0
  const ultimoPunto = r.puntos.length ? ms(r.puntos[r.puntos.length - 1].hora) : 0

  for (const j of r.jornadas) {
    const inicio = ms(j.inicio)
    const fin = j.fin ? ms(j.fin) : Math.max(Math.min(ahora, Date.now()), ultimoPunto)
    eventos.push({ tipo: 'entrada', hora: inicio })

    // Paradas y pausas de esta jornada, en orden
    const dentro: Evento[] = [
      ...r.paradas
        .filter((p) => ms(p.inicio) >= inicio && ms(p.inicio) <= fin)
        .map((p) => ({ tipo: 'parada' as const, inicio: ms(p.inicio), fin: ms(p.fin), numero: 0, parada: p })),
      ...r.pausas
        .map((p) => ({ tipo: 'pausa' as const, inicio: Math.max(ms(p.inicio), inicio), fin: Math.min(ms(p.fin), fin), nombre: p.nombre }))
        .filter((p) => p.fin > p.inicio),
    ].sort((a, b) => (a as { inicio: number }).inicio - (b as { inicio: number }).inicio)

    let cursor = inicio
    // Entre dos eventos: trayectos, cortados por "sin datos" donde no hubo puntos por más de 20 min
    const hueco = (desde: number, hasta: number) => {
      if (hasta - desde < MIN_TRAMO_MS) return
      const marcas = [desde, ...r.puntos.map((p) => ms(p.hora)).filter((x) => x > desde && x < hasta), hasta]
      let inicioTramo = desde
      const trayecto = (a: number, b: number) => {
        if (b - a >= MIN_TRAMO_MS) eventos.push({ tipo: 'trayecto', inicio: a, fin: b, metros: metrosEntre(r.puntos, a, b) })
      }
      for (let k = 1; k < marcas.length; k++) {
        if (marcas[k] - marcas[k - 1] > MAX_HUECO_MS) {
          trayecto(inicioTramo, marcas[k - 1])
          eventos.push({ tipo: 'sin_datos', inicio: marcas[k - 1], fin: marcas[k] })
          inicioTramo = marcas[k]
        }
      }
      trayecto(inicioTramo, hasta)
    }
    for (const e of dentro) {
      const ev = e as Extract<Evento, { inicio: number }>
      hueco(cursor, ev.inicio)
      if (ev.tipo === 'parada') eventos.push({ ...ev, numero: ++numero })
      else eventos.push(ev)
      cursor = Math.max(cursor, ev.fin)
    }
    hueco(cursor, fin)
    eventos.push(j.fin ? { tipo: 'salida', hora: fin } : { tipo: 'en_curso', hora: fin })
  }
  return eventos
}

/** Dónde estaba a la hora `t` (interpolando entre puntos). null si está en un hueco sin datos. */
export function posicionEn(puntos: PuntoRecorrido[], t: number): { lat: number; lng: number } | null {
  if (!puntos.length) return null
  let bajo = 0
  let alto = puntos.length - 1
  if (t <= ms(puntos[0].hora)) return puntos[0]
  if (t >= ms(puntos[alto].hora)) return puntos[alto]
  while (alto - bajo > 1) {
    const medio = (bajo + alto) >> 1
    if (ms(puntos[medio].hora) <= t) bajo = medio
    else alto = medio
  }
  const a = puntos[bajo]
  const b = puntos[alto]
  const ta = ms(a.hora)
  const tb = ms(b.hora)
  if (tb - ta > MAX_HUECO_MS) return null
  const f = tb === ta ? 0 : (t - ta) / (tb - ta)
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }
}

/** "14 min", "2 h 08". */
export function duracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

/** "350 m", "14,8 km". */
export function distanciaTexto(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`
  return `${(metros / 1000).toLocaleString('es-BO', { maximumFractionDigits: 1 })} km`
}
