# Contrato de la API — Jalmeco GPS

Define los endpoints que conectan el **backend** (Django) con la **app móvil** y el
**panel web**. Es el acuerdo para que los 3 trabajen en paralelo.

## Convenciones

- **Base URL:** `/api/v1`
- **Autenticación:** JWT. Enviar en cada petición protegida el encabezado
  `Authorization: Bearer <access_token>`.
- **Formato:** JSON. Fechas en ISO 8601 con zona horaria (ej. `2026-11-07T11:30:00-04:00`).
- **Coordenadas:** decimales `lat` y `lng` (no WKB). El backend las convierte a/desde PostGIS.
- **Errores:** `{ "error": "mensaje legible", "codigo": "CODIGO_OPCIONAL" }` con el código HTTP
  correspondiente (400, 401, 403, 404, 422…).

---

## 1. Autenticación

### POST /auth/admin/login
Login del administrador (panel web).
```
→ { "email": "carla@jalmeco.com.bo", "password": "••••••" }
← { "access": "jwt…", "refresh": "jwt…", "admin": { "id": 1, "nombre": "Carla Rojas", "email": "…" } }
```

### POST /auth/tecnico/login
Login del técnico (app móvil).
```
→ { "usuario": "jmartinez", "pin": "292317" }
← { "access": "jwt…", "refresh": "jwt…", "tecnico": { …resumen técnico… } }
```
- `usuario` acepta el **usuario de Odoo o el código JAL-XXXX** (sin distinguir mayúsculas).
  Si la persona no tiene usuario en Odoo, su usuario es el código.
- Un técnico "Sin PIN" (el admin aún no lo generó) no puede entrar → 401.

### POST /auth/refresh
```
→ { "refresh": "jwt…" }   ← { "access": "jwt…" }
```
- Access dura 60 min y refresh 30 días (configurable). Credenciales o tokens inválidos → 401.
- Límite de intentos: 10 por hora **por persona** (usuario y código cuentan juntos) y 60 por
  minuto por IP → 429 `DEMASIADOS_INTENTOS`.

---

## 2. Objetos reutilizados

**TecnicoResumen** (para mapa, lista y fichas):
```
{
  "id": 12, "codigo": "JAL-1047", "nombre": "Marco Antonio Condori",
  "cargo": "Supervisor de campo", "foto_url": "…",
  "estado_actual": "en_trayecto",      // fuera_jornada | en_trayecto | en_parada | sin_conexion
  "ultima_lat": -16.5412, "ultima_lng": -68.0790, "ultima_bateria": 91,
  "ultima_velocidad": 28.4,             // km/h, del último punto
  "ultima_actualizacion": "2026-11-07T11:30:05-04:00",
  "celular_modelo": "Motorola G54", "celular_numero": "+591 720 11873"
}
```
- `celular_modelo` / `celular_numero`: celular **asignado** por la empresa (los carga el admin).
  El equipo **detectado** por la app (`equipo_modelo`) se ve en el detalle del técnico.

---

## 3. Endpoints de la APP MÓVIL (rol técnico)

### GET /mi/estado
Estado de la jornada actual (para la pantalla Inicio).
```
← {
    "en_jornada": true,
    "jornada": { "inicio": "2026-11-07T08:02:00-04:00", "horario": "08:00–18:00" },
    "en_pausa_almuerzo": false,
    "franja_almuerzo": { "inicio": "12:00", "fin": "13:00" },
    "resumen_hoy": { "tiempo_jornada_min": 263, "distancia_km": 37.4 },
    "rastreo": { "distancia_m": 25, "intervalo_seg": 120 },
    "ultima_verificacion": { "id": 88, "segundos_restantes": null,
                             "solicitada_en": "…11:30…", "respondida_en": "…11:31…",
                             "resultado": "exito" }        // o null; pendiente | exito | no_realizada
  }
```
- `jornada` es `null` si no hay jornada activa. `horario` sale de la configuración (horario laboral).
- `en_pausa_almuerzo`: la hora actual cae en una franja de pausa habilitada → la app no
  captura ni guarda puntos.
- `resumen_hoy.tiempo_jornada_min`: minutos de las jornadas de hoy (la activa cuenta hasta ahora).
- `resumen_hoy.distancia_km`: kilómetros **recorridos** hoy (suma de tramos entre puntos
  consecutivos; ignora puntos con precisión peor que 50 m). No es la distancia en línea recta.
- `rastreo`: cómo debe capturar la app (configurable en el panel). Un punto cada vez que se
  mueve `distancia_m` metros **o** cada `intervalo_seg` segundos si está quieto (para que el
  panel sepa que sigue conectado). La app lo relee en cada sondeo.
- `ultima_verificacion.segundos_restantes`: solo si está `pendiente` y vigente. La app arma la
  cuenta regresiva con este número (no con su reloj) y muestra el aviso "Confirma tu identidad".
  Las vencidas se cierran como `no_realizada` con alerta (worker cada minuto:
  `cerrar_verificaciones_vencidas`; mi/estado también lo hace para quien consulta).

### POST /mi/ubicaciones
Enviar puntos GPS (en lote; soporta los acumulados offline).
```
→ { "puntos": [
     { "lat": -16.5412, "lng": -68.0790, "precision_m": 8.0, "velocidad": 12.5,
       "bateria": 90, "registrado_en": "2026-11-07T11:30:00-04:00" }, … ] }
← { "recibidos": 12, "rechazados": 0 }   // rechazados: fuera de jornada o en almuerzo
```
- `velocidad` en **km/h** (geolocator entrega m/s: la app multiplica × 3.6).
- Máximo 1000 puntos por lote. Cada punto se valida por separado: uno malo no invalida el lote.
- Cada punto se liga a la jornada que contiene su `registrado_en`, **aunque esa jornada ya se
  haya cerrado** (puntos offline que llegan al reconectar). Se rechaza si no cae en ninguna
  jornada, si cae en una franja de pausa, si tiene datos inválidos o si está más de 5 min en el futuro.
- Solo los puntos de la jornada **activa** actualizan la última posición/estado (mapa en vivo).

### PUT /mi/dispositivo
Equipo detectado por la app (`device_info_plus` + Android ID). Llamar al iniciar sesión y al
abrir la app.
```
→ { "equipo_id": "9774d56d682e549c", "equipo_modelo": "samsung SM-A155F" }
← { "ok": true, "cambio_equipo": false }
```
- Primera vez (sin equipo registrado): se guarda, sin alerta.
- Si ya había otro `equipo_id` → se registra el nuevo y se crea la alerta **`cambio_equipo`**
  (crítica): cambio de celular o intento de usar otro equipo para evadir el GPS.
- El IMEI no se usa (Android 10+ no lo permite).

### POST /mi/seguimiento-detenido
La app avisa que va a dejar de rastrear. Solo crea alerta si hay jornada activa.
```
→ { "motivo": "cerro_sesion" }   // cerro_sesion | permiso_revocado | gps_apagado
← { "ok": true, "alerta_creada": true }
```
- En jornada: alerta **`seguimiento_detenido`** crítica.
- Fuera de jornada, `cerro_sesion` o `permiso_revocado`: la misma alerta como **advertencia** ("no se
  registrará su próxima jornada"), una por motivo cada 12 h. `gps_apagado` fuera de jornada: sin alerta.
- Al cerrar sesión, llamarlo **antes** de borrar el token.

### GET /mi/verificacion-pendiente
¿Hay una verificación de huella vigente? (la app también la recibe por notificación).
```
← { "pendiente": true, "verificacion_id": 88, "solicitada_en": "…11:30:00…",
    "vence_en": "…11:33:00…", "limite_min": 3 }          // o { "pendiente": false }
```

### POST /mi/verificaciones/{id}/responder
Resultado tras pasar la huella en el celular (`local_auth` en modo **solo biometría**).
```
→ { "resultado": "exito", "lat": -16.5412, "lng": -68.0790 }   ← { "ok": true }
```
- `lat`/`lng` opcionales: dónde estaba al confirmar (se ve en el panel).
- Solo se envía `exito`. Si no responde a tiempo, el worker la marca `no_realizada` y alerta.
- 409 `YA_RESPONDIDA` si ya fue respondida · 409 `VERIFICACION_VENCIDA` si pasó el límite ·
  404 si no es suya.

### GET /mi/perfil
Datos del técnico y políticas (pantalla Perfil).
```
← { "tecnico": { "id": 1, "codigo": "JAL-1047", "usuario": "jmartinez", "nombre": "…",
                 "cargo": "…", "foto_url": null, "celular_modelo": "Samsung A15",
                 "celular_numero": "+591 712 34567", "equipo_modelo": "samsung SM-A155F" },
    "politicas": { "horario": "08:00–18:00", "franja_almuerzo": { "inicio": "12:00", "fin": "13:00" },
                   "retencion_meses": 12, "verificaciones_por_dia": 2,
                   "rastreo": { "distancia_m": 25, "intervalo_seg": 120 } } }
```

---

## 4. Endpoints del PANEL ADMIN (rol administrador)

### GET /mapa-en-vivo
Todo el personal activo (el panel lo consulta cada ~10 s).
```
← { "actualizado_en": "…", "tecnicos": [ TecnicoResumen + { "jornada_inicio": "…" | null }, … ] }
```
- En jornada: con su última posición, batería y velocidad.
- Fuera de jornada: `estado_actual: "fuera_jornada"` y **sin** `ultima_lat/lng/bateria/velocidad/
  actualizacion` (null): fuera de la jornada no se muestra dónde estuvo (privacidad).

### GET /dashboard
Resumen de Inicio (el panel lo consulta cada 30 s; las últimas alertas salen de `/alertas/resumen`
y el mapa chico de `/mapa-en-vivo`).
```
← { "actualizado_en": "…",
    "personal": { "activos": 48, "en_jornada": 12, "en_trayecto": 7, "en_parada": 4,
                  "sin_conexion": 1, "trabajaron_hoy": 14, "sin_pin": 3 },
    "alertas": { "nuevas": 2, "criticas": 1, "hoy": 5 },
    "verificaciones_hoy": { "pedidas": 10, "exito": 8, "no_realizadas": 1, "pendientes": 1 },
    "sin_conexion_min": 30,          // umbral de la alerta (para el texto de la tarjeta)
    "horas_campo": [ { "fecha": "2026-11-05", "horas": 80.5, "personas": 10 }, … ] }   // 7 días, sin almuerzo
```

### GET /tecnicos  ·  GET /tecnicos/{id}  ·  POST /tecnicos  ·  PUT /tecnicos/{id}
Lista (todo el personal, activos e inactivos), ficha, alta y edición.
```
← GET /tecnicos      { "tecnicos": [ TecnicoAdmin, … ] }
← GET /tecnicos/{id}  TecnicoAdmin
   TecnicoAdmin = TecnicoResumen + { jornada_inicio, usuario, usuario_de_odoo, activo, tiene_pin, pin_generado_en,
                  equipo_modelo, equipo_registrado_en, odoo_employee_id, creado_en }
→ POST / PUT { "nombre", "codigo"?, "usuario"?, "cargo"?, "celular_modelo"?, "celular_numero"?, "activo"? }
← 201 / 200 TecnicoAdmin
```
- Fuera de jornada: sin ubicación (igual que en /mapa-en-vivo).
- PUT cambia solo los campos enviados. No hay borrado: se desactiva (`activo: false`, no puede entrar).
- `usuario` vacío = el código. Ni el usuario ni el código pueden repetirse entre personas (tampoco
  cruzados), porque el login acepta cualquiera de los dos.
- `celular_numero` se guarda como `+591 7XXXXXXX` (acepta "712 45830", "59171245830"…).
- Si la persona viene de Odoo (`odoo_employee_id`), nombre y cargo se cambian en Odoo → 400. El
  usuario también, si es el de Odoo (`usuario_de_odoo: true`); si fue generado, se puede cambiar.

### GET /odoo/empleados  ·  POST /tecnicos/importar-odoo
Empleados activos de Odoo para elegir a quién importar, e importación de los elegidos.
```
GET /odoo/empleados
← { "empleados": [ { "odoo_id": 71, "nombre": "DAVID HUAJLLIRE LAIME", "cargo": "Instalador Mecánico",
                     "departamento": "MANTENIMIENTO", "empresa": "JALMECO LTDA",
                     "usuario_odoo": null,          // login de Odoo, si tiene
                     "tecnico_id": null }, … ] }    // ya importado → id en Jalmeco GPS
POST /tecnicos/importar-odoo  → { "odoo_ids": [71, 73] }      (1–300)
← { "importados": 2, "actualizados": 0, "vinculados": 0, "nombres": ["DAVID HUAJLLIRE LAIME", …] }
```
- Nombre completo (nombres + apellidos), cargo y usuario de Odoo; sin usuario en Odoo →
  `nombre.apellido` (sin repetir). Quedan "Sin PIN".
- `vinculados`: ya estaban cargados a mano con el mismo nombre; se enlazan en vez de duplicarse.
- Después trae sus asistencias recientes: quien ya marcó entrada aparece en jornada.
- Si Odoo falla → 502 `ODOO_ERROR` con el motivo.

### POST /tecnicos/{id}/pin
Genera o reinicia el PIN (se muestra una sola vez). Guarda `pin_generado_en`.
```
← { "pin": "292317", "generado_en": "…" }
```
- En la lista/detalle: `tiene_pin` (false = "Sin PIN") y `pin_generado_en`.
- PIN al azar sin patrones fáciles (111111, 123456…). Al reiniciarlo, las sesiones abiertas con el
  PIN anterior dejan de valer: la app recibe 401 `SESION_REVOCADA` y vuelve al login.

### GET /tecnicos/{id}/recorrido?fecha=YYYY-MM-DD
El recorrido de un día (por defecto hoy, hora de La Paz) — mapa, línea de tiempo y reproducción.
```
← {
    "fecha": "2026-11-11",
    "jornadas": [ { "id": 6, "inicio": "…", "fin": "…" | null, "estado": "cerrada",
                    "cierre_automatico": false }, … ],   // true = no marcó salida
    "resumen": { "en_jornada_min": 482, "en_paradas_min": 95, "paradas": 2, "distancia_km": 14.8,
                 "puntos": 412 },
    "puntos":  [ { "lat": …, "lng": …, "hora": "…", "velocidad": 28.4, "bateria": 81 }, … ],
    "paradas": [ { "lat": …, "lng": …, "inicio": "…", "fin": "…", "duracion_min": 14 }, … ],
    "pausas":  [ { "nombre": "Almuerzo", "inicio": "…12:00…", "fin": "…13:00…" } ]
  }
```
- `jornadas` es una lista: puede marcar entrada y salida más de una vez en el día.
- Las paradas se calculan al consultar: puntos seguidos a ≤ 100 m durante ≥ 5 min.
- Se descartan lecturas falsas del GPS (precisión peor que 100 m, "picos" que se alejan y
  vuelven, saltos de más de 180 km/h, duplicados). Un hueco de más de 20 min sin puntos corta el
  trayecto: no se dibuja ni se suma distancia a través de él (p. ej. el almuerzo).
- La distancia no cuenta el "temblor" del GPS dentro de las paradas.
- `en_jornada_min` descuenta las pausas. Dirección de las paradas y "en sucursal": Fase 2.

### GET /tecnicos/{id}/historial
Lista de jornadas pasadas con resumen (fecha, horas en campo, distancia…).

### GET /tecnicos/{id}/verificaciones?fecha=YYYY-MM-DD
Verificaciones de huella del día.
```
← { "realizadas": 1, "total": 2, "items": [
     { "solicitada_en": "…11:30…", "respondida_en": "…11:31…", "resultado": "exito",
       "lat": -16.54, "lng": -68.07 }, … ] }
```

### GET /alertas
Bandeja de alertas con filtros (por defecto, los últimos 7 días; máx. 500).
```
GET /alertas?estado=nueva&tipo=sin_conexion&tecnico=12&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
← { "desde": "2026-11-05", "hasta": "2026-11-11", "limitado": false,
    "conteo": { "todas": 23, "nuevas": 10, "atendidas": 13 },   // sin aplicar `estado` (pestañas)
    "alertas": [
     { "id": 5, "tecnico": { "id": 12, "nombre": "…", "codigo": "JAL-1047", "cargo": "…",
                             "celular_numero": "+591 …", "en_jornada": true },
       "tipo": "sin_conexion", "mensaje": "Sin datos del celular desde las 16:15.",
       "nivel": "advertencia", "creada_en": "…", "estado": "nueva",
       "atendida_por": null, "atendida_en": null }, … ] }
```
- Sin ubicación del técnico (el botón 📍 abre `/mapa?tecnico=12` si `en_jornada`).

Tipos: `sin_conexion`, `bateria_baja`, `verificacion_no_realizada`, `cambio_equipo`,
`seguimiento_detenido`, `salida_no_marcada`. `sin_conexion`, `bateria_baja` y `salida_no_marcada`
las crea el worker (sin conexión: una por cada corte, sin contar el almuerzo; batería baja: una por
jornada; salida no marcada: al cerrar sola una jornada abierta pasado el fin del horario + 2 h). En el MVP el aviso al admin es por **correo** (SMS/WhatsApp: Fase 2).

### POST /alertas/correo-prueba
Envía un correo de prueba a quienes reciben las alertas (máx. 5 por hora).
```
← { "ok": true, "destinatarios": ["carla@jalmeco.com.bo"] }
← { "ok": false, "mensaje": "Falta configurar EMAIL_* en backend/.env." | "No se pudo enviar: …" }
```

### GET /alertas/resumen
Para la campana y el menú (el panel lo consulta cada 30 s): todas las nuevas, de cualquier fecha.
```
← { "nuevas": 8, "criticas": 2, "ultimas": [ Alerta, … ] }   // las 5 más recientes
```

### POST /alertas/{id}/atender  ·  POST /alertas/atender-todas
Marca una como atendida (← la alerta) o varias: `{ "ids": [1, 2] }`; sin `ids`, todas las nuevas
(← `{ "atendidas": 2 }`). Guarda quién y cuándo.

### GET /config  ·  PUT /config
Configuración del sistema (pantalla Configuración). `PUT` acepta solo los campos que cambian.
```
← { "horario_inicio": "08:00", "horario_fin": "18:00",
    "almuerzo": { "inicio": "12:00", "fin": "13:00" },   // franja de pausa "Almuerzo"
    "verificaciones_por_dia": 2,      // 1–4
    "verificacion_limite_min": 3,     // 1–15
    "gps_distancia_m": 25,            // 5–500
    "gps_intervalo_seg": 120,         // 30–900
    "sin_conexion_min": 30,           // 3–120
    "bateria_baja_pct": 15,           // 5–50
    "alertas_correos": "a@x.com, b@x.com",   // vacío = administradores activos
    "alertas_destinatarios": ["a@x.com", "b@x.com"],   // solo lectura: a quién llegan hoy
    "correo_activo": false,           // solo lectura: hay SMTP en backend/.env
    "retencion_meses": 12,            // 1–36
    "odoo_sync_min": 2,               // 1 o 2
    "espejo_odoo_min": 8 }            // 5–60
```
- El horario debe terminar después de empezar y el almuerzo quedar dentro de él. El almuerzo no
  se puede quitar (privacidad). Los correos se aceptan separados por coma, punto y coma o líneas
  y se guardan normalizados (máx. 10).

### GET /odoo/estado  ·  POST /odoo/probar
Estado de la integración (nunca devuelve la clave API) y prueba de conexión (solo lectura).
```
← { "url": "https://jalmeco.odoo.com", "db": "…", "usuario": null,
    "faltan": ["ODOO_USUARIO", "ODOO_API_KEY"],   // variables vacías en backend/.env
    "ultima_sync_ok": "…16:31…",
    "historial": [
      { "id": 1, "fecha": "…16:30…", "tipo": "asistencia", "resultado": "ok", "registros": 2, "mensaje": null },
      { "id": 2, "fecha": "…15:45…", "tipo": "asistencia", "resultado": "error", "registros": 0,
        "mensaje": "Tiempo de espera agotado" } ] }     // las últimas 20

POST /odoo/probar  ← { "ok": true, "version": "17.0+e", "mensaje": "Conectado como …" }
                   ← { "ok": false, "mensaje": "Usuario o clave API incorrectos…" }
```

### POST /odoo/sincronizar
Trae ya la asistencia y los datos del personal importado (sin esperar al worker).
```
← { "ok": true, "jornadas": 3, "empleados": 0 }      // cuántas cambiaron
← { "ok": false, "mensaje": "…" }
```
- Si Odoo se cae, el historial guarda el error una vez por hora (no una fila por minuto).
- El historial solo guarda corridas **con registros** o **con error**; las vacías solo pisan
  `ultima_sync_ok`. La sincronización manual llegará con la sincronización del worker.

### GET /mi-cuenta  ·  PUT /mi-cuenta  ·  POST /mi-cuenta/password
```
GET/PUT /mi-cuenta  → { nombre?, email?, password_actual? }   ← { "id": 1, "nombre": "…", "email": "…" }
   (cambiar el email exige password_actual → 400 si falta o no es correcta; máx. 10 intentos por hora)
POST /mi-cuenta/password  → { "actual": "…", "nueva": "…" }   ← { "access": "…", "refresh": "…" }
```
- La nueva contraseña pasa los validadores de Django (8+ caracteres, no común, no solo números,
  no parecida al correo). Máx. 10 intentos por hora.
- Al cambiarla, los tokens emitidos antes dejan de valer (401 `SESION_REVOCADA`) en todos los
  equipos; la respuesta trae tokens nuevos para seguir en el actual.

---

## 5. Notas

- El **mapa en vivo** usa los campos `ultima_*` del técnico (rápido); el **recorrido** lee las
  `ubicacion` de la jornada (más pesado, solo al abrir el detalle).
- El backend **rechaza** puntos fuera de jornada o dentro del almuerzo (por eso `rechazados`).
  Los puntos offline de una jornada ya cerrada se guardan igual si su hora cae dentro de ella.
- Las verificaciones y el espejo a Odoo los dispara el **worker**, no son endpoints del panel.
- El panel refresca el mapa por **sondeo** (`GET /mapa-en-vivo` cada ~10 s).
- Cada endpoint valida el rol: un técnico solo accede a `/mi/*`; el admin a lo demás.
