import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../tema.dart';
import '../widgets/marca.dart';

/// [TEMPORAL] Inicio provisional para probar el login. Se reemplaza en el paso "Inicio".
class InicioPantalla extends StatelessWidget {
  const InicioPantalla({super.key, required this.api});

  final Api api;

  Future<void> _cerrarSesion(BuildContext context) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cerrar sesión?'),
        content: const Text('Si estás en jornada, el seguimiento se detendrá y tu supervisor recibirá un aviso.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cerrar sesión')),
        ],
      ),
    );
    if (confirmar != true) return;
    try {
      // Avisar ANTES de borrar el token (el backend solo alerta si hay jornada activa)
      await api.post('mi/seguimiento-detenido', {'motivo': 'cerro_sesion'});
    } on ApiError catch (_) {
      // Sin conexión: igual se cierra la sesión; el panel lo verá como "Sin conexión".
    }
    await api.sesion.cerrar();
  }

  @override
  Widget build(BuildContext context) {
    final t = api.sesion.tecnico ?? const {};
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Marca(),
              const SizedBox(height: 32),
              Text('Hola, ${api.sesion.nombre}',
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('${t['codigo'] ?? ''}  ·  ${t['cargo'] ?? ''}',
                  style: const TextStyle(color: Colores.textoSuave)),
              const Spacer(),
              OutlinedButton.icon(
                onPressed: () => _cerrarSesion(context),
                icon: const Icon(Icons.logout),
                label: const Text('Cerrar sesión'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
