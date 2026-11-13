# Jalmeco GPS · Panel web (administración)

React 19 + Vite 8 + TypeScript 7, Tailwind 4 + shadcn/ui (Radix), React Router 8, TanStack Query.
Versiones fijas (sin `^`) en `package.json`.

## Correr

```bash
# Requiere el backend levantado (docker compose up) en http://localhost:8000
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas (Vitest)
npm run build      # compila a dist/
```

En desarrollo, Vite pasa `/api/...` al backend (proxy en `vite.config.ts`), así que no hace
falta CORS. En producción el servidor web (nginx) servirá `dist/` y `/api` en el mismo dominio.

Para entrar se necesita un administrador:
`docker compose exec backend python manage.py crear_admin --email ... --nombre "..."` (pide la contraseña).

> Si `npm install` falla con `Cannot read properties of null (reading 'edgesOut')` (error de
> npm 10.8 con las dependencias opcionales de Vitest), usa `npm install --legacy-peer-deps`.

## Estructura

```
src/
├── App.tsx            Rutas + proveedores (tema, sesión, consultas, avisos)
├── secciones.ts       Menú lateral (ruta, título, ícono)
├── lib/
│   ├── api.ts         Cliente de la API: token JWT, renovación automática, errores en español
│   ├── sesion.tsx     Sesión del admin (localStorage, compartida entre pestañas)
│   ├── tema.tsx       Tema claro / oscuro / sistema
│   └── formato.ts     Fechas en hora de La Paz
├── components/
│   ├── ui/            Componentes de shadcn/ui (agregar con `npx shadcn@4.23.0 add <nombre>`)
│   └── marco/         Menú lateral, encabezado y marco de las pantallas con sesión
└── paginas/           Una por pantalla (Login, …)
```

Colores de la marca en `src/index.css` (`--marino` #1C1C62 y `--petroleo` #0185B6, los mismos
de la app del trabajador).
