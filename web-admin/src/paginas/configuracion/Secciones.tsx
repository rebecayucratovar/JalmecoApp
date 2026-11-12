import { CheckCircle2Icon, Loader2Icon, MailIcon, PlugIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fechaCorta, haceCuanto } from '@/lib/formato'
import { useAhora } from '@/lib/useAhora'
import { cn } from '@/lib/utils'

import { listaCorreos, useEstadoOdoo, useProbarOdoo, type Configuracion } from './datos'
import { useBorrador } from './borrador'
import { Campo, CampoHora, CampoNumero, Nota, Tarjeta } from './Formulario'

type Props = { config: Configuracion }

// ---------- Horario y almuerzo ----------

export function SeccionHorario({ config }: Props) {
  const b = useBorrador(config, ['horario_inicio', 'horario_fin', 'almuerzo'] as const)
  const { horario_inicio: inicio, horario_fin: fin } = b.borrador
  const almuerzo = b.borrador.almuerzo ?? { inicio: '12:00', fin: '13:00' }

  return (
    <Tarjeta
      titulo="Horario y almuerzo"
      descripcion="Horario laboral esperado y la pausa del almuerzo, en hora de La Paz."
      borrador={b}
    >
      <BarraHorario inicio={inicio} fin={fin} almuerzo={almuerzo} />

      <div className="grid gap-5 xl:grid-cols-2 xl:gap-8">
      <div className="space-y-5">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-medium">Horario laboral</legend>
        <CampoHora id="horario_inicio" etiqueta="Desde" valor={inicio} alCambiar={(v) => b.cambiar('horario_inicio', v)} error={b.errores.horario_inicio} />
        <CampoHora id="horario_fin" etiqueta="Hasta" valor={fin} alCambiar={(v) => b.cambiar('horario_fin', v)} error={b.errores.horario_fin} />
      </fieldset>
      <Nota>
        Es informativo: la jornada real empieza y termina con la <strong className="font-medium text-foreground">entrada y salida
        marcadas en Odoo</strong>. Se usa para repartir las verificaciones por huella dentro del día.
      </Nota>
      </div>
      <div className="space-y-5">

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-medium">Almuerzo</legend>
        <CampoHora id="almuerzo_inicio" etiqueta="Desde" valor={almuerzo.inicio} alCambiar={(v) => b.cambiar('almuerzo', { ...almuerzo, inicio: v })} />
        <CampoHora id="almuerzo_fin" etiqueta="Hasta" valor={almuerzo.fin} alCambiar={(v) => b.cambiar('almuerzo', { ...almuerzo, fin: v })} />
        {b.errores.almuerzo && <p className="text-xs text-destructive sm:col-span-2" role="alert">{b.errores.almuerzo}</p>}
      </fieldset>
      <Nota>
        Por privacidad, durante el almuerzo la app <strong className="font-medium text-foreground">no registra la ubicación</strong> y
        el servidor rechaza cualquier punto en esa franja. Tampoco se piden huellas ni cuenta para “Sin conexión”.
      </Nota>
      </div>
      </div>
    </Tarjeta>
  )
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Dibujo del día (06:00–22:00): horario laboral con el almuerzo marcado. */
function BarraHorario({ inicio, fin, almuerzo }: { inicio: string; fin: string; almuerzo: { inicio: string; fin: string } }) {
  const desde = 6 * 60
  const hasta = 22 * 60
  const pct = (hhmm: string) => `${Math.min(100, Math.max(0, ((minutos(hhmm) - desde) / (hasta - desde)) * 100))}%`
  const ancho = (a: string, b: string) => `calc(${pct(b)} - ${pct(a)})`
  const valido = /^\d\d:\d\d/.test(inicio) && /^\d\d:\d\d/.test(fin) && minutos(inicio) < minutos(fin)
  const conAlmuerzo = valido && /^\d\d:\d\d/.test(almuerzo.inicio) && /^\d\d:\d\d/.test(almuerzo.fin) && minutos(almuerzo.inicio) < minutos(almuerzo.fin)

  const rayado = 'bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_5px,var(--color-card)_5px_10px)]'

  return (
    <div>
      <div className="relative h-7 overflow-hidden rounded-lg bg-muted" aria-hidden>
        {valido && <div className="absolute inset-y-0 bg-primary/80" style={{ left: pct(inicio), width: ancho(inicio, fin) }} />}
        {conAlmuerzo && (
          <div className={cn('absolute inset-y-0 ring-1 ring-border', rayado)} style={{ left: pct(almuerzo.inicio), width: ancho(almuerzo.inicio, almuerzo.fin) }} />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums" aria-hidden>
        {['06:00', '10:00', '14:00', '18:00', '22:00'].map((h) => <span key={h}>{h}</span>)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary/80" aria-hidden /> Horario laboral{valido && ` ${inicio}–${fin}`}
        </li>
        <li className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded-sm ring-1 ring-border', rayado)} aria-hidden /> Almuerzo, sin rastreo
          {conAlmuerzo && ` ${almuerzo.inicio}–${almuerzo.fin}`}
        </li>
      </ul>
    </div>
  )
}

// ---------- Verificación por huella ----------

export function SeccionHuella({ config }: Props) {
  const b = useBorrador(config, ['verificaciones_por_dia', 'verificacion_limite_min'] as const)
  return (
    <Tarjeta
      titulo="Verificación por huella"
      descripcion="La app pide confirmar la identidad con la huella del celular en momentos al azar de la jornada."
      borrador={b}
    >
      <div className="grid items-start gap-5 xl:grid-cols-2 xl:gap-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo id="verificaciones_por_dia" etiqueta="Verificaciones por día" error={b.errores.verificaciones_por_dia}
          ayuda="Por persona y por jornada. Siempre al menos 1.">
          <Select value={String(b.borrador.verificaciones_por_dia)} onValueChange={(v) => b.cambiar('verificaciones_por_dia', Number(v))}>
            <SelectTrigger id="verificaciones_por_dia" className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n === 1 ? '1 vez al día' : `${n} veces al día`}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
        <CampoNumero id="verificacion_limite_min" etiqueta="Tiempo para responder" unidad="min" min={1} max={15}
          valor={b.borrador.verificacion_limite_min} alCambiar={(v) => b.cambiar('verificacion_limite_min', v)}
          error={b.errores.verificacion_limite_min}
          ayuda="Si no confirma en ese tiempo, se crea la alerta “Verificación no realizada”." />
      </div>
      <Nota>
        Los momentos se sortean dentro del horario laboral, separados al menos 60 minutos. Nunca durante el almuerzo
        ni en los primeros 10 minutos después de marcar la entrada.
      </Nota>
      </div>
    </Tarjeta>
  )
}

// ---------- Captura GPS ----------

export function SeccionGps({ config }: Props) {
  const b = useBorrador(config, ['gps_distancia_m', 'gps_intervalo_seg'] as const)
  const { gps_distancia_m: metros, gps_intervalo_seg: segundos } = b.borrador
  return (
    <Tarjeta
      titulo="Captura GPS"
      descripcion="Cada cuánto la app guarda un punto de ubicación durante la jornada."
      borrador={b}
      pie="Los celulares toman el cambio al consultar su estado (en 1–2 min)."
    >
      <div className="grid items-start gap-5 xl:grid-cols-2 xl:gap-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <CampoNumero id="gps_distancia_m" etiqueta="En movimiento: un punto cada" unidad="metros" min={5} max={500}
          valor={metros} alCambiar={(v) => b.cambiar('gps_distancia_m', v)} error={b.errores.gps_distancia_m} />
        <CampoNumero id="gps_intervalo_seg" etiqueta="Quieto: un punto cada" unidad="seg" min={30} max={900}
          valor={segundos} alCambiar={(v) => b.cambiar('gps_intervalo_seg', v)} error={b.errores.gps_intervalo_seg}
          ayuda={`Entre 30 y 900 segundos${segundos >= 60 && !Number.isNaN(segundos) ? ` (${+(segundos / 60).toFixed(1)} min)` : ''}.`} />
      </div>
      <Nota>
        Valores más bajos dan un recorrido más detallado, pero gastan más batería y datos móviles. Con 25 m y 120 s
        (lo recomendado) el recorrido se ve bien sin agotar la batería en la jornada.
      </Nota>
      </div>
    </Tarjeta>
  )
}

// ---------- Alertas ----------

export function SeccionAlertas({ config }: Props) {
  const b = useBorrador(config, ['sin_conexion_min', 'bateria_baja_pct', 'alertas_correos'] as const)
  const escritos = listaCorreos(b.borrador.alertas_correos)
  const destinatarios = b.sucio ? (escritos.length ? escritos : null) : config.alertas_destinatarios

  return (
    <Tarjeta titulo="Alertas" descripcion="Cuándo se crean las alertas automáticas y a quién se avisa por correo." borrador={b}>
      <div className="grid items-start gap-5 xl:grid-cols-2 xl:gap-8">
      <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <CampoNumero id="sin_conexion_min" etiqueta="“Sin conexión” después de" unidad="min" min={3} max={120}
          valor={b.borrador.sin_conexion_min} alCambiar={(v) => b.cambiar('sin_conexion_min', v)} error={b.errores.sin_conexion_min}
          ayuda="Sin datos del celular en jornada. El almuerzo no cuenta." />
        <CampoNumero id="bateria_baja_pct" etiqueta="“Batería baja” por debajo de" unidad="%" min={5} max={50}
          valor={b.borrador.bateria_baja_pct} alCambiar={(v) => b.cambiar('bateria_baja_pct', v)} error={b.errores.bateria_baja_pct}
          ayuda="Una vez por jornada." />
      </div>
      <Nota>
        30 minutos es lo recomendado para “Sin conexión”: dentro del ducto del ascensor el celular puede quedarse sin señal
        durante todo un mantenimiento. Con menos, llegarán alertas en trabajos normales.
      </Nota>
      </div>
      <div className="space-y-5">

      <Campo id="alertas_correos" etiqueta="Enviar las alertas por correo a" error={b.errores.alertas_correos}
        ayuda="Separados por coma o uno por línea. Vacío = a todos los administradores activos.">
        <textarea
          id="alertas_correos"
          rows={3}
          value={b.borrador.alertas_correos}
          onChange={(e) => b.cambiar('alertas_correos', e.target.value)}
          placeholder="supervisor@jalmeco.com, gerencia@jalmeco.com"
          spellCheck={false}
          aria-invalid={!!b.errores.alertas_correos || undefined}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </Campo>
      <div className="text-sm">
        <p className="mb-2 text-muted-foreground">{b.sucio ? 'Al guardar, llegarán a:' : 'Hoy llegan a:'}</p>
        {destinatarios ? (
          <ul className="flex flex-wrap gap-1.5">
            {destinatarios.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                <MailIcon className="size-3.5 text-muted-foreground" aria-hidden /> {c}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs">Todos los administradores activos.</p>
        )}
      </div>
      {!config.correo_activo && (
        <Nota tono="aviso">
          <strong className="font-medium">El servidor de correo aún no está configurado.</strong> Las alertas se ven en el panel,
          pero no se envían correos hasta completar los datos <code className="text-xs">EMAIL_*</code> en <code className="text-xs">backend/.env</code>.
        </Nota>
      )}
      </div>
      </div>
    </Tarjeta>
  )
}

// ---------- Odoo y datos ----------

const TIPOS_SYNC: Record<string, string> = { asistencia: 'Asistencia', empleados: 'Empleados', espejo: 'Ubicación a Odoo' }

export function SeccionOdoo({ config }: Props) {
  const b = useBorrador(config, ['odoo_sync_min', 'retencion_meses'] as const)
  const reduce = !Number.isNaN(b.borrador.retencion_meses) && b.borrador.retencion_meses < b.original.retencion_meses

  return (
    <div className="grid items-start gap-5 2xl:grid-cols-2">
      <EstadoOdoo />
      <Tarjeta titulo="Sincronización y datos guardados" borrador={b}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo id="odoo_sync_min" etiqueta="Leer la asistencia de Odoo cada" error={b.errores.odoo_sync_min}
            ayuda="Entradas y salidas que abren y cierran la jornada.">
            <Select value={String(b.borrador.odoo_sync_min)} onValueChange={(v) => b.cambiar('odoo_sync_min', Number(v))}>
              <SelectTrigger id="odoo_sync_min" className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 minuto</SelectItem>
                <SelectItem value="2">2 minutos</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <CampoNumero id="retencion_meses" etiqueta="Guardar ubicaciones y recorridos" unidad="meses" min={1} max={36}
            valor={b.borrador.retencion_meses} alCambiar={(v) => b.cambiar('retencion_meses', v)} error={b.errores.retencion_meses}
            ayuda="Lo más antiguo se borra cada día. La asistencia vive en Odoo y no se toca." />
        </div>
        {reduce && (
          <Nota tono="aviso">
            <strong className="font-medium">Atención:</strong> en la próxima limpieza diaria se borrarán las ubicaciones y
            recorridos de más de {b.borrador.retencion_meses} {b.borrador.retencion_meses === 1 ? 'mes' : 'meses'}. No se puede deshacer.
          </Nota>
        )}
      </Tarjeta>
    </div>
  )
}

function EstadoOdoo() {
  const consulta = useEstadoOdoo()
  const probar = useProbarOdoo()
  const ahora = useAhora(30_000)
  const e = consulta.data

  return (
    <Tarjeta titulo="Integración con Odoo" descripcion="De Odoo se leen la asistencia (entrada y salida) y el personal.">
      {consulta.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" /> Cargando…</p>
      ) : consulta.isError ? (
        <p className="text-sm text-destructive">{consulta.error.message}</p>
      ) : (
        <>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Servidor</dt>
            <dd className="font-mono text-xs leading-5 break-all">{e!.url ?? '—'}</dd>
            <dt className="text-muted-foreground">Base de datos</dt>
            <dd className="font-mono text-xs leading-5 break-all">{e!.db ?? '—'}</dd>
            <dt className="text-muted-foreground">Usuario de integración</dt>
            <dd className="leading-5">{e!.usuario ?? <span className="text-muted-foreground">Sin configurar</span>}</dd>
            <dt className="text-muted-foreground">Última sincronización</dt>
            <dd className="leading-5">
              {e!.ultima_sync_ok ? (
                <span title={fechaCorta(e!.ultima_sync_ok, ahora)}>{haceCuanto(e!.ultima_sync_ok, ahora)}</span>
              ) : (
                <span className="text-muted-foreground">Todavía ninguna</span>
              )}
            </dd>
          </dl>

          {e!.faltan.length > 0 && (
            <Nota tono="aviso">
              <strong className="font-medium">Faltan datos para conectar:</strong>{' '}
              {e!.faltan.map((v, i) => <span key={v}>{i > 0 && ', '}<code className="text-xs">{v}</code></span>)} en{' '}
              <code className="text-xs">backend/.env</code>. El usuario y la clave API los entrega el administrador de Odoo.
            </Nota>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => probar.mutate()} disabled={probar.isPending}>
              {probar.isPending ? <Loader2Icon className="animate-spin" /> : <PlugIcon />} Probar conexión
            </Button>
            {probar.data && (
              <p className={cn('flex items-center gap-1.5 text-sm', probar.data.ok ? 'text-exito' : 'text-destructive')} role="status">
                {probar.data.ok ? <CheckCircle2Icon className="size-4 shrink-0" /> : <XCircleIcon className="size-4 shrink-0" />}
                {probar.data.ok ? `${probar.data.mensaje} Odoo ${probar.data.version ?? ''}` : probar.data.mensaje}
              </p>
            )}
            {probar.isError && <p className="text-sm text-destructive">{probar.error.message}</p>}
          </div>

          {e!.historial.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Últimas sincronizaciones</h3>
              <ul className="divide-y rounded-lg border text-sm">
                {e!.historial.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                    {h.resultado === 'ok'
                      ? <CheckCircle2Icon className="size-4 text-exito" aria-label="Correcta" />
                      : <TriangleAlertIcon className="size-4 text-destructive" aria-label="Con error" />}
                    <span className="w-28 text-muted-foreground tabular-nums">{fechaCorta(h.fecha, ahora)}</span>
                    <span className="font-medium">{TIPOS_SYNC[h.tipo] ?? h.tipo}</span>
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {h.resultado === 'ok' ? `${h.registros} ${h.registros === 1 ? 'registro' : 'registros'}` : h.mensaje}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  )
}
