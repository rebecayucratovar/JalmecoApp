import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Api, ApiError } from '@/lib/api'
import { AlmacenObservable, ProveedorSesion } from '@/lib/sesion'

import { erroresPorCampo, filtrarEmpleados, filtrarTecnicos, formatoCelular, type TecnicoAdmin } from './datos'
import { DialogoImportarOdoo } from './DialogoImportarOdoo'
import { DialogoPin } from './DialogoPin'
import { FormularioTecnico } from './FormularioTecnico'

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

function tec(extra: Partial<TecnicoAdmin> = {}): TecnicoAdmin {
  return {
    id: 7, codigo: 'JAL-1021', nombre: 'Juan Mamani', cargo: 'Técnico', foto_url: null, estado_actual: 'fuera_jornada',
    ultima_lat: null, ultima_lng: null, ultima_bateria: null, ultima_velocidad: null, ultima_actualizacion: null,
    celular_modelo: 'Samsung A15', celular_numero: '+591 71245830', jornada_inicio: null, usuario: 'jmamani', usuario_de_odoo: false,
    activo: true, tiene_pin: false, pin_generado_en: null, equipo_modelo: null, equipo_registrado_en: null,
    odoo_employee_id: null, creado_en: '2026-11-01T12:00:00Z', ...extra,
  }
}

function Proveedores({ f, children }: { f: typeof fetch; children: ReactNode }) {
  const almacen = new AlmacenObservable(null)
  almacen.guardar({ access: 'a', refresh: 'r', admin: { id: 1, nombre: 'Ana', email: 'a@j.com' } })
  return (
    <ProveedorSesion almacen={almacen} api={new Api(almacen, { fetch: f })}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </ProveedorSesion>
  )
}

describe('datos de técnicos', () => {
  it('formato del celular', () => {
    expect(formatoCelular('+591 71245830')).toBe('+591 712 45830')
    expect(formatoCelular(null)).toBe('')
  })

  it('filtros: vista, estado y búsqueda (también por número)', () => {
    const lista = [
      tec({ id: 1, nombre: 'Juan Mamani', tiene_pin: true }),
      tec({ id: 2, nombre: 'Luis Choque', codigo: 'JAL-1034', usuario: 'lchoque', celular_numero: '+591 79999999' }),
      tec({ id: 3, nombre: 'Ex Empleado', codigo: null, usuario: 'ex', activo: false }),
    ]
    expect(filtrarTecnicos(lista, 'activos', 'todos', '').map((t) => t.id)).toEqual([1, 2])
    expect(filtrarTecnicos(lista, 'sin_pin', 'todos', '').map((t) => t.id)).toEqual([2])
    expect(filtrarTecnicos(lista, 'inactivos', 'todos', '').map((t) => t.id)).toEqual([3])
    expect(filtrarTecnicos(lista, 'activos', 'todos', '799 999').map((t) => t.id)).toEqual([2])
    expect(filtrarTecnicos(lista, 'activos', 'todos', 'lchoque').map((t) => t.id)).toEqual([2])
    expect(filtrarTecnicos(lista, 'activos', 'en_trayecto', '')).toEqual([])
  })

  it('errores por campo del backend', () => {
    const e = new ApiError('Datos inválidos.', 400, 'DATOS_INVALIDOS', { codigo: ['Formato JAL-XXXX.'] })
    expect(erroresPorCampo(e)).toEqual({ codigo: 'Formato JAL-XXXX.' })
    expect(erroresPorCampo(new Error('x'))).toEqual({})
    const anidado = new ApiError('Datos inválidos.', 400, 'DATOS_INVALIDOS', { almuerzo: { non_field_errors: ['Termina antes de empezar.'] } })
    expect(erroresPorCampo(anidado)).toEqual({ almuerzo: 'Termina antes de empezar.' })
  })
})

describe('FormularioTecnico', () => {
  it('alta: envía los datos y muestra el error del campo que devuelve el servidor', async () => {
    const cuerpos: unknown[] = []
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      cuerpos.push(JSON.parse(String(init?.body)))
      return json({ error: 'Datos inválidos.', codigo: 'DATOS_INVALIDOS', detalle: { usuario: ['«jmamani» ya lo usa otra persona.'] } }, 400)
    })
    render(<Proveedores f={f as unknown as typeof fetch}><FormularioTecnico abierto alCambiar={vi.fn()} /></Proveedores>)
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Juan Mamani')
    await userEvent.type(screen.getByLabelText('Código'), 'jal-1021')
    await userEvent.type(screen.getByLabelText('Usuario de la app'), 'jmamani')
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }))
    expect(await screen.findByText('«jmamani» ya lo usa otra persona.')).toBeInTheDocument()
    expect(cuerpos[0]).toMatchObject({ nombre: 'Juan Mamani', codigo: 'JAL-1021', usuario: 'jmamani' })
  })

  it('edición: envía solo lo que cambió', async () => {
    const cuerpos: unknown[] = []
    const alCambiar = vi.fn()
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      cuerpos.push(JSON.parse(String(init?.body)))
      return json(tec({ celular_modelo: 'Motorola G54' }))
    })
    render(<Proveedores f={f as unknown as typeof fetch}><FormularioTecnico tecnico={tec()} abierto alCambiar={alCambiar} /></Proveedores>)
    const modelo = screen.getByLabelText('Modelo')
    await userEvent.clear(modelo)
    await userEvent.type(modelo, 'Motorola G54')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledWith(false))
    expect(cuerpos).toEqual([{ celular_modelo: 'Motorola G54' }])
    expect(f.mock.calls[0][0]).toBe('/api/v1/tecnicos/7')
  })

  it('si viene de Odoo, nombre y cargo no se editan (el usuario, solo si es el de Odoo)', () => {
    const { unmount } = render(<Proveedores f={vi.fn()}><FormularioTecnico tecnico={tec({ odoo_employee_id: 55 })} abierto alCambiar={vi.fn()} /></Proveedores>)
    expect(screen.getByLabelText('Nombre completo')).toBeDisabled()
    expect(screen.getByLabelText('Cargo')).toBeDisabled()
    expect(screen.getByLabelText('Código')).toBeEnabled()
    expect(screen.getByLabelText('Usuario de la app')).toBeEnabled()
    unmount()
    render(<Proveedores f={vi.fn()}><FormularioTecnico tecnico={tec({ odoo_employee_id: 55, usuario_de_odoo: true })} abierto alCambiar={vi.fn()} /></Proveedores>)
    expect(screen.getByLabelText('Usuario de la app')).toBeDisabled()
  })
})

describe('DialogoPin', () => {
  it('confirma, muestra el PIN una vez y explica cómo entrar', async () => {
    const f = vi.fn(async () => json({ pin: '480213', generado_en: '2026-11-11T16:00:00Z' }))
    render(<Proveedores f={f}><DialogoPin tecnico={tec()} abierto alCambiar={vi.fn()} /></Proveedores>)
    expect(screen.getByRole('heading', { name: 'Generar PIN' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Generar PIN' }))
    expect(await screen.findByText('480213')).toBeInTheDocument()
    expect(screen.getByText(/No se volverá a mostrar/)).toBeInTheDocument()
    expect(screen.getByText('jmamani')).toBeInTheDocument()
    expect(f).toHaveBeenCalledWith('/api/v1/tecnicos/7/pin', expect.objectContaining({ method: 'POST' }))
  })

  it('si ya tiene PIN, avisa que el anterior deja de funcionar', () => {
    render(<Proveedores f={vi.fn()}><DialogoPin tecnico={tec({ tiene_pin: true })} abierto alCambiar={vi.fn()} /></Proveedores>)
    expect(screen.getByRole('heading', { name: 'Reiniciar PIN' })).toBeInTheDocument()
    expect(screen.getByText(/el anterior dejará de funcionar/)).toBeInTheDocument()
  })
})

describe('DialogoImportarOdoo', () => {
  const EMPLEADOS = [
    { odoo_id: 10, nombre: 'Kevin Apaza', cargo: 'Técnico de mantenimiento', departamento: 'MANTENIMIENTO', empresa: 'JALMECO LTDA', usuario_odoo: null, tecnico_id: null },
    { odoo_id: 11, nombre: 'Ana Mamani', cargo: 'Contadora', departamento: 'ADMINISTRACION', empresa: 'MI EMPRESA', usuario_odoo: 'ana@j.com', tecnico_id: null },
    { odoo_id: 12, nombre: 'Juan Mamani', cargo: 'Instalador', departamento: 'INSTALACION', empresa: 'JALMECO LTDA', usuario_odoo: null, tecnico_id: 7 },
  ]

  it('filtra por empresa y texto', () => {
    expect(filtrarEmpleados(EMPLEADOS, '', 'JALMECO LTDA', '__todos').map((e) => e.odoo_id)).toEqual([10, 12])
    expect(filtrarEmpleados(EMPLEADOS, 'mamani', '__todos', 'ADMINISTRACION').map((e) => e.odoo_id)).toEqual([11])
  })

  it('elige los visibles (no los ya importados) e importa', async () => {
    const enviados: unknown[] = []
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('odoo/empleados')) return json({ empleados: EMPLEADOS })
      enviados.push(JSON.parse(String(init?.body)))
      return json({ importados: 2, actualizados: 0, vinculados: 0, nombres: ['Kevin Apaza', 'Ana Mamani'] })
    })
    const alCambiar = vi.fn()
    render(<Proveedores f={f as unknown as typeof fetch}><DialogoImportarOdoo abierto alCambiar={alCambiar} /></Proveedores>)

    expect(await screen.findByLabelText(/Juan Mamani/)).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Elegir los 2 visibles' }))
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2' }))
    await vi.waitFor(() => expect(alCambiar).toHaveBeenCalledWith(false))
    expect(enviados).toEqual([{ odoo_ids: [10, 11] }])
  })
})
