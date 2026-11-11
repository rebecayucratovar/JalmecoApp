import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { Marco } from '@/components/marco/Marco'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Api, ApiError } from '@/lib/api'
import { AlmacenObservable, ProveedorSesion } from '@/lib/sesion'
import { ProveedorTema } from '@/lib/tema'
import { LoginPagina } from '@/paginas/LoginPagina'
import { NoEncontrada, Proximamente } from '@/paginas/Proximamente'
import { SECCIONES } from '@/secciones'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPagina /> },
  {
    element: <Marco />,
    children: [
      // Cada sección reemplaza su <Proximamente /> al construirse
      ...SECCIONES.map((s) => ({ path: s.ruta, element: <Proximamente /> })),
      { path: '*', element: <NoEncontrada /> },
    ],
  },
])

function crearClienteConsultas() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Reintentar solo errores de red o del servidor (no 4xx: no cambiarían al repetir)
        retry: (intentos, error) =>
          intentos < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        staleTime: 5_000,
      },
    },
  })
}

export default function App() {
  const [almacen] = useState(() => new AlmacenObservable())
  const [api] = useState(() => new Api(almacen))
  const [consultas] = useState(crearClienteConsultas)

  // Al cerrar sesión (o expirar) se borran los datos en memoria del administrador anterior
  useEffect(() => almacen.suscribir(() => {
    if (!almacen.leer()) consultas.clear()
  }), [almacen, consultas])

  return (
    <ProveedorTema>
      <ProveedorSesion almacen={almacen} api={api}>
        <QueryClientProvider client={consultas}>
          <TooltipProvider delayDuration={300}>
            <RouterProvider router={router} />
            <Toaster position="top-right" />
          </TooltipProvider>
        </QueryClientProvider>
      </ProveedorSesion>
    </ProveedorTema>
  )
}
