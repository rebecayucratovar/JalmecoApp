import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config.dart';
import 'sesion.dart';

/// Error de la API con un mensaje listo para mostrar al usuario.
class ApiError implements Exception {
  ApiError(this.mensaje, {this.status, this.codigo});

  final String mensaje;
  final int? status; // null = no hubo respuesta (sin internet, servidor caído, timeout)
  final String? codigo; // p. ej. DEMASIADOS_INTENTOS, CREDENCIALES_INVALIDAS

  bool get sinConexion => status == null;

  @override
  String toString() => 'ApiError($status, $codigo): $mensaje';
}

/// Cliente del backend Jalmeco GPS (ver docs/contrato-api.md).
///
/// Agrega el token a cada petición y, si el access venció (401), lo renueva una vez con el
/// refresh. Si el refresh también venció, cierra la sesión (la app vuelve al Login).
class Api {
  Api(this.sesion, {http.Client? cliente, String? baseUrl})
      : _http = cliente ?? http.Client(),
        _base = baseUrl ?? Config.apiUrl;

  final Sesion sesion;
  final http.Client _http;
  final String _base;
  Future<bool>? _renovando; // una sola renovación a la vez

  // ---------- Autenticación ----------

  /// POST /auth/tecnico/login. `usuario` acepta el usuario o el código JAL-XXXX.
  Future<void> login(String usuario, String pin) async {
    final datos = await _enviar('POST', 'auth/tecnico/login',
        cuerpo: {'usuario': usuario.trim(), 'pin': pin}, conToken: false) as Map<String, dynamic>;
    await sesion.iniciar(
      access: datos['access'] as String,
      refresh: datos['refresh'] as String,
      tecnico: datos['tecnico'] as Map<String, dynamic>,
    );
  }

  // ---------- Peticiones autenticadas ----------

  Future<dynamic> get(String ruta) => _conRenovacion('GET', ruta);
  Future<dynamic> post(String ruta, [Object? cuerpo]) => _conRenovacion('POST', ruta, cuerpo);
  Future<dynamic> put(String ruta, [Object? cuerpo]) => _conRenovacion('PUT', ruta, cuerpo);

  Future<dynamic> _conRenovacion(String metodo, String ruta, [Object? cuerpo]) async {
    try {
      return await _enviar(metodo, ruta, cuerpo: cuerpo);
    } on ApiError catch (e) {
      if (e.status != 401) rethrow;
      if (!await _renovarAccess()) {
        await sesion.cerrar();
        throw ApiError('Tu sesión expiró. Vuelve a ingresar.', status: 401, codigo: 'SESION_EXPIRADA');
      }
      return _enviar(metodo, ruta, cuerpo: cuerpo);
    }
  }

  Future<bool> _renovarAccess() {
    return _renovando ??= () async {
      try {
        final refresh = sesion.refresh;
        if (refresh == null) return false;
        final datos = await _enviar('POST', 'auth/refresh',
            cuerpo: {'refresh': refresh}, conToken: false) as Map<String, dynamic>;
        await sesion.actualizarAccess(datos['access'] as String);
        return true;
      } on ApiError catch (e) {
        if (e.sinConexion) rethrow; // sin internet no es "sesión vencida"
        return false;
      } finally {
        _renovando = null;
      }
    }();
  }

  // ---------- Bajo nivel ----------

  Future<dynamic> _enviar(String metodo, String ruta, {Object? cuerpo, bool conToken = true}) async {
    final req = http.Request(metodo, Uri.parse('$_base/$ruta'));
    req.headers['Accept'] = 'application/json';
    if (cuerpo != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(cuerpo);
    }
    if (conToken && sesion.access != null) {
      req.headers['Authorization'] = 'Bearer ${sesion.access}';
    }

    final http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(Config.timeout));
    } on TimeoutException {
      throw ApiError('El servidor tarda en responder. Revisa tu conexión e intenta de nuevo.');
    } on SocketException {
      throw ApiError('Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.');
    } on http.ClientException {
      throw ApiError('Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.');
    }

    final cuerpoRes = _decodificar(res);
    if (res.statusCode >= 200 && res.statusCode < 300) return cuerpoRes;

    // Formato de error del contrato: { "error": "...", "codigo": "..." }
    final mapa = cuerpoRes is Map<String, dynamic> ? cuerpoRes : const <String, dynamic>{};
    throw ApiError(
      (mapa['error'] as String?) ?? 'Error del servidor (${res.statusCode}).',
      status: res.statusCode,
      codigo: mapa['codigo'] as String?,
    );
  }

  dynamic _decodificar(http.Response res) {
    if (res.bodyBytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      return null; // p. ej. una página HTML de error del proxy
    }
  }
}
