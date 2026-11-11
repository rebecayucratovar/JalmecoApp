import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../tema.dart';

/// Puntos que muestran cuántos dígitos del PIN se ingresaron (nunca los dígitos).
class PuntosPin extends StatelessWidget {
  const PuntosPin({super.key, required this.cantidad, this.largo = 6, this.error = false});

  final int cantidad;
  final int largo;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error ? Colores.error : Colores.marino;
    return Semantics(
      label: 'PIN: $cantidad de $largo dígitos',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(largo, (i) {
          final lleno = i < cantidad;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            margin: const EdgeInsets.symmetric(horizontal: 6),
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: lleno ? color : Colors.transparent,
              border: Border.all(color: lleno ? color : Colores.borde, width: 1.6),
            ),
          );
        }),
      ),
    );
  }
}

/// Teclado numérico propio (0–9 y borrar), como en el mockup.
class TecladoPin extends StatelessWidget {
  const TecladoPin({super.key, required this.alDigito, required this.alBorrar, this.habilitado = true});

  final ValueChanged<String> alDigito;
  final VoidCallback alBorrar;
  final bool habilitado;

  @override
  Widget build(BuildContext context) {
    Widget fila(List<Widget> teclas) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [
            for (var i = 0; i < teclas.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(child: teclas[i]),
            ],
          ]),
        );

    Widget digito(String d) => _Tecla(
          habilitado: habilitado,
          alPresionar: () => alDigito(d),
          semantica: d,
          child: Text(d, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w500)),
        );

    return Column(children: [
      fila([digito('1'), digito('2'), digito('3')]),
      fila([digito('4'), digito('5'), digito('6')]),
      fila([digito('7'), digito('8'), digito('9')]),
      fila([
        const SizedBox(),
        digito('0'),
        _Tecla(
          habilitado: habilitado,
          alPresionar: alBorrar,
          semantica: 'Borrar',
          fondo: false,
          child: const Icon(Icons.backspace_outlined, color: Colores.textoSuave),
        ),
      ]),
    ]);
  }
}

class _Tecla extends StatelessWidget {
  const _Tecla({
    required this.child,
    required this.alPresionar,
    required this.semantica,
    this.habilitado = true,
    this.fondo = true,
  });

  final Widget child;
  final VoidCallback alPresionar;
  final String semantica;
  final bool habilitado;
  final bool fondo;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantica,
      child: Material(
        color: fondo ? Colores.superficie : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: habilitado
              ? () {
                  HapticFeedback.selectionClick();
                  alPresionar();
                }
              : null,
          child: SizedBox(height: 60, child: Center(child: child)),
        ),
      ),
    );
  }
}
