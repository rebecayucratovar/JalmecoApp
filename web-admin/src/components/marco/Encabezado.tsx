import { ChevronDownIcon, LogOutIcon, MenuIcon, MoonIcon, SunIcon, UserCogIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fechaEncabezado, iniciales } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { useTema } from '@/lib/tema'
import { useAhora } from '@/lib/useAhora'

import { CampanaAlertas } from './CampanaAlertas'

export function Encabezado({ titulo, alAbrirMenu }: { titulo: string; alAbrirMenu: () => void }) {
  const ahora = useAhora(15_000)
  const { admin, cerrar } = useSesion()
  const { efectivo, cambiar } = useTema()
  const oscuro = efectivo === 'oscuro'

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={alAbrirMenu} aria-label="Abrir menú">
        <MenuIcon />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold leading-tight">{titulo}</h1>
        <p className="truncate text-xs text-muted-foreground">{fechaEncabezado(ahora)}</p>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cambiar(oscuro ? 'claro' : 'oscuro')}
            aria-label={oscuro ? 'Usar tema claro' : 'Usar tema oscuro'}
          >
            {oscuro ? <SunIcon /> : <MoonIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{oscuro ? 'Tema claro' : 'Tema oscuro'}</TooltipContent>
      </Tooltip>

      <CampanaAlertas />

      <div className="mx-1 hidden h-8 w-px bg-border sm:block" aria-hidden />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-lg p-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-marino text-xs font-semibold text-white dark:bg-primary dark:text-primary-foreground">
                {iniciales(admin?.nombre ?? '')}
              </AvatarFallback>
            </Avatar>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-40 truncate text-sm font-medium leading-tight">{admin?.nombre}</span>
              <span className="block text-xs text-muted-foreground">Administración</span>
            </span>
            <ChevronDownIcon className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">{admin?.nombre}</span>
            <span className="block truncate text-xs text-muted-foreground">{admin?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/configuracion?seccion=cuenta">
              <UserCogIcon />
              Mi cuenta
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={cerrar}>
            <LogOutIcon />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
