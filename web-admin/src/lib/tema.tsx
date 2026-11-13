/** Tema claro / oscuro / según el sistema (se recuerda en este navegador). */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Tema = 'claro' | 'oscuro' | 'sistema'

const CLAVE = 'jalmeco-gps.tema'

interface ValorTema {
  tema: Tema
  /** El que se ve realmente (resuelve "sistema"). */
  efectivo: 'claro' | 'oscuro'
  cambiar(tema: Tema): void
}

const ContextoTema = createContext<ValorTema | null>(null)

function leerGuardado(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    if (t === 'claro' || t === 'oscuro' || t === 'sistema') return t
  } catch {
    // sin almacenamiento
  }
  return 'sistema'
}

function sistemaOscuro() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ProveedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(leerGuardado)
  const [oscuroSistema, setOscuroSistema] = useState(sistemaOscuro)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiar = () => setOscuroSistema(consulta.matches)
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])

  const efectivo = tema === 'sistema' ? (oscuroSistema ? 'oscuro' : 'claro') : tema

  useEffect(() => {
    document.documentElement.classList.toggle('dark', efectivo === 'oscuro')
  }, [efectivo])

  const valor = useMemo<ValorTema>(
    () => ({
      tema,
      efectivo,
      cambiar(nuevo) {
        setTema(nuevo)
        try {
          localStorage.setItem(CLAVE, nuevo)
        } catch {
          // sin almacenamiento: solo dura esta visita
        }
      },
    }),
    [tema, efectivo],
  )
  return <ContextoTema.Provider value={valor}>{children}</ContextoTema.Provider>
}

export function useTema() {
  const valor = useContext(ContextoTema)
  if (!valor) throw new Error('useTema debe usarse dentro de <ProveedorTema>')
  return valor
}
