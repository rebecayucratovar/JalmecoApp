/// Cómo captura la app: un punto cada `distanciaM` metros recorridos, o cada `intervaloSeg`
/// segundos si está quieto. Lo define el panel (Configuración).
class Rastreo {
  const Rastreo({required this.distanciaM, required this.intervaloSeg});

  final int distanciaM;
  final int intervaloSeg;

  factory Rastreo.fromJson(Map<String, dynamic> j) => Rastreo(
        distanciaM: (j['distancia_m'] as num).toInt(),
        intervaloSeg: (j['intervalo_seg'] as num).toInt(),
      );

  /// "cada 2 minutos", "cada 90 segundos"
  String get intervaloTexto {
    if (intervaloSeg % 60 == 0) {
      final m = intervaloSeg ~/ 60;
      return m == 1 ? 'cada minuto' : 'cada $m minutos';
    }
    return 'cada $intervaloSeg segundos';
  }
}
