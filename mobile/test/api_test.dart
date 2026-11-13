import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jalmeco_gps/servicios/api.dart';
import 'package:jalmeco_gps/servicios/sesion.dart';

http.Response _json(Object cuerpo, int status) => http.Response.bytes(
    utf8.encode(jsonEncode(cuerpo)), status,
    headers: {'content-type': 'application/json'});

const _tecnico = {'id': 1, 'codigo': 'JAL-1047', 'nombre': 'Juan Martinez'};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('login correcto guarda la sesión', () async {
    final sesion = Sesion();
    final api = Api(sesion, baseUrl: 'http://x', cliente: MockClient((req) async {
      expect(req.url.path, '/auth/tecnico/login');
      expect(jsonDecode(req.body), {'usuario': 'JAL-1047', 'pin': '292317'});
      return _json({'access': 'a1', 'refresh': 'r1', 'tecnico': _tecnico}, 200);
    }));

    await api.login('  JAL-1047 ', '292317');

    expect(sesion.activa, isTrue);
    expect(sesion.nombre, 'Juan Martinez');
    final recargada = Sesion();
    await recargada.cargar();
    expect(recargada.refresh, 'r1'); // persistió en el almacén seguro
  });

  test('credenciales inválidas → ApiError 401 con el mensaje del backend', () async {
    final api = Api(Sesion(), baseUrl: 'http://x', cliente: MockClient((_) async =>
        _json({'error': 'Credenciales inválidas.', 'codigo': 'CREDENCIALES_INVALIDAS'}, 401)));

    expect(
      () => api.login('jmartinez', '000000'),
      throwsA(isA<ApiError>().having((e) => e.status, 'status', 401).having((e) => e.mensaje, 'mensaje', 'Credenciales inválidas.')),
    );
  });

  test('demasiados intentos → mensaje del backend', () async {
    final api = Api(Sesion(), baseUrl: 'http://x', cliente: MockClient((_) async => _json(
        {'error': 'Demasiados intentos. Vuelve a intentarlo en 42 min.', 'codigo': 'DEMASIADOS_INTENTOS'}, 429)));

    expect(() => api.login('jmartinez', '000000'),
        throwsA(isA<ApiError>().having((e) => e.codigo, 'codigo', 'DEMASIADOS_INTENTOS')));
  });

  test('sin conexión → ApiError sin status', () async {
    final api = Api(Sesion(), baseUrl: 'http://x',
        cliente: MockClient((_) async => throw http.ClientException('sin red')));

    expect(() => api.login('jmartinez', '292317'),
        throwsA(isA<ApiError>().having((e) => e.sinConexion, 'sinConexion', isTrue)));
  });

  test('access vencido → renueva con refresh y reintenta', () async {
    final sesion = Sesion();
    await sesion.iniciar(access: 'viejo', refresh: 'r1', tecnico: _tecnico);
    final llamadas = <String>[];
    final api = Api(sesion, baseUrl: 'http://x', cliente: MockClient((req) async {
      llamadas.add('${req.url.path} ${req.headers['Authorization'] ?? ''}');
      if (req.url.path == '/auth/refresh') return _json({'access': 'nuevo'}, 200);
      if (req.headers['Authorization'] == 'Bearer viejo') {
        return _json({'error': 'Token inválido', 'codigo': 'TOKEN_NOT_VALID'}, 401);
      }
      return _json({'en_jornada': false}, 200);
    }));

    final r = await api.get('mi/estado');

    expect(r, {'en_jornada': false});
    expect(sesion.access, 'nuevo');
    expect(llamadas, ['/mi/estado Bearer viejo', '/auth/refresh ', '/mi/estado Bearer nuevo']);
  });

  test('refresh vencido → cierra la sesión', () async {
    final sesion = Sesion();
    await sesion.iniciar(access: 'viejo', refresh: 'vencido', tecnico: _tecnico);
    final api = Api(sesion, baseUrl: 'http://x', cliente: MockClient((_) async =>
        _json({'error': 'Token inválido', 'codigo': 'TOKEN_NOT_VALID'}, 401)));

    await expectLater(api.get('mi/estado'),
        throwsA(isA<ApiError>().having((e) => e.codigo, 'codigo', 'SESION_EXPIRADA')));
    expect(sesion.activa, isFalse);
  });

  test('sin internet al renovar → NO cierra la sesión', () async {
    final sesion = Sesion();
    await sesion.iniciar(access: 'viejo', refresh: 'r1', tecnico: _tecnico);
    final api = Api(sesion, baseUrl: 'http://x', cliente: MockClient((req) async {
      if (req.url.path == '/auth/refresh') throw http.ClientException('sin red');
      return _json({'error': 'Token inválido'}, 401);
    }));

    await expectLater(api.get('mi/estado'), throwsA(isA<ApiError>().having((e) => e.sinConexion, 'sin', isTrue)));
    expect(sesion.activa, isTrue);
  });
}
