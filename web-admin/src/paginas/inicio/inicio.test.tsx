import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { Api } from '@/lib/api'
import { hoyLaPaz, sumarDias } from '@/lib/formato'
import { AlmacenObservable, ProveedorSesion } from '@/lib/sesion'

import InicioPagina, { type Dashboard } from './InicioPagina'

const hoy = hoyLaPaz()
const DATOS: Dashboard = {
  actualizado_en: new Date().toISOString(),
  personal: { activos: 48, en_jornada: 12, en_trayecto: 7, en_parada: 4, sin_conexion: 1, trabajaron_hoy: 14, sin_pin: 3 },
  alertas: { nuevas: 2, criticas: 1, hoy: 5 },
  verificaciones_hoy: { pedidas: 10, exito: 8, no_realizadas: 1, pendientes: 1 },
  atencion: [{ id: 7, nombre: 'Juan Mamani', codigo: 'JAL-1021', motivos: ['sin_conexion', 'bateria_baja'], ultima_bateria: 9, ultima_actualizacion: new Date().toISOString() }],
  horas_campo: Array.from({ length: 7 }, (_, i) => ({ fecha: sumarDias(hoy, i - 6), horas: i === 6 ? 31.5 : 80, personas: 10 })),
}

function montar(datos: Dashboard) {
  const almacen = new AlmacenObservable(null)
  almacen.guardar({ access: 'a', refresh: 'r', admin: { id: 1, nombre: 'Ana', email: 'a@j.com' } })
  const f = vi.fn(async () => new Response(JSON.stringify(datos), { status: 200 }))
  const router = createMemoryRouter([{ path: '/', element: <InicioPagina /> }])
  render(
    <ProveedorSesion almacen={almacen} api={new Api(almacen, { fetch: f as unknown as typeof fetch })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider><RouterProvider router={router} /></TooltipProvider>
      </QueryClientProvider>
    </ProveedorSesion>,
  )
}

describe('InicioPagina', () => {
  it('muestra el resumen, quién necesita atención y las horas', async () => {
    montar(DATOS)
    expect(await screen.findByText('de 48 con la app')).toBeInTheDocument()
    expect(screen.getByText('1 crítica')).toBeInTheDocument()
    expect(screen.getByText('3 sin PIN: aún no pueden entrar a la app')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Generar PIN' })).toHaveAttribute('href', '/tecnicos?vista=sin_pin')
    expect(screen.getByText('Juan Mamani').closest('a')).toHaveAttribute('href', '/mapa?tecnico=7')
    expect(screen.getByText('Batería 9%')).toBeInTheDocument()
    expect(screen.getByText('Hoy')).toBeInTheDocument()
    expect(screen.getByText(/Total 511,5 h/)).toBeInTheDocument()
  })

  it('sin datos: mensajes vacíos claros', async () => {
    montar({ ...DATOS, personal: { ...DATOS.personal, en_jornada: 0, sin_pin: 0 }, atencion: [],
      verificaciones_hoy: { pedidas: 0, exito: 0, no_realizadas: 0, pendientes: 0 },
      horas_campo: DATOS.horas_campo.map((d) => ({ ...d, horas: 0, personas: 0 })) })
    expect(await screen.findByText('Nadie está en jornada ahora.')).toBeInTheDocument()
    expect(screen.getByText(/Sin jornadas en los últimos 7 días/)).toBeInTheDocument()
    expect(screen.getByText(/Todavía no se pidió ninguna hoy/)).toBeInTheDocument()
  })
})
