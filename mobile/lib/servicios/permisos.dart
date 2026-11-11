import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

/// Ubicación en Android 10+: primero "mientras se usa la app" y luego, en Ajustes,
/// "Permitir todo el tiempo" (Android 11+ ya no ofrece esa opción en la ventana del permiso).
enum EstadoUbicacion { pendiente, soloEnUso, siempre, bloqueado }

@immutable
class EstadoPermisos {
  const EstadoPermisos({
    required this.ubicacion,
    required this.notificaciones,
    required this.notificacionesBloqueadas,
    required this.bateria,
  });

  final EstadoUbicacion ubicacion;
  final bool notificaciones;
  final bool notificacionesBloqueadas; // el usuario eligió "No volver a preguntar"
  final bool bateria; // la app está fuera del ahorro de batería (recomendado, no obligatorio)

  /// Lo mínimo para trabajar: ubicación "todo el tiempo" + notificaciones.
  bool get listos => ubicacion == EstadoUbicacion.siempre && notificaciones;
}

/// Acceso a los permisos de Android (se reemplaza por uno falso en las pruebas).
abstract class FuentePermisos {
  Future<EstadoPermisos> leer();
  Future<void> pedirUbicacion();
  Future<void> pedirUbicacionSiempre();
  Future<void> pedirNotificaciones();
  Future<void> pedirBateria();
  Future<void> abrirAjustes();
  Future<String> fabricante();
}

class FuentePermisosAndroid implements FuentePermisos {
  @override
  Future<EstadoPermisos> leer() async {
    final enUso = await Permission.location.status;
    final siempre = await Permission.locationAlways.status;
    final notif = await Permission.notification.status;
    final bateria = await Permission.ignoreBatteryOptimizations.status;

    final EstadoUbicacion ubicacion;
    if (siempre.isGranted) {
      ubicacion = EstadoUbicacion.siempre;
    } else if (enUso.isGranted) {
      ubicacion = EstadoUbicacion.soloEnUso;
    } else if (enUso.isPermanentlyDenied) {
      ubicacion = EstadoUbicacion.bloqueado;
    } else {
      ubicacion = EstadoUbicacion.pendiente;
    }

    return EstadoPermisos(
      ubicacion: ubicacion,
      notificaciones: notif.isGranted,
      notificacionesBloqueadas: notif.isPermanentlyDenied,
      bateria: bateria.isGranted,
    );
  }

  @override
  Future<void> pedirUbicacion() => _pedirOAjustes(Permission.location);

  /// En Android 11+ esto abre directamente la página de Ajustes del permiso.
  @override
  Future<void> pedirUbicacionSiempre() => _pedirOAjustes(Permission.locationAlways);

  @override
  Future<void> pedirNotificaciones() => _pedirOAjustes(Permission.notification);

  @override
  Future<void> pedirBateria() => Permission.ignoreBatteryOptimizations.request();

  @override
  Future<void> abrirAjustes() => openAppSettings();

  @override
  Future<String> fabricante() async {
    try {
      return (await DeviceInfoPlugin().androidInfo).manufacturer.toLowerCase();
    } catch (_) {
      return '';
    }
  }

  /// Si el usuario ya marcó "No volver a preguntar", Android no muestra la ventana: solo queda
  /// llevarlo a los Ajustes de la app.
  Future<void> _pedirOAjustes(Permission permiso) async {
    final estado = await permiso.request();
    if (estado.isPermanentlyDenied) await openAppSettings();
  }
}

/// Estado de los permisos para la interfaz. Se vuelve a revisar cada vez que la app vuelve
/// al frente (el usuario pudo cambiar algo en Ajustes).
class Permisos extends ChangeNotifier {
  Permisos(this._fuente);

  final FuentePermisos _fuente;

  EstadoPermisos? estado; // null hasta la primera lectura
  String fabricante = '';
  bool _aceptados = false;
  bool _revisando = false;

  /// Se llama si la ubicación "todo el tiempo" estaba concedida y se perdió (el técnico la
  /// quitó en Ajustes). La app lo usa para avisar al supervisor.
  VoidCallback? alPerderUbicacion;

  /// Mostrar la pantalla de permisos: falta alguno, o aún no tocó "Continuar".
  bool get mostrarPantalla => estado != null && (!estado!.listos || !_aceptados);

  /// Celulares que, además del ajuste estándar, tienen su propio "gestor de inicio" de apps.
  bool get fabricanteAgresivo =>
      const ['huawei', 'honor', 'xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'oneplus']
          .any(fabricante.contains);

  Future<void> revisar() async {
    if (_revisando) return;
    _revisando = true;
    try {
      if (fabricante.isEmpty) fabricante = await _fuente.fabricante();
      final anterior = estado;
      final nuevo = await _fuente.leer();
      estado = nuevo;

      if (anterior == null) {
        // Al abrir la app con todo concedido no se muestra la pantalla.
        _aceptados = nuevo.listos;
      } else if (anterior.ubicacion == EstadoUbicacion.siempre && nuevo.ubicacion != EstadoUbicacion.siempre) {
        _aceptados = false;
        alPerderUbicacion?.call();
      } else if (!nuevo.listos) {
        _aceptados = false;
      }
      notifyListeners();
    } finally {
      _revisando = false;
    }
  }

  void aceptar() {
    if (estado?.listos != true) return;
    _aceptados = true;
    notifyListeners();
  }

  Future<void> pedirUbicacion() => _yRevisar(_fuente.pedirUbicacion);
  Future<void> pedirUbicacionSiempre() => _yRevisar(_fuente.pedirUbicacionSiempre);
  Future<void> pedirNotificaciones() => _yRevisar(_fuente.pedirNotificaciones);
  Future<void> pedirBateria() => _yRevisar(_fuente.pedirBateria);
  Future<void> abrirAjustes() => _fuente.abrirAjustes();

  Future<void> _yRevisar(Future<void> Function() accion) async {
    await accion();
    await revisar();
  }
}
