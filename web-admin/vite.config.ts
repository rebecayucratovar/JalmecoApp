/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const paquete = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

// Fecha de compilación (hora de Bolivia) para "Versión 1.0.0 · dd/mm/aaaa" al pie del menú
const fechaVersion = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date())

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __VERSION__: JSON.stringify(paquete.version),
    __FECHA_VERSION__: JSON.stringify(fechaVersion),
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    // En desarrollo el panel llama a /api/... y Vite lo pasa al backend de Docker (mismo origen:
    // no hace falta CORS). En producción el panel está en Hostinger y llama a VITE_API_URL.
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
