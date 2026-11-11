import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { useGenerarPin, type TecnicoAdmin } from './datos'

interface Props {
  tecnico: TecnicoAdmin
  abierto: boolean
  alCambiar(abierto: boolean): void
}

/** Generar o reiniciar el PIN. El PIN se muestra UNA sola vez (el servidor no lo guarda legible). */
export function DialogoPin({ tecnico, abierto, alCambiar }: Props) {
  const generar = useGenerarPin(tecnico.id)
  const [pin, setPin] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const reinicio = tecnico.tiene_pin

  function cerrar(abrir: boolean) {
    if (abrir) return alCambiar(true)
    alCambiar(false)
    // Al cerrar se olvida el PIN (ya no se puede volver a ver)
    setTimeout(() => {
      setPin(null)
      setCopiado(false)
      generar.reset()
    }, 200)
  }

  async function copiar() {
    if (!pin) return
    try {
      await navigator.clipboard.writeText(pin)
      setCopiado(true)
      toast.success('PIN copiado')
    } catch {
      toast.error('No se pudo copiar. Anótalo a mano.')
    }
  }

  const subtitulo = [tecnico.nombre, tecnico.codigo].filter(Boolean).join(' · ')

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => pin && e.preventDefault()}>
        {pin ? (
          <>
            <DialogHeader>
              <DialogTitle>PIN generado</DialogTitle>
              <DialogDescription>{subtitulo}</DialogDescription>
            </DialogHeader>
            <div className="py-2 text-center">
              <p className="text-sm text-muted-foreground">Comparte este PIN con la persona. No se volverá a mostrar.</p>
              <p className="my-4 font-mono text-4xl font-bold tracking-[0.35em] tabular-nums" aria-label={`PIN ${pin.split('').join(' ')}`}>
                {pin}
              </p>
              <Button variant="ghost" size="sm" onClick={copiar}>
                {copiado ? <CheckIcon /> : <CopyIcon />}
                {copiado ? 'Copiado' : 'Copiar PIN'}
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Entra a la app con su usuario <span className="font-mono font-medium text-foreground">{tecnico.usuario}</span>
                {tecnico.codigo && tecnico.codigo !== tecnico.usuario && (
                  <> o su código <span className="font-mono font-medium text-foreground">{tecnico.codigo}</span></>
                )}{' '}
                y este PIN.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => cerrar(false)}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{reinicio ? 'Reiniciar PIN' : 'Generar PIN'}</DialogTitle>
              <DialogDescription>{subtitulo}</DialogDescription>
            </DialogHeader>
            <p className="leading-relaxed">
              {reinicio
                ? 'Se generará un PIN nuevo y el anterior dejará de funcionar. Si tiene la sesión abierta en la app, deberá volver a iniciarla con el PIN nuevo.'
                : 'Se generará un PIN de 6 dígitos para que pueda iniciar sesión en la app Jalmeco GPS.'}
            </p>
            {!tecnico.activo && (
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Esta persona está desactivada: no podrá entrar hasta que la reactives.
              </p>
            )}
            {generar.isError && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertDescription>{generar.error.message}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
              <Button
                disabled={generar.isPending}
                onClick={() => generar.mutate(undefined, { onSuccess: (r) => setPin(r.pin) })}
              >
                {generar.isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
                {reinicio ? 'Reiniciar PIN' : 'Generar PIN'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
