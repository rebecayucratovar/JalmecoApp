import { CarIcon, CircleDotIcon, EyeOffIcon, LogInIcon, LogOutIcon, UtensilsIcon, WifiOffIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { hora } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { distanciaTexto, duracion, type Evento } from './linea'

interface Props {
  eventos: Evento[]
  activo: number | null
  alElegir(indice: number): void
}

const minutos = (desde: number, hasta: number) => (hasta - desde) / 60_000

export function LineaTiempo({ eventos, activo, alElegir }: Props) {
  const lista = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (activo == null) return
    lista.current?.querySelector(`[data-i="${activo}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [activo])

  return (
    <ol ref={lista} className="space-y-1 p-3">
      {eventos.map((e, i) => (
        <li key={i} data-i={i}>
          <button
            type="button"
            onClick={() => alElegir(i)}
            aria-current={activo === i || undefined}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg px-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              e.tipo === 'trayecto' || e.tipo === 'sin_datos' ? 'py-1.5' : 'py-2.5',
              activo === i ? 'bg-accent' : 'hover:bg-muted',
            )}
          >
            <Contenido evento={e} />
          </button>
        </li>
      ))}
    </ol>
  )
}

function Icono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', className)}>{children}</span>
}

function Contenido({ evento: e }: { evento: Evento }) {
  switch (e.tipo) {
    case 'entrada':
      return (
        <>
          <Icono className="bg-exito/15 text-exito"><LogInIcon className="size-4" /></Icono>
          <span>
            <span className="block text-sm font-medium">{e.regreso ? 'Regreso del almuerzo' : 'Entrada'} · {hora(new Date(e.hora))}</span>
            <span className="block text-xs text-muted-foreground">Marcación de asistencia en Odoo</span>
          </span>
        </>
      )
    case 'salida':
      return (
        <>
          <Icono className="bg-muted text-muted-foreground"><LogOutIcon className="size-4" /></Icono>
          <span className="min-w-0 pt-1.5">
            <span className="block text-sm font-medium">{e.almuerzo ? 'Salida al almuerzo' : 'Salida'} · {hora(new Date(e.hora))}</span>
            {e.automatica && (
              <span className="block text-xs text-aviso">No marcó salida en Odoo: la cerró el sistema</span>
            )}
          </span>
        </>
      )
    case 'en_curso':
      return (
        <>
          <Icono className="bg-exito/15 text-exito"><CircleDotIcon className="size-4" /></Icono>
          <span className="block pt-1.5 text-sm font-medium">Jornada en curso</span>
        </>
      )
    case 'parada':
      return (
        <>
          <Icono className="bg-[#d97706] text-xs font-bold text-white">{e.numero}</Icono>
          <span>
            <span className="block text-sm font-medium">Parada</span>
            <span className="block text-sm tabular-nums">
              {hora(new Date(e.inicio))}–{hora(new Date(e.fin))} <span className="font-semibold">({duracion(minutos(e.inicio, e.fin))})</span>
            </span>
          </span>
        </>
      )
    case 'pausa':
      return (
        <>
          <Icono className="bg-muted text-muted-foreground"><UtensilsIcon className="size-4" /></Icono>
          <span>
            <span className="block text-sm font-medium tabular-nums">
              {e.nombre} {hora(new Date(e.inicio))}–{hora(new Date(e.fin))}
              {e.marcada && <span className="font-normal text-muted-foreground"> ({duracion(minutos(e.inicio, e.fin))})</span>}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <EyeOffIcon className="size-3" /> {e.marcada ? 'Marcado en Odoo · sin seguimiento' : 'Sin seguimiento (privacidad)'}
            </span>
          </span>
        </>
      )
    case 'trayecto':
      return (
        <span className="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
          <CarIcon className="size-3.5" />
          {e.metros >= 50
            ? `Trayecto ${duracion(minutos(e.inicio, e.fin))} · ${distanciaTexto(e.metros)}`
            : `Sin desplazamiento ${duracion(minutos(e.inicio, e.fin))}`}
        </span>
      )
    case 'sin_datos':
      return (
        <span className="flex items-center gap-2 pl-10 text-xs text-destructive">
          <WifiOffIcon className="size-3.5" />
          Sin datos del GPS {hora(new Date(e.inicio))}–{hora(new Date(e.fin))}
        </span>
      )
  }
}
