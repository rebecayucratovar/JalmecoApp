# Jalmeco GPS — Contexto del proyecto (para Claude Code)

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
- **Odoo:** Odoo.sh 17.0 Enterprise (`jalmeco.odoo.com`, base `appexbo-jalmeco-teknoliff-main-41805985`,
  con módulos a medida del partner: p. ej. ubicación y estado en hr.attendance). Integración
  por API XML-RPC con clave API (`backend/odoo_sync/cliente.py`; probar con `manage.py probar_odoo`).

## Estructura del monorepo

```
jalmeco-gps/
├── backend/     Django + DRF + GeoDjango (API + worker)   — corre en Docker
├── web-admin/   React + Vite + TS                          — nativo en dev
└── mobile/      Flutter (Android)                          — nativo, SDK local
```

Flutter NO va en Docker. Backend + DB sí (incluye las librerías de mapas GDAL/GEOS/PROJ).

## Modelo de datos (resumen)

- **administrador:** login del panel (email + password_hash). Cambiar la contraseña
  (`password_cambiado_en`) cierra las demás sesiones (mismo mecanismo que el PIN).
- **tecnico:** login de la app (usuario + pin_hash). Vinculado a Odoo por `odoo_employee_id`.
  El usuario es el de Odoo (su correo, `usuario_de_odoo` = se cambia allá); si no tiene, uno
  generado `nombre.apellido` (editable en el panel). También entra con su código JAL-XXXX si se
  le cargó (Odoo no lo tiene; el código es opcional).
  `pin_hash` NULL = "Sin PIN"; `pin_generado_en`. El PIN lo genera el admin (se muestra una sola
  vez); reiniciarlo revoca las sesiones abiertas (tokens con `iat` anterior → 401 SESION_REVOCADA). Campos de último estado denormalizados
  (estado_actual, ultima_lat/lng, ultima_bateria, ultima_velocidad, ultima_actualizacion)
  para el mapa en vivo.
- **jornada:** de la entrada a la salida (de Odoo). Incluye ubicacion_inicio/fin.
- **ubicacion:** cada punto GPS (geography Point). La tabla que más crece. Índices por
  (tecnico, registrado_en) y espacial en el punto.
- **parada:** reservada (Fase 2: direcciones/zonas). Hoy las paradas se calculan al consultar el
  recorrido (`ubicaciones/recorrido.py`: ≤ 100 m durante ≥ 5 min; filtra lecturas falsas del GPS).
- **alerta:** sin_conexion, bateria_baja, verificacion_no_realizada, cambio_equipo,
  seguimiento_detenido, salida_no_marcada. MVP: aviso al admin por correo (SMS/WhatsApp de pago → Fase 2).
- **franja_pausa:** ventanas sin rastreo (fila inicial: Almuerzo 12:00–13:00).
- **verificacion:** solicitudes de huella (tecnico, jornada, solicitada_en, respondida_en,
  resultado: exito / no_realizada, punto donde confirmó).
- **sincronizacion_odoo:** historial (solo corridas con registros o con error). La "última
  sincronización OK" es un solo dato en `configuracion.odoo_ultima_sync_ok`.
- **zona (Fase 2, no ahora):** geocercas para "En sucursal" y "En punto de trabajo".

Celular: **asignado** = `celular_modelo` (lo carga el admin, ej. "Samsung A15") y
`celular_numero` (+591, del Excel). **Detectado** = `equipo_id` (Android ID) + `equipo_modelo`
(device_info_plus, ej. "samsung SM-A155F"), lo reporta la app. Primera vez se guarda sin
alerta; si luego llega otro `equipo_id` → alerta `cambio_equipo`. Sin IMEI (Android 10+).

## Reglas de negocio clave

- **Estados (los calcula el sistema, nadie los marca a mano):**
  Fuera de jornada (sin jornada), En trayecto (velocidad alta), En parada (quieto),
  Sin conexión (sin datos por más de `sin_conexion_min`: señal, celular apagado, app cerrada…),
  Ubicación apagada (en jornada con el GPS apagado: la app lo avisa al instante con `preaviso`;
  vuelve al estado normal con el próximo punto; no genera además "Sin conexión"). "En sucursal" y "En punto de trabajo" son Fase 2 (requieren
  la tabla `zona`).
- **Horario laboral:** 08:00–12:00 y 13:00–18:00 (en `configuracion`: horario_inicio/fin).
  Es informativo: la jornada real la marcan la entrada y salida de Odoo.
- **Captura GPS:** un punto cada `gps_distancia_m` (25 m) recorridos, o cada `gps_intervalo_seg`
  (120 s) si está quieto. La velocidad la da el GPS del celular (no se calcula). La app guarda
  en SQLite y envía en lotes.
- **Servicio de rastreo (app):** servicio en primer plano encendido mientras haya sesión (Android
  no deja que una app cerrada lo arranque al marcar la entrada en Odoo). Fuera de jornada y en
  el almuerzo NO usa el GPS: solo consulta `mi/estado` (cada 2 min) con notificación "Fuera de
  jornada · No se registra tu ubicación". En jornada consulta cada 1 min y envía la cola cada 1 min.
- **Seguimiento detenido:** si cierra sesión, quita el permiso o apaga el GPS en jornada, la
  app avisa (`mi/seguimiento-detenido`) → alerta crítica al admin. GPS apagado en jornada (p. ej. lo
  olvidó al marcar la entrada): primero una notificación que suena al trabajador ("Activa tu
  ubicación") y, si sigue apagado a los 5 min (`Motor.esperaAvisoGps`), recién la alerta al admin.
  Fuera de jornada solo avisa cerrar sesión (advertencia: no se registrará su próxima jornada);
  ubicación apagada o sin permiso fuera de jornada, no.
- **Salida no marcada:** si la jornada sigue abierta al fin del horario + 2 h (o 4 h después de
  una entrada fuera de horario), el worker la cierra (al fin del horario o al último punto GPS),
  marca `cierre_automatico` y crea la alerta `salida_no_marcada`. La sincronización con Odoo no
  la reabre; si luego marca en Odoo una salida anterior, vale la de Odoo.
- **Almuerzo / privacidad:** entre 12:00 y 13:00 (hora America/La_Paz) la app NO recolecta ni
  guarda puntos, y el backend rechaza cualquier punto en esa franja. El personal además marca en
  Odoo la salida al almuerzo y el regreso (tolerancia de la empresa: ~12:10 y 13:05; los atrasos
  los descuenta Odoo/RR. HH., no este sistema) → quedan 2 jornadas; el recorrido muestra UN
  "Almuerzo" en el hueco entre ellas si cae en la franja ±30 min (`recorrido/linea.ts`).
- **Huella:** la app pide confirmar identidad con la huella del celular en momentos aleatorios,
  ~2 veces al día (mínimo 1), vía notificación que abre la pantalla de verificación. Si no se
  responde en ~3 min → alerta al supervisor. (Las huellas se controlan con otra app de la
  empresa, así que solo la del técnico real está registrada en su equipo.)
- **Offline:** sin señal, los puntos se guardan en SQLite y se envían al reconectar. Se
  guardan aunque la jornada ya se haya cerrado, si su hora cae dentro de ella.
- **Worker** (contenedor `worker`, `manage.py worker`): cada 1 min cierra huellas vencidas,
  sortea huellas (prob. faltan/minutos útiles hasta el fin del horario; separación 60 min; nunca
  en el almuerzo ni en los primeros 10 min) y revisa "Sin conexión" (`sin_conexion_min`, el
  almuerzo no cuenta; 30 min por defecto porque en el ducto del ascensor se pierde la señal hasta
  ~30 min); cada 5 min "Batería baja" (`bateria_baja_pct`, 1 por jornada); cada 1 min un correo
  con las alertas nuevas a `alertas_correos` (vacío = admins activos; SMTP en `.env`); cada 24 h
  la retención; Odoo: asistencia cada `odoo_sync_min` y datos del personal cada 1 h (sin
  credenciales en `.env` no hace nada). La configuración se edita en el panel
  (Configuración); el admin de Django (/admin) queda como respaldo.
- **Retención:** borrar ubicaciones/recorridos más viejos que **12 meses** (configurable).
  El mismo valor se muestra en la app y en el admin. La asistencia vive en Odoo y no se toca.

## Integración con Odoo

- Solo LECTURA de Odoo (`odoo_sync/servicios.py`). Leer `hr.attendance` para abrir/cerrar jornadas
  (entrada/salida); `hr.employee` para importar personal y su **cargo** (job position de Odoo). El
  worker lee la asistencia cada **1–2 min** como máximo (`odoo_sync_min`).
- **Importar personal:** lo elige el admin (Técnicos → "Importar de Odoo"), porque Odoo tiene 134
  empleados activos de 3 empresas (MI EMPRESA, TEKNOLIFT SRL, JALMECO LTDA) y ex empleados sin
  archivar. Nombre = `name` + `apellido_paterno` + `apellido_materno` (campos del partner: `name`
  trae solo los nombres). Si alguien ya estaba cargado a mano con el mismo nombre, se vincula.
  Cada hora se ponen al día nombre/cargo/usuario y, si se archiva en Odoo, se desactiva aquí.
- **Asistencia → jornada:** las abiertas + las de los últimos 2 días + las modificadas desde la
  última sincronización. Solo CREA jornadas de los últimos 2 días (no trae historial viejo).
  Se ignoran: marcaciones de segundos (< 1 min, por error), entradas con fecha futura y empleados
  no importados. Si borran la asistencia en Odoo, la jornada se borra (si está vacía) o se cierra.
  Al entrar se limpia la última posición (el mapa no muestra la de ayer). La asistencia trae la
  ubicación de entrada/salida (`in_latitude`…) → `ubicacion_inicio/fin`.
- **Cuidado con Odoo.sh:** el 12/11/2026 bloqueó el acceso ~90 min (403) mientras el worker iniciaba
  sesión cada 2 min. Ahora se inicia sesión UNA vez por proceso (`cliente._UIDS`) y, ante un 403/429,
  todas las tareas de Odoo se pausan 1 h (`servicios.PAUSA_POR_BLOQUEO`) en vez de insistir.
- **Espejo a Odoo (pedido de gerencia):** subir la última ubicación de cada persona a un campo
  del empleado cada ~8 min, para consultarla en Odoo. El detalle completo queda en el panel
  propio (con enlace). Solo resumen liviano, para no sobrecargar Odoo.
- El celular NO viene de Odoo (ver "Celular" arriba).

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

## Producción (Hostinger) — ver `docs/despliegue.md`

- **Panel:** hosting web de Hostinger, `https://ubicacionesgps.jalmeco.pro` (carpeta
  `/home/u358429369/domains/jalmeco.pro/public_html/ubicacionesgps`). API: `https://apigps.jalmeco.pro`
  (VPS 179.66.145.72). Se compila con
  `VITE_API_URL` y se sube por FTP (`.github/workflows/panel.yml`); `public/.htaccess` resuelve las rutas.
- **API + base + worker:** VPS de Hostinger con `docker-compose.prod.yml` (gunicorn, Caddy con HTTPS
  automático, base sin puertos publicados). `deploy/deploy.sh` lo actualiza; GitHub Actions lo corre por
  SSH al llegar a `main` (`.github/workflows/backend.yml`). Respaldo diario: `deploy/backup.sh` (cron).
- Variables del servidor: `deploy/env.produccion.example` → `backend/.env` en el VPS. Con `DEBUG=False`
  el backend no arranca si `SECRET_KEY` es la de ejemplo. CORS solo para el dominio del panel.
- APK: `flutter build apk --release --dart-define=API_URL=https://api.…/api/v1`.

## Decisiones pendientes

- Confirmar que se instala la app en los celulares de **todo el personal** de La Paz
  (cualquiera puede salir en jornada). Santa Cruz entra con multi-sucursal (Fase 2).
- Teléfono del único trabajador con iPhone (recomendado: darle un Android).

Resuelto: retención = 12 meses. Nombre: Jalmeco GPS. Login: usuario de Odoo o generado
(nombre.apellido); el código JAL no está en Odoo. Cargo: casi todos lo tienen en Odoo (job_id).
Celular: asignado (admin + Excel) y detectado (app). Sin IMEI ni celular del administrador.

## Equipo

Hoy una sola persona trabaja en todo (backend, app y panel). Se planeó para 3 (backend / app /
panel), por eso el **contrato de la API** (`docs/contrato-api.md`) es el punto de encuentro:
mantenerlo al día con cada cambio de endpoints.
