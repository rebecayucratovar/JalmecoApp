import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jalmeco_gps/pantallas/permisos_pantalla.dart';
import 'package:jalmeco_gps/servicios/permisos.dart';

/// Simula Android: cada "pedir" concede el permiso, como si el usuario aceptara.
class FuenteFalsa implements FuentePermisos {
  EstadoUbicacion ubicacion = EstadoUbicacion.pendiente;
  bool notificaciones = false;
  bool bateria = false;
  String marca = 'samsung';
  int ajustesAbiertos = 0;

  @override
  Future<EstadoPermisos> leer() async => EstadoPermisos(
      ubicacion: ubicacion, notificaciones: notificaciones, notificacionesBloqueadas: false, bateria: bateria);
  @override
  Future<void> pedirUbicacion() async => ubicacion = EstadoUbicacion.soloEnUso;
  @override
  Future<void> pedirUbicacionSiempre() async => ubicacion = EstadoUbicacion.siempre;
  @override
  Future<void> pedirNotificaciones() async => notificaciones = true;
  @override
  Future<void> pedirBateria() async => bateria = true;
  @override
  Future<void> abrirAjustes() async => ajustesAbiertos++;
  @override
  Future<String> fabricante() async => marca;
}

void main() {
  group('Permisos (lógica)', () {
    test('con todo concedido al abrir la app no se muestra la pantalla', () async {
      final f = FuenteFalsa()
        ..ubicacion = EstadoUbicacion.siempre
        ..notificaciones = true;
      final p = Permisos(f);
      await p.revisar();
      expect(p.mostrarPantalla, isFalse);
    });

    test('la batería es recomendada, no obligatoria', () async {
      final f = FuenteFalsa()
        ..ubicacion = EstadoUbicacion.siempre
        ..notificaciones = true
        ..bateria = false;
      final p = Permisos(f);
      await p.revisar();
      expect(p.estado!.listos, isTrue);
    });

    test('si quita la ubicación "todo el tiempo" → avisa y vuelve a la pantalla', () async {
      final f = FuenteFalsa()
        ..ubicacion = EstadoUbicacion.siempre
        ..notificaciones = true;
      var avisos = 0;
      final p = Permisos(f)..alPerderUbicacion = () => avisos++;
      await p.revisar();

      f.ubicacion = EstadoUbicacion.soloEnUso; // la cambió en Ajustes
      await p.revisar();

      expect(avisos, 1);
      expect(p.mostrarPantalla, isTrue);
      await p.revisar();
      expect(avisos, 1); // no repite el aviso
    });

    test('Huawei se reconoce como fabricante con ahorro agresivo', () async {
      final p = Permisos(FuenteFalsa()..marca = 'huawei');
      await p.revisar();
      expect(p.fabricanteAgresivo, isTrue);
    });
  });

  testWidgets('pantalla: ubicación en 2 pasos + notificaciones habilitan Continuar', (t) async {
    t.view.physicalSize = const Size(1080, 2400);
    t.view.devicePixelRatio = 2.6;
    addTearDown(t.view.reset);

    final f = FuenteFalsa();
    final p = Permisos(f);
    await p.revisar();
    await t.pumpWidget(MaterialApp(home: PermisosPantalla(permisos: p)));

    FilledButton continuar() => t.widget(find.widgetWithText(FilledButton, 'Continuar'));
    expect(continuar().onPressed, isNull);
    expect(find.textContaining('Paso 1 de 2'), findsOneWidget);

    await t.tap(find.widgetWithText(FilledButton, 'Activar').first); // ubicación paso 1
    await t.pumpAndSettle();
    expect(find.textContaining('Paso 2 de 2'), findsOneWidget);

    await t.tap(find.widgetWithText(FilledButton, 'Abrir ajustes')); // paso 2
    await t.pumpAndSettle();
    expect(find.text('Permitida todo el tiempo'), findsOneWidget);
    expect(continuar().onPressed, isNull); // faltan notificaciones

    await t.ensureVisible(find.widgetWithText(FilledButton, 'Activar').first);
    await t.tap(find.widgetWithText(FilledButton, 'Activar').first); // notificaciones
    await t.pumpAndSettle();
    expect(find.text('Permitidas'), findsOneWidget);
    expect(continuar().onPressed, isNotNull);

    await t.tap(find.widgetWithText(FilledButton, 'Continuar'));
    await t.pump();
    expect(p.mostrarPantalla, isFalse);
  });
}
