import 'package:flutter/material.dart';

import '../servicios/permisos.dart';
import '../tema.dart';
import '../widgets/marca.dart';

/// "Antes de empezar": ubicación (2 pasos), notificaciones y batería.
class PermisosPantalla extends StatefulWidget {
  const PermisosPantalla({super.key, required this.permisos});

  final Permisos permisos;

  @override
  State<PermisosPantalla> createState() => _PermisosPantallaState();
}

class _PermisosPantallaState extends State<PermisosPantalla> {
  bool _ocupado = false; // evita abrir dos ventanas de permiso a la vez

  Future<void> _hacer(Future<void> Function() accion) async {
    if (_ocupado) return;
    setState(() => _ocupado = true);
    try {
      await accion();
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.permisos;
    return ListenableBuilder(
      listenable: p,
      builder: (context, _) {
        final e = p.estado!;
        return Scaffold(
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Marca(tamano: 44),
                        const SizedBox(height: 28),
                        const Text('Antes de empezar',
                            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        const Text(
                          'La app necesita estos permisos para funcionar durante tu jornada. '
                          'Fuera de tu horario no se registra nada.',
                          style: TextStyle(fontSize: 15, color: Colores.textoSuave, height: 1.4),
                        ),
                        const SizedBox(height: 20),
                        Container(
                          decoration: BoxDecoration(
                            color: Colores.superficie,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 18),
                          child: Column(children: [
                            _ubicacion(e),
                            const Divider(height: 1, color: Colores.borde),
                            _notificaciones(e),
                            const Divider(height: 1, color: Colores.borde),
                            _bateria(e, p),
                          ]),
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
                  child: Column(children: [
                    FilledButton(
                      onPressed: e.listos ? p.aceptar : null,
                      child: const Text('Continuar'),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      e.listos
                          ? 'Puedes revisar estos permisos en los Ajustes del celular.'
                          : 'Activa la ubicación y las notificaciones para continuar.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13, color: Colores.textoSuave),
                    ),
                  ]),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _ubicacion(EstadoPermisos e) {
    final p = widget.permisos;
    return _Tarjeta(
      icono: Icons.location_on_outlined,
      titulo: 'Ubicación',
      descripcion: 'Para registrar tu recorrido aunque el celular esté bloqueado o uses otra app. '
          'Solo durante tu jornada.',
      concedido: e.ubicacion == EstadoUbicacion.siempre ? 'Permitida todo el tiempo' : null,
      instruccion: switch (e.ubicacion) {
        EstadoUbicacion.pendiente => 'Paso 1 de 2: cuando el celular pregunte, elige «Mientras se usa la app».',
        EstadoUbicacion.soloEnUso => 'Paso 2 de 2: en Ajustes, elige «Permitir todo el tiempo» y vuelve a la app.',
        EstadoUbicacion.bloqueado =>
          'El permiso está bloqueado. En Ajustes → Permisos → Ubicación, elige «Permitir todo el tiempo».',
        EstadoUbicacion.siempre => null,
      },
      boton: switch (e.ubicacion) {
        EstadoUbicacion.pendiente => 'Activar',
        EstadoUbicacion.soloEnUso || EstadoUbicacion.bloqueado => 'Abrir ajustes',
        EstadoUbicacion.siempre => null,
      },
      alPresionar: _ocupado
          ? null
          : () => _hacer(switch (e.ubicacion) {
                EstadoUbicacion.pendiente => p.pedirUbicacion,
                EstadoUbicacion.soloEnUso => p.pedirUbicacionSiempre,
                _ => p.abrirAjustes,
              }),
    );
  }

  Widget _notificaciones(EstadoPermisos e) {
    final p = widget.permisos;
    return _Tarjeta(
      icono: Icons.notifications_none,
      titulo: 'Notificaciones',
      descripcion: 'Para avisarte cuando debas confirmar tu identidad o si el seguimiento se detiene.',
      concedido: e.notificaciones ? 'Permitidas' : null,
      instruccion: e.notificacionesBloqueadas
          ? 'Están bloqueadas. Actívalas en Ajustes → Notificaciones.'
          : 'Cuando el celular pregunte, elige «Permitir».',
      boton: e.notificacionesBloqueadas ? 'Abrir ajustes' : 'Activar',
      alPresionar: _ocupado ? null : () => _hacer(p.pedirNotificaciones),
    );
  }

  Widget _bateria(EstadoPermisos e, Permisos p) {
    final esHuawei = p.fabricante.contains('huawei') || p.fabricante.contains('honor');
    final extra = !p.fabricanteAgresivo
        ? null
        : esHuawei
            ? 'En Huawei también: Ajustes → Batería → Inicio de aplicaciones → Jalmeco GPS → '
                'desactiva «Gestionar automáticamente» y deja las 3 opciones encendidas.'
            : 'En este celular revisa también el ahorro de batería de la marca y elige '
                '«Sin restricciones» para Jalmeco GPS.';
    return _Tarjeta(
      icono: Icons.battery_charging_full_outlined,
      titulo: 'Batería',
      etiqueta: 'Recomendado',
      descripcion: 'Para que el ahorro de batería no detenga el seguimiento durante tu jornada. '
          'No cambia cuándo se registra tu ubicación.',
      concedido: e.bateria ? 'Sin restricciones' : null,
      instruccion: 'Cuando el celular pregunte, elige «Permitir».',
      boton: 'Activar',
      alPresionar: _ocupado ? null : () => _hacer(p.pedirBateria),
      nota: extra,
    );
  }
}

class _Tarjeta extends StatelessWidget {
  const _Tarjeta({
    required this.icono,
    required this.titulo,
    required this.descripcion,
    this.concedido,
    this.instruccion,
    this.boton,
    this.alPresionar,
    this.etiqueta,
    this.nota,
  });

  final IconData icono;
  final String titulo;
  final String descripcion;
  final String? concedido; // texto en verde cuando ya está concedido
  final String? instruccion;
  final String? boton;
  final VoidCallback? alPresionar;
  final String? etiqueta;
  final String? nota; // indicación extra (siempre visible)

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: Colores.fondo, borderRadius: BorderRadius.circular(12)),
            child: Icon(icono, color: Colores.marino),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(titulo, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                  if (etiqueta != null) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colores.petroleo.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(etiqueta!,
                          style: const TextStyle(fontSize: 12, color: Colores.petroleo, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ]),
                const SizedBox(height: 4),
                Text(descripcion, style: const TextStyle(fontSize: 14, color: Colores.textoSuave, height: 1.4)),
                const SizedBox(height: 12),
                if (concedido != null)
                  Row(children: [
                    const Icon(Icons.check_circle_outline, color: Colores.exito, size: 20),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(concedido!,
                          style: const TextStyle(color: Colores.exito, fontWeight: FontWeight.w600)),
                    ),
                  ])
                else ...[
                  if (instruccion != null)
                    Text(instruccion!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, height: 1.4)),
                  if (boton != null) ...[
                    const SizedBox(height: 10),
                    FilledButton(
                      onPressed: alPresionar,
                      style: FilledButton.styleFrom(
                        backgroundColor: Colores.marino,
                        minimumSize: const Size(0, 44),
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: Text(boton!),
                    ),
                  ],
                ],
                if (nota != null) ...[
                  const SizedBox(height: 10),
                  Text(nota!, style: const TextStyle(fontSize: 13, color: Colores.textoSuave, height: 1.4)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
