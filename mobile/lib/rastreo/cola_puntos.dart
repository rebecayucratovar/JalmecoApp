import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../modelos/punto_gps.dart';

/// Cola de puntos pendientes de enviar. Sin señal se acumulan aquí y se envían al reconectar.
abstract class ColaPuntos {
  Future<void> agregar(PuntoGps punto);

  /// Los más antiguos primero (el backend los liga a su jornada aunque ya esté cerrada).
  Future<List<PuntoGps>> tomar(int limite);
  Future<void> borrar(List<int> ids);
  Future<int> contar();
}

/// Cola en SQLite. Solo la usa el servicio de rastreo (un único isolate).
class ColaSqlite implements ColaPuntos {
  ColaSqlite._(this._db);

  /// Tope de seguridad (~2 semanas sin señal); si se supera se descartan los más viejos.
  static const maximo = 50000;

  final Database _db;

  static Future<ColaSqlite> abrir() async {
    final ruta = p.join(await getDatabasesPath(), 'jalmeco_gps.db');
    final db = await openDatabase(
      ruta,
      version: 1,
      onCreate: (db, _) => db.execute('''
        CREATE TABLE punto (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          lat           REAL NOT NULL,
          lng           REAL NOT NULL,
          precision_m   REAL,
          velocidad     REAL,
          bateria       INTEGER,
          registrado_en TEXT NOT NULL
        )'''),
    );
    return ColaSqlite._(db);
  }

  @override
  Future<void> agregar(PuntoGps punto) async {
    await _db.insert('punto', punto.aFila());
    final total = await contar();
    if (total > maximo) {
      await _db.rawDelete(
          'DELETE FROM punto WHERE id IN (SELECT id FROM punto ORDER BY id LIMIT ?)', [total - maximo]);
    }
  }

  @override
  Future<List<PuntoGps>> tomar(int limite) async {
    final filas = await _db.query('punto', orderBy: 'id', limit: limite);
    return filas.map(PuntoGps.deFila).toList();
  }

  @override
  Future<void> borrar(List<int> ids) async {
    if (ids.isEmpty) return;
    await _db.delete('punto', where: 'id IN (${List.filled(ids.length, '?').join(',')})', whereArgs: ids);
  }

  @override
  Future<int> contar() async =>
      Sqflite.firstIntValue(await _db.rawQuery('SELECT COUNT(*) FROM punto')) ?? 0;

  Future<void> cerrar() => _db.close();
}
