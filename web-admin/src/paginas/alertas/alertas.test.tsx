import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { Api } from '@/lib/api'
import { AlmacenObservable, ProveedorSesion } from '@/lib/sesion'

import AlertasPagina from './AlertasPagina'

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

const alerta = (id: number, extra = {}) => ({
  id,
  tecnico: { id: 7, nombre: 'Juan Mamani', codigo: 'JAL-1021', cargo: null, celular_numero: null, en_jornada: true },
  tipo: 'sin_conexion', mensaje: 'Sin datos del celular desde las 16:15.', nivel: 'advertencia',
  creada_en: new Date().toISOString(), estado: 'nueva', atendida_por: null, atendida_en: null, ...extra,
})

function montar(f: typeof fetch, ruta = '/alertas') {
  const almacen = new AlmacenObservable(null)
  almacen.guardar({ access: 'a', refresh: 'r', admin: { id: 1, nombre: 'Ana', email: 'a@j.com' } })
  const router = createMemoryRouter([{ path: '/alertas', element: <AlertasPagina /> }], { initialEntries: [ruta] })
  render(
    <ProveedorSesion almacen={almacen} api={new Api(almacen, { fetch: f })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider><RouterProvider router={router} /></TooltipProvider>
      </QueryClientProvider>
    </ProveedorSesion>,
  )
}

describe('AlertasPagina', () => {
  it('lista las nuevas, con enlace al mapa, y marca una como atendida', async () => {
    const pedidos: string[] = []
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      pedidos.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('/atender')) return json(alerta(1, { estado: 'atendida' }))
      return json({ desde: '2026-11-05', hasta: '2026-11-11', limitado: false, conteo: { todas: 3, nuevas: 2, atendidas: 1 },
        alertas: [alerta(1), alerta(2, { tipo: 'verificacion_no_realizada', nivel: 'critico', tecnico: { id: 8, nombre: 'Luis', codigo: null, cargo: null, celular_numero: null, en_jornada: false } })] })
    })
    montar(f as unknown as typeof fetch)
    expect(await screen.findByText('2 alertas nuevas sin atender', { exact: false })).toBeInTheDocument()
    expect(pedidos[0]).toMatch(/GET \/api\/v1\/alertas\?desde=.*&hasta=.*&estado=nueva/)
    expect(screen.getByText('Crítica')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a Juan Mamani en el mapa' })).toHaveAttribute('href', '/mapa?tecnico=7')
    expect(screen.getByRole('button', { name: 'Fuera de jornada' })).toBeDisabled()

    const fila = screen.getByText('Juan Mamani').closest('li')!
    await userEvent.click(within(fila).getByRole('button', { name: /Marcar atendida/ }))
    await vi.waitFor(() => expect(pedidos).toContain('POST /api/v1/alertas/1/atender'))
  })

  it('"marcar todas" envía solo las nuevas que se ven', async () => {
    const cuerpos: unknown[] = []
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('atender-todas')) {
        cuerpos.push(JSON.parse(String(init?.body)))
        return json({ atendidas: 1 })
      }
      return json({ desde: 'x', hasta: 'x', limitado: false, conteo: { todas: 2, nuevas: 1, atendidas: 1 },
        alertas: [alerta(3), alerta(4, { estado: 'atendida', atendida_por: 'Ana', atendida_en: new Date().toISOString() })] })
    })
    montar(f as unknown as typeof fetch, '/alertas?estado=todas')
    await screen.findByText(/Atendida por Ana/)
    await userEvent.click(screen.getByRole('button', { name: /como atendidas/ }))
    await vi.waitFor(() => expect(cuerpos).toEqual([{ ids: [3] }]))
  })

  it('sin alertas muestra el estado vacío', async () => {
    montar(vi.fn(async () => json({ desde: 'x', hasta: 'x', limitado: false, conteo: { todas: 0, nuevas: 0, atendidas: 0 }, alertas: [] })))
    expect(await screen.findByText('No hay alertas sin atender')).toBeInTheDocument()
  })
})
