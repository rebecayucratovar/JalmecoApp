import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jalmeco_gps/pantallas/verificacion_pantalla.dart';
import 'package:jalmeco_gps/servicios/api.dart';
import 'package:jalmeco_gps/servicios/datos.dart';
import 'package:jalmeco_gps/servicios/sesion.dart';

void main() {
  late List<String> respuestas; // cuerpos enviados a /responder
  late int estadoResponder;
  late String? codigoResponder;

  Future<Datos> datos() async {
    FlutterSecureStorage.setMockInitialValues({});
    final sesion = Sesion();
    await sesion.iniciar(access: 'a', refresh: 'r', tecnico: {'nombre': 'Juan'});
    final api = Api(sesion, baseUrl: 'http://x', cliente: MockClient((req) async {
      if (req.url.path == '/mi/verificaciones/9/responder') {
        respuestas.add(req.body);
        return http.Response.bytes(
            utf8.encode(jsonEncode(estadoResponder == 200 ? {'ok': true} : {'error': 'x', 'codigo': codigoResponder})),
            estadoResponder,
            headers: {'content-type': 'application/json'});
      }
      return http.Response('{}', 500); // /mi/estado tras terminar: no importa aquí
    }));
    return Datos(api, intervalo: const Duration(hours: 1));
  }

  Future<void> abrir(WidgetTester t, Datos d, Future<ResultadoHuella> Function() huella,
      {Duration quedan = const Duration(minutes: 3)}) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 2.6;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: VerificacionPantalla(
        datos: d,
        verificacion: VerificacionPendiente(9, DateTime.now().add(quedan)),
        huella: huella,
        posicion: () async => null,
      ),
    ));
  }

  setUp(() {
    respuestas = [];
    estadoResponder = 200;
    codigoResponder = null;
  });

  testWidgets('huella correcta → envía "exito" y muestra Identidad confirmada', (t) async {
    await abrir(t, await datos(), () async => ResultadoHuella.ok);
    await t.pumpAndSettle();
    expect(respuestas.single, contains('"resultado":"exito"'));
    expect(find.text('Identidad confirmada'), findsOneWidget);
  });

  testWidgets('huella fallida → se puede reintentar tocando el ícono', (t) async {
    var intentos = 0;
    await abrir(t, await datos(), () async => ++intentos == 1 ? ResultadoHuella.fallo : ResultadoHuella.ok);
    await t.pump();
    await t.pump();
    expect(find.textContaining('No se confirmó la huella'), findsOneWidget);
    expect(respuestas, isEmpty);

    await t.tap(find.bySemanticsLabel('Verificar con huella'));
    await t.pumpAndSettle();
    expect(find.text('Identidad confirmada'), findsOneWidget);
  });

  testWidgets('celular sin huella registrada → indica avisar al supervisor', (t) async {
    await abrir(t, await datos(), () async => ResultadoHuella.sinHuella);
    await t.pump();
    await t.pump();
    expect(find.textContaining('no tiene una huella registrada'), findsOneWidget);
  });

  testWidgets('el servidor dice que ya venció → Verificación no realizada', (t) async {
    estadoResponder = 409;
    codigoResponder = 'VERIFICACION_VENCIDA';
    await abrir(t, await datos(), () async => ResultadoHuella.ok);
    await t.pumpAndSettle();
    expect(find.text('Verificación no realizada'), findsOneWidget);
  });

  testWidgets('se acaba el tiempo en pantalla → Verificación no realizada', (t) async {
    await abrir(t, await datos(), () async => ResultadoHuella.fallo, quedan: const Duration(seconds: 2));
    await t.pump();
    await t.pump(const Duration(seconds: 3));
    await t.pump();
    expect(find.text('Verificación no realizada'), findsOneWidget);
  });
}
