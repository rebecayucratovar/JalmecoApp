import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

import '../rastreo/servicio.dart';
import '../servicios/api.dart';
import '../servicios/datos.dart';
import '../tema.dart';
import 'estado_pantalla.dart';
import 'inicio_pantalla.dart';
import 'perfil_pantalla.dart';
import 'verificacion_pantalla.dart';

/// Pantalla principal con la barra inferior: Inicio · Estado · Perfil.
/// Mantiene el sondeo de /mi/estado solo mientras la app está al frente.
class PrincipalPantalla extends StatefulWidget {
  const PrincipalPantalla({super.key, required this.api, this.datos, this.conServicio = true});

  final Api api;
  final Datos? datos; // para pruebas
  final bool conServicio; // false en pruebas (sin Android)

  @override
  State<PrincipalPantalla> createState() => _PrincipalPantallaState();
}

class _PrincipalPantallaState extends State<PrincipalPantalla> with WidgetsBindingObserver {
  late final Datos _datos = widget.datos ?? Datos(widget.api, leerBateria: () => Battery().batteryLevel);
  int _pestana = 0;
  int? _verificacionAbierta; // para abrirla sola una sola vez por solicitud

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _datos.addListener(_revisarVerificacion);
    _datos.iniciar();
    if (widget.conServicio) {
      FlutterForegroundTask.addTaskDataCallback(_datos.recibirDelServicio);
      _asegurarServicio();
    }
  }

  /// Con sesión y permisos listos el seguimiento debe estar corriendo (decide solo si captura).
  Future<void> _asegurarServicio() async {
    await ServicioRastreo.asegurar();
    ServicioRastreo.pedirEstado();
  }

  /// Si llega una verificación de huella nueva, se abre sola (también al tocar la notificación,
  /// que abre la app).
  void _revisarVerificacion() {
    final v = _datos.verificacion;
    if (v == null || v.id == _verificacionAbierta) return;
    _verificacionAbierta = v.id;
    WidgetsBinding.instance.addPostFrameCallback((_) => abrirVerificacion());
  }

  Future<void> abrirVerificacion() async {
    final v = _datos.verificacion;
    if (v == null || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => VerificacionPantalla(datos: _datos, verificacion: v),
    ));
  }

  @override
  void dispose() {
    _datos.removeListener(_revisarVerificacion);
    WidgetsBinding.instance.removeObserver(this);
    if (widget.conServicio) FlutterForegroundTask.removeTaskDataCallback(_datos.recibirDelServicio);
    _datos.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _datos.iniciar();
      if (widget.conServicio) _asegurarServicio();
    } else if (state == AppLifecycleState.paused) {
      _datos.pausar();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: _pestana, children: [
          InicioPantalla(
            datos: _datos,
            verEstado: () => setState(() => _pestana = 1),
            verificar: abrirVerificacion,
          ),
          EstadoPantalla(datos: _datos),
          PerfilPantalla(datos: _datos),
        ]),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _pestana,
        onDestinationSelected: (i) {
          setState(() => _pestana = i);
          if (i == 2 && _datos.perfil == null) _datos.cargarPerfil();
        },
        backgroundColor: Colores.superficie,
        indicatorColor: Colores.petroleo.withValues(alpha: 0.15),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Inicio'),
          NavigationDestination(
              icon: Icon(Icons.monitor_heart_outlined), selectedIcon: Icon(Icons.monitor_heart), label: 'Estado'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Perfil'),
        ],
      ),
    );
  }
}
