import 'dart:async';

import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';

import '../modelos/punto_gps.dart';
import '../servicios/api.dart';
import '../servicios/aviso_verificacion.dart';
import '../servicios/sesion.dart';
import 'cola_puntos.dart';
import 'motor.dart';

// =====================================================================================
//  Lado de la INTERFAZ: configurar, encender y apagar el servicio.
// =====================================================================================

class ServicioRastreo {
  static const _idServicio = 4710;

  /// Una vez al arrancar la app (antes de runApp).
  static void configurar() {
    FlutterForegroundTask.initCommunicationPort();
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'seguimiento',
        channelName: 'Seguimiento de jornada',
        channelDescription: 'Aviso permanente mientras la app puede registrar tu ubicación.',
        // Baja prioridad: sin sonido ni vibración, no interrumpe.
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
        onlyAlertOnce: true,
      ),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(30000), // tick cada 30 s
        autoRunOnBoot: true, // al reiniciar el celular vuelve solo
        autoRunOnMyPackageReplaced: true, // y al actualizar la app
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  /// Enciende el servicio si no está corriendo (con sesión y permisos listos).
  static Future<void> asegurar() async {
    if (await FlutterForegroundTask.isRunningService) return;
    final r = await FlutterForegroundTask.startService(
      serviceId: _idServicio,
      serviceTypes: [ForegroundServiceTypes.location],
      notificationTitle: 'Jalmeco GPS',
      notificationText: 'Revisando tu jornada…',
      callback: iniciarServicioRastreo,
    );
    if (r is ServiceRequestFailure) debugPrint('No se pudo iniciar el seguimiento: ${r.error}');
  }

  static Future<void> detener() async {
    if (await FlutterForegroundTask.isRunningService) await FlutterForegroundTask.stopService();
  }

  /// Pide al servicio que envíe ya la cola ("Sincronizar ahora").
  static void enviarAhora() => FlutterForegroundTask.sendDataToTask('enviar');

  /// Pide al servicio su estado actual (al abrir la pantalla Estado).
  static void pedirEstado() => FlutterForegroundTask.sendDataToTask('estado');
}

// =====================================================================================
//  Lado del SERVICIO: corre en un isolate aparte, aunque la app esté cerrada.
// =====================================================================================

@pragma('vm:entry-point')
void iniciarServicioRastreo() {
  FlutterForegroundTask.setTaskHandler(_ManejadorRastreo());
}

class _ManejadorRastreo extends TaskHandler {
  Motor? _motor;
  ColaSqlite? _cola;

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    final sesion = Sesion();
    await sesion.cargar();
    if (!sesion.activa) {
      // P. ej. arrancó al reiniciar el celular pero ya no hay sesión.
      await FlutterForegroundTask.stopService();
      return;
    }
    _cola = await ColaSqlite.abrir();
    final bateria = Battery();
    _motor = Motor(
      api: Api(sesion),
      cola: _cola!,
      gps: GpsGeolocator(),
      bateria: () async {
        try {
          return await bateria.batteryLevel;
        } catch (_) {
          return null;
        }
      },
      notificar: (titulo, texto) =>
          FlutterForegroundTask.updateService(notificationTitle: titulo, notificationText: texto),
      alCambiar: (e) => FlutterForegroundTask.sendDataToMain(e.aMapa()),
      alSesionCerrada: () => FlutterForegroundTask.stopService(),
      alVerificacion: (id, segundos) =>
          id == null ? AvisoVerificacion.quitar() : AvisoVerificacion.mostrar(segundos),
    );
    await _motor!.tick();
  }

  @override
  void onRepeatEvent(DateTime timestamp) => _motor?.tick();

  @override
  void onReceiveData(Object data) {
    final motor = _motor;
    if (motor == null) return;
    if (data == 'enviar') {
      motor.enviarCola().then((_) => motor.publicar());
    } else if (data == 'estado') {
      motor.publicar();
    }
  }

  @override
  void onNotificationPressed() => FlutterForegroundTask.launchApp();

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    await _motor?.detener();
    await _cola?.cerrar();
  }
}

/// GPS real con geolocator.
class GpsGeolocator implements FuenteGps {
  static PuntoGps _aPunto(Position p) => PuntoGps(
        lat: p.latitude,
        lng: p.longitude,
        precisionM: p.accuracy,
        // El GPS da m/s; el backend espera km/h. Negativo = sin dato.
        velocidadKmh: p.speed >= 0 ? p.speed * 3.6 : null,
        registradoEn: p.timestamp.toUtc(),
      );

  @override
  Stream<PuntoGps> escuchar(int distanciaM) => Geolocator.getPositionStream(
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: distanciaM,
          intervalDuration: const Duration(seconds: 10),
        ),
      ).map(_aPunto);

  @override
  Future<PuntoGps?> actual() async {
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 20),
        ),
      );
      return _aPunto(p);
    } catch (_) {
      return null; // sin fix (bajo techo, en un ascensor…): se reintenta en el próximo tick
    }
  }

  @override
  Future<bool> activado() => Geolocator.isLocationServiceEnabled();
}
