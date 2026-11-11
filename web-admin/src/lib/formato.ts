/** Formatos de fecha y hora. Siempre en hora de La Paz, aunque la PC tenga otra zona. */

export const ZONA = 'America/La_Paz'

const partesFecha = new Intl.DateTimeFormat('es-BO', {
  timeZone: ZONA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

/** "Miércoles 11 de noviembre · 16:45" (encabezado del panel). */
export function fechaEncabezado(fecha: Date): string {
  const p = Object.fromEntries(partesFecha.formatToParts(fecha).map((x) => [x.type, x.value]))
  return `${mayuscula(p.weekday)} ${p.day} de ${p.month} · ${p.hour}:${p.minute}`
}

/**
 * Iniciales del nombre y el apellido paterno: "Carla Rojas" → "CR",
 * "Wilmer Huanca Callisaya" → "WH", "Luis Fernando Choque Apaza" → "LC".
 */
export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean)
  const apellido = p.length >= 4 ? p[2] : p[1]
  return ((p[0]?.[0] ?? '') + (apellido?.[0] ?? '')).toUpperCase()
}

const formatoHora = new Intl.DateTimeFormat('es-BO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "08:02" (hora de La Paz). */
export function hora(fecha: Date | string): string {
  return formatoHora.format(new Date(fecha))
}

/** "hace 28 s", "hace 5 min", "hace 2 h", "hace 3 d". */
export function haceCuanto(fecha: Date | string, ahora: Date = new Date()): string {
  const seg = Math.max(0, Math.round((ahora.getTime() - new Date(fecha).getTime()) / 1000))
  if (seg < 60) return `hace ${seg} s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

/** Para buscar sin importar mayúsculas ni tildes: "Óscar Peña" → "oscar pena". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

const formatoFecha = new Intl.DateTimeFormat('es-BO', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' })
const diaLaPaz = (d: Date) => formatoFecha.format(d)

/** "Hoy, 16:45" · "Ayer, 09:10" · "15/09/2026" (hora de La Paz). */
export function fechaCorta(fecha: Date | string, ahora: Date = new Date()): string {
  const d = new Date(fecha)
  if (diaLaPaz(d) === diaLaPaz(ahora)) return `Hoy, ${hora(d)}`
  if (diaLaPaz(d) === diaLaPaz(new Date(ahora.getTime() - 86_400_000))) return `Ayer, ${hora(d)}`
  return diaLaPaz(d)
}

/** "15/09/2026 08:02" (hora de La Paz). */
export function fechaHora(fecha: Date | string): string {
  const d = new Date(fecha)
  return `${diaLaPaz(d)} ${hora(d)}`
}
