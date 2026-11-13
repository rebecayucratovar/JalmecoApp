import { useState } from 'react'

import { erroresPorCampo } from '@/lib/api'

import { cambios, useGuardarConfiguracion, type CambiosConfiguracion, type Configuracion } from './datos'

type Clave = keyof CambiosConfiguracion

function elegir<K extends Clave>(config: Configuracion, claves: readonly K[]) {
  return Object.fromEntries(claves.map((k) => [k, config[k]])) as Pick<Configuracion, K>
}

/** Borrador de una sección: lo escrito, qué cambió y cómo guardarlo (solo lo cambiado). */
export function useBorrador<K extends Clave>(config: Configuracion, claves: readonly K[]) {
  const original = elegir(config, claves)
  const [borrador, setBorrador] = useState(original)
  const guardar = useGuardarConfiguracion()
  const diferencias = cambios(original, borrador)
  return {
    borrador,
    original,
    cambiar: <C extends K>(clave: C, valor: Configuracion[C]) => setBorrador((b) => ({ ...b, [clave]: valor })),
    sucio: Object.keys(diferencias).length > 0,
    guardar,
    errores: erroresPorCampo(guardar.error),
    enviar: () =>
      // El servidor puede normalizar lo escrito (p. ej. los correos): se toma lo que devuelve
      guardar.mutate(diferencias, { onSuccess: (nueva) => setBorrador(elegir(nueva, claves)) }),
    descartar: () => {
      guardar.reset()
      setBorrador(original)
    },
  }
}
