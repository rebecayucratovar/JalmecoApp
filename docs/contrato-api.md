# Contrato de la API — Jalmeco Campo

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

### POST /auth/refresh
```
→ { "refresh": "jwt…" }   ← { "access": "jwt…" }
```

---

## 2. Objetos reutilizados

**TecnicoResumen** (para mapa, lista y fichas):
```
{
  "id": 12, "codigo": "JAL-1047", "nombre": "Marco Antonio Condori",
  "cargo": "Supervisor de campo", "foto_url": "…",
  "estado_actual": "en_trayecto",      // fuera_jornada | en_trayecto | en_parada | sin_conexion
  "ultima_lat": -16.5412, "ultima_lng": -68.0790, "ultima_bateria": 91,
  "ultima_actualizacion": "2026-11-07T11:30:05-04:00",
  "celular_modelo": "Motorola G54", "celular_numero": "+591 720 11873"
}
```

---

## 3. Endpoints de la APP MÓVIL (rol técnico)

### GET /mi/estado
Estado de la jornada actual (para la pantalla Inicio).
```
← {
    "en_jornada": true,
    "jornada": { "inicio": "2026-11-07T08:02:00-04:00", "horario": "08:00–17:00" },
    "en_pausa_almuerzo": false,
    "franja_almuerzo": { "inicio": "12:00", "fin": "13:00" },
    "resumen_hoy": { "tiempo_jornada_min": 263, "distancia_km": 37.4 }
  }
```

### POST /mi/ubicaciones
Enviar puntos GPS (en lote; soporta los acumulados offline).
```
→ { "puntos": [
     { "lat": -16.5412, "lng": -68.0790, "precision_m": 8.0, "velocidad": 12.5,
       "bateria": 90, "registrado_en": "2026-11-07T11:30:00-04:00" }, … ] }
← { "recibidos": 12, "rechazados": 0 }   // rechazados: fuera de jornada o en almuerzo
```

### PUT /mi/dispositivo
Reportar marca/modelo del celular (autocompletado por la app).
```
→ { "celular_modelo": "Samsung Galaxy A15" }   ← { "ok": true }
```

### GET /mi/verificacion-pendiente
¿Hay una verificación de huella pendiente? (la app también la recibe por notificación).
```
← { "pendiente": true, "verificacion_id": 88, "limite_min": 3 }   // o { "pendiente": false }
```

### POST /mi/verificaciones/{id}/responder
Resultado tras pasar la huella en el celular.
```
→ { "resultado": "exito" }   ← { "ok": true }
```

### GET /mi/perfil
Datos del técnico para la pantalla Perfil (código, cargo, celular, políticas).

---

## 4. Endpoints del PANEL ADMIN (rol administrador)

### GET /mapa-en-vivo
Posiciones actuales de todos los que están en jornada.
```
← { "actualizado_en": "…", "tecnicos": [ TecnicoResumen, … ] }
```

### GET /dashboard
KPIs del inicio.
```
← { "en_jornada": 42, "en_campo": 32, "sin_conexion": 4, "alertas_activas": 8,
    "tiempo_campo_semana": [ { "fecha": "2026-11-02", "horas": 190 }, … ] }
```

### GET /tecnicos  ·  GET /tecnicos/{id}  ·  POST /tecnicos  ·  PUT /tecnicos/{id}
Lista (con estado actual), detalle, alta y edición de técnicos.

### POST /tecnicos/importar-odoo
Importa empleados desde Odoo (nombre, código, cargo).
```
← { "importados": 3, "nombres": ["Kevin Apaza", "Ever Choque", "Marcelo Flores"] }
```

### POST /tecnicos/{id}/pin
Genera o reinicia el PIN (se muestra una sola vez).
```
← { "pin": "292317" }
```

### GET /tecnicos/{id}/recorrido?fecha=YYYY-MM-DD
El recorrido del día (puntos + paradas + resumen) — para el mapa y la línea de tiempo.
```
← {
    "jornada": { "inicio": "…08:02…", "fin": "…16:42…", "estado": "cerrada" },
    "resumen": { "en_campo_min": 482, "en_sucursal_min": 38, "paradas": 2, "distancia_km": 14.8 },
    "puntos":  [ { "lat": …, "lng": …, "hora": "…" }, … ],
    "paradas": [ { "lat": …, "lng": …, "inicio": "…", "fin": "…", "duracion_min": 14,
                   "direccion": "Calle Rosendo Gutiérrez" }, … ],
    "pausas":  [ { "nombre": "Almuerzo", "inicio": "…12:00…", "fin": "…13:00…" } ]
  }
```

### GET /tecnicos/{id}/historial
Lista de jornadas pasadas con resumen (fecha, horas en campo, distancia…).

### GET /tecnicos/{id}/verificaciones?fecha=YYYY-MM-DD
Verificaciones de huella del día.
```
← { "realizadas": 1, "total": 2, "items": [
     { "solicitada_en": "…11:30…", "respondida_en": "…11:31…", "resultado": "exito" }, … ] }
```

### GET /alertas
Bandeja de alertas con filtros.
```
GET /alertas?estado=nueva&tipo=sin_conexion&desde=…&hasta=…
← { "alertas": [
     { "id": 5, "tecnico": TecnicoResumen, "tipo": "sin_conexion",
       "mensaje": "Sin señal desde hace 15 min · última ubicación Cota Cota",
       "nivel": "advertencia", "creada_en": "…16:30…", "estado": "nueva" }, … ] }
```

### POST /alertas/{id}/atender  ·  POST /alertas/atender-todas
Marca una (o todas) como atendidas.

### GET /config  ·  PUT /config
Configuración: almuerzo, retención (meses), verificación (por día, límite min), Odoo.

### GET /odoo/estado  ·  POST /odoo/sincronizar
Estado de la integración y disparar una sincronización manual.

### GET /mi-cuenta  ·  PUT /mi-cuenta  ·  POST /mi-cuenta/password
Datos del administrador y cambio de contraseña.

---

## 5. Notas

- El **mapa en vivo** usa los campos `ultima_*` del técnico (rápido); el **recorrido** lee las
  `ubicacion` de la jornada (más pesado, solo al abrir el detalle).
- El backend **rechaza** puntos fuera de jornada o dentro del almuerzo (por eso `rechazados`).
- Las verificaciones y el espejo a Odoo los dispara el **worker**, no son endpoints del panel.
- El panel refresca el mapa por **sondeo** (`GET /mapa-en-vivo` cada ~10 s).
- Cada endpoint valida el rol: un técnico solo accede a `/mi/*`; el admin a lo demás.
