# Jalmeco GPS — app del trabajador (Flutter, Android)

Rastreo GPS de la jornada. Habla **solo con la API del backend** (`/api/v1`), nunca con Odoo.
Contrato: [`docs/contrato-api.md`](../docs/contrato-api.md).

## Estructura

```
lib/
├── main.dart              arranque: carga la sesión y elige Login o Inicio
├── config.dart            URL de la API (--dart-define=API_URL=...)
├── tema.dart              colores del logo (marino #1C1C62, petróleo #0185B6)
├── servicios/
│   ├── api.dart           cliente HTTP: token, renovación automática, errores
│   ├── sesion.dart        tokens + datos del técnico (almacén cifrado)
│   └── dispositivo.dart   equipo detectado → PUT /mi/dispositivo
├── pantallas/             Login, Inicio (provisional)…
└── widgets/               marca (logo), teclado de PIN
assets/logo/               logo recortado (se incluye en la app)
assets/icono/              fuente del ícono (no se incluye; ver abajo)
```

## Correr en desarrollo

Requisitos: Flutter 3.32, Android SDK, backend levantado (`docker compose up` en la raíz).

**Emulador** (la PC se ve como `10.0.2.2`, es el valor por defecto):

```
flutter run
```

**Celular real** por USB (depuración USB activada), en el mismo wifi que la PC:

```
ipconfig                                   # IPv4 de la PC, p. ej. 192.168.1.50
flutter run --dart-define=API_URL=http://192.168.1.50:8000/api/v1
```

Si el celular no llega al backend: permitir el puerto 8000 en el Firewall de Windows.

Datos de prueba: crear técnico con `python manage.py crear_tecnico` (ver backend). El login
acepta el usuario o el código JAL-XXXX.

## Rastreo (lib/rastreo/)

- `motor.dart`: la lógica (modo fuera / activo / almuerzo, captura, envío de la cola). Sin
  Android, se prueba en `test/motor_test.dart`.
- `servicio.dart`: servicio en primer plano (flutter_foreground_task) + GPS real (geolocator).
- `cola_puntos.dart`: cola SQLite; sin señal los puntos esperan aquí.

Probar una jornada: `docker compose exec backend python manage.py abrir_jornada 1` (y
`cerrar_jornada 1`). Ver los puntos que llegaron:

```
docker compose exec db psql -U jalmeco -d jalmeco -c "SELECT id, ST_Y(punto::geometry) lat, ST_X(punto::geometry) lng, velocidad, bateria, registrado_en FROM ubicacion ORDER BY id DESC LIMIT 10;"
```

## Pruebas

```
flutter analyze
flutter test
```

## Notas

- Android mínimo: 8.0 (API 26).
- HTTP sin cifrar solo está permitido en la versión de depuración
  (`android/app/src/debug/AndroidManifest.xml`); producción usa https.
- Ícono: después de cambiar el logo, `dart run flutter_launcher_icons`.
- Versiones de dependencias fijas (sin `^`).
