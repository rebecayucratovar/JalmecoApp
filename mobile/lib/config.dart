/// Configuración de la app.
///
/// La URL de la API se pasa al compilar/ejecutar, por ejemplo:
///   flutter run --dart-define=API_URL=http://192.168.1.50:8000/api/v1
/// Por defecto apunta al backend local visto desde el emulador de Android (10.0.2.2 = la PC).
class Config {
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:8000/api/v1',
  );

  /// Tiempo máximo de espera de cada petición.
  static const timeout = Duration(seconds: 15);
}
