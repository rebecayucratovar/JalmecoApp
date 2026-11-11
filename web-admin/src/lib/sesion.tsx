/**
 * Sesión del administrador: se guarda en localStorage y se comparte entre pestañas
 * (si cierras sesión en una, se cierra en todas).
 */
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'

import { Api, type Admin, type AlmacenSesion, type DatosSesion } from './api'

const CLAVE = 'jalmeco-gps.sesion'

/** Almacén observable: la interfaz se entera cuando la sesión cambia (login, renovación, cierre). */
export class AlmacenObservable implements AlmacenSesion {
  private avisos = new Set<() => void>()
  private cache: DatosSesion | null | undefined

  private readonly storage: Storage | null

  constructor(storage: Storage | null = navegadorStorage()) {
    this.storage = storage
    window.addEventListener('storage', (e) => {
      if (e.key === CLAVE) {
        this.cache = undefined
        this.avisar()
      }
    })
  }

  leer(): DatosSesion | null {
    if (this.cache === undefined) {
      try {
        const crudo = this.storage?.getItem(CLAVE)
        this.cache = crudo ? (JSON.parse(crudo) as DatosSesion) : null
      } catch {
        this.cache = null
      }
    }
    return this.cache
  }

  guardar(sesion: DatosSesion | null) {
    this.cache = sesion
    try {
      if (sesion) this.storage?.setItem(CLAVE, JSON.stringify(sesion))
      else this.storage?.removeItem(CLAVE)
    } catch {
      // Sin almacenamiento (modo privado estricto): la sesión dura mientras la pestaña esté abierta
    }
    this.avisar()
  }

  suscribir = (aviso: () => void) => {
    this.avisos.add(aviso)
    return () => {
      this.avisos.delete(aviso)
    }
  }

  private avisar() {
    this.avisos.forEach((a) => a())
  }
}

function navegadorStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

interface ValorSesion {
  api: Api
  admin: Admin | null
  iniciar(email: string, password: string): Promise<void>
  cerrar(): void
}

const ContextoSesion = createContext<ValorSesion | null>(null)

export function ProveedorSesion({ children, almacen, api }: { children: ReactNode; almacen: AlmacenObservable; api: Api }) {
  const datos = useSyncExternalStore(almacen.suscribir, () => almacen.leer())
  const admin = datos?.admin ?? null

  const iniciar = useCallback(async (email: string, password: string) => {
    await api.login(email, password)
  }, [api])
  const cerrar = useCallback(() => api.cerrarSesion(), [api])

  const valor = useMemo(() => ({ api, admin, iniciar, cerrar }), [api, admin, iniciar, cerrar])
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}

export function useSesion() {
  const valor = useContext(ContextoSesion)
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>')
  return valor
}
