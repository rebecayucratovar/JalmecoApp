import { BellIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { infoTipo, useResumenAlertas } from '@/lib/alertas'
import { fechaCorta, hora } from '@/lib/formato'

/** Campana del encabezado: cuántas alertas nuevas hay, las últimas 5 y un aviso al llegar una nueva. */
export function CampanaAlertas() {
  const { data } = useResumenAlertas()
  const navegar = useNavigate()
  const nuevas = data?.nuevas ?? 0

  // Aviso emergente cuando aparece una alerta que no estaba (no al abrir el panel)
  const vistas = useRef<Set<number> | null>(null)
  useEffect(() => {
    if (!data) return
    const ids = data.ultimas.map((a) => a.id)
    if (vistas.current) {
      const llegadas = data.ultimas.filter((a) => !vistas.current!.has(a.id))
      for (const a of llegadas.slice(0, 3).reverse()) {
        toast.warning(`${infoTipo(a.tipo).etiqueta} — ${a.tecnico.nombre}`, {
          description: a.mensaje ?? undefined,
          action: { label: 'Ver', onClick: () => navegar('/alertas') },
        })
      }
    }
    vistas.current = new Set([...(vistas.current ?? []), ...ids])
  }, [data, navegar])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={nuevas ? `Alertas: ${nuevas} nuevas` : 'Alertas'}>
          <BellIcon />
          {nuevas > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white tabular-nums">
              {nuevas > 9 ? '9+' : nuevas}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between font-normal">
          <span className="font-medium text-foreground">Alertas nuevas</span>
          {data && data.criticas > 0 && <span className="text-xs text-destructive">{data.criticas} críticas</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {nuevas === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No hay alertas sin atender.</p>
        ) : (
          data!.ultimas.map((a) => {
            const tipo = infoTipo(a.tipo)
            const Icono = tipo.icono
            const cuando = fechaCorta(a.creada_en)
            return (
              <DropdownMenuItem key={a.id} asChild>
                <Link to="/alertas" className="items-start gap-3">
                  <Icono className="mt-0.5 size-4 shrink-0" style={{ color: tipo.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.tecnico.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.mensaje ?? tipo.etiqueta}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {cuando.startsWith('Hoy') ? hora(a.creada_en) : cuando}
                  </span>
                </Link>
              </DropdownMenuItem>
            )
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/alertas" className="justify-center font-medium">Ver todas las alertas</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
