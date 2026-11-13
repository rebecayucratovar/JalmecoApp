import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Notificación de ALTA prioridad "Confirma tu identidad": suena y aparece sobre cualquier app,
/// aunque el celular esté bloqueado. Al tocarla se abre la app, que muestra la verificación.
class AvisoVerificacion {
  static const _id = 7001;
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _listo = false;

  static Future<void> _iniciar() async {
    if (_listo) return;
    await _plugin.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    );
    _listo = true;
  }

  static Future<void> mostrar(int segundosRestantes) async {
    try {
      await _iniciar();
      final minutos = (segundosRestantes / 60).ceil();
      await _plugin.show(
        id: _id,
        title: 'Confirma tu identidad',
        body: 'Toca para verificar con tu huella. Tienes $minutos min.',
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            'verificacion',
            'Verificación de identidad',
            channelDescription: 'Aviso para confirmar tu identidad con la huella durante la jornada.',
            importance: Importance.max,
            priority: Priority.high,
            category: AndroidNotificationCategory.reminder,
            // Desaparece sola cuando vence el plazo
            timeoutAfter: segundosRestantes * 1000,
          ),
        ),
      );
    } catch (e) {
      debugPrint('No se pudo mostrar el aviso de verificación: $e');
    }
  }

  static Future<void> quitar() async {
    try {
      await _iniciar();
      await _plugin.cancel(id: _id);
    } catch (_) {}
  }
}

/// Notificación de ALTA prioridad "Activa tu ubicación": suena una vez y queda fija mientras la
/// ubicación esté apagada en jornada. Si no la activa en unos minutos, se avisa al supervisor.
class AvisoUbicacion {
  static const _id = 7002;

  static Future<void> mostrar() async {
    try {
      await AvisoVerificacion._iniciar();
      await AvisoVerificacion._plugin.show(
        id: _id,
        title: 'Activa tu ubicación',
        body: 'Tu jornada empezó y la ubicación del celular está apagada. Actívala para no generar '
            'un aviso a tu supervisor.',
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            'ubicacion',
            'Ubicación apagada',
            channelDescription: 'Aviso cuando la ubicación está apagada durante la jornada.',
            importance: Importance.max,
            priority: Priority.high,
            category: AndroidNotificationCategory.reminder,
            ongoing: true, // no se puede descartar: se quita sola al activar la ubicación
            onlyAlertOnce: true,
          ),
        ),
      );
    } catch (e) {
      debugPrint('No se pudo mostrar el aviso de ubicación: $e');
    }
  }

  static Future<void> quitar() async {
    try {
      await AvisoVerificacion._iniciar();
      await AvisoVerificacion._plugin.cancel(id: _id);
    } catch (_) {}
  }
}
