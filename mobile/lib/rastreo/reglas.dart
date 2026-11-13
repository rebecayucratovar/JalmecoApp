import '../modelos/estado_jornada.dart';
import '../utils/formato.dart';

/// Qué hace el servicio en cada momento.
enum ModoRastreo {
  fuera, // sin jornada: no usa el GPS, solo consulta al servidor
  activo, // en jornada: captura puntos
  almuerzo, // en jornada, dentro de la franja de pausa: no captura ni guarda nada
}

int? _minutos(String? hhmm) {
  if (hhmm == null) return null;
  final partes = hhmm.split(':');
  if (partes.length < 2) return null;
  return int.parse(partes[0]) * 60 + int.parse(partes[1]);
}

/// ¿`momento` (hora de La Paz) cae en la franja [inicio, fin)? Soporta franjas que cruzan la
/// medianoche. Igual que el backend (core/pausas.py).
bool enFranja(DateTime momento, String? inicio, String? fin) {
  final ini = _minutos(inicio);
  final f = _minutos(fin);
  if (ini == null || f == null) return false;
  final l = enLaPaz(momento);
  final m = l.hour * 60 + l.minute;
  return ini <= f ? (m >= ini && m < f) : (m >= ini || m < f);
}

/// Modo según el último estado conocido del servidor y la hora local.
/// - Sin estado conocido (recién encendido y sin internet) → fuera: no se captura a ciegas.
/// - El almuerzo se decide con la hora del celular, así funciona aunque no haya señal.
ModoRastreo decidirModo(EstadoJornada? estado, DateTime ahora) {
  if (estado == null || !estado.enJornada) return ModoRastreo.fuera;
  if (enFranja(ahora, estado.almuerzoInicio, estado.almuerzoFin)) return ModoRastreo.almuerzo;
  return ModoRastreo.activo;
}
