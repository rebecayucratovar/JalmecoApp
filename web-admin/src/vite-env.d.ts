/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección de la API en producción, p. ej. https://api.jalmeco.com.bo/api/v1 (vacío = /api/v1). */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
