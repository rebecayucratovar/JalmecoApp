import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { NavLink } from 'react-router'

import logo from '@/assets/logo_circulo.png'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SECCIONES } from '@/secciones'

interface Props {
  contraido: boolean
  alContraer?: () => void
  /** Al elegir una sección (en celular cierra el cajón). */
  alNavegar?: () => void
}

export function MenuLateral({ contraido, alContraer, alNavegar }: Props) {
  return (
    <nav
      aria-label="Menú principal"
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        contraido ? 'w-[72px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 px-4', contraido && 'justify-center px-0')}>
        <img src={logo} alt="" className="size-9 shrink-0 rounded-full bg-white" />
        {!contraido && (
          <span className="truncate text-[15px] font-semibold text-white">
            Jalmeco <span className="font-normal text-sidebar-foreground">GPS</span>
          </span>
        )}
      </div>

      <ul className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {SECCIONES.map(({ ruta, titulo, icono: Icono }) => {
          const enlace = (
            <NavLink
              to={ruta}
              end={ruta === '/'}
              onClick={alNavegar}
              className={({ isActive }) =>
                cn(
                  'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  contraido && 'justify-center px-0',
                  isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  isActive &&
                    'before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary',
                )
              }
            >
              <Icono className="size-[18px] shrink-0" aria-hidden />
              {contraido ? <span className="sr-only">{titulo}</span> : <span className="truncate">{titulo}</span>}
            </NavLink>
          )
          return (
            <li key={ruta}>
              {contraido ? (
                <Tooltip>
                  <TooltipTrigger asChild>{enlace}</TooltipTrigger>
                  <TooltipContent side="right">{titulo}</TooltipContent>
                </Tooltip>
              ) : (
                enlace
              )}
            </li>
          )
        })}
      </ul>

      {alContraer && (
        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={alContraer}
            className={cn(
              'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              contraido && 'justify-center px-0',
            )}
            aria-label={contraido ? 'Expandir menú' : 'Contraer menú'}
          >
            {contraido ? (
              <PanelLeftOpenIcon className="size-[18px]" aria-hidden />
            ) : (
              <>
                <PanelLeftCloseIcon className="size-[18px]" aria-hidden />
                Contraer
              </>
            )}
          </button>
        </div>
      )}
    </nav>
  )
}
