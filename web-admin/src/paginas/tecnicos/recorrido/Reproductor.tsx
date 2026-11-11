import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { hora } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** x1 = 1 minuto del recorrido por segundo. */
export const VELOCIDADES = [1, 5, 10] as const
export type Velocidad = (typeof VELOCIDADES)[number]

interface Props {
  desde: number
  hasta: number
  valor: number
  reproduciendo: boolean
  velocidad: Velocidad
  alCambiar(t: number): void
  alReproducir(si: boolean): void
  alVelocidad(v: Velocidad): void
}

export function Reproductor({ desde, hasta, valor, reproduciendo, velocidad, alCambiar, alReproducir, alVelocidad }: Props) {
  // Avanza el tiempo mientras se reproduce
  const ultimo = useRef<number | null>(null)
  const valorRef = useRef(valor)
  useLayoutEffect(() => {
    valorRef.current = valor
  }, [valor])
  useEffect(() => {
    if (!reproduciendo) return
    let cuadro = 0
    ultimo.current = null
    const paso = (ahora: number) => {
      const dt = ultimo.current == null ? 0 : ahora - ultimo.current
      ultimo.current = ahora
      const siguiente = Math.min(hasta, valorRef.current + dt * 60 * velocidad)
      alCambiar(siguiente)
      if (siguiente >= hasta) alReproducir(false)
      else cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [reproduciendo, velocidad, hasta, alCambiar, alReproducir])

  const alFinal = valor >= hasta
  return (
    <div className="flex flex-wrap items-center gap-3 border-t bg-card px-3 py-2.5">
      <Button
        size="icon"
        className="rounded-full"
        onClick={() => {
          if (alFinal) alCambiar(desde)
          alReproducir(!reproduciendo)
        }}
        aria-label={reproduciendo ? 'Pausar' : 'Reproducir recorrido'}
      >
        {reproduciendo ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => alCambiar(desde)} aria-label="Volver al inicio">
        <RotateCcwIcon />
      </Button>
      <span className="w-11 text-sm font-medium tabular-nums">{hora(new Date(valor))}</span>
      <input
        type="range"
        min={desde}
        max={hasta}
        step={1000}
        value={valor}
        onChange={(e) => alCambiar(Number(e.target.value))}
        aria-label="Hora del recorrido"
        className="h-1.5 min-w-32 flex-1 cursor-pointer accent-[var(--petroleo)]"
      />
      <span className="w-11 text-sm text-muted-foreground tabular-nums">{hora(new Date(hasta))}</span>
      <div className="flex rounded-lg border p-0.5" role="group" aria-label="Velocidad">
        {VELOCIDADES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={velocidad === v}
            onClick={() => alVelocidad(v)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
              velocidad === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            x{v}
          </button>
        ))}
      </div>
    </div>
  )
}
