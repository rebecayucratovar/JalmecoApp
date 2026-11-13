import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Sesión del técnico: tokens JWT y sus datos básicos, guardados cifrados en el celular.
///
/// Es un ChangeNotifier: la app escucha `activa` para mostrar el Login o el Inicio.
class Sesion extends ChangeNotifier {
  Sesion({FlutterSecureStorage? almacen}) : _almacen = almacen ?? const FlutterSecureStorage();

  static const _kAccess = 'access';
  static const _kRefresh = 'refresh';
  static const _kTecnico = 'tecnico';

  final FlutterSecureStorage _almacen;

  String? access;
  String? refresh;
  Map<String, dynamic>? tecnico;

  bool get activa => refresh != null;

  String get nombre => (tecnico?['nombre'] as String?) ?? '';

  /// Lee la sesión guardada (al abrir la app).
  Future<void> cargar() async {
    try {
      access = await _almacen.read(key: _kAccess);
      refresh = await _almacen.read(key: _kRefresh);
      final t = await _almacen.read(key: _kTecnico);
      tecnico = t == null ? null : jsonDecode(t) as Map<String, dynamic>;
    } catch (_) {
      // Almacén ilegible (p. ej. tras restaurar un respaldo): empezar sin sesión.
      await _borrarTodo();
    }
    notifyListeners();
  }

  Future<void> iniciar({
    required String access,
    required String refresh,
    required Map<String, dynamic> tecnico,
  }) async {
    this.access = access;
    this.refresh = refresh;
    this.tecnico = tecnico;
    await _almacen.write(key: _kAccess, value: access);
    await _almacen.write(key: _kRefresh, value: refresh);
    await _almacen.write(key: _kTecnico, value: jsonEncode(tecnico));
    notifyListeners();
  }

  Future<void> actualizarAccess(String nuevo) async {
    access = nuevo;
    await _almacen.write(key: _kAccess, value: nuevo);
  }

  Future<void> cerrar() async {
    await _borrarTodo();
    notifyListeners();
  }

  Future<void> _borrarTodo() async {
    access = null;
    refresh = null;
    tecnico = null;
    try {
      await _almacen.deleteAll();
    } catch (_) {}
  }
}
