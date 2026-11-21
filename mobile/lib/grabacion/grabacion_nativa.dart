import 'package:flutter/services.dart';

/// Puente con el módulo nativo (Kotlin) de grabación de llamadas: android/.../grabacion/.
/// La grabación ocurre en el servicio de accesibilidad, aunque la app esté cerrada.
class GrabacionNativa {
  static const _canal = MethodChannel('jalmeco/grabacion');

  static Future<EstadoGrabacion> estado() async =>
      EstadoGrabacion.desdeMapa(Map<String, dynamic>.from(await _canal.invokeMethod('estado') as Map));

  /// 'microfono' o 'registro' (registro de llamadas).
  static Future<void> pedirPermiso(String permiso) => _canal.invokeMethod('pedirPermiso', {'permiso': permiso});

  static Future<void> abrirAccesibilidad() => _canal.invokeMethod('abrirAccesibilidad');

  static Future<void> abrirAjustesApp() => _canal.invokeMethod('abrirAjustesApp');

  /// La app avisa al módulo si hay jornada activa (solo entonces se graba).
  static Future<void> setEnJornada(bool enJornada) async {
    try {
      await _canal.invokeMethod('configurar', {'enJornada': enJornada});
    } on MissingPluginException {
      // Pruebas sin Android
    }
  }

  static Future<void> configurar({bool? ignorarJornada, int? fuente}) => _canal.invokeMethod('configurar', {
        if (ignorarJornada != null) 'ignorarJornada': ignorarJornada,
        if (fuente != null) 'fuente': fuente,
      });

  static Future<List<Grabacion>> listar() async {
    final lista = await _canal.invokeMethod('listar') as List;
    return lista.map((m) => Grabacion.desdeMapa(Map<String, dynamic>.from(m as Map))).toList();
  }

  static Future<List<String>> eventos() async => List<String>.from(await _canal.invokeMethod('eventos') as List);

  // ---- Solo prototipo (pantalla de pruebas en modo desarrollo) ----
  static Future<int> reproducir(String ruta) async => await _canal.invokeMethod('reproducir', {'ruta': ruta}) as int;
  static Future<void> detenerReproduccion() => _canal.invokeMethod('detenerReproduccion');
  static Future<void> borrar(String ruta) => _canal.invokeMethod('borrar', {'ruta': ruta});
  static Future<bool> pruebaIniciar() async => await _canal.invokeMethod('pruebaIniciar') as bool;
  static Future<void> pruebaDetener() => _canal.invokeMethod('pruebaDetener');
}

class EstadoGrabacion {
  const EstadoGrabacion({
    required this.microfono,
    required this.registro,
    required this.accesibilidad,
    required this.servicioConectado,
    required this.enJornada,
    required this.ignorarJornada,
    required this.fuente,
    required this.fuentes,
    required this.probando,
  });

  final bool microfono;
  final bool registro;
  final bool accesibilidad;
  final bool servicioConectado;
  final bool enJornada;
  final bool ignorarJornada;
  final int fuente;
  final Map<int, String> fuentes;
  final bool probando;

  bool get listo => microfono && registro && accesibilidad;
  int get pasosListos => [microfono, registro, accesibilidad].where((p) => p).length;

  factory EstadoGrabacion.desdeMapa(Map<String, dynamic> m) => EstadoGrabacion(
        microfono: m['microfono'] == true,
        registro: m['registro'] == true,
        accesibilidad: m['accesibilidad'] == true,
        servicioConectado: m['servicioConectado'] == true,
        enJornada: m['enJornada'] == true,
        ignorarJornada: m['ignorarJornada'] == true,
        fuente: m['fuente'] as int,
        fuentes: {
          for (final f in (m['fuentes'] as List).cast<Map>()) f['id'] as int: f['nombre'] as String,
        },
        probando: m['probando'] == true,
      );
}

class Grabacion {
  const Grabacion({
    required this.ruta,
    required this.archivo,
    required this.canal,
    required this.tamano,
    this.inicio,
    this.duracionS,
    this.fuente,
    this.numero,
    this.direccion,
    this.paquete,
    this.sha256,
    this.incompleta = false,
  });

  final String ruta;
  final String archivo;
  final String canal; // telefono · whatsapp · voip · prueba
  final int tamano;
  final DateTime? inicio;
  final int? duracionS;
  final String? fuente;
  final String? numero;
  final String? direccion;
  final String? paquete;
  final String? sha256;
  final bool incompleta;

  factory Grabacion.desdeMapa(Map<String, dynamic> m) {
    final ruta = m['ruta'] as String;
    return Grabacion(
      ruta: ruta,
      archivo: m['archivo'] as String? ?? ruta.split('/').last,
      canal: m['canal'] as String? ?? '?',
      tamano: (m['tamano'] as num?)?.toInt() ?? 0,
      inicio: m['inicio'] == null ? null : DateTime.fromMillisecondsSinceEpoch((m['inicio'] as num).toInt()),
      duracionS: (m['duracion_s'] as num?)?.toInt(),
      fuente: m['fuente'] as String?,
      numero: m['numero'] as String?,
      direccion: m['direccion'] as String?,
      paquete: m['paquete'] as String?,
      sha256: m['sha256'] as String?,
      incompleta: m['incompleta'] == true,
    );
  }
}
