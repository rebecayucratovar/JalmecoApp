import 'package:flutter/material.dart';

/// Colores de la marca (tomados del logo de Jalmeco).
class Colores {
  static const marino = Color(0xFF1C1C62); // fondo del logo — color principal
  static const petroleo = Color(0xFF0185B6); // escalones del logo — botones y acentos
  static const petroleoDeshabilitado = Color(0xFFA9D6E8);
  static const fondo = Color(0xFFF1F4F8);
  static const superficie = Colors.white;
  static const texto = Color(0xFF111827);
  static const textoSuave = Color(0xFF6B7280);
  static const borde = Color(0xFFE2E8F0);
  static const error = Color(0xFFDC2626);
  static const aviso = Color(0xFFF97316); // naranja: solo avisos (p. ej. "Puntos por enviar")
}

ThemeData temaApp() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: Colores.marino,
      primary: Colores.marino,
      secondary: Colores.petroleo,
      error: Colores.error,
      surface: Colores.superficie,
    ),
    scaffoldBackgroundColor: Colores.fondo,
  );

  final borde = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: const BorderSide(color: Colores.borde),
  );

  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: Colores.texto, displayColor: Colores.texto),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colores.superficie,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: borde,
      enabledBorder: borde,
      focusedBorder: borde.copyWith(borderSide: const BorderSide(color: Colores.petroleo, width: 1.6)),
      hintStyle: const TextStyle(color: Colores.textoSuave),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Colores.petroleo,
        disabledBackgroundColor: Colores.petroleoDeshabilitado,
        foregroundColor: Colors.white,
        disabledForegroundColor: Colors.white,
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
      ),
    ),
  );
}
