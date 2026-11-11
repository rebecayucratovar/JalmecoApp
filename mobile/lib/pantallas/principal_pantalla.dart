import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../servicios/datos.dart';
import '../tema.dart';
import 'estado_pantalla.dart';
import 'inicio_pantalla.dart';
import 'perfil_pantalla.dart';

/// Pantalla principal con la barra inferior: Inicio · Estado · Perfil.
/// Mantiene el sondeo de /mi/estado solo mientras la app está al frente.
class PrincipalPantalla extends StatefulWidget {
  const PrincipalPantalla({super.key, required this.api, this.datos});

  final Api api;
  final Datos? datos; // para pruebas

  @override
  State<PrincipalPantalla> createState() => _PrincipalPantallaState();
}

class _PrincipalPantallaState extends State<PrincipalPantalla> with WidgetsBindingObserver {
  late final Datos _datos = widget.datos ?? Datos(widget.api);
  int _pestana = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _datos.iniciar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _datos.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _datos.iniciar();
    } else if (state == AppLifecycleState.paused) {
      _datos.pausar();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: _pestana, children: [
          InicioPantalla(datos: _datos, verEstado: () => setState(() => _pestana = 1)),
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
