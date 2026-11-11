import { describe, expect, it } from 'vitest'

import { fechaEncabezado, iniciales } from './formato'

describe('formato', () => {
  it('fecha del encabezado en hora de La Paz (UTC−4)', () => {
    expect(fechaEncabezado(new Date('2026-11-11T20:45:00Z'))).toBe('Miércoles 11 de noviembre · 16:45')
    // 02:30 UTC del jueves = 22:30 del miércoles en La Paz
    expect(fechaEncabezado(new Date('2026-11-12T02:30:00Z'))).toBe('Miércoles 11 de noviembre · 22:30')
  })

  it('iniciales', () => {
    expect(iniciales('Carla Rojas')).toBe('CR')
    expect(iniciales('Wilmer Huanca Callisaya')).toBe('WH')
    expect(iniciales('Luis Fernando Choque Apaza')).toBe('LC')
    expect(iniciales('  ana   pérez  ')).toBe('AP')
    expect(iniciales('Juan')).toBe('J')
    expect(iniciales('')).toBe('')
  })
})
