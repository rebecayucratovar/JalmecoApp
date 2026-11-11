import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'pantallas/login_pantalla.dart';
import 'pantallas/permisos_pantalla.dart';
import 'pantallas/principal_pantalla.dart';
import 'servicios/api.dart';
import 'servicios/dispositivo.dart';
import 'servicios/permisos.dart';
import 'servicios/sesion.dart';
import 'tema.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final sesion = Sesion();
  await sesion.cargar();
  final api = Api(sesion);
  if (sesion.activa) reportarEquipo(api); // cada vez que se abre la app

  final permisos = Permisos(FuentePermisosAndroid())
    // Si quita la ubicación "todo el tiempo" en Ajustes → aviso al supervisor
    // (el backend solo crea la alerta si hay jornada activa).
    ..alPerderUbicacion = () {
      if (!sesion.activa) return;
      api.post('mi/seguimiento-detenido', {'motivo': 'permiso_revocado'}).catchError((_) => null);
    };

  runApp(JalmecoGpsApp(api: api, permisos: permisos));
}

class JalmecoGpsApp extends StatelessWidget {
  const JalmecoGpsApp({super.key, required this.api, required this.permisos});

  final Api api;
  final Permisos permisos;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Jalmeco GPS',
      debugShowCheckedModeBanner: false,
      theme: temaApp(),
      locale: const Locale('es'),
      supportedLocales: const [Locale('es')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: Raiz(api: api, permisos: permisos),
    );
  }
}

/// Elige la pantalla: sin sesión → Login; faltan permisos → Permisos; si no → Inicio.
class Raiz extends StatefulWidget {
  const Raiz({super.key, required this.api, required this.permisos});

  final Api api;
  final Permisos permisos;

  @override
  State<Raiz> createState() => _RaizState();
}

class _RaizState extends State<Raiz> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.permisos.revisar();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Al volver de Ajustes (o de cualquier otra app) los permisos pueden haber cambiado.
    if (state == AppLifecycleState.resumed) widget.permisos.revisar();
  }

  @override
  Widget build(BuildContext context) {
    final api = widget.api;
    final permisos = widget.permisos;
    return ListenableBuilder(
      listenable: Listenable.merge([api.sesion, permisos]),
      builder: (context, _) {
        if (!api.sesion.activa) return LoginPantalla(api: api);
        if (permisos.estado == null) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (permisos.mostrarPantalla) return PermisosPantalla(permisos: permisos);
        return PrincipalPantalla(api: api);
      },
    );
  }
}
