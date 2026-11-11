import { describe, expect, it } from 'vitest'

import { hoyLaPaz, sumarDias, type PuntoRecorrido, type Recorrido } from './datos'
import { construirLinea, distanciaTexto, duracion, posicionEn, tramos } from './linea'

// Horas de La Paz (UTC−4) del 10/11/2026
const lp = (h: number, m = 0) => `2026-11-10T${String(h + 4).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`
const t = (h: number, m = 0) => new Date(lp(h, m)).getTime()
const pt = (h: number, m: number, lat: number): PuntoRecorrido => ({ lat, lng: -68.1, hora: lp(h, m), velocidad: null, bateria: null })

function recorrido(extra: Partial<Recorrido> = {}): Recorrido {
  return {
    fecha: '2026-11-10',
    jornadas: [{ id: 1, inicio: lp(8), fin: lp(17), estado: 'cerrada' }],
    resumen: { en_jornada_min: 480, en_paradas_min: 0, paradas: 1, distancia_km: 1, puntos: 0 },
    puntos: [pt(8, 0, -16.5), pt(8, 10, -16.51), pt(8, 20, -16.52), pt(9, 0, -16.52), pt(11, 50, -16.52),
      pt(13, 0, -16.52), pt(13, 10, -16.53), pt(16, 50, -16.53)],
    paradas: [{ lat: -16.52, lng: -68.1, inicio: lp(8, 20), fin: lp(9, 0), duracion_min: 40 }],
    pausas: [{ nombre: 'Almuerzo', inicio: lp(12), fin: lp(13) }],
    ...extra,
  }
}

describe('línea de tiempo', () => {
  it('entrada → trayecto → parada → … → almuerzo → … → salida', () => {
    const eventos = construirLinea(recorrido())
    expect(eventos.map((e) => e.tipo)).toEqual([
      'entrada', 'trayecto', 'parada',
      'sin_datos', 'trayecto', // 9:00–11:50 sin puntos; 11:50–12:00
      'pausa',
      'trayecto', 'sin_datos', 'trayecto', // 13:00–13:10; 13:10–16:50 sin puntos; 16:50–17:00
      'salida',
    ])
    const parada = eventos[2]
    expect(parada.tipo === 'parada' && parada.numero).toBe(1)
    const primerTrayecto = eventos[1]
    expect(primerTrayecto.tipo === 'trayecto' && Math.round(primerTrayecto.metros / 100)).toBe(22) // ~2,2 km
  })

  it('jornada abierta termina en "en curso"', () => {
    const eventos = construirLinea(recorrido({ jornadas: [{ id: 1, inicio: lp(8), fin: null, estado: 'activa' }], pausas: [] }), t(10))
    expect(eventos[eventos.length - 1].tipo).toBe('en_curso')
  })

  it('tramos se cortan en huecos de más de 20 min (no se dibuja a través del almuerzo)', () => {
    expect(tramos(recorrido().puntos).map((x) => x.length)).toEqual([3, 1, 1, 2, 1])
  })
})

describe('reproducción', () => {
  it('interpola entre puntos y no inventa posición en un hueco', () => {
    const puntos = [pt(8, 0, -16.5), pt(8, 10, -16.51), pt(9, 0, -16.6)]
    expect(posicionEn(puntos, t(8, 5))?.lat).toBeCloseTo(-16.505, 5)
    expect(posicionEn(puntos, t(7))?.lat).toBe(-16.5)
    expect(posicionEn(puntos, t(8, 30))).toBeNull()
  })
})

describe('formatos y fechas', () => {
  it('duración y distancia', () => {
    expect(duracion(14)).toBe('14 min')
    expect(duracion(128)).toBe('2 h 08')
    expect(distanciaTexto(350)).toBe('350 m')
    expect(distanciaTexto(14_800)).toBe('14,8 km')
  })

  it('fechas en La Paz', () => {
    expect(hoyLaPaz(new Date('2026-11-12T02:30:00Z'))).toBe('2026-11-11') // 22:30 del 11 en La Paz
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })
})
