import 'package:flutter/foundation.dart';

/// Configuración de la app.
///
/// La URL de la API queda dentro del APK al compilar:
/// - `flutter build apk --release` → el servidor de producción (sin pasar nada).
/// - En desarrollo (debug) → el backend local; con un celular real, pasar la IP de la PC:
///     flutter run --dart-define=API_URL=http://192.168.1.50:8000/api/v1
/// `--dart-define=API_URL=…` siempre gana (sirve para apuntar a otro servidor).
class Config {
  static const _produccion = 'https://apigps.jalmeco.pro/api/v1';
  static const _desarrollo = 'http://10.0.2.2:8000/api/v1'; // 10.0.2.2 = la PC vista desde el emulador

  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: kReleaseMode ? _produccion : _desarrollo,
  );

  /// Tiempo máximo de espera de cada petición.
  static const timeout = Duration(seconds: 15);
}
