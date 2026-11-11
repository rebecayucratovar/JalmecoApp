import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'pantallas/inicio_pantalla.dart';
import 'pantallas/login_pantalla.dart';
import 'servicios/api.dart';
import 'servicios/dispositivo.dart';
import 'servicios/sesion.dart';
import 'tema.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final sesion = Sesion();
  await sesion.cargar();
  final api = Api(sesion);
  if (sesion.activa) reportarEquipo(api); // cada vez que se abre la app
  runApp(JalmecoGpsApp(api: api));
}

class JalmecoGpsApp extends StatelessWidget {
  const JalmecoGpsApp({super.key, required this.api});

  final Api api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Jalmeco GPS',
      debugShowCheckedModeBanner: false,
      theme: temaApp(),
      locale: const Locale('es'),
      supportedLocales: const [Locale('es')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      // Con sesión → Inicio; sin sesión (o si expiró) → Login
      home: ListenableBuilder(
        listenable: api.sesion,
        builder: (context, _) =>
            api.sesion.activa ? InicioPantalla(api: api) : LoginPantalla(api: api),
      ),
    );
  }
}
