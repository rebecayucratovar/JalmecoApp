import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import { erroresPorCampo, formatoCelular, useGuardarTecnico, type DatosTecnico, type TecnicoAdmin } from './datos'

interface Props {
  /** Sin técnico = alta. */
  tecnico?: TecnicoAdmin
  abierto: boolean
  alCambiar(abierto: boolean): void
  alGuardar?(t: TecnicoAdmin): void
}

type Campos = Required<Omit<DatosTecnico, 'activo'>> & { activo: boolean }

function inicial(t?: TecnicoAdmin): Campos {
  return {
    nombre: t?.nombre ?? '',
    codigo: t?.codigo ?? '',
    usuario: t?.usuario ?? '',
    cargo: t?.cargo ?? '',
    celular_modelo: t?.celular_modelo ?? '',
    celular_numero: formatoCelular(t?.celular_numero ?? null),
    activo: t?.activo ?? true,
  }
}

export function FormularioTecnico({ tecnico, abierto, alCambiar, alGuardar }: Props) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent className="sm:max-w-lg">
        {/* Se vuelve a montar al abrir: siempre empieza con los datos actuales */}
        {abierto && <Contenido tecnico={tecnico} alCerrar={() => alCambiar(false)} alGuardar={alGuardar} />}
      </DialogContent>
    </Dialog>
  )
}

function Contenido({ tecnico, alCerrar, alGuardar }: { tecnico?: TecnicoAdmin; alCerrar(): void; alGuardar?(t: TecnicoAdmin): void }) {
  const guardar = useGuardarTecnico(tecnico?.id)
  const [campos, setCampos] = useState<Campos>(() => inicial(tecnico))
  const deOdoo = tecnico?.odoo_employee_id != null
  const usuarioDeOdoo = tecnico?.usuario_de_odoo ?? false
  const errores = erroresPorCampo(guardar.error)
  const errorGeneral = guardar.isError && Object.keys(errores).length === 0 ? guardar.error.message : null

  const cambiar = (campo: keyof Campos) => (valor: string | boolean) => setCampos((c) => ({ ...c, [campo]: valor }))

  function enviar(e: FormEvent) {
    e.preventDefault()
    const original = inicial(tecnico)
    // En edición se envía solo lo que cambió (y nunca los datos que vienen de Odoo)
    const datos = Object.fromEntries(
      Object.entries(campos).filter(([k, v]) => !tecnico || v !== original[k as keyof Campos]),
    ) as Partial<DatosTecnico>
    if (tecnico && Object.keys(datos).length === 0) return alCerrar()
    guardar.mutate(datos, {
      onSuccess: (t) => {
        alCerrar()
        alGuardar?.(t)
      },
    })
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{tecnico ? 'Editar datos' : 'Nuevo técnico'}</DialogTitle>
        <DialogDescription>
          {tecnico
            ? tecnico.nombre
            : 'Para quien no está en Odoo (si está, mejor «Importar de Odoo»). Después de crearlo, genera su PIN para que pueda entrar a la app.'}
        </DialogDescription>
      </DialogHeader>

      {deOdoo && (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {usuarioDeOdoo ? 'Nombre, cargo y usuario vienen de Odoo' : 'Nombre y cargo vienen de Odoo'}: se cambian allá.
        </p>
      )}
      {errorGeneral && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{errorGeneral}</AlertDescription>
        </Alert>
      )}

      <Campo id="nombre" etiqueta="Nombre completo" error={errores.nombre}>
        <Input id="nombre" value={campos.nombre} onChange={(e) => cambiar('nombre')(e.target.value)} disabled={deOdoo} autoFocus={!tecnico} />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="codigo" etiqueta="Código" ayuda="JAL-XXXX" error={errores.codigo}>
          <Input id="codigo" value={campos.codigo ?? ''} onChange={(e) => cambiar('codigo')(e.target.value.toUpperCase())} placeholder="JAL-1021" className="font-mono" />
        </Campo>
        <Campo id="usuario" etiqueta="Usuario de la app" ayuda={usuarioDeOdoo ? 'Su usuario de Odoo' : 'Vacío = el código'} error={errores.usuario}>
          <Input id="usuario" value={campos.usuario} onChange={(e) => cambiar('usuario')(e.target.value)} disabled={usuarioDeOdoo} autoCapitalize="none" spellCheck={false} />
        </Campo>
      </div>

      <Campo id="cargo" etiqueta="Cargo" error={errores.cargo}>
        <Input id="cargo" value={campos.cargo ?? ''} onChange={(e) => cambiar('cargo')(e.target.value)} placeholder="Técnico de mantenimiento" disabled={deOdoo} />
      </Campo>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Celular asignado por la empresa</legend>
        <Campo id="celular_modelo" etiqueta="Modelo" error={errores.celular_modelo}>
          <Input id="celular_modelo" value={campos.celular_modelo ?? ''} onChange={(e) => cambiar('celular_modelo')(e.target.value)} placeholder="Samsung A15" />
        </Campo>
        <Campo id="celular_numero" etiqueta="Número" error={errores.celular_numero}>
          <Input id="celular_numero" value={campos.celular_numero ?? ''} onChange={(e) => cambiar('celular_numero')(e.target.value)} placeholder="+591 712 45830" inputMode="tel" />
        </Campo>
      </fieldset>

      {tecnico && (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="activo" className="text-sm font-medium text-foreground">Acceso activo</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Si lo desactivas, no puede entrar a la app (su historial se conserva).</p>
          </div>
          <Switch id="activo" checked={campos.activo} onCheckedChange={cambiar('activo')} />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={alCerrar}>Cancelar</Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending && <Loader2Icon className="animate-spin" />}
          {tecnico ? 'Guardar cambios' : 'Crear'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Campo({ id, etiqueta, ayuda, error, children }: { id: string; etiqueta: string; ayuda?: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className={cn(error && '[&_input]:border-destructive [&_input]:ring-destructive/20')} aria-invalid={!!error}>
        {children}
      </div>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  )
}
