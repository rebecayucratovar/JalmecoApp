/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección de la API en producción, p. ej. https://api.jalmeco.com.bo/api/v1 (vacío = /api/v1). */
  readonly VITE_API_URL?: string
}

/** Versión del panel (package.json) y fecha de compilación dd/mm/aaaa: se muestran al pie del menú. */
declare const __VERSION__: string
declare const __FECHA_VERSION__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}
