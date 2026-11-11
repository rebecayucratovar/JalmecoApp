import { useEffect, useState } from 'react'

/** La hora actual, refrescada cada `cadaMs` (para textos como "hace 5 s"). */
export function useAhora(cadaMs = 1000) {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), cadaMs)
    return () => clearInterval(t)
  }, [cadaMs])
  return ahora
}
