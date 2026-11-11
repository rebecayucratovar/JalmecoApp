import { HammerIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { seccionDe } from '@/secciones'

/** Pantalla provisoria mientras se construye cada sección. */
export function Proximamente() {
  const seccion = seccionDe(useLocation().pathname)
  const Icono = seccion?.icono ?? HammerIcon

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Icono className="size-7" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold">{seccion?.titulo ?? 'Página'} · en construcción</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{seccion?.descripcion}</p>
      </div>
    </div>
  )
}

export function NoEncontrada() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">No encontramos esta página</h2>
        <p className="mt-2 text-sm text-muted-foreground">Puede que el enlace esté mal escrito.</p>
        <Button asChild className="mt-5">
          <Link to="/">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  )
}
