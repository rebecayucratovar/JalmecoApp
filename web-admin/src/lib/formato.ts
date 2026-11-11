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

/** Iniciales para el avatar: "Carla Rojas" → "CR". */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  return ((palabras[0]?.[0] ?? '') + (palabras.length > 1 ? palabras[palabras.length - 1][0] : '')).toUpperCase()
}
