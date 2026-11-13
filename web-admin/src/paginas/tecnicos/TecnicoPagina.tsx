import {
  ArrowLeftIcon,
  BellIcon,
  KeyRoundIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { AvatarEstado, EstadoChip } from '@/components/EstadoChip'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fechaCorta, fechaHora, hora } from '@/lib/formato'
import { useAhora } from '@/lib/useAhora'
import { NoEncontrada } from '@/paginas/Proximamente'

import { RecorridoPestana } from './recorrido/RecorridoPestana'

import { formatoCelular, useGuardarTecnico, useTecnico, type TecnicoAdmin } from './datos'
import { DialogoPin } from './DialogoPin'
import { FormularioTecnico } from './FormularioTecnico'

export default function TecnicoPagina() {
  const id = Number(useParams().id)
  const consulta = useTecnico(id)

  if (consulta.isPending) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Cargando…
      </div>
    )
  }
  if (consulta.isError) {
    if ((consulta.error as { status?: number }).status === 404) return <NoEncontrada />
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <TriangleAlertIcon className="size-6 text-destructive" />
        {consulta.error.message}
        <Button variant="outline" size="sm" onClick={() => consulta.refetch()}>Reintentar</Button>
      </div>
    )
  }
  return <Ficha tecnico={consulta.data} />
}

function Ficha({ tecnico: t }: { tecnico: TecnicoAdmin }) {
  const [editando, setEditando] = useState(false)
  const [pin, setPin] = useState(false)
  const reactivar = useGuardarTecnico(t.id)
  const ahora = useAhora(30_000)
  const enMapa = t.ultima_lat != null && t.ultima_lng != null

  const linea = [
    t.codigo && <span key="c" className="font-mono text-xs">{t.codigo}</span>,
    t.cargo && <span key="g">{t.cargo}</span>,
    (t.celular_modelo || t.celular_numero) && (
      <span key="t" className="inline-flex items-center gap-1">
        <SmartphoneIcon className="size-3.5" />
        {[t.celular_modelo, formatoCelular(t.celular_numero)].filter(Boolean).join(' · ')}
      </span>
    ),
    t.jornada_inicio && <span key="e">Entrada {hora(t.jornada_inicio)}</span>,
  ].filter(Boolean)

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <Link to="/tecnicos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Técnicos
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <AvatarEstado nombre={t.nombre} estado={t.activo ? t.estado_actual : undefined} tamano="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{t.nombre}</h2>
            {t.activo ? <EstadoChip estado={t.estado_actual} /> : <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Desactivado</span>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">{linea}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.celular_numero && (
            <Button variant="outline" asChild>
              <a href={`tel:${t.celular_numero.replace(/\s+/g, '')}`}><PhoneIcon /> Llamar</a>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={`/alertas?tecnico=${t.id}&estado=todas&rango=30`}><BellIcon /> Alertas</Link>
          </Button>
          <Button variant="outline" onClick={() => setEditando(true)}><PencilIcon /> Editar</Button>
          {enMapa && (
            <Button asChild>
              <Link to={`/mapa?tecnico=${t.id}`}><MapPinIcon /> Ver en mapa</Link>
            </Button>
          )}
        </div>
      </div>

      {!t.activo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/60 p-4 text-sm">
          <span>Desactivado: no puede iniciar sesión en la app. Su historial se conserva.</span>
          <Button size="sm" variant="outline" disabled={reactivar.isPending} onClick={() => reactivar.mutate({ activo: true })}>
            {reactivar.isPending && <Loader2Icon className="animate-spin" />} Reactivar
          </Button>
        </div>
      )}

      <Tabs defaultValue="recorrido">
        <TabsList>
          <TabsTrigger value="recorrido">Recorrido del día</TabsTrigger>
          <TabsTrigger value="datos">Datos y acceso</TabsTrigger>
        </TabsList>

        <TabsContent value="recorrido" className="mt-4">
          <RecorridoPestana tecnicoId={t.id} />
        </TabsContent>

        <TabsContent value="datos" className="mt-4 grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Acceso a la app">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm">
                  PIN:{' '}
                  {t.tiene_pin ? (
                    <span className="font-medium text-exito">Activo</span>
                  ) : (
                    <span className="font-medium text-aviso">Sin PIN · no puede entrar todavía</span>
                  )}
                </p>
                {t.pin_generado_en && (
                  <p className="mt-0.5 text-xs text-muted-foreground">Generado: {fechaCorta(t.pin_generado_en, ahora)}</p>
                )}
              </div>
              <Button variant={t.tiene_pin ? 'outline' : 'default'} onClick={() => setPin(true)}>
                <KeyRoundIcon /> {t.tiene_pin ? 'Reiniciar PIN' : 'Generar PIN'}
              </Button>
            </div>
            <Datos
              filas={[
                ['Usuario', <span key="u" className="font-mono text-xs">{t.usuario}</span>],
                ['También entra con', t.codigo && t.codigo !== t.usuario ? <span key="c" className="font-mono text-xs">{t.codigo}</span> : null],
              ]}
            />
          </Tarjeta>

          <Tarjeta titulo="Celular">
            <Datos
              filas={[
                ['Asignado', [t.celular_modelo, formatoCelular(t.celular_numero)].filter(Boolean).join(' · ') || 'Sin asignar'],
                [
                  'Detectado por la app',
                  t.equipo_modelo ? (
                    <>
                      {t.equipo_modelo}
                      {t.equipo_registrado_en && (
                        <span className="block text-xs text-muted-foreground">desde {fechaHora(t.equipo_registrado_en)}</span>
                      )}
                    </>
                  ) : (
                    'Aún no inició sesión'
                  ),
                ],
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Si inicia sesión desde otro celular, se crea una alerta de cambio de equipo.
            </p>
          </Tarjeta>

          <Tarjeta titulo="Datos">
            <Datos
              filas={[
                ['Código', t.codigo ? <span key="c" className="font-mono text-xs">{t.codigo}</span> : null],
                ['Cargo', t.cargo],
                ['Origen', t.odoo_employee_id != null ? `Odoo (empleado #${t.odoo_employee_id})` : 'Alta manual en el panel'],
                ['Registrado', fechaHora(t.creado_en)],
              ]}
            />
          </Tarjeta>
        </TabsContent>

      </Tabs>

      <FormularioTecnico tecnico={t} abierto={editando} alCambiar={setEditando} />
      <DialogoPin tecnico={t} abierto={pin} alCambiar={setPin} />
    </div>
  )
}

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <h3 className="font-semibold">{titulo}</h3>
      {children}
    </section>
  )
}

function Datos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="divide-y text-sm">
      {filas
        .filter(([, valor]) => valor != null && valor !== '')
        .map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="w-40 shrink-0 text-muted-foreground">{etiqueta}</dt>
            <dd className="min-w-0 flex-1">{valor}</dd>
          </div>
        ))}
    </dl>
  )
}
