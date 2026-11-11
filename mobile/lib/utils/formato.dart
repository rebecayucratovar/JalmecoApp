// Formatos de fecha, hora y números en español, siempre en hora de La Paz (UTC−4, sin
// horario de verano), aunque el celular tenga otra zona configurada.

const _dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const _meses = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/// El mismo instante expresado con la hora de pared de La Paz.
DateTime enLaPaz(DateTime d) => d.toUtc().subtract(const Duration(hours: 4));

String _dos(int n) => n.toString().padLeft(2, '0');

/// "Miércoles, 4 de noviembre"
String fechaLarga(DateTime d) {
  final l = enLaPaz(d);
  return '${_dias[l.weekday - 1]}, ${l.day} de ${_meses[l.month - 1]}';
}

/// "08:02"
String hora(DateTime d) {
  final l = enLaPaz(d);
  return '${_dos(l.hour)}:${_dos(l.minute)}';
}

/// "Hoy 11:30", "Ayer 17:05" o "4/11 09:15"
String diaYHora(DateTime d, {DateTime? ahora}) {
  final l = enLaPaz(d);
  final hoy = enLaPaz(ahora ?? DateTime.now());
  final dias = DateTime(hoy.year, hoy.month, hoy.day).difference(DateTime(l.year, l.month, l.day)).inDays;
  final prefijo = switch (dias) { 0 => 'Hoy', 1 => 'Ayer', _ => '${l.day}/${l.month}' };
  return '$prefijo ${hora(d)}';
}

/// "7 h 38 min", "45 min", "2 h"
String duracion(int minutos) {
  final h = minutos ~/ 60;
  final m = minutos % 60;
  if (h == 0) return '$m min';
  if (m == 0) return '$h h';
  return '$h h $m min';
}

/// "52,8 km"
String kilometros(double km) => '${km.toStringAsFixed(1).replaceAll('.', ',')} km';

/// "Hace un momento", "Hace 3 min", "Hace 2 h"
String haceCuanto(DateTime d, {DateTime? ahora}) {
  final dif = (ahora ?? DateTime.now()).difference(d);
  if (dif.inMinutes < 1) return 'Hace un momento';
  if (dif.inMinutes < 60) return 'Hace ${dif.inMinutes} min';
  return 'Hace ${dif.inHours} h';
}

/// "Juan" de "Juan Martínez Ríos"
String primerNombre(String nombre) => nombre.trim().split(RegExp(r'\s+')).first;
