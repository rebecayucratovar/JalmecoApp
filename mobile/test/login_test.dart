import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jalmeco_gps/pantallas/login_pantalla.dart';
import 'package:jalmeco_gps/servicios/api.dart';
import 'package:jalmeco_gps/servicios/sesion.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('Ingresar se habilita con usuario y 6 dígitos; error 401 limpia el PIN', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 2.6;
    addTearDown(t.view.reset);

    final api = Api(Sesion(), baseUrl: 'http://x', cliente: MockClient((_) async => http.Response(
        '{"error":"Credenciales inválidas.","codigo":"CREDENCIALES_INVALIDAS"}', 401,
        headers: {'content-type': 'application/json; charset=utf-8'})));
    await t.pumpWidget(MaterialApp(home: LoginPantalla(api: api)));

    FilledButton boton() => t.widget(find.byType(FilledButton));
    expect(boton().onPressed, isNull);

    await t.enterText(find.byType(TextField), 'jmartinez');
    for (final d in ['2', '9', '2', '3', '1', '7']) {
      await t.tap(find.text(d).last);
    }
    await t.pump();
    expect(boton().onPressed, isNotNull);

    await t.tap(find.byType(FilledButton));
    await t.pumpAndSettle();
    expect(find.text('Usuario o PIN incorrecto.'), findsOneWidget);
    expect(boton().onPressed, isNull); // PIN vacío otra vez
  });
}
