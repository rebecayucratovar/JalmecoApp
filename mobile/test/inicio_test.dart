import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jalmeco_gps/modelos/estado_jornada.dart';
import 'package:jalmeco_gps/modelos/perfil.dart';
import 'package:jalmeco_gps/pantallas/principal_pantalla.dart';
import 'package:jalmeco_gps/servicios/api.dart';
import 'package:jalmeco_gps/servicios/datos.dart';
import 'package:jalmeco_gps/servicios/sesion.dart';
import 'package:jalmeco_gps/utils/formato.dart';

// Respuestas reales del backend (copiadas de una prueba contra la API).
const _estadoActiva = '''{"en_jornada": true, "jornada": {"inicio": "2026-11-10T08:02:00-04:00", "horario": "08:00–18:00"},
 "en_pausa_almuerzo": false, "franja_almuerzo": {"inicio": "12:00", "fin": "13:00"},
 "resumen_hoy": {"tiempo_jornada_min": 458, "distancia_km": 52.84}, "rastreo": {"distancia_m": 25, "intervalo_seg": 120},
 "ultima_verificacion": {"id": 3, "segundos_restantes": null, "solicitada_en": "2026-11-10T11:30:00-04:00", "respondida_en": "2026-11-10T11:31:00-04:00", "resultado": "exito"}}''';

String _estado({bool enJornada = true, bool almuerzo = false}) => _estadoActiva
    .replaceFirst('"en_jornada": true', '"en_jornada": $enJornada')
    .replaceFirst('"jornada": {"inicio": "2026-11-10T08:02:00-04:00", "horario": "08:00–18:00"}',
        enJornada ? '"jornada": {"inicio": "2026-11-10T08:02:00-04:00", "horario": "08:00–18:00"}' : '"jornada": null')
    .replaceFirst('"en_pausa_almuerzo": false', '"en_pausa_almuerzo": $almuerzo');

const _perfil = '''{"tecnico": {"id": 1, "codigo": "JAL-1047", "usuario": "jmartinez", "nombre": "Juan Martinez",
 "cargo": "Tecnico de campo", "foto_url": null, "celular_modelo": null, "celular_numero": null, "equipo_modelo": "samsung SM-A155F"},
 "politicas": {"horario": "08:00–18:00", "franja_almuerzo": {"inicio": "12:00", "fin": "13:00"}, "retencion_meses": 12,
 "verificaciones_por_dia": 2, "rastreo": {"distancia_m": 25, "intervalo_seg": 120}}}''';

Future<Datos> _datos(String estadoJson) async {
  FlutterSecureStorage.setMockInitialValues({});
  final sesion = Sesion();
  await sesion.iniciar(access: 'a', refresh: 'r', tecnico: {'nombre': 'Juan Martinez'});
  final api = Api(sesion, baseUrl: 'http://x', cliente: MockClient((req) async {
    final cuerpo = req.url.path == '/mi/perfil' ? _perfil : estadoJson;
    return http.Response(cuerpo, 200, headers: {'content-type': 'application/json; charset=utf-8'});
  }));
  return Datos(api, intervalo: const Duration(hours: 1));
}

Future<void> _abrir(WidgetTester t, Datos datos) async {
  t.view.physicalSize = const Size(1080, 2400);
  t.view.devicePixelRatio = 2.6;
  addTearDown(t.view.reset);
  await t.pumpWidget(MaterialApp(home: PrincipalPantalla(api: datos.api, datos: datos, conServicio: false)));
  await t.pumpAndSettle();
}

void main() {
  group('modelos', () {
    test('EstadoJornada lee la respuesta real de /mi/estado', () {
      final e = EstadoJornada.fromJson(jsonDecode(_estadoActiva));
      expect(e.fase, FaseJornada.activa);
      expect(hora(e.inicioJornada!), '08:02');
      expect(e.rastreo.intervaloTexto, 'cada 2 minutos');
      expect(e.ultimaVerificacion!.resultado, 'exito');
    });

    test('Perfil lee la respuesta real de /mi/perfil (campos nulos incluidos)', () {
      final p = Perfil.fromJson(jsonDecode(_perfil));
      expect(p.codigo, 'JAL-1047');
      expect(p.celularModelo, isNull);
      expect(p.politicas.retencionMeses, 12);
    });

    test('fase: fuera de jornada aunque sea la hora del almuerzo', () {
      final e = EstadoJornada.fromJson(jsonDecode(_estado(enJornada: false, almuerzo: true)));
      expect(e.fase, FaseJornada.fuera);
    });
  });

  group('formato', () {
    test('hora de La Paz aunque el instante venga en UTC', () {
      expect(hora(DateTime.parse('2026-11-10T12:02:00Z')), '08:02');
      expect(fechaLarga(DateTime.parse('2026-11-04T15:00:00Z')), 'Miércoles, 4 de noviembre');
      // 23:30 en La Paz = 03:30 UTC del día siguiente
      expect(fechaLarga(DateTime.parse('2026-11-05T03:30:00Z')), 'Miércoles, 4 de noviembre');
    });

    test('duración y kilómetros', () {
      expect(duracion(458), '7 h 38 min');
      expect(duracion(45), '45 min');
      expect(duracion(120), '2 h');
      expect(kilometros(52.84), '52,8 km');
      expect(kilometros(0.04), '40 m');
      expect(kilometros(0), '0 m');
    });
  });

  group('Inicio', () {
    testWidgets('jornada activa', (t) async {
      await _abrir(t, await _datos(_estadoActiva));
      expect(find.text('Hola, Juan'), findsOneWidget);
      expect(find.text('Jornada activa'), findsOneWidget);
      expect(find.text('Horario de hoy: 08:00–18:00'), findsOneWidget);
      expect(find.text('7 h 38 min'), findsOneWidget);
      expect(find.text('52,8 km'), findsOneWidget);

      await t.tap(find.text('Ver estado del seguimiento'));
      await t.pumpAndSettle();
      expect(find.text('Seguimiento encendido'), findsWidgets);
    });

    testWidgets('almuerzo', (t) async {
      await _abrir(t, await _datos(_estado(almuerzo: true)));
      expect(find.text('Hora de almuerzo'), findsOneWidget);
      expect(find.text('Seguimiento en pausa (12:00–13:00)'), findsOneWidget);
    });

    testWidgets('fuera de jornada', (t) async {
      await _abrir(t, await _datos(_estado(enJornada: false)));
      expect(find.text('Fuera de jornada'), findsOneWidget);
      expect(find.text('Horario laboral: 08:00–18:00'), findsOneWidget);
    });

    testWidgets('perfil y hoja "Cómo se usa mi ubicación" con las reglas reales', (t) async {
      await _abrir(t, await _datos(_estadoActiva));
      await t.tap(find.text('Perfil'));
      await t.pumpAndSettle();
      expect(find.text('Código JAL-1047'), findsOneWidget);
      expect(find.text('Sin asignar'), findsOneWidget);

      await t.tap(find.text('Cómo se usa mi ubicación'));
      await t.pumpAndSettle();
      expect(find.textContaining('cada 2 minutos si estás quieto'), findsOneWidget);
      await t.scrollUntilVisible(find.textContaining('12 meses'), 200,
          scrollable: find.byType(Scrollable).last);
      expect(find.textContaining('12 meses'), findsOneWidget);
    });
  });
}
