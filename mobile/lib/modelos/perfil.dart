import 'rastreo.dart';

/// Reglas que la app muestra (Perfil y "Cómo se usa mi ubicación").
class Politicas {
  const Politicas({
    required this.horario,
    this.almuerzoInicio,
    this.almuerzoFin,
    required this.retencionMeses,
    required this.verificacionesPorDia,
    required this.rastreo,
  });

  final String horario;
  final String? almuerzoInicio;
  final String? almuerzoFin;
  final int retencionMeses;
  final int verificacionesPorDia;
  final Rastreo rastreo;

  factory Politicas.fromJson(Map<String, dynamic> j) {
    final almuerzo = j['franja_almuerzo'] as Map<String, dynamic>?;
    return Politicas(
      horario: j['horario'] as String,
      almuerzoInicio: almuerzo?['inicio'] as String?,
      almuerzoFin: almuerzo?['fin'] as String?,
      retencionMeses: (j['retencion_meses'] as num).toInt(),
      verificacionesPorDia: (j['verificaciones_por_dia'] as num).toInt(),
      rastreo: Rastreo.fromJson(j['rastreo'] as Map<String, dynamic>),
    );
  }
}

/// Respuesta de GET /mi/perfil.
class Perfil {
  const Perfil({
    required this.id,
    this.codigo,
    required this.usuario,
    required this.nombre,
    this.cargo,
    this.fotoUrl,
    this.celularModelo,
    this.celularNumero,
    this.equipoModelo,
    required this.politicas,
  });

  final int id;
  final String? codigo;
  final String usuario;
  final String nombre;
  final String? cargo;
  final String? fotoUrl;
  final String? celularModelo; // asignado por la empresa
  final String? celularNumero;
  final String? equipoModelo; // detectado por la app
  final Politicas politicas;

  factory Perfil.fromJson(Map<String, dynamic> j) {
    final t = j['tecnico'] as Map<String, dynamic>;
    return Perfil(
      id: (t['id'] as num).toInt(),
      codigo: t['codigo'] as String?,
      usuario: t['usuario'] as String,
      nombre: t['nombre'] as String,
      cargo: t['cargo'] as String?,
      fotoUrl: t['foto_url'] as String?,
      celularModelo: t['celular_modelo'] as String?,
      celularNumero: t['celular_numero'] as String?,
      equipoModelo: t['equipo_modelo'] as String?,
      politicas: Politicas.fromJson(j['politicas'] as Map<String, dynamic>),
    );
  }
}
