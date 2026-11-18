import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { Api } from '@/lib/api'
import { AlmacenObservable, ProveedorSesion } from '@/lib/sesion'

import ConfiguracionPagina from './ConfiguracionPagina'
import { cambios, listaCorreos } from './datos'

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

const CONFIG = {
  horario_inicio: '08:00', horario_fin: '18:00', cierre_auto_horas: 4, almuerzo: { inicio: '12:00', fin: '13:00' },
  verificaciones_por_dia: 2, verificacion_limite_min: 3, gps_distancia_m: 25, gps_intervalo_seg: 120,
  sin_conexion_min: 30, bateria_baja_pct: 15, alertas_correos: '', alertas_destinatarios: ['ana@j.com'],
  correo_activo: false, retencion_meses: 12, odoo_sync_min: 2, espejo_odoo_min: 8,
}

const ODOO = { url: 'https://jalmeco.odoo.com', db: 'b', usuario: null, faltan: ['ODOO_USUARIO', 'ODOO_API_KEY'], ultima_sync_ok: null, historial: [] }

function montar(respuesta: (url: string, init?: RequestInit) => Promise<Response>, ruta = '/configuracion') {
  const f = (url: string, init?: RequestInit) => (url.includes('odoo/estado') ? Promise.resolve(json(ODOO)) : respuesta(url, init))
  const almacen = new AlmacenObservable(null)
  almacen.guardar({ access: 'a', refresh: 'r', admin: { id: 1, nombre: 'Ana', email: 'ana@j.com' } })
  const router = createMemoryRouter([{ path: '/configuracion', element: <ConfiguracionPagina /> }], { initialEntries: [ruta] })
  render(
    <ProveedorSesion almacen={almacen} api={new Api(almacen, { fetch: vi.fn(f) as unknown as typeof fetch })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider><RouterProvider router={router} /></TooltipProvider>
      </QueryClientProvider>
    </ProveedorSesion>,
  )
  return almacen
}

describe('ayudas de configuración', () => {
  it('cambios: solo lo distinto (también objetos)', () => {
    expect(cambios({ a: 1, b: { x: '1' } }, { a: 1, b: { x: '2' } })).toEqual({ b: { x: '2' } })
    expect(cambios({ a: 1 }, { a: 1 })).toEqual({})
  })
  it('listaCorreos separa por coma, punto y coma o líneas', () => {
    expect(listaCorreos(' a@x.com; b@x.com\nc@x.com, ')).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
  })
})

describe('ConfiguracionPagina', () => {
  it('guarda solo lo que cambió en una sección y muestra el error del servidor', async () => {
    const enviados: unknown[] = []
    montar(async (_url, init) => {
      if (init?.method === 'PUT') {
        const cuerpo = JSON.parse(String(init.body))
        enviados.push(cuerpo)
        if (cuerpo.sin_conexion_min === 1) {
          return json({ error: 'Datos inválidos.', codigo: 'DATOS_INVALIDOS', detalle: { sin_conexion_min: ['Mínimo 3.'] } }, 400)
        }
        return json({ ...CONFIG, ...cuerpo })
      }
      return json(CONFIG)
    }, '/configuracion?seccion=alertas')

    const campo = await screen.findByLabelText('“Sin conexión” después de')
    expect(screen.getByText(/servidor de correo aún no está configurado/)).toBeInTheDocument()
    const guardar = screen.getAllByRole('button', { name: 'Guardar cambios' }).find((b) => b.closest('form')?.contains(campo))!
    expect(guardar).toBeDisabled()

    await userEvent.clear(campo)
    await userEvent.type(campo, '1')
    await userEvent.click(guardar)
    expect(await screen.findByText('Mínimo 3.')).toBeInTheDocument()
    expect(enviados).toEqual([{ sin_conexion_min: 1 }])

    await userEvent.clear(campo)
    await userEvent.type(campo, '45')
    await userEvent.click(guardar)
    await vi.waitFor(() => expect(enviados).toHaveLength(2))
    expect(enviados[1]).toEqual({ sin_conexion_min: 45 })
  })

  it('avisa antes de reducir la retención', async () => {
    montar(async () => json(CONFIG), '/configuracion?seccion=odoo')
    const campo = await screen.findByLabelText('Guardar ubicaciones y recorridos')
    expect(await screen.findByText(/Faltan datos para conectar/)).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, '6')
    expect(screen.getByText(/se borrarán las ubicaciones/)).toBeInTheDocument()
  })

  it('cambio de contraseña: valida que coincidan y guarda los tokens nuevos', async () => {
    const pedidos: string[] = []
    const almacen = montar(async (url, init) => {
      pedidos.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('mi-cuenta/password')) return json({ access: 'nuevo-a', refresh: 'nuevo-r' })
      return json(CONFIG)
    }, '/configuracion?seccion=cuenta')

    await userEvent.type(await screen.findByLabelText('Contraseña actual'), 'vieja-123')
    await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'Ascensor-77')
    await userEvent.type(screen.getByLabelText('Repite la nueva'), 'Ascensor-78')
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    expect(screen.getByText('No coincide con la nueva contraseña.')).toBeInTheDocument()
    expect(pedidos.some((p) => p.includes('password'))).toBe(false)

    await userEvent.clear(screen.getByLabelText('Repite la nueva'))
    await userEvent.type(screen.getByLabelText('Repite la nueva'), 'Ascensor-77')
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    await vi.waitFor(() => expect(almacen.leer()?.access).toBe('nuevo-a'))
    expect(almacen.leer()?.admin.nombre).toBe('Ana')
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
  })
})
