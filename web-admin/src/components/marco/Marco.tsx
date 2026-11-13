import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/utils'
import { seccionDe } from '@/secciones'

import { Encabezado } from './Encabezado'
import { MenuLateral } from './MenuLateral'

const CLAVE_CONTRAIDO = 'jalmeco-gps.menu-contraido'

function leerContraido() {
  try {
    return localStorage.getItem(CLAVE_CONTRAIDO) === '1'
  } catch {
    return false
  }
}

/** Estructura de todas las pantallas con sesión: menú lateral + encabezado + contenido. */
export function Marco() {
  const { admin } = useSesion()
  const ubicacion = useLocation()
  const [contraido, setContraido] = useState(leerContraido)
  const [cajonAbierto, setCajonAbierto] = useState(false)

  // Cerrar el cajón (celular) con Escape
  useEffect(() => {
    if (!cajonAbierto) return
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setCajonAbierto(false)
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [cajonAbierto])

  if (!admin) {
    // Sin sesión (o expiró): al login, recordando a dónde iba
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />
  }

  const alternarContraido = () => {
    setContraido((c) => {
      try {
        localStorage.setItem(CLAVE_CONTRAIDO, c ? '0' : '1')
      } catch {
        // sin almacenamiento
      }
      return !c
    })
  }

  const titulo = seccionDe(ubicacion.pathname)?.titulo ?? 'Jalmeco GPS'

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background">
      {/* Escritorio: menú fijo */}
      <aside className="hidden shrink-0 lg:block">
        <MenuLateral contraido={contraido} alContraer={alternarContraido} />
      </aside>

      {/* Celular/tablet: menú como cajón */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', !cajonAbierto && 'pointer-events-none')} inert={!cajonAbierto}>
        <div
          className={cn('absolute inset-0 bg-black/40 transition-opacity', cajonAbierto ? 'opacity-100' : 'opacity-0')}
          onClick={() => setCajonAbierto(false)}
        />
        <div className={cn('absolute inset-y-0 left-0 transition-transform', cajonAbierto ? 'translate-x-0' : '-translate-x-full')}>
          <MenuLateral contraido={false} alNavegar={() => setCajonAbierto(false)} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado titulo={titulo} alAbrirMenu={() => setCajonAbierto(true)} />
        {/* relative: lo posicionado en absoluto (p. ej. tablas sr-only) queda dentro de este scroll
            y no estira la página, que daría un segundo scroll */}
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
