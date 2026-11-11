# Jalmeco Campo — Contexto del proyecto (para Claude Code)

Este archivo le da a Claude Code el contexto del proyecto. Mantener actualizado.

## Qué es

Sistema de seguimiento de técnicos de campo de **Jalmeco** (instalación y mantenimiento de
ascensores, La Paz / El Alto, Bolivia). Dos aplicaciones + un backend:

- **Panel web (admin):** ver técnicos en vivo, recorridos del día, alertas, configuración.
- **App móvil (técnico, Android):** rastreo GPS en segundo plano durante la jornada.
- **Backend:** recibe el GPS, calcula estados/paradas/alertas, sincroniza con Odoo.

Enfoque **transparente y con consentimiento**: el rastreo ocurre SOLO entre la marcación de
entrada y de salida (registradas en Odoo), nunca fuera de jornada. Se rastrea a **todo el
personal** con celular de la empresa (~48–50), no solo a los técnicos de campo: cualquiera
puede salir en jornada. MVP: La Paz; Santa Cruz entra con multi-sucursal (Fase 2).

## Alcance del MVP (entrega < 1 mes)

- 2 roles: **Administrador** y **Técnico**. Sin multi-sucursal (una sola operación).
- Sin lista de trabajos/servicios asignados (Fase 2).
- Incluye: rastreo + mapa en vivo + recorrido del día + alertas + integración Odoo +
  regla de almuerzo + **verificación por huella**.
- Fase 2 (después): servicios/encargos, zonas de clientes (estado "En punto de trabajo"),
  reportes avanzados, multi-sucursal, espejo de resumen en Odoo.

## Stack

- **Backend:** Python + Django + Django REST Framework + GeoDjango. (JWT para auth.)
- **Base de datos:** PostgreSQL + PostGIS.
- **Web admin:** React + Vite + TypeScript, Tailwind + shadcn/ui, Leaflet + OpenStreetMap, Recharts.
- **App móvil:** Flutter (Android). GPS: `flutter_foreground_task` + `geolocator` (gratis;
  el de pago Transistorsoft queda como opción futura). Offline: SQLite (sqflite/drift).
  Sesión: `flutter_secure_storage`. Huella: `local_auth`. Notificaciones:
  `flutter_local_notifications`. Info del equipo: `device_info_plus`.
- **Infra:** todo en Docker. Desarrollo local con `docker compose`. Producción en VPS
  (Contabo) con el mismo Docker. Respaldos al NAS. Mapa en vivo por sondeo (~10 s).
- **Odoo:** Odoo.sh 17. Integración por API (xmlrpc/odoorpc).

## Estructura del monorepo

```
jalmeco-campo/
├── backend/     Django + DRF + GeoDjango (API + worker)   — corre en Docker
├── web-admin/   React + Vite + TS                          — nativo en dev
└── mobile/      Flutter (Android)                          — nativo, SDK local
```

Flutter NO va en Docker. Backend + DB sí (incluye las librerías de mapas GDAL/GEOS/PROJ).

## Modelo de datos (resumen)

- **administrador:** login del panel (email + password_hash).
- **tecnico:** login de la app (usuario + pin_hash). Vinculado a Odoo por `odoo_employee_id`.
  Campos de último estado denormalizados (estado_actual, ultima_lat/lng, ultima_bateria,
  ultima_actualizacion) para el mapa en vivo. Incluye marca/modelo de celular y número.
- **jornada:** de la entrada a la salida (de Odoo). Incluye ubicacion_inicio/fin.
- **ubicacion:** cada punto GPS (geography Point). La tabla que más crece. Índices por
  (tecnico, registrado_en) y espacial en el punto.
- **parada:** paradas calculadas (para la línea de tiempo).
- **alerta:** sin_conexion, bateria_baja, verificacion_no_realizada.
- **franja_pausa:** ventanas sin rastreo (fila inicial: Almuerzo 12:00–13:00).
- **verificacion:** solicitudes de huella (tecnico, jornada, solicitada_en, respondida_en,
  resultado: exito / no_realizada).
- **zona (Fase 2, no ahora):** geocercas para "En sucursal" y "En punto de trabajo".

Celular: `celular_modelo` (lo autocompleta la app con device_info_plus) y `celular_numero`
(+591, se importa del Excel de la empresa).

## Reglas de negocio clave

- **Estados (los calcula el sistema, nadie los marca a mano):**
  Fuera de jornada (sin jornada), En trayecto (velocidad alta), En parada (quieto),
  Sin conexión (sin datos). "En sucursal" y "En punto de trabajo" son Fase 2 (requieren
  la tabla `zona`).
- **Horario laboral:** 08:00–12:00 y 13:00–18:00 (en `configuracion`: horario_inicio/fin).
  Es informativo: la jornada real la marcan la entrada y salida de Odoo.
- **Almuerzo / privacidad:** entre 12:00 y 13:00 (hora America/La_Paz) la app NO recolecta ni
  guarda puntos, y el backend rechaza cualquier punto en esa franja.
- **Huella:** la app pide confirmar identidad con la huella del celular en momentos aleatorios,
  ~2 veces al día (mínimo 1), vía notificación que abre la pantalla de verificación. Si no se
  responde en ~3 min → alerta al supervisor. (Las huellas se controlan con otra app de la
  empresa, así que solo la del técnico real está registrada en su equipo.)
- **Offline:** sin señal, los puntos se guardan en SQLite y se envían al reconectar. Se
  guardan aunque la jornada ya se haya cerrado, si su hora cae dentro de ella.
- **Retención:** borrar ubicaciones/recorridos más viejos que **12 meses** (configurable).
  El mismo valor se muestra en la app y en el admin. La asistencia vive en Odoo y no se toca.

## Integración con Odoo

- Leer `hr.attendance` para abrir/cerrar jornadas; `hr.employee` para importar personal y su
  **cargo** (job position de Odoo). El worker sincroniza cada ~1–15 min.
- **Espejo a Odoo (pedido de gerencia):** subir la última ubicación de cada persona a un campo
  del empleado cada ~8 min, para consultarla en Odoo. El detalle completo queda en el panel
  propio (con enlace). Solo resumen liviano, para no sobrecargar Odoo.
- El celular (marca/modelo/número) NO viene de Odoo: marca/modelo los autocompleta la app
  (`device_info_plus`); el número se importa de un Excel de la empresa. IMEI no es accesible
  en Android moderno.

## Convenciones

- Idioma de la interfaz: **español**. Zona horaria: **America/La_Paz**.
- Código de técnico: formato **JAL-XXXX** (de Odoo).
- Teléfonos: prefijo **+591** (Bolivia).
- PIN del técnico: **6 dígitos**.
- No versionar `.env` (solo `.env.example`). Fijar versiones en Docker y dependencias.

## Cómo correr (desarrollo)

```
# Backend + base de datos
cp backend/.env.example backend/.env   # (Copy-Item en PowerShell)
docker compose up --build
docker compose exec backend python manage.py migrate

# Web admin
cd web-admin && npm install && npm run dev

# App móvil (requiere Flutter SDK + emulador/celular Android)
cd mobile && flutter run
```

## Decisiones pendientes

- Confirmar que se instala la app en los celulares de **todo el personal** de La Paz
  (cualquiera puede salir en jornada). Santa Cruz entra con multi-sucursal (Fase 2).
- Confirmar si en Odoo los empleados ya tienen el cargo cargado.
- Teléfono del único trabajador con iPhone (recomendado: darle un Android).

Resuelto: retención = 12 meses. Celular: número del Excel + modelo automático por la app.

## Reparto del equipo (3 personas)

- Persona A: backend + worker + Odoo.
- Persona B: app móvil Flutter.
- Persona C: panel web React.

Punto de encuentro: el **contrato de la API** (definir antes de programar en paralelo).
