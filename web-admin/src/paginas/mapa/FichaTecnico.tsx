import { BatteryLowIcon, BatteryMediumIcon, GaugeIcon, PhoneIcon, RouteIcon, XIcon } from 'lucide-react'
import { Link } from 'react-router'

import { AvatarEstado, EstadoChip } from '@/components/EstadoChip'
import { Button } from '@/components/ui/button'
import { haceCuanto, hora } from '@/lib/formato'
import { cn } from '@/lib/utils'

import type { TecnicoMapa } from './datos'

const BATERIA_BAJA = 15

export function FichaTecnico({ tecnico: t, ahora, alCerrar }: { tecnico: TecnicoMapa; ahora: Date; alCerrar(): void }) {
  const fuera = t.estado_actual === 'fuera_jornada'
  const bateriaBaja = t.ultima_bateria != null && t.ultima_bateria <= BATERIA_BAJA

  return (
    <section
      aria-label={`Ficha de ${t.nombre}`}
      className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg"
    >
      <div className="flex items-start gap-3 p-4">
        <AvatarEstado nombre={t.nombre} estado={t.estado_actual} tamano="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold leading-tight">{t.nombre}</h2>
          <p className="truncate text-xs text-muted-foreground">{[t.codigo, t.cargo].filter(Boolean).join(' · ') || '—'}</p>
          <EstadoChip estado={t.estado_actual} className="mt-1.5" />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={alCerrar} aria-label="Cerrar ficha">
          <XIcon />
        </Button>
      </div>

      {fuera ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">
          Fuera de jornada: su ubicación no se registra ni se muestra.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 border-t text-sm">
            <div className="p-3">
              <dt className="text-xs text-muted-foreground">Actualización</dt>
              <dd className="mt-0.5 font-semibold">{t.ultima_actualizacion ? haceCuanto(t.ultima_actualizacion, ahora) : '—'}</dd>
            </div>
            <div className="border-l p-3">
              <dt className="text-xs text-muted-foreground">Batería</dt>
              <dd className={cn('mt-0.5 flex items-center gap-1 font-semibold', bateriaBaja && 'text-destructive')}>
                {t.ultima_bateria == null ? (
                  '—'
                ) : (
                  <>
                    {bateriaBaja ? <BatteryLowIcon className="size-4" /> : <BatteryMediumIcon className="size-4 text-exito" />}
                    {t.ultima_bateria} %
                  </>
                )}
              </dd>
            </div>
            <div className="border-l p-3">
              <dt className="text-xs text-muted-foreground">Velocidad</dt>
              <dd className="mt-0.5 flex items-center gap-1 font-semibold">
                {t.ultima_velocidad == null ? '—' : (
                  <>
                    <GaugeIcon className="size-4 text-muted-foreground" />
                    {Math.round(t.ultima_velocidad)} km/h
                  </>
                )}
              </dd>
            </div>
          </dl>
          {t.jornada_inicio && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">En jornada desde las {hora(t.jornada_inicio)}</p>
          )}
        </>
      )}

      <div className="flex gap-2 border-t p-3">
        <Button asChild className="h-10 flex-1">
          <Link to={`/tecnicos/${t.id}`}>
            <RouteIcon />
            Ver recorrido
          </Link>
        </Button>
        {t.celular_numero && (
          <Button asChild variant="outline" className="h-10 flex-1">
            <a href={`tel:${t.celular_numero.replace(/\s+/g, '')}`}>
              <PhoneIcon />
              Llamar
            </a>
          </Button>
        )}
      </div>
    </section>
  )
}
