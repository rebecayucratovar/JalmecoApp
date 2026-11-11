import 'rastreo.dart';

/// Lo que se muestra en el Inicio.
enum FaseJornada { activa, almuerzo, fuera }

class UltimaVerificacion {
  const UltimaVerificacion({required this.solicitadaEn, this.respondidaEn, required this.resultado});

  final DateTime solicitadaEn;
  final DateTime? respondidaEn;
  final String resultado; // pendiente | exito | no_realizada

  factory UltimaVerificacion.fromJson(Map<String, dynamic> j) => UltimaVerificacion(
        solicitadaEn: DateTime.parse(j['solicitada_en'] as String),
        respondidaEn: j['respondida_en'] == null ? null : DateTime.parse(j['respondida_en'] as String),
        resultado: j['resultado'] as String,
      );
}

/// Respuesta de GET /mi/estado (ver docs/contrato-api.md).
class EstadoJornada {
  const EstadoJornada({
    required this.enJornada,
    this.inicioJornada,
    this.horario,
    required this.enPausaAlmuerzo,
    this.almuerzoInicio,
    this.almuerzoFin,
    required this.tiempoJornadaMin,
    required this.distanciaKm,
    required this.rastreo,
    this.ultimaVerificacion,
  });

  final bool enJornada;
  final DateTime? inicioJornada; // marca de ingreso en Odoo
  final String? horario; // "08:00–18:00"
  final bool enPausaAlmuerzo;
  final String? almuerzoInicio; // "12:00"
  final String? almuerzoFin; // "13:00"
  final int tiempoJornadaMin;
  final double distanciaKm;
  final Rastreo rastreo;
  final UltimaVerificacion? ultimaVerificacion;

  FaseJornada get fase {
    if (!enJornada) return FaseJornada.fuera;
    return enPausaAlmuerzo ? FaseJornada.almuerzo : FaseJornada.activa;
  }

  factory EstadoJornada.fromJson(Map<String, dynamic> j) {
    final jornada = j['jornada'] as Map<String, dynamic>?;
    final almuerzo = j['franja_almuerzo'] as Map<String, dynamic>?;
    final resumen = j['resumen_hoy'] as Map<String, dynamic>;
    final verif = j['ultima_verificacion'] as Map<String, dynamic>?;
    return EstadoJornada(
      enJornada: j['en_jornada'] as bool,
      inicioJornada: jornada == null ? null : DateTime.parse(jornada['inicio'] as String),
      horario: jornada?['horario'] as String?,
      enPausaAlmuerzo: j['en_pausa_almuerzo'] as bool,
      almuerzoInicio: almuerzo?['inicio'] as String?,
      almuerzoFin: almuerzo?['fin'] as String?,
      tiempoJornadaMin: (resumen['tiempo_jornada_min'] as num).toInt(),
      distanciaKm: (resumen['distancia_km'] as num).toDouble(),
      rastreo: Rastreo.fromJson(j['rastreo'] as Map<String, dynamic>),
      ultimaVerificacion: verif == null ? null : UltimaVerificacion.fromJson(verif),
    );
  }
}
