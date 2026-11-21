# Grabación de llamadas de trabajo (rama `grabacion-llamadas`)

Estado: **prototipo validado en 1 modelo; desarrollo en pausa** hasta probar en los demás celulares de
la flota. No pasa a producción sin la autorización legal de la empresa y el consentimiento firmado
del personal.

## Reglas

- Se graba **solo en jornada** (entrada → salida en Odoo), nunca fuera de jornada ni en el almuerzo.
- Canales: llamadas de teléfono (red móvil) y de WhatsApp / WhatsApp Business.
- Transparencia: aviso visible "Grabando llamada como respaldo" mientras se graba (además del punto
  verde del micrófono de Android, que no se puede ocultar).
- El trabajador **no puede escuchar ni borrar** grabaciones. En el panel, escuchar requiere un permiso
  aparte y cada reproducción/descarga queda registrada (auditoría).
- Retención limitada (propuesta: 90 días) y borrado automático.

## Cómo funciona (prototipo)

Módulo nativo en Kotlin dentro de la misma app Flutter (`mobile/android/.../grabacion/`):

| Archivo | Qué hace |
|---|---|
| `ServicioGrabacion.kt` | Servicio de accesibilidad. Detecta la llamada por el **modo de audio** (`MODE_IN_CALL` = teléfono, `MODE_IN_COMMUNICATION` = internet; WhatsApp se reconoce por la última pantalla abierta). Graba solo si `Ajustes.puedeGrabar()` |
| `Grabador.kt` | `MediaRecorder` AAC mono 64 kbps (~0,5 MB/min) en el almacenamiento privado de la app. Al terminar escribe un `.json` con canal, inicio/fin, duración, fuente, equipo y **SHA-256** |
| `Ajustes.kt` | En jornada / ignorar jornada (solo pruebas) / fuente de audio |
| `CanalGrabacion.kt` | Puente con Flutter (`jalmeco/grabacion`) |
| `Registro.kt` | Bitácora para diagnosticar cada modelo |

Flutter: `lib/grabacion/grabacion_nativa.dart` y la pantalla de pruebas
`lib/pantallas/grabacion_pruebas_pantalla.dart`, que **solo existe en la versión de desarrollo**
(se abre desde el login). La versión de desarrollo se instala aparte como **"Jalmeco GPS (dev)"**
(`applicationIdSuffix = ".dev"`).

Permisos: micrófono, registro de llamadas y el servicio de accesibilidad (en APKs instalados a mano,
Android 13+ pide antes "Permitir ajustes restringidos").

## Resultados por modelo

| Modelo | Android | Fuente | Teléfono (ambas voces) | WhatsApp (ambas voces) | Notas |
|---|---|---|---|---|---|
| Honor 70 (FNE-NX9) | 14 | VOICE_RECOGNITION | Sí, sin altavoz | Sí, sin altavoz | 21/11/2026 |
| Samsung Galaxy A15 | | | | | pendiente |
| Tecno Spark Go 2/3 | | | | | pendiente |
| Motorola Moto G54 | | | | | pendiente |
| Xiaomi Redmi | | | | | pendiente |

Cómo probar un modelo: instalar el APK de desarrollo (`flutter build apk --debug`), en
"Pruebas de grabación" completar los 3 permisos, activar "Grabar aunque no haya jornada", hacer una
llamada normal y una de WhatsApp de 15–20 s sin altavoz (con aviso a la otra persona) y escucharlas.
Si no se oye al otro, probar otra fuente de audio. La bitácora se lee desde la PC con:
`adb shell "run-as com.jalmeco.jalmeco_gps.dev cat files/grabaciones/eventos.log"`.

Pendiente detectado: la grabación de una llamada de teléfono empieza al marcar (incluye el tono de
espera). Recortar o guardar también la duración real del registro de llamadas.

## Versión completa (por hacer)

1. **Subida con confirmación por huella**: el celular calcula SHA-256 → sube por HTTPS → el servidor
   recalcula y compara → guarda (archivo temporal + mover) → verifica que se puede leer → registra en
   PostgreSQL → responde `{id, sha256}` → el celular borra su copia **solo si la huella coincide**.
   Reintentos idempotentes (misma huella + mismo equipo = misma respuesta, sin duplicados).
2. **Backend**: app `llamadas` (modelo `Grabacion`: técnico, equipo, canal, dirección, número, inicio,
   duración, sha256, ubicación del archivo), endpoint `POST /mi/grabaciones`, permiso
   "Puede escuchar grabaciones", registro de accesos, retención.
3. **Panel**: sección "Llamadas" (diseños en Magic Patterns), reproductor y auditoría.
4. **App**: los 3 permisos en "Antes de empezar", la app avisa al módulo cuándo hay jornada
   (`GrabacionNativa.setEnJornada`), estado en la pestaña Estado, aviso si se desactiva la
   accesibilidad (alerta al supervisor).

## Almacenamiento: NAS de la empresa

Volumen estimado: ~50 personas × 1 h de llamadas al día × ~28 MB/h ≈ **1,4 GB por día** (~30–40 GB
por mes). El disco del VPS no alcanza; los audios van al NAS.

Diseño (el NAS **no** se expone a internet):

```
Celular ──HTTPS──▶ API (VPS) ──túnel privado (WireGuard/Tailscale)──▶ NAS
                    │  guarda temporal, verifica SHA-256              (almacenamiento final)
                    └─ el panel escucha a través de la API (con permiso y auditoría)
```

- Los celulares **nunca** hablan con el NAS; solo con la API (que valida usuario, jornada y huella).
- El VPS guarda cada audio **temporalmente**; una tarea del worker lo copia al NAS, verifica la huella
  en el NAS y recién entonces lo borra del VPS (mismo principio que en el celular).
- El NAS se conecta al VPS por un **túnel privado** que inicia el propio NAS (salida), así que no se
  abren puertos en el router de la oficina. El mismo túnel sirve para los respaldos diarios
  (`NAS_DESTINO` en `deploy/backup.sh`).
- Para escuchar una grabación antigua, la API la lee del NAS por el túnel y la entrega al panel; el
  NAS nunca recibe conexiones de internet.
- Si el túnel cae, los audios esperan en el VPS (se avisa si el espacio temporal pasa un límite).

Datos a confirmar del NAS: marca y modelo, si admite Docker/paquetes (Tailscale o WireGuard), espacio
libre, velocidad de subida del internet de la oficina y si tiene respaldo propio (RAID / copia externa).
Alternativa si el NAS no sirve: almacenamiento en la nube compatible con S3 (Backblaze B2, Cloudflare
R2, Wasabi), con el mismo diseño.
