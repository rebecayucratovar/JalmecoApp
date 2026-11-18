import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { type FormEvent, type ReactNode } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import type { useBorrador } from './borrador'

interface PropsTarjeta {
  titulo: string
  descripcion?: ReactNode
  children: ReactNode
  /** Sin borrador: tarjeta solo informativa (sin botón Guardar). */
  borrador?: Pick<ReturnType<typeof useBorrador>, 'sucio' | 'guardar' | 'errores' | 'enviar' | 'descartar'>
  pie?: ReactNode
}

export function Tarjeta({ titulo, descripcion, children, borrador, pie }: PropsTarjeta) {
  const errorGeneral =
    borrador?.guardar.isError && Object.keys(borrador.errores).length === 0 ? borrador.guardar.error.message : null

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (borrador?.sucio) borrador.enviar()
  }

  const contenido = (
    <>
      <div className="space-y-1 border-b px-5 py-4">
        <h2 className="font-semibold">{titulo}</h2>
        {descripcion && <div className="text-sm text-muted-foreground">{descripcion}</div>}
      </div>
      <div className="space-y-5 px-5 py-5">
        {errorGeneral && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{errorGeneral}</AlertDescription>
          </Alert>
        )}
        {children}
      </div>
      {borrador && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          {pie && <div className="mr-auto text-xs text-muted-foreground">{pie}</div>}
          {borrador.sucio && (
            <Button type="button" variant="ghost" onClick={borrador.descartar} disabled={borrador.guardar.isPending}>
              Descartar
            </Button>
          )}
          <Button type="submit" disabled={!borrador.sucio || borrador.guardar.isPending}>
            {borrador.guardar.isPending && <Loader2Icon className="animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      )}
    </>
  )

  const clases = 'overflow-hidden rounded-xl border bg-card'
  return borrador ? (
    <form onSubmit={enviar} noValidate className={clases}>{contenido}</form>
  ) : (
    <section className={clases}>{contenido}</section>
  )
}

export function Campo({ id, etiqueta, ayuda, error, children, className }: {
  id: string
  etiqueta: string
  ayuda?: ReactNode
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className={cn(error && '[&_input,&_textarea]:border-destructive')}>{children}</div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      ) : (
        ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>
      )}
    </div>
  )
}

/** Número entero con su unidad ("min", "m", "%"…) y límites. */
export function CampoNumero({ id, etiqueta, valor, alCambiar, min, max, unidad, ayuda, error }: {
  id: string
  etiqueta: string
  valor: number
  alCambiar(valor: number): void
  min: number
  max: number
  unidad: string
  ayuda?: ReactNode
  error?: string
}) {
  return (
    <Campo id={id} etiqueta={etiqueta} error={error} ayuda={ayuda ?? `Entre ${min} y ${max} ${unidad}.`}>
      <div className="relative max-w-44">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={Number.isNaN(valor) ? '' : valor}
          onChange={(e) => alCambiar(e.target.value === '' ? Number.NaN : Math.trunc(Number(e.target.value)))}
          aria-invalid={!!error || undefined}
          className="h-10 pr-14 tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{unidad}</span>
      </div>
    </Campo>
  )
}

export function CampoHora({ id, etiqueta, valor, alCambiar, error }: {
  id: string
  etiqueta: string
  valor: string
  alCambiar(valor: string): void
  error?: string
}) {
  return (
    <Campo id={id} etiqueta={etiqueta} error={error}>
      <Input id={id} type="time" step={300} value={valor} onChange={(e) => alCambiar(e.target.value)}
        aria-invalid={!!error || undefined} className="h-10 max-w-36 tabular-nums" />
    </Campo>
  )
}

/** Recuadro con una nota (cómo funciona, qué implica). */
export function Nota({ children, tono = 'info' }: { children: ReactNode; tono?: 'info' | 'aviso' }) {
  return (
    <div
      className={cn(
        'rounded-lg p-3 text-sm leading-relaxed',
        tono === 'aviso' ? 'bg-aviso/10 text-foreground ring-1 ring-aviso/30' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}
