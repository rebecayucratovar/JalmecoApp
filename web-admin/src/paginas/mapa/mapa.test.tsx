import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { haceCuanto, normalizar } from '@/lib/formato'

import { contarPorEstado, filtrar, type TecnicoMapa } from './datos'
import { ListaPersonal } from './ListaPersonal'

const AHORA = new Date('2026-11-11T15:00:00Z')

function tec(id: number, nombre: string, estado: TecnicoMapa['estado_actual'], extra: Partial<TecnicoMapa> = {}): TecnicoMapa {
  const enJornada = estado !== 'fuera_jornada'
  return {
    id, nombre, codigo: `JAL-${1000 + id}`, cargo: 'Técnico', foto_url: null, estado_actual: estado,
    ultima_lat: enJornada ? -16.5 : null, ultima_lng: enJornada ? -68.1 : null,
    ultima_bateria: enJornada ? 80 : null, ultima_velocidad: enJornada ? 32.4 : null,
    ultima_actualizacion: enJornada ? '2026-11-11T14:59:30Z' : null,
    celular_modelo: null, celular_numero: null, jornada_inicio: enJornada ? '2026-11-11T12:00:00Z' : null,
    ...extra,
  }
}

const PERSONAL = [
  tec(1, 'Óscar Peña', 'en_trayecto'),
  tec(2, 'Juan Mamani', 'en_parada', { cargo: 'Supervisor de campo' }),
  tec(3, 'Freddy Quispe', 'sin_conexion'),
  tec(4, 'Ana Condori', 'fuera_jornada'),
]

describe('lógica del mapa', () => {
  it('cuenta por estado', () => {
    expect(contarPorEstado(PERSONAL)).toEqual({ todos: 4, en_trayecto: 1, en_parada: 1, sin_conexion: 1, fuera_jornada: 1 })
  })

  it('filtra por estado y busca sin importar tildes, código ni cargo', () => {
    expect(filtrar(PERSONAL, 'en_parada', '').map((t) => t.id)).toEqual([2])
    expect(filtrar(PERSONAL, 'todos', 'oscar').map((t) => t.id)).toEqual([1])
    expect(filtrar(PERSONAL, 'todos', 'jal-1003').map((t) => t.id)).toEqual([3])
    expect(filtrar(PERSONAL, 'todos', 'supervisor').map((t) => t.id)).toEqual([2])
    expect(filtrar(PERSONAL, 'en_trayecto', 'juan')).toEqual([])
  })

  it('tiempo relativo y normalización', () => {
    expect(haceCuanto('2026-11-11T14:59:30Z', AHORA)).toBe('hace 30 s')
    expect(haceCuanto('2026-11-11T14:45:00Z', AHORA)).toBe('hace 15 min')
    expect(haceCuanto('2026-11-11T12:00:00Z', AHORA)).toBe('hace 3 h')
    expect(normalizar(' Óscar PEÑA ')).toBe('oscar pena')
  })
})

describe('ListaPersonal', () => {
  function montar(props: Partial<Parameters<typeof ListaPersonal>[0]> = {}) {
    const alFiltrar = vi.fn()
    const alSeleccionar = vi.fn()
    render(
      <ListaPersonal
        todos={PERSONAL}
        visibles={PERSONAL}
        filtro="todos"
        busqueda=""
        seleccionado={null}
        ahora={AHORA}
        alFiltrar={alFiltrar}
        alBuscar={vi.fn()}
        alSeleccionar={alSeleccionar}
        {...props}
      />,
    )
    return { alFiltrar, alSeleccionar }
  }

  it('muestra estado, tiempo y velocidad; fuera de jornada sin datos de ubicación', () => {
    montar()
    expect(screen.getByText('En trayecto · hace 30 s')).toBeInTheDocument()
    expect(screen.getByText('32 km/h')).toBeInTheDocument()
    expect(screen.getAllByText('Fuera de jornada').length).toBeGreaterThan(0)
    expect(screen.getByText('4 personas')).toBeInTheDocument()
  })

  it('los filtros muestran la cantidad y avisan al elegir', async () => {
    const { alFiltrar } = montar()
    const chip = screen.getByRole('button', { name: /Sin conexión\s*1/ })
    await userEvent.click(chip)
    expect(alFiltrar).toHaveBeenCalledWith('sin_conexion')
  })

  it('elegir a alguien avisa su id', async () => {
    const { alSeleccionar } = montar()
    await userEvent.click(screen.getByRole('button', { name: /Juan Mamani/ }))
    expect(alSeleccionar).toHaveBeenCalledWith(2)
  })

  it('mensaje cuando el filtro no deja a nadie', () => {
    montar({ visibles: [] })
    expect(screen.getByText('Nadie coincide con la búsqueda o el filtro.')).toBeInTheDocument()
  })
})
