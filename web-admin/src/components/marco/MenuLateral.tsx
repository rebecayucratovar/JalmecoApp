import { LogOutIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, XIcon } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { NavLink } from 'react-router'

import logo from '@/assets/logo_circulo.png'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useResumenAlertas } from '@/lib/alertas'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/utils'
import { SECCIONES } from '@/secciones'

interface Props {
  contraido: boolean
  /** Escritorio: contraer/abrir el menú. */
  alContraer?: () => void
  /** Celular: cerrar el cajón (botón X). */
  alCerrar?: () => void
  /** Al elegir una sección (en celular cierra el cajón). */
  alNavegar?: () => void
}

// Botón cuadrado de la cabecera (contraer, abrir, cerrar)
const BOTON_ICONO =
  'flex shrink-0 items-center justify-center rounded-xl text-slate-300 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring'

/** Con el menú contraído, el nombre aparece al pasar el mouse. */
function ConNombre({ contraido, nombre, children }: { contraido: boolean; nombre: string; children: ReactElement }) {
  if (!contraido) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{nombre}</TooltipContent>
    </Tooltip>
  )
}

export function MenuLateral({ contraido, alContraer, alCerrar, alNavegar }: Props) {
  const nuevas = useResumenAlertas().data?.nuevas ?? 0
  const { cerrar } = useSesion()
  const [confirmarSalida, setConfirmarSalida] = useState(false)

  return (
    <nav
      aria-label="Menú principal"
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width,padding] duration-200',
        contraido ? 'w-[72px] px-3 py-4' : 'w-72 max-w-[85vw] p-4',
      )}
    >
      {/* Cabecera: logo + botón de contraer. Contraído: solo el botón para abrir. */}
      <div className="flex h-11 shrink-0 items-center gap-3">
        {contraido ? (
          <button type="button" onClick={alContraer} className={cn(BOTON_ICONO, 'mx-auto size-11')}
            aria-label="Abrir menú" title="Abrir menú">
            <PanelLeftOpenIcon className="size-6" aria-hidden />
          </button>
        ) : (
          <>
            <img src={logo} alt="" className="size-10 shrink-0 rounded-full bg-white" />
            <div className="min-w-0 flex-1 leading-none">
              <span className="block truncate text-xl font-extrabold tracking-[0.08em] text-white">JALMECO</span>
              <span className="mt-1 block text-xs text-white">GPS</span>
            </div>
            {alContraer && (
              <button type="button" onClick={alContraer} className={cn(BOTON_ICONO, 'size-10')}
                aria-label="Contraer menú" title="Contraer menú">
                <PanelLeftCloseIcon className="size-6" aria-hidden />
              </button>
            )}
            {alCerrar && (
              <button type="button" onClick={alCerrar} className={cn(BOTON_ICONO, 'size-10')} aria-label="Cerrar menú">
                <XIcon className="size-6" aria-hidden />
              </button>
            )}
          </>
        )}
      </div>

      <div className="my-4 border-b border-white/15" aria-hidden />

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {SECCIONES.map(({ ruta, titulo, icono: Icono }) => {
          const contador = ruta === '/alertas' ? nuevas : 0
          const texto = contador > 99 ? '99+' : String(contador)
          return (
            <li key={ruta}>
              <ConNombre contraido={contraido} nombre={titulo}>
                <NavLink
                  to={ruta}
                  end={ruta === '/'}
                  onClick={alNavegar}
                  aria-label={contraido ? `${titulo}${contador ? ` (${contador} nuevas)` : ''}` : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-300 outline-none',
                      'hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                      contraido && 'justify-center px-0',
                      isActive && 'bg-sidebar-primary text-white hover:bg-sidebar-primary',
                    )
                  }
                >
                  <span className="relative shrink-0">
                    <Icono className="size-5" aria-hidden />
                    {contraido && contador > 0 && (
                      <span className="absolute -top-2 -right-2.5 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[10px] font-bold leading-4 text-white tabular-nums ring-2 ring-sidebar" aria-hidden>
                        {contador > 9 ? '9+' : contador}
                      </span>
                    )}
                  </span>
                  {!contraido && (
                    <>
                      <span className="flex-1 truncate">{titulo}</span>
                      {contador > 0 && (
                        <span className="min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white tabular-nums" aria-label={`${contador} nuevas`}>
                          {texto}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </ConNombre>
            </li>
          )
        })}
      </ul>

      {/* Pie: cerrar sesión (con confirmación) y versión */}
      <div className="mt-4 shrink-0">
        <ConNombre contraido={contraido} nombre="Cerrar sesión">
          <button
            type="button"
            onClick={() => setConfirmarSalida(true)}
            aria-label={contraido ? 'Cerrar sesión' : undefined}
            className={cn(
              'flex h-11 w-full items-center gap-3 rounded-lg bg-white/10 px-3 text-sm font-medium text-slate-100 outline-none',
              'hover:bg-rose-600 hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              contraido && 'justify-center px-0',
            )}
          >
            <LogOutIcon className="size-5 shrink-0" aria-hidden />
            {!contraido && 'Cerrar sesión'}
          </button>
        </ConNombre>
        {!contraido && (
          <p className="mt-3 text-center text-[11px] text-slate-400">
            Versión {__VERSION__} · {__FECHA_VERSION__}
          </p>
        )}
      </div>

      <Dialog open={confirmarSalida} onOpenChange={setConfirmarSalida}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>Tendrás que volver a ingresar tu correo y contraseña para usar el panel.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarSalida(false)}>Cancelar</Button>
            <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={cerrar}>
              <LogOutIcon data-icon="inline-start" />
              Cerrar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  )
}
