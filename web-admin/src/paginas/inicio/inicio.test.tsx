import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { Api } from '@/lib/api'
import { hoyLaPaz, sumarDias } from '@/lib/formato'
import { AlmacenObservable, ProveedorSesion } from '@/lib/sesion'

import InicioPagina, { type Dashboard } from './InicioPagina'

// Leaflet no se dibuja en jsdom: el mapa se prueba en su pantalla
vi.mock('@/paginas/mapa/MapaLeaflet', () => ({ MapaLeaflet: () => <div>mapa</div> }))

const hoy = hoyLaPaz()
const DATOS: Dashboard = {
  actualizado_en: new Date().toISOString(),
  personal: { activos: 48, en_jornada: 12, en_trayecto: 7, en_parada: 4, sin_conexion: 1, trabajaron_hoy: 14, sin_pin: 3 },
  alertas: { nuevas: 2, criticas: 1, hoy: 5 },
  verificaciones_hoy: { pedidas: 10, exito: 8, no_realizadas: 1, pendientes: 1 },
  sin_conexion_min: 30,
  horas_campo: Array.from({ length: 7 }, (_, i) => ({ fecha: sumarDias(hoy, i - 6), horas: i === 6 ? 31.5 : 80, personas: 10 })),
}

function montar(datos: Dashboard) {
  const almacen = new AlmacenObservable(null)
  almacen.guardar({ access: 'a', refresh: 'r', admin: { id: 1, nombre: 'Ana', email: 'a@j.com' } })
  const alerta = { id: 1, tecnico: { id: 7, nombre: 'Juan Mamani', codigo: 'JAL-1021', cargo: null, celular_numero: null, en_jornada: true },
    tipo: 'bateria_baja', mensaje: 'Batería al 9 %', nivel: 'advertencia', creada_en: new Date().toISOString(), estado: 'nueva', atendida_por: null, atendida_en: null }
  const respuestas: Record<string, unknown> = {
    dashboard: datos,
    'alertas/resumen': datos.alertas.nuevas ? { nuevas: 7, criticas: 1, ultimas: [alerta] } : { nuevas: 0, criticas: 0, ultimas: [] },
    'mapa-en-vivo': { actualizado_en: datos.actualizado_en, tecnicos: [] },
  }
  const f = vi.fn(async (url: string) => new Response(JSON.stringify(respuestas[url.replace('/api/v1/', '')]), { status: 200 }))
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
  it('muestra indicadores, últimas alertas y las horas', async () => {
    montar(DATOS)
    expect(await screen.findByText('36 fuera de jornada')).toBeInTheDocument()
    expect(screen.getByText('sin datos por más de 30 min')).toBeInTheDocument()
    expect(screen.getByText('1 crítica · requieren atención')).toBeInTheDocument()
    expect(screen.getByText(/3 personas no tienen/).closest('a')).toHaveAttribute('href', '/tecnicos?vista=sin_pin')
    expect(await screen.findByText('Juan Mamani')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver batería baja de Juan Mamani' })).toHaveAttribute('href', '/mapa?tecnico=7')
    expect(screen.getByText('y 6 más sin atender')).toBeInTheDocument()
    expect(screen.getByText('511,5 h')).toBeInTheDocument()
    expect(screen.getByText('Hoy (jornada en curso)')).toBeInTheDocument()
  })

  it('sin datos: mensajes vacíos claros', async () => {
    montar({ ...DATOS, personal: { ...DATOS.personal, en_jornada: 0, sin_pin: 0 }, alertas: { nuevas: 0, criticas: 0, hoy: 0 },
      verificaciones_hoy: { pedidas: 0, exito: 0, no_realizadas: 0, pendientes: 0 },
      horas_campo: DATOS.horas_campo.map((d) => ({ ...d, horas: 0, personas: 0 })) })
    expect(await screen.findByText('No hay alertas sin atender.')).toBeInTheDocument()
    expect(screen.getByText(/Sin jornadas en los últimos 7 días/)).toBeInTheDocument()
    expect(screen.getByText('aún no se pidieron huellas hoy')).toBeInTheDocument()
    expect(screen.queryByText(/no tienen/)).not.toBeInTheDocument()
  })
})
