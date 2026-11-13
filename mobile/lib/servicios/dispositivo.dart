import 'package:android_id/android_id.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';

import 'api.dart';

/// Equipo detectado: Android ID (estable para esta app en este celular; cambia con un
/// restablecimiento de fábrica) + marca/modelo, p. ej. "samsung SM-A155F".
/// El backend genera la alerta `cambio_equipo` si llega un equipo distinto al registrado.
Future<void> reportarEquipo(Api api) async {
  try {
    final id = await const AndroidId().getId();
    if (id == null || id.isEmpty) return;
    final info = await DeviceInfoPlugin().androidInfo;
    await api.put('mi/dispositivo', {
      'equipo_id': id,
      'equipo_modelo': '${info.manufacturer} ${info.model}'.trim(),
    });
  } catch (e) {
    // No bloquea el uso de la app: se vuelve a intentar la próxima vez que se abra.
    debugPrint('No se pudo reportar el equipo: $e');
  }
}
