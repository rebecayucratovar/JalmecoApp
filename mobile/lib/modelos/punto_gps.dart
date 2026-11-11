/// Un punto GPS capturado por el celular (se guarda en SQLite hasta enviarlo).
class PuntoGps {
  const PuntoGps({
    this.id,
    required this.lat,
    required this.lng,
    this.precisionM,
    this.velocidadKmh,
    this.bateria,
    required this.registradoEn,
  });

  final int? id; // id en la cola local (null antes de guardarlo)
  final double lat;
  final double lng;
  final double? precisionM;
  final double? velocidadKmh; // el GPS la da en m/s; se guarda ya en km/h
  final int? bateria;
  final DateTime registradoEn; // cuándo lo capturó el celular

  PuntoGps conBateria(int? nivel) => PuntoGps(
        id: id,
        lat: lat,
        lng: lng,
        precisionM: precisionM,
        velocidadKmh: velocidadKmh,
        bateria: nivel,
        registradoEn: registradoEn,
      );

  /// Formato de POST /mi/ubicaciones.
  Map<String, dynamic> aJsonApi() => {
        'lat': lat,
        'lng': lng,
        if (precisionM != null) 'precision_m': precisionM,
        if (velocidadKmh != null) 'velocidad': velocidadKmh,
        if (bateria != null) 'bateria': bateria,
        'registrado_en': registradoEn.toUtc().toIso8601String(),
      };

  Map<String, Object?> aFila() => {
        'lat': lat,
        'lng': lng,
        'precision_m': precisionM,
        'velocidad': velocidadKmh,
        'bateria': bateria,
        'registrado_en': registradoEn.toUtc().toIso8601String(),
      };

  factory PuntoGps.deFila(Map<String, Object?> f) => PuntoGps(
        id: f['id'] as int,
        lat: (f['lat'] as num).toDouble(),
        lng: (f['lng'] as num).toDouble(),
        precisionM: (f['precision_m'] as num?)?.toDouble(),
        velocidadKmh: (f['velocidad'] as num?)?.toDouble(),
        bateria: f['bateria'] as int?,
        registradoEn: DateTime.parse(f['registrado_en'] as String),
      );
}
