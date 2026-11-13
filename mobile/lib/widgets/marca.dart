import 'package:flutter/material.dart';

import '../tema.dart';

/// Logo + "Jalmeco GPS" (+ subtítulo opcional). Se usa en Login y en las pantallas de inicio.
class Marca extends StatelessWidget {
  const Marca({super.key, this.subtitulo, this.tamano = 52});

  final String? subtitulo;
  final double tamano;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Image.asset('assets/logo/logo_circulo.png', width: tamano, height: tamano),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text.rich(
              TextSpan(children: [
                TextSpan(text: 'Jalmeco ', style: TextStyle(color: Colores.marino)),
                TextSpan(text: 'GPS', style: TextStyle(color: Colores.petroleo)),
              ]),
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            if (subtitulo != null)
              Text(subtitulo!, style: const TextStyle(fontSize: 14, color: Colores.textoSuave)),
          ],
        ),
      ],
    );
  }
}
