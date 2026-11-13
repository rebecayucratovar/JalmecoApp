import { EyeIcon, EyeOffIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { erroresPorCampo } from '@/lib/api'
import { useSesion } from '@/lib/sesion'

import { useCambiarPassword, useGuardarCuenta } from './datos'
import { Campo } from './Formulario'

export function SeccionCuenta() {
  const { admin } = useSesion()
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      {/* La clave reinicia el formulario al cambiar los datos guardados */}
      <DatosCuenta key={`${admin?.nombre}|${admin?.email}`} nombre={admin?.nombre ?? ''} email={admin?.email ?? ''} />
      <CambioPassword />
    </div>
  )
}

function Bloque({ titulo, descripcion, error, children, pie, alEnviar }: {
  titulo: string
  descripcion: string
  error: string | null
  children: React.ReactNode
  pie: React.ReactNode
  alEnviar(e: FormEvent): void
}) {
  return (
    <form onSubmit={alEnviar} noValidate className="overflow-hidden rounded-xl border bg-card">
      <div className="space-y-1 border-b px-5 py-4">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      <div className="space-y-5 px-5 py-5">
        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </div>
      <div className="flex justify-end gap-2 border-t bg-muted/40 px-5 py-3">{pie}</div>
    </form>
  )
}

function DatosCuenta({ nombre: nombreInicial, email: emailInicial }: { nombre: string; email: string }) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [email, setEmail] = useState(emailInicial)
  const [clave, setClave] = useState('')
  const guardar = useGuardarCuenta()
  const errores = erroresPorCampo(guardar.error)
  const cambiaCorreo = email.trim().toLowerCase() !== emailInicial
  const sucio = nombre !== nombreInicial || email !== emailInicial

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!sucio) return
    guardar.mutate(
      {
        ...(nombre !== nombreInicial && { nombre }),
        ...(email !== emailInicial && { email }),
        ...(cambiaCorreo && { password_actual: clave }),
      },
      { onSuccess: () => toast.success('Datos actualizados') },
    )
  }

  return (
    <Bloque
      titulo="Mis datos"
      descripcion="Con este correo entras al panel."
      error={guardar.isError && Object.keys(errores).length === 0 ? guardar.error.message : null}
      alEnviar={enviar}
      pie={
        <Button type="submit" disabled={!sucio || (cambiaCorreo && !clave) || guardar.isPending}>
          {guardar.isPending && <Loader2Icon className="animate-spin" />} Guardar cambios
        </Button>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo id="cuenta_nombre" etiqueta="Nombre" error={errores.nombre}>
          <Input id="cuenta_nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" className="h-9" />
        </Campo>
        <Campo id="cuenta_email" etiqueta="Correo" error={errores.email}>
          <Input id="cuenta_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" spellCheck={false} className="h-9" />
        </Campo>
      </div>
      {cambiaCorreo && (
        <Campo id="cuenta_password" etiqueta="Tu contraseña actual" error={errores.password_actual} className="sm:max-w-sm"
          ayuda="Para cambiar el correo con el que entras al panel.">
          <Input id="cuenta_password" type="password" value={clave} onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password" className="h-9" />
        </Campo>
      )}
    </Bloque>
  )
}

function CambioPassword() {
  const { admin } = useSesion()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [ver, setVer] = useState(false)
  const [noCoinciden, setNoCoinciden] = useState(false)
  const cambiar = useCambiarPassword()
  const errores = erroresPorCampo(cambiar.error)

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (nueva !== repetida) return setNoCoinciden(true)
    setNoCoinciden(false)
    cambiar.mutate(
      { actual, nueva },
      {
        onSuccess: () => {
          setActual('')
          setNueva('')
          setRepetida('')
          toast.success('Contraseña cambiada', { description: 'Se cerró la sesión en tus otros navegadores y equipos.' })
        },
      },
    )
  }

  const tipo = ver ? 'text' : 'password'
  return (
    <Bloque
      titulo="Cambiar contraseña"
      descripcion="Al cambiarla se cierra la sesión en los demás navegadores y equipos; en este sigues dentro."
      error={cambiar.isError && Object.keys(errores).length === 0 ? cambiar.error.message : null}
      alEnviar={enviar}
      pie={
        <Button type="submit" disabled={!actual || !nueva || !repetida || cambiar.isPending}>
          {cambiar.isPending && <Loader2Icon className="animate-spin" />} Cambiar contraseña
        </Button>
      }
    >
      {/* Para que el gestor de contraseñas del navegador sepa de qué cuenta es */}
      <input type="text" name="username" autoComplete="username" value={admin?.email ?? ''} readOnly hidden />
      <Campo id="password_actual" etiqueta="Contraseña actual" error={errores.actual} className="sm:max-w-sm">
        <Input id="password_actual" type={tipo} value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" className="h-9" />
      </Campo>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo id="password_nueva" etiqueta="Nueva contraseña" error={errores.nueva}
          ayuda="Al menos 8 caracteres. Que no sea solo números ni una muy común.">
          <Input id="password_nueva" type={tipo} value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" className="h-9" />
        </Campo>
        <Campo id="password_repetida" etiqueta="Repite la nueva" error={noCoinciden ? 'No coincide con la nueva contraseña.' : undefined}>
          <Input id="password_repetida" type={tipo} value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" className="h-9" />
        </Campo>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setVer((v) => !v)} className="-ml-2">
        {ver ? <EyeOffIcon /> : <EyeIcon />} {ver ? 'Ocultar' : 'Mostrar'} contraseñas
      </Button>
    </Bloque>
  )
}
