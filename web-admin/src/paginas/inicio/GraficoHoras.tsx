import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { hoyLaPaz } from '@/lib/formato'
import { cn } from '@/lib/utils'

interface Dia {
  fecha: string
  horas: number
  personas: number
}

const formatoDia = new Intl.DateTimeFormat('es-BO', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
const formatoLargo = new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const aFecha = (iso: string) => new Date(`${iso}T12:00:00Z`)
const horasTexto = (h: number) => `${h.toLocaleString('es-BO', { maximumFractionDigits: 1 })} h`

/** Escala "redonda" para el eje: 10, 20, 50, 100, 200… */
function techo(maximo: number) {
  for (const paso of [5, 10, 20, 50, 100, 200, 500, 1000, 2000]) if (maximo <= paso) return paso
  return Math.ceil(maximo / 1000) * 1000
}

/** Barras simples (una serie): horas en jornada de todo el personal por día, sin el almuerzo. */
export function GraficoHoras({ dias }: { dias: Dia[] }) {
  const hoy = hoyLaPaz()
  const total = dias.reduce((s, d) => s + d.horas, 0)
  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Sin jornadas en los últimos 7 días. Se registran con la entrada y salida marcadas en Odoo.
      </p>
    )
  }
  const max = techo(Math.max(...dias.map((d) => d.horas)))
  const lineas = [max, max / 2, 0]

  return (
    <figure>
      <figcaption className="mb-3 text-xs text-muted-foreground">
        Total {horasTexto(Math.round(total * 10) / 10)} · horas en jornada sumadas de todo el personal, sin el almuerzo
      </figcaption>
      <div className="relative h-48 pl-9">
        {/* Grilla y eje (recesivos) */}
        {lineas.map((l) => (
          <div key={l} className="absolute right-0 left-9 border-t border-dashed border-border" style={{ bottom: `${(l / max) * 100}%` }} aria-hidden>
            <span className="absolute -top-2 -left-9 w-7 text-right text-[11px] text-muted-foreground tabular-nums">{l}</span>
          </div>
        ))}
        <div className="relative flex h-full items-end gap-2 sm:gap-4">
          {dias.map((d) => {
            const esHoy = d.fecha === hoy
            return (
              <Tooltip key={d.fecha}>
                <TooltipTrigger asChild>
                  {/* Zona de toque de toda la columna (más grande que la barra) */}
                  <button
                    type="button"
                    className="group relative flex h-full flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${formatoLargo.format(aFecha(d.fecha))}: ${horasTexto(d.horas)}, ${d.personas} personas`}
                  >
                    {esHoy && d.horas > 0 && (
                      <span className="absolute text-xs font-medium tabular-nums" style={{ bottom: `calc(${(d.horas / max) * 100}% + 4px)` }}>
                        {horasTexto(d.horas)}
                      </span>
                    )}
                    <span
                      className={cn(
                        'w-full max-w-10 rounded-t-[4px] transition-opacity group-hover:opacity-80',
                        esHoy ? 'bg-primary' : 'bg-primary/55',
                      )}
                      style={{ height: d.horas > 0 ? `max(2px, ${(d.horas / max) * 100}%)` : 0 }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium capitalize">{formatoLargo.format(aFecha(d.fecha))}</p>
                  <p>{horasTexto(d.horas)} · {d.personas} {d.personas === 1 ? 'persona' : 'personas'}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-2 pl-9 sm:gap-4" aria-hidden>
        {dias.map((d) => (
          <span key={d.fecha} className={cn('min-w-0 flex-1 text-center text-[10px] whitespace-nowrap text-muted-foreground sm:text-[11px]', d.fecha === hoy && 'font-semibold text-foreground')}>
            {d.fecha === hoy ? 'Hoy' : formatoDia.format(aFecha(d.fecha))}
          </span>
        ))}
      </div>
      {/* Versión en tabla para lectores de pantalla */}
      <table className="sr-only">
        <caption>Horas en campo por día</caption>
        <thead><tr><th>Día</th><th>Horas</th><th>Personas</th></tr></thead>
        <tbody>
          {dias.map((d) => <tr key={d.fecha}><td>{d.fecha}</td><td>{d.horas}</td><td>{d.personas}</td></tr>)}
        </tbody>
      </table>
    </figure>
  )
}
