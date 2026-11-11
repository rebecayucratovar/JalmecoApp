import 'package:flutter/material.dart';

import '../modelos/perfil.dart';
import '../tema.dart';

/// Hoja inferior con título, recuadro destacado y secciones de texto.
Future<void> _mostrarHoja(
  BuildContext context, {
  required String titulo,
  required String destacado,
  required List<(String, String)> secciones,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colores.superficie,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (ctx, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: Colores.borde, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: Text(titulo, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700))),
            IconButton(
              onPressed: () => Navigator.pop(ctx),
              icon: const Icon(Icons.close),
              tooltip: 'Cerrar',
            ),
          ]),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colores.petroleo.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(destacado, style: const TextStyle(fontSize: 15, height: 1.45)),
          ),
          for (final (t, texto) in secciones) ...[
            const SizedBox(height: 20),
            Text(t, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(texto, style: const TextStyle(fontSize: 15, color: Colores.textoSuave, height: 1.45)),
          ],
        ],
      ),
    ),
  );
}

/// "Cómo se usa mi ubicación". Usa las políticas reales (captura, almuerzo, retención).
Future<void> mostrarComoSeUsaUbicacion(BuildContext context, Politicas? p) {
  final distancia = p?.rastreo.distanciaM ?? 25;
  final intervalo = p?.rastreo.intervaloTexto ?? 'cada 2 minutos';
  final almuerzo = (p?.almuerzoInicio != null && p?.almuerzoFin != null)
      ? 'Durante el almuerzo (${p!.almuerzoInicio}–${p.almuerzoFin}) no se registra tu ubicación'
      : 'Durante el almuerzo no se registra tu ubicación';
  final meses = p?.retencionMeses ?? 12;

  return _mostrarHoja(
    context,
    titulo: 'Cómo se usa mi ubicación',
    destacado: 'Tu ubicación se comparte solo durante tu jornada de trabajo. '
        'Al registrar tu salida, el seguimiento se apaga solo.',
    secciones: [
      (
        'Qué se registra',
        'Tu ubicación cuando te desplazas (aprox. cada $distancia m) o $intervalo si estás quieto, '
            'la distancia recorrida y el nivel de batería del celular. Nada más: no accedemos a tus '
            'fotos, mensajes ni llamadas.'
      ),
      (
        'Cuándo se registra',
        'Solo desde que se registra tu ingreso en Odoo hasta tu salida. $almuerzo, y fuera de tu '
            'jornada el seguimiento se apaga automáticamente.'
      ),
      (
        'Verificación con huella',
        'A veces te pediremos confirmar tu identidad con tu huella, solo para verificar que el equipo '
            'está contigo. Tu huella nunca sale del celular: a nosotros solo nos llega si fue '
            'confirmada o no.'
      ),
      (
        'Quién lo ve',
        'Tu supervisor y el área de operaciones, para organizar el trabajo en campo y apoyarte si '
            'tienes un problema en ruta.'
      ),
      (
        'Cuánto tiempo se guarda',
        'Los recorridos se guardan $meses meses y luego se eliminan de forma permanente.'
      ),
      (
        'Tus derechos',
        'Puedes pedir una copia de tus datos o hacer consultas a Recursos Humanos.'
      ),
    ],
  );
}

/// "Política de uso del celular".
Future<void> mostrarPoliticaUso(BuildContext context) {
  return _mostrarHoja(
    context,
    titulo: 'Política de uso del celular',
    destacado: 'Estas reglas cuidan el equipo y tu información. Léelas una vez; puedes volver aquí '
        'cuando quieras.',
    secciones: const [
      (
        'Equipo de la empresa',
        'El celular asignado es propiedad de Jalmeco y está destinado al trabajo de campo.'
      ),
      (
        'Durante tu jornada',
        'Mantén esta app abierta en segundo plano y la ubicación activada. No la desinstales ni '
            'actives el modo avión durante la jornada.'
      ),
      (
        'Cuidado y carga',
        'Carga el celular al terminar el día para empezar la siguiente jornada con batería completa.'
      ),
      (
        'Pérdida o robo',
        'Avisa de inmediato a tu supervisor para bloquear el equipo y proteger la información.'
      ),
      (
        'Fuera de jornada',
        'Se permite un uso personal moderado. La app no registra tu ubicación en ese tiempo.'
      ),
    ],
  );
}
