import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jalmeco_gps/modelos/punto_gps.dart';
import 'package:jalmeco_gps/rastreo/cola_puntos.dart';
import 'package:jalmeco_gps/rastreo/motor.dart';
import 'package:jalmeco_gps/rastreo/reglas.dart';
import 'package:jalmeco_gps/servicios/api.dart';
import 'package:jalmeco_gps/servicios/sesion.dart';

// ---------- fakes ----------

class ColaMemoria implements ColaPuntos {
  final puntos = <PuntoGps>[];
  int _id = 0;

  @override
  Future<void> agregar(PuntoGps p) async => puntos.add(PuntoGps(
      id: ++_id,
      lat: p.lat,
      lng: p.lng,
      velocidadKmh: p.velocidadKmh,
      bateria: p.bateria,
      registradoEn: p.registradoEn));

  @override
  Future<List<PuntoGps>> tomar(int limite) async => puntos.take(limite).toList();

  @override
  Future<void> borrar(List<int> ids) async => puntos.removeWhere((p) => ids.contains(p.id));

  @override
  Future<int> contar() async => puntos.length;
}

class GpsFalso implements FuenteGps {
  final _ctrl = StreamController<PuntoGps>.broadcast();
  int? distanciaEscuchada;
  bool escuchando = false;
  bool encendido = true;
  int pedidosActual = 0;
  DateTime Function() reloj = DateTime.now;

  int _segundos = 0;

  /// Una lectura nueva del GPS (cada una 1 s después de la anterior, o en la hora `en`).
  void mover(double lat, {DateTime? en}) => _ctrl.add(
      PuntoGps(lat: lat, lng: -68.1, registradoEn: en ?? reloj().add(Duration(seconds: ++_segundos))));

  @override
  Stream<PuntoGps> escuchar(int distanciaM) {
    distanciaEscuchada = distanciaM;
    escuchando = true;
    late StreamController<PuntoGps> salida;
    StreamSubscription<PuntoGps>? sub;
    salida = StreamController<PuntoGps>(
      onListen: () => sub = _ctrl.stream.listen(salida.add),
      onCancel: () {
        escuchando = false;
        return sub?.cancel();
      },
    );
    return salida.stream;
  }

  @override
  Future<PuntoGps?> actual() async {
    pedidosActual++;
    return PuntoGps(lat: -16.5, lng: -68.1, registradoEn: reloj());
  }

  @override
  Future<bool> activado() async => encendido;
}

/// Servidor falso: /mi/estado configurable; registra los lotes y avisos recibidos.
class Servidor {
  bool enJornada = true;
  bool caido = false;
  int estadoUbicaciones = 200;
  bool sesionVencida = false;
  final lotes = <List<dynamic>>[];
  final avisos = <String>[];
  int consultasEstado = 0;
  Map<String, Object?>? verificacion; // ultima_verificacion de /mi/estado

  http.Response _json(Object o, [int s = 200]) =>
      http.Response.bytes(utf8.encode(jsonEncode(o)), s, headers: {'content-type': 'application/json'});

  Future<http.Response> atender(http.Request req) async {
    if (caido) throw http.ClientException('sin señal');
    if (sesionVencida) return _json({'error': 'Token inválido', 'codigo': 'TOKEN_NOT_VALID'}, 401);
    switch (req.url.path) {
      case '/mi/estado':
        consultasEstado++;
        return _json({
          'en_jornada': enJornada,
          'jornada': enJornada ? {'inicio': '2026-11-10T08:00:00-04:00', 'horario': '08:00–18:00'} : null,
          'en_pausa_almuerzo': false,
          'franja_almuerzo': {'inicio': '12:00', 'fin': '13:00'},
          'resumen_hoy': {'tiempo_jornada_min': 0, 'distancia_km': 0},
          'rastreo': {'distancia_m': 25, 'intervalo_seg': 120},
          'ultima_verificacion': verificacion,
        });
      case '/mi/ubicaciones':
        if (estadoUbicaciones != 200) return _json({'error': 'x', 'codigo': 'X'}, estadoUbicaciones);
        final puntos = (jsonDecode(req.body) as Map)['puntos'] as List;
        lotes.add(puntos);
        return _json({'recibidos': puntos.length, 'rechazados': 0});
      case '/mi/seguimiento-detenido':
        avisos.add((jsonDecode(req.body) as Map)['motivo'] as String);
        return _json({'ok': true, 'alerta_creada': true});
      case '/auth/refresh':
        return _json({'error': 'Token inválido'}, 401);
    }
    return _json({'error': 'no existe'}, 404);
  }
}

/// Hora de pared en La Paz (UTC−4) → instante UTC.
DateTime laPaz(int h, [int m = 0]) => DateTime.utc(2026, 11, 10, h + 4, m);

void main() {
  late Servidor servidor;
  late ColaMemoria cola;
  late GpsFalso gps;
  late DateTime ahora;
  late List<String> notificaciones;
  late Motor motor;
  late bool sesionCerrada;
  late List<String> avisosHuella;
  late List<bool> avisosUbicacion;

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    servidor = Servidor();
    cola = ColaMemoria();
    ahora = laPaz(10);
    gps = GpsFalso()..reloj = () => ahora;
    notificaciones = [];
    sesionCerrada = false;
    avisosHuella = [];
    avisosUbicacion = [];
    final sesion = Sesion();
    await sesion.iniciar(access: 'a', refresh: 'r', tecnico: {'nombre': 'Juan'});
    motor = Motor(
      api: Api(sesion, baseUrl: 'http://x', cliente: MockClient(servidor.atender)),
      cola: cola,
      gps: gps,
      bateria: () async => 80,
      notificar: (t, _) => notificaciones.add(t),
      reloj: () => ahora,
      alSesionCerrada: () => sesionCerrada = true,
      alVerificacion: (id, s) => avisosHuella.add(id == null ? 'quitar' : 'mostrar $id ${s}s'),
      alUbicacionApagada: avisosUbicacion.add,
    );
  });

  Future<void> esperar() => Future<void>.delayed(Duration.zero);

  test('fuera de jornada: no usa el GPS y consulta cada 2 min', () async {
    servidor.enJornada = false;
    await motor.tick();
    expect(motor.modo, ModoRastreo.fuera);
    expect(gps.escuchando, isFalse);
    expect(notificaciones.last, 'Jalmeco GPS · Fuera de jornada');

    ahora = ahora.add(const Duration(seconds: 90));
    await motor.tick();
    expect(servidor.consultasEstado, 1); // todavía no toca
    ahora = ahora.add(const Duration(seconds: 30));
    await motor.tick();
    expect(servidor.consultasEstado, 2);
  });

  test('en jornada: escucha cada 25 m, guarda con batería y envía en lotes', () async {
    await motor.tick();
    expect(motor.modo, ModoRastreo.activo);
    expect(gps.distanciaEscuchada, 25);
    expect(notificaciones.last, 'Jalmeco GPS · Jornada activa');
    // el primer tick toma un punto inmediato (aún no había ninguno) y lo envía
    expect(servidor.lotes.single.single['bateria'], 80);

    gps.mover(-16.51);
    gps.mover(-16.52);
    await esperar();
    expect(cola.puntos, hasLength(2));

    ahora = ahora.add(const Duration(minutes: 1));
    await motor.tick();
    expect(servidor.lotes, hasLength(2));
    expect(servidor.lotes.last, hasLength(2));
    expect(cola.puntos, isEmpty);
  });

  test('la misma lectura del GPS no se guarda dos veces', () async {
    servidor.caido = false;
    await motor.tick(); // punto inmediato a las 10:00:00 (ya enviado)
    gps.mover(-16.5, en: ahora); // el flujo entrega la misma lectura (misma hora)
    await esperar();
    expect(cola.puntos, isEmpty);
    gps.mover(-16.51);
    await esperar();
    expect(cola.puntos, hasLength(1));
  });

  test('quieto: un punto cada intervalo_seg (120 s), no antes', () async {
    await motor.tick();
    expect(gps.pedidosActual, 1);
    ahora = ahora.add(const Duration(seconds: 60));
    await motor.tick();
    expect(gps.pedidosActual, 1);
    ahora = ahora.add(const Duration(seconds: 60));
    await motor.tick();
    expect(gps.pedidosActual, 2);
  });

  test('almuerzo: apaga el GPS, no guarda nada y lo retoma a las 13:00', () async {
    await motor.tick();
    expect(gps.escuchando, isTrue);

    ahora = laPaz(12, 0);
    await motor.tick();
    expect(motor.modo, ModoRastreo.almuerzo);
    expect(gps.escuchando, isFalse);
    expect(notificaciones.last, 'Jalmeco GPS · Pausa de almuerzo');
    final antes = cola.puntos.length;
    gps.mover(-16.6);
    await esperar();
    expect(cola.puntos.length, antes);

    ahora = laPaz(13, 0);
    await motor.tick();
    expect(motor.modo, ModoRastreo.activo);
    expect(gps.escuchando, isTrue);
  });

  test('almuerzo sin señal: lo decide con la hora del celular', () async {
    await motor.tick();
    servidor.caido = true;
    ahora = laPaz(12, 15);
    await motor.tick();
    expect(motor.modo, ModoRastreo.almuerzo);
  });

  test('sin señal: los puntos esperan en la cola y se envían al volver', () async {
    await motor.tick();
    servidor.caido = true;
    for (var i = 1; i <= 3; i++) {
      gps.mover(-16.5 - i / 100);
    }
    await esperar();
    ahora = ahora.add(const Duration(minutes: 1));
    await motor.tick();
    expect(cola.puntos, hasLength(3));
    expect(motor.modo, ModoRastreo.activo); // conserva el último estado conocido

    servidor.caido = false;
    ahora = ahora.add(const Duration(minutes: 1));
    await motor.tick();
    expect(cola.puntos, isEmpty);
  });

  test('lote rechazado por datos (400) se descarta; error del servidor (500) se reintenta', () async {
    await motor.tick();
    gps.mover(-16.51);
    await esperar();

    servidor.estadoUbicaciones = 500;
    expect(await motor.enviarCola(), 0);
    expect(cola.puntos, hasLength(1));

    servidor.estadoUbicaciones = 400;
    await motor.enviarCola();
    expect(cola.puntos, isEmpty);
  });

  test('GPS apagado en jornada: avisa al trabajador al instante y al supervisor a los 5 min', () async {
    await motor.tick();
    gps.encendido = false;
    await motor.tick();
    expect(avisosUbicacion, [true]); // notificación al trabajador
    expect(servidor.avisos, isEmpty); // todavía no al supervisor
    expect(notificaciones.last, 'Jalmeco GPS · Ubicación desactivada');

    ahora = ahora.add(const Duration(minutes: 4));
    await motor.tick();
    expect(servidor.avisos, isEmpty);
    ahora = ahora.add(const Duration(minutes: 1));
    await motor.tick();
    await motor.tick();
    expect(servidor.avisos, ['gps_apagado']); // una sola vez

    gps.encendido = true;
    await motor.tick();
    expect(notificaciones.last, 'Jalmeco GPS · Jornada activa');
    expect(gps.escuchando, isTrue);
    expect(avisosUbicacion, [true, false]); // se quitó el aviso
  });

  test('si activa la ubicación antes de 5 min, el supervisor no recibe nada', () async {
    await motor.tick();
    gps.encendido = false;
    await motor.tick();
    ahora = ahora.add(const Duration(minutes: 3));
    gps.encendido = true;
    await motor.tick();
    ahora = ahora.add(const Duration(minutes: 10));
    await motor.tick();
    expect(servidor.avisos, isEmpty);
    expect(avisosUbicacion, [true, false]);
  });

  test('al terminar la jornada deja de capturar', () async {
    await motor.tick();
    servidor.enJornada = false;
    ahora = ahora.add(const Duration(minutes: 1));
    await motor.tick();
    expect(motor.modo, ModoRastreo.fuera);
    expect(gps.escuchando, isFalse);
  });

  test('huella: avisa una vez por solicitud y quita el aviso al responder', () async {
    servidor.verificacion = {
      'id': 9, 'segundos_restantes': 170, 'solicitada_en': '2026-11-10T10:00:00-04:00',
      'respondida_en': null, 'resultado': 'pendiente',
    };
    await motor.tick();
    ahora = ahora.add(const Duration(seconds: 30));
    await motor.tick(); // sigue pendiente: no repite el aviso
    expect(avisosHuella, ['mostrar 9 170s']);

    servidor.verificacion = {...servidor.verificacion!, 'resultado': 'exito', 'segundos_restantes': null};
    ahora = ahora.add(const Duration(seconds: 30));
    await motor.tick();
    expect(avisosHuella, ['mostrar 9 170s', 'quitar']);
  });

  test('sesión vencida: se detiene y avisa', () async {
    servidor.sesionVencida = true;
    await motor.tick();
    expect(sesionCerrada, isTrue);
  });

  test('EstadoRastreo viaja del servicio a la interfaz', () {
    final e = EstadoRastreo(modo: ModoRastreo.activo, gpsActivado: true, pendientes: 4, ultimaCaptura: laPaz(10));
    final r = EstadoRastreo.deMapa(e.aMapa())!;
    expect(r.modo, ModoRastreo.activo);
    expect(r.pendientes, 4);
    expect(r.ultimaCaptura!.isAtSameMomentAs(laPaz(10)), isTrue);
  });

  test('velocidad y fecha viajan al backend en el formato del contrato', () {
    final p = PuntoGps(lat: -16.5, lng: -68.1, velocidadKmh: 28.4, bateria: 54, registradoEn: laPaz(10));
    expect(p.aJsonApi(), {
      'lat': -16.5,
      'lng': -68.1,
      'velocidad': 28.4,
      'bateria': 54,
      'registrado_en': '2026-11-10T14:00:00.000Z',
    });
  });

  group('reglas', () {
    test('franja de almuerzo [12:00, 13:00) en hora de La Paz', () {
      expect(enFranja(laPaz(11, 59), '12:00', '13:00'), isFalse);
      expect(enFranja(laPaz(12, 0), '12:00', '13:00'), isTrue);
      expect(enFranja(laPaz(12, 59), '12:00', '13:00'), isTrue);
      expect(enFranja(laPaz(13, 0), '12:00', '13:00'), isFalse);
    });

    test('franja que cruza la medianoche', () {
      expect(enFranja(laPaz(23, 30), '22:00', '06:00'), isTrue);
      expect(enFranja(laPaz(7, 0), '22:00', '06:00'), isFalse);
    });

    test('sin estado conocido no se captura', () {
      expect(decidirModo(null, laPaz(10)), ModoRastreo.fuera);
    });
  });
}
