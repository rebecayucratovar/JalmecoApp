import { infoEstado } from '@/lib/estados'
import { iniciales } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** Etiqueta de color con el estado ("En trayecto", "Sin conexión"…). */
export function EstadoChip({ estado, className }: { estado: string; className?: string }) {
  const { etiqueta, color } = infoEstado(estado)
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', className)}
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {etiqueta}
    </span>
  )
}

/** Círculo con iniciales y un punto del color del estado. */
export function AvatarEstado({ nombre, estado, tamano = 'md' }: { nombre: string; estado?: string; tamano?: 'sm' | 'md' | 'lg' }) {
  const medidas = { sm: 'size-8 text-[11px]', md: 'size-9 text-xs', lg: 'size-14 text-base' }[tamano]
  const punto = { sm: 'size-2.5', md: 'size-3', lg: 'size-4' }[tamano]
  return (
    <span className="relative inline-flex shrink-0">
      <span className={cn('flex items-center justify-center rounded-full bg-muted font-semibold text-foreground', medidas)}>
        {iniciales(nombre)}
      </span>
      {estado && (
        <span
          className={cn('absolute right-0 bottom-0 rounded-full ring-2 ring-card', punto)}
          style={{ background: infoEstado(estado).color }}
          aria-hidden
        />
      )}
    </span>
  )
}
