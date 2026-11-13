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
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace('.', '')

/** Escala "redonda" para el eje: 4 divisiones con pasos de 1, 2, 5, 10, 20, 50… */
function escala(maximo: number) {
  for (const paso of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (maximo <= paso * 4) return { max: paso * 4, paso }
  }
  const paso = Math.ceil(maximo / 4000) * 1000
  return { max: paso * 4, paso }
}

/** Una sola serie: horas en jornada de todo el personal por día, sin el almuerzo. Hoy se resalta. */
export function GraficoHoras({ dias }: { dias: Dia[] }) {
  const hoy = hoyLaPaz()
  const total = Math.round(dias.reduce((s, d) => s + d.horas, 0) * 10) / 10
  const promedio = dias.length ? Math.round((total / dias.length) * 10) / 10 : 0
  const { max, paso } = escala(Math.max(...dias.map((d) => d.horas), 0))
  const lineas = Array.from({ length: 5 }, (_, i) => max - i * paso)

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Tiempo total en campo</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Horas en jornada de todo el personal por día, sin el almuerzo · última semana</p>
        </div>
        <dl className="flex gap-8">
          <div>
            <dt className="text-xs text-muted-foreground">Total semana</dt>
            <dd className="text-2xl font-semibold tabular-nums">{horasTexto(total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Promedio diario</dt>
            <dd className="text-2xl font-semibold tabular-nums">{horasTexto(promedio)}</dd>
          </div>
        </dl>
      </div>

      {total === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Sin jornadas en los últimos 7 días. Se registran con la entrada y salida marcadas en Odoo.
        </p>
      ) : (
        <figure className="mt-6">
          <div className="relative h-64 pl-12">
            {/* Grilla y eje: recesivos */}
            {lineas.map((l) => (
              <div key={l} className="absolute right-0 left-12 border-t border-border" style={{ bottom: `${(l / max) * 100}%` }} aria-hidden>
                <span className="absolute -top-2 -left-12 w-9 text-right text-[11px] text-muted-foreground tabular-nums">{l} h</span>
              </div>
            ))}
            <div className="relative flex h-full items-end gap-2 sm:gap-6">
              {dias.map((d) => {
                const esHoy = d.fecha === hoy
                return (
                  <Tooltip key={d.fecha}>
                    <TooltipTrigger asChild>
                      {/* Zona de toque de toda la columna (más grande que la barra) */}
                      <button
                        type="button"
                        className="group flex h-full flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${formatoLargo.format(aFecha(d.fecha))}: ${horasTexto(d.horas)}, ${d.personas} personas`}
                      >
                        <span
                          className={cn(
                            'w-full max-w-16 rounded-t-[4px] transition-opacity group-hover:opacity-85',
                            esHoy ? 'bg-primary' : 'bg-marino dark:bg-primary/45',
                          )}
                          style={{ height: d.horas > 0 ? `max(2px, ${(d.horas / max) * 100}%)` : 0 }}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{mayuscula(formatoLargo.format(aFecha(d.fecha)))}{esHoy && ' · jornada en curso'}</p>
                      <p>{horasTexto(d.horas)} · {d.personas} {d.personas === 1 ? 'persona' : 'personas'}</p>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </div>
          <div className="mt-2 flex gap-2 pl-12 sm:gap-6" aria-hidden>
            {dias.map((d) => (
              <span key={d.fecha} className={cn('min-w-0 flex-1 text-center text-[11px] whitespace-nowrap text-muted-foreground sm:text-xs', d.fecha === hoy && 'font-semibold text-foreground')}>
                {mayuscula(formatoDia.format(aFecha(d.fecha)))}
              </span>
            ))}
          </div>
          <figcaption className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-sm bg-primary" aria-hidden /> Hoy (jornada en curso)
          </figcaption>
          {/* Versión en tabla para lectores de pantalla */}
          <table className="sr-only">
            <caption>Horas en campo por día</caption>
            <thead><tr><th>Día</th><th>Horas</th><th>Personas</th></tr></thead>
            <tbody>
              {dias.map((d) => <tr key={d.fecha}><td>{d.fecha}</td><td>{d.horas}</td><td>{d.personas}</td></tr>)}
            </tbody>
          </table>
        </figure>
      )}
    </section>
  )
}
