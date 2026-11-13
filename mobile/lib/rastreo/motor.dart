import 'dart:async';

import '../modelos/estado_jornada.dart';
import '../modelos/punto_gps.dart';
import '../servicios/api.dart';
import 'cola_puntos.dart';
import 'reglas.dart';

/// Acceso al GPS (en el celular: geolocator; en las pruebas: uno falso).
abstract class FuenteGps {
  /// Un punto cada vez que el celular se mueve `distanciaM` metros.
  Stream<PuntoGps> escuchar(int distanciaM);

  /// Un punto ahora (para cuando está quieto). null si no se pudo obtener.
  Future<PuntoGps?> actual();

  /// ¿La ubicación del celular está encendida?
  Future<bool> activado();
}

/// Resumen para la pantalla Estado (viaja del servicio a la interfaz).
class EstadoRastreo {
  const EstadoRastreo({
    required this.modo,
    required this.gpsActivado,
    required this.pendientes,
    this.ultimaCaptura,
    this.ultimoEnvio,
  });

  final ModoRastreo modo;
  final bool gpsActivado;
  final int pendientes; // puntos en la cola, aún sin enviar
  final DateTime? ultimaCaptura;
  final DateTime? ultimoEnvio;

  Map<String, Object?> aMapa() => {
        'tipo': 'estado_rastreo',
        'modo': modo.name,
        'gps': gpsActivado,
        'pendientes': pendientes,
        'captura': ultimaCaptura?.millisecondsSinceEpoch,
        'envio': ultimoEnvio?.millisecondsSinceEpoch,
      };

  static EstadoRastreo? deMapa(Object? datos) {
    if (datos is! Map || datos['tipo'] != 'estado_rastreo') return null;
    DateTime? fecha(Object? ms) => ms is int ? DateTime.fromMillisecondsSinceEpoch(ms) : null;
    return EstadoRastreo(
      modo: ModoRastreo.values.byName(datos['modo'] as String),
      gpsActivado: datos['gps'] as bool,
      pendientes: datos['pendientes'] as int,
      ultimaCaptura: fecha(datos['captura']),
      ultimoEnvio: fecha(datos['envio']),
    );
  }
}

/// Lógica del rastreo, sin depender de Android (se prueba con fakes).
///
/// El servicio llama a [tick] cada 30 s. En cada tick:
///  1. Consulta /mi/estado (cada 1 min en jornada, cada 2 min fuera).
///  2. Decide el modo: fuera / activo / almuerzo (el almuerzo con la hora local: funciona sin señal).
///  3. En modo activo escucha el GPS (un punto cada N metros) y, si está quieto, toma uno cada
///     `intervalo_seg`. Fuera de jornada y en almuerzo el GPS no se usa.
///  4. Envía la cola por lotes; sin señal los puntos esperan en SQLite.
class Motor {
  Motor({
    required this.api,
    required this.cola,
    required this.gps,
    required this.bateria,
    required this.notificar,
    this.alCambiar,
    this.alSesionCerrada,
    this.alVerificacion,
    this.alUbicacionApagada,
    DateTime Function()? reloj,
  }) : _reloj = reloj ?? DateTime.now;

  // En jornada cada 30 s: así el aviso de huella llega a tiempo (hay ~3 min para responder).
  static const consultaEnJornada = Duration(seconds: 30);
  static const consultaFuera = Duration(minutes: 2);
  static const envioCada = Duration(minutes: 1);

  /// Ubicación apagada en jornada: primero se avisa al trabajador (notificación que suena) y,
  /// si sigue apagada pasado este tiempo, recién al supervisor (puede ser un olvido al marcar).
  static const esperaAvisoGps = Duration(minutes: 5);
  static const loteMaximo = 500;
  static const lotesPorEnvio = 5;

  final Api api;
  final ColaPuntos cola;
  final FuenteGps gps;
  final Future<int?> Function() bateria;
  final void Function(String titulo, String texto) notificar;
  final void Function(EstadoRastreo)? alCambiar;
  final void Function()? alSesionCerrada;

  /// Verificación de huella: (id, segundos restantes) al aparecer una nueva; (null, 0) cuando
  /// deja de estar pendiente (respondida o vencida) para quitar el aviso.
  final void Function(int? id, int segundos)? alVerificacion;

  /// true: mostrar al trabajador "Activa tu ubicación"; false: quitar ese aviso.
  final void Function(bool apagada)? alUbicacionApagada;
  final DateTime Function() _reloj;

  EstadoJornada? estado;
  ModoRastreo modo = ModoRastreo.fuera;
  bool gpsActivado = true;
  DateTime? ultimaCaptura;
  DateTime? ultimoEnvio;

  DateTime? _ultimaConsulta;
  DateTime? _ultimoGuardado; // hora GPS del último punto guardado
  int? _verificacionAvisada; // id de la verificación cuyo aviso está en pantalla
  StreamSubscription<PuntoGps>? _suscripcion;
  int? _distanciaSuscrita;
  bool _avisoGpsEnviado = false;
  DateTime? _gpsApagadoDesde; // en jornada; null = encendido (o fuera de jornada)
  bool _enTick = false;
  bool _enviando = false;
  String? _notificacionActual;
  bool _detenido = false;

  /// Un ciclo completo. Nunca lanza excepciones (el servicio no debe caerse).
  Future<void> tick() async {
    if (_enTick || _detenido) return;
    _enTick = true;
    try {
      final ahora = _reloj();
      final cada = modo == ModoRastreo.fuera ? consultaFuera : consultaEnJornada;
      if (_ultimaConsulta == null || ahora.difference(_ultimaConsulta!) >= cada) {
        await consultarEstado();
        if (_detenido) return;
      }
      await _aplicarModo(decidirModo(estado, _reloj()));
      if (modo == ModoRastreo.activo) {
        await _vigilarGps();
      } else {
        _gpsEncendidoOFueraDeJornada(); // fuera de jornada o en el almuerzo la ubicación puede estar apagada
      }
      if (ultimoEnvio == null || _reloj().difference(ultimoEnvio!) >= envioCada) {
        await enviarCola();
      }
      await _publicar();
    } catch (_) {
      // Un error inesperado no debe detener el seguimiento: se reintenta en el próximo tick.
    } finally {
      _enTick = false;
    }
  }

  Future<void> consultarEstado() async {
    try {
      estado = EstadoJornada.fromJson(await api.get('mi/estado') as Map<String, dynamic>);
      _ultimaConsulta = _reloj();
      _revisarVerificacion();
    } on ApiError catch (e) {
      if (e.codigo == 'SESION_EXPIRADA') {
        await detener();
        alSesionCerrada?.call();
        return;
      }
      // Sin señal: se conserva el último estado conocido (los puntos se guardan igual y el
      // backend descarta los que caigan fuera de la jornada).
      _ultimaConsulta = _reloj();
    }
  }

  void _revisarVerificacion() {
    final v = estado?.ultimaVerificacion;
    if (v != null && v.pendiente) {
      if (_verificacionAvisada != v.id) {
        _verificacionAvisada = v.id;
        alVerificacion?.call(v.id, v.segundosRestantes!);
      }
    } else if (_verificacionAvisada != null) {
      _verificacionAvisada = null;
      alVerificacion?.call(null, 0);
    }
  }

  Future<void> _aplicarModo(ModoRastreo nuevo) async {
    modo = nuevo;
    if (nuevo == ModoRastreo.activo) {
      final distancia = estado!.rastreo.distanciaM;
      if (_suscripcion == null || _distanciaSuscrita != distancia) {
        await _suscripcion?.cancel();
        _distanciaSuscrita = distancia;
        _suscripcion = gps.escuchar(distancia).listen(_guardar, onError: (_) {});
      }
    } else {
      await _apagarGps();
    }
    _actualizarNotificacion();
  }

  Future<void> _vigilarGps() async {
    final antes = gpsActivado;
    gpsActivado = await gps.activado();
    if (!antes && gpsActivado) {
      // Al apagar el GPS Android puede cerrar el flujo de posiciones: suscribirse de nuevo.
      await _apagarGps();
      await _aplicarModo(modo);
    }
    if (!gpsActivado) {
      if (_gpsApagadoDesde == null) {
        _gpsApagadoDesde = _reloj();
        alUbicacionApagada?.call(true); // primero, al trabajador
      }
      if (!_avisoGpsEnviado && _reloj().difference(_gpsApagadoDesde!) >= esperaAvisoGps) {
        _avisoGpsEnviado = true;
        try {
          await api.post('mi/seguimiento-detenido', {'motivo': 'gps_apagado'}); // ahora, al supervisor
        } on ApiError catch (_) {
          _avisoGpsEnviado = false; // sin señal: se reintenta en el próximo tick
        }
      }
      _actualizarNotificacion();
      return;
    }
    _gpsEncendidoOFueraDeJornada();
    _actualizarNotificacion();

    // Quieto: el stream por distancia no entrega nada → un punto cada intervalo_seg.
    final intervalo = Duration(seconds: estado!.rastreo.intervaloSeg);
    if (ultimaCaptura == null || _reloj().difference(ultimaCaptura!) >= intervalo) {
      final p = await gps.actual();
      if (p != null) await _guardar(p);
    }
  }

  Future<void> _guardar(PuntoGps punto) async {
    // Doble control: solo en modo activo y nunca dentro de la franja de pausa.
    if (modo != ModoRastreo.activo || _detenido) return;
    if (enFranja(punto.registradoEn, estado?.almuerzoInicio, estado?.almuerzoFin)) return;
    // El GPS puede entregar la misma lectura por el flujo y por "actual()": solo puntos nuevos.
    if (_ultimoGuardado != null && !punto.registradoEn.isAfter(_ultimoGuardado!)) return;
    _ultimoGuardado = punto.registradoEn;
    await cola.agregar(punto.conBateria(await bateria()));
    ultimaCaptura = _reloj();
  }

  /// Envía la cola en lotes. Devuelve cuántos puntos se enviaron.
  Future<int> enviarCola() async {
    if (_enviando) return 0;
    _enviando = true;
    var enviados = 0;
    try {
      for (var i = 0; i < lotesPorEnvio; i++) {
        final lote = await cola.tomar(loteMaximo);
        if (lote.isEmpty) break;
        try {
          await api.post('mi/ubicaciones', {'puntos': [for (final p in lote) p.aJsonApi()]});
        } on ApiError catch (e) {
          if (e.sinConexion || e.status == 401 || (e.status ?? 0) >= 500) break; // reintentar luego
          // 4xx de datos: el lote nunca será aceptado; se descarta para no bloquear la cola.
        }
        await cola.borrar([for (final p in lote) p.id!]);
        enviados += lote.length;
        ultimoEnvio = _reloj();
        if (lote.length < loteMaximo) break;
      }
    } finally {
      _enviando = false;
    }
    return enviados;
  }

  void _gpsEncendidoOFueraDeJornada() {
    _avisoGpsEnviado = false;
    if (_gpsApagadoDesde != null) {
      _gpsApagadoDesde = null;
      alUbicacionApagada?.call(false);
    }
  }

  void _actualizarNotificacion() {
    final (titulo, texto) = switch (modo) {
      ModoRastreo.activo when !gpsActivado => (
          'Jalmeco GPS · Ubicación desactivada',
          'Activa la ubicación del celular para continuar tu jornada.'
        ),
      ModoRastreo.activo => ('Jalmeco GPS · Jornada activa', 'Tu ubicación se comparte solo en horario de trabajo.'),
      ModoRastreo.almuerzo => (
          'Jalmeco GPS · Pausa de almuerzo',
          'No se registra tu ubicación hasta las ${estado?.almuerzoFin ?? 'el fin del almuerzo'}.'
        ),
      ModoRastreo.fuera => (
          'Jalmeco GPS · Fuera de jornada',
          'No se registra tu ubicación. Se activará al registrar tu ingreso.'
        ),
    };
    final clave = '$titulo|$texto';
    if (clave == _notificacionActual) return; // no tocar la notificación si no cambió
    _notificacionActual = clave;
    notificar(titulo, texto);
  }

  Future<void> _publicar() async {
    alCambiar?.call(EstadoRastreo(
      modo: modo,
      gpsActivado: gpsActivado,
      pendientes: await cola.contar(),
      ultimaCaptura: ultimaCaptura,
      ultimoEnvio: ultimoEnvio,
    ));
  }

  /// Para que la interfaz pida el estado al abrir la pantalla Estado.
  Future<void> publicar() => _publicar();

  Future<void> _apagarGps() async {
    await _suscripcion?.cancel();
    _suscripcion = null;
    _distanciaSuscrita = null;
  }

  Future<void> detener() async {
    _detenido = true;
    await _apagarGps();
  }
}
