import 'dart:async';

import 'package:flutter/foundation.dart';

import '../modelos/estado_jornada.dart';
import '../modelos/perfil.dart';
import 'api.dart';

/// Estado de la jornada y perfil del técnico para las pantallas.
///
/// Consulta GET /mi/estado cada 30 s mientras la app está al frente (la jornada la abre o
/// cierra Odoo, así que la app debe enterarse sola). Sin conexión conserva lo último recibido.
class Datos extends ChangeNotifier {
  Datos(this.api, {this.intervalo = const Duration(seconds: 30)});

  final Api api;
  final Duration intervalo;

  EstadoJornada? estado;
  Perfil? perfil;
  bool enLinea = true;
  DateTime? actualizadoEn; // última respuesta correcta del servidor
  String? error; // mensaje si la última consulta falló

  Timer? _timer;
  bool _consultando = false;
  bool _cerrado = false;

  /// Empieza (o reanuda) el sondeo.
  void iniciar() {
    _timer?.cancel();
    _timer = Timer.periodic(intervalo, (_) => actualizar());
    actualizar();
    if (perfil == null) cargarPerfil();
  }

  /// Pausa el sondeo (app en segundo plano: ahorra batería y datos).
  void pausar() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> actualizar() async {
    if (_consultando) return;
    _consultando = true;
    try {
      final j = await api.get('mi/estado') as Map<String, dynamic>;
      estado = EstadoJornada.fromJson(j);
      enLinea = true;
      actualizadoEn = DateTime.now();
      error = null;
    } on ApiError catch (e) {
      enLinea = !e.sinConexion;
      error = e.mensaje;
    } finally {
      _consultando = false;
    }
    _avisar();
  }

  Future<void> cargarPerfil() async {
    try {
      perfil = Perfil.fromJson(await api.get('mi/perfil') as Map<String, dynamic>);
      _avisar();
    } on ApiError catch (_) {
      // Se reintenta al volver a abrir el Perfil.
    }
  }

  void _avisar() {
    if (!_cerrado) notifyListeners();
  }

  @override
  void dispose() {
    _cerrado = true;
    _timer?.cancel();
    super.dispose();
  }
}
