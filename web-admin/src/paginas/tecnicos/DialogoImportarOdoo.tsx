import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, Loader2Icon, SearchIcon, TriangleAlertIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSesion } from '@/lib/sesion'

import { filtrarEmpleados, TODOS, type EmpleadoOdoo } from './datos'

interface ResultadoImportar {
  importados: number
  actualizados: number
  vinculados: number
  nombres: string[]
}


/** Valores distintos (sin vacíos), ordenados. */
function opciones(empleados: EmpleadoOdoo[], campo: 'empresa' | 'departamento') {
  return [...new Set(empleados.map((e) => e[campo]).filter((v): v is string => !!v))].sort()
}

export function DialogoImportarOdoo({ abierto, alCambiar }: { abierto: boolean; alCambiar(abierto: boolean): void }) {
  return (
    <Dialog open={abierto} onOpenChange={alCambiar}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
        {abierto && <Contenido alCerrar={() => alCambiar(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Contenido({ alCerrar }: { alCerrar(): void }) {
  const { api } = useSesion()
  const consultas = useQueryClient()
  const lista = useQuery({
    queryKey: ['odoo-empleados'],
    queryFn: ({ signal }) => api.get<{ empleados: EmpleadoOdoo[] }>('odoo/empleados', signal).then((r) => r.empleados),
    staleTime: 0,
  })
  const importar = useMutation({
    mutationFn: (odoo_ids: number[]) => api.post<ResultadoImportar>('tecnicos/importar-odoo', { odoo_ids }),
    onSuccess: (r) => {
      void consultas.invalidateQueries({ queryKey: ['tecnicos'] })
      void consultas.invalidateQueries({ queryKey: ['mapa-en-vivo'] })
      void consultas.invalidateQueries({ queryKey: ['dashboard'] })
      const nuevos = r.importados + r.vinculados
      toast.success(`${nuevos} ${nuevos === 1 ? 'persona importada' : 'personas importadas'}`, {
        description: r.vinculados
          ? `${r.vinculados} ya estaban cargadas a mano y se vincularon con Odoo. Genera el PIN de cada una para que entren a la app.`
          : 'Genera el PIN de cada una para que entren a la app.',
      })
      alCerrar()
    },
  })

  const [busqueda, setBusqueda] = useState('')
  const [empresa, setEmpresa] = useState(TODOS)
  const [departamento, setDepartamento] = useState(TODOS)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())

  const empleados = useMemo(() => lista.data ?? [], [lista.data])
  const visibles = useMemo(() => filtrarEmpleados(empleados, busqueda, empresa, departamento),
    [empleados, busqueda, empresa, departamento])
  const elegibles = visibles.filter((e) => e.tecnico_id == null)
  const todosVisiblesElegidos = elegibles.length > 0 && elegibles.every((e) => elegidos.has(e.odoo_id))
  const yaEstan = empleados.filter((e) => e.tecnico_id != null).length

  function alternar(id: number) {
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function alternarVisibles() {
    setElegidos((s) => {
      const n = new Set(s)
      for (const e of elegibles) {
        if (todosVisiblesElegidos) n.delete(e.odoo_id)
        else n.add(e.odoo_id)
      }
      return n
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Importar personal de Odoo</DialogTitle>
        <DialogDescription>
          Elige solo a quien usa un celular de la empresa. Odoo puede tener ex empleados sin archivar y
          personal de otras empresas. Se traen el nombre, el cargo y el usuario de Odoo; quien no tiene usuario
          recibe uno como «nombre.apellido».
        </DialogDescription>
      </DialogHeader>

      {lista.isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> Leyendo empleados de Odoo…
        </div>
      ) : lista.isError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>
            {lista.error.message}
            <Button variant="outline" size="sm" className="mt-2" onClick={() => lista.refetch()}>Reintentar</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o cargo"
                aria-label="Buscar empleado" className="h-10 pl-9" />
            </div>
            <Filtro etiqueta="Empresa" todas="Todas las empresas" valor={empresa} alCambiar={setEmpresa} opciones={opciones(empleados, 'empresa')} />
            <Filtro etiqueta="Departamento" todas="Todos los departamentos" valor={departamento} alCambiar={setDepartamento}
              opciones={opciones(empleados, 'departamento')} />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{visibles.length} de {empleados.length} empleados activos{yaEstan ? ` · ${yaEstan} ya importados` : ''}</span>
            {elegibles.length > 0 && (
              <Button variant="ghost" size="sm" onClick={alternarVisibles} className="-mr-2">
                {todosVisiblesElegidos ? 'Quitar los visibles' : `Elegir los ${elegibles.length} visibles`}
              </Button>
            )}
          </div>

          <ul className="-mx-4 min-h-0 flex-1 divide-y overflow-y-auto border-y" aria-label="Empleados de Odoo">
            {visibles.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Nadie coincide con el filtro.</li>}
            {visibles.map((e) => {
              const ya = e.tecnico_id != null
              const id = `odoo-${e.odoo_id}`
              return (
                <li key={e.odoo_id}>
                  <label htmlFor={id} className={ya ? 'flex items-center gap-3 px-4 py-2.5 opacity-60' : 'flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50'}>
                    <input id={id} type="checkbox" className="size-4 shrink-0 accent-primary" disabled={ya}
                      checked={ya || elegidos.has(e.odoo_id)} onChange={() => alternar(e.odoo_id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[e.cargo, e.departamento, e.empresa].filter(Boolean).join(' · ') || 'Sin cargo'}
                      </span>
                    </span>
                    {ya ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-exito"><CheckIcon className="size-3.5" /> Ya está</span>
                    ) : e.usuario_odoo ? (
                      <span className="hidden max-w-48 shrink-0 truncate font-mono text-xs text-muted-foreground sm:block">{e.usuario_odoo}</span>
                    ) : null}
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {importar.isError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{importar.error.message}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
        <Button disabled={elegidos.size === 0 || importar.isPending} onClick={() => importar.mutate([...elegidos])}>
          {importar.isPending && <Loader2Icon className="animate-spin" />}
          {elegidos.size ? `Importar ${elegidos.size}` : 'Importar'}
        </Button>
      </DialogFooter>
    </>
  )
}

function Filtro({ etiqueta, todas, valor, alCambiar, opciones }: {
  etiqueta: string
  todas: string
  valor: string
  alCambiar(v: string): void
  opciones: string[]
}) {
  return (
    <Select value={valor} onValueChange={alCambiar}>
      <SelectTrigger className="h-10 sm:w-48" aria-label={etiqueta}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{todas}</SelectItem>
        {opciones.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
