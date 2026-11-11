import 'package:flutter/material.dart';

import '../modelos/estado_jornada.dart';
import '../servicios/datos.dart';
import '../tema.dart';
import '../utils/formato.dart';
import '../widgets/hojas_info.dart';

/// Inicio: estado de la jornada (activa / almuerzo / fuera) y resumen del día.
class InicioPantalla extends StatelessWidget {
  const InicioPantalla({super.key, required this.datos, required this.verEstado});

  final Datos datos;
  final VoidCallback verEstado; // cambia a la pestaña Estado

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: datos,
      builder: (context, _) {
        final e = datos.estado;
        final nombre = datos.perfil?.nombre ?? datos.api.sesion.nombre;
        return RefreshIndicator(
          onRefresh: datos.actualizar,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(fechaLarga(DateTime.now()),
                          style: const TextStyle(fontSize: 15, color: Colores.textoSuave)),
                      const SizedBox(height: 2),
                      Text('Hola, ${primerNombre(nombre)}',
                          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                  Image.asset('assets/logo/logo_circulo.png', width: 44, height: 44),
                ],
              ),
              const SizedBox(height: 14),
              Align(alignment: Alignment.centerLeft, child: ChipConexion(enLinea: datos.enLinea)),
              const SizedBox(height: 18),
              if (e == null)
                _SinDatos(error: datos.error, reintentar: datos.actualizar)
              else ...[
                switch (e.fase) {
                  FaseJornada.activa => _TarjetaActiva(estado: e, verEstado: verEstado),
                  FaseJornada.almuerzo => _TarjetaAlmuerzo(estado: e),
                  FaseJornada.fuera => _TarjetaFuera(horario: datos.perfil?.politicas.horario),
                },
                const SizedBox(height: 18),
                _AvisoPrivacidad(alAbrir: () => mostrarComoSeUsaUbicacion(context, datos.perfil?.politicas)),
                const SizedBox(height: 18),
                _ResumenHoy(estado: e),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// "En línea" / "Sin conexión" (según la última consulta al servidor).
class ChipConexion extends StatelessWidget {
  const ChipConexion({super.key, required this.enLinea});

  final bool enLinea;

  @override
  Widget build(BuildContext context) {
    final color = enLinea ? Colores.exito : Colores.textoSuave;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(enLinea ? Icons.wifi : Icons.wifi_off, size: 18, color: color),
        const SizedBox(width: 6),
        Text(enLinea ? 'En línea' : 'Sin conexión',
            style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class _TarjetaActiva extends StatelessWidget {
  const _TarjetaActiva({required this.estado, required this.verEstado});

  final EstadoJornada estado;
  final VoidCallback verEstado;

  @override
  Widget build(BuildContext context) {
    const blanco = TextStyle(color: Colors.white);
    final suave = TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 15);
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(color: Colores.marino, borderRadius: BorderRadius.circular(24)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const _Punto(color: Color(0xFF22C55E)),
          const SizedBox(width: 8),
          Flexible(child: Text('Seguimiento encendido', style: suave)),
        ]),
        const SizedBox(height: 10),
        const Text('Jornada activa',
            style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w700)),
        Divider(height: 32, color: Colors.white.withValues(alpha: 0.2)),
        if (estado.inicioJornada != null)
          _Linea(
            icono: Icons.check_circle_outline,
            color: Colors.white70,
            texto: Text.rich(TextSpan(style: suave, children: [
              TextSpan(
                  text: 'Ingreso: ${hora(estado.inicioJornada!)}',
                  style: blanco.copyWith(fontWeight: FontWeight.w700)),
              const TextSpan(text: ', registrado en Odoo'),
            ])),
          ),
        if (estado.horario != null) ...[
          const SizedBox(height: 10),
          _Linea(
            icono: Icons.schedule,
            color: Colors.white70,
            texto: Text('Horario de hoy: ${estado.horario}', style: suave),
          ),
        ],
        const SizedBox(height: 18),
        Material(
          color: Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: verEstado,
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(children: [
                Expanded(
                  child: Text('Ver estado del seguimiento',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15)),
                ),
                Icon(Icons.chevron_right, color: Colors.white),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _TarjetaAlmuerzo extends StatelessWidget {
  const _TarjetaAlmuerzo({required this.estado});

  final EstadoJornada estado;

  @override
  Widget build(BuildContext context) {
    final franja = estado.almuerzoInicio != null ? ' (${estado.almuerzoInicio}–${estado.almuerzoFin})' : '';
    return _TarjetaBlanca(children: [
      Row(children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: Colores.fondo, borderRadius: BorderRadius.circular(8)),
          child: const Icon(Icons.pause, size: 16, color: Colores.marino),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text('Seguimiento en pausa$franja',
              style: const TextStyle(color: Colores.textoSuave, fontSize: 15)),
        ),
      ]),
      const SizedBox(height: 10),
      const Text('Hora de almuerzo', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      const Text('No se registra tu ubicación durante el almuerzo.',
          style: TextStyle(fontSize: 15, color: Colores.textoSuave, height: 1.4)),
      if (estado.almuerzoFin != null) ...[
        const Divider(height: 32, color: Colores.borde),
        _Linea(
          icono: Icons.schedule,
          texto: Text.rich(TextSpan(style: const TextStyle(fontSize: 15, color: Colores.textoSuave), children: [
            const TextSpan(text: 'Se reanuda a las '),
            TextSpan(
                text: estado.almuerzoFin,
                style: const TextStyle(color: Colores.texto, fontWeight: FontWeight.w700)),
          ])),
        ),
      ],
    ]);
  }
}

class _TarjetaFuera extends StatelessWidget {
  const _TarjetaFuera({this.horario});

  final String? horario;

  @override
  Widget build(BuildContext context) {
    return _TarjetaBlanca(children: [
      const Row(children: [
        _Punto(color: Color(0xFF9CA3AF)),
        SizedBox(width: 8),
        Flexible(child: Text('Seguimiento apagado', style: TextStyle(color: Colores.textoSuave, fontSize: 15))),
      ]),
      const SizedBox(height: 10),
      const Text('Fuera de jornada', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      const Text(
        'Tu ubicación no se registra. El seguimiento se enciende solo cuando se registra tu ingreso en Odoo.',
        style: TextStyle(fontSize: 15, color: Colores.textoSuave, height: 1.4),
      ),
      if (horario != null) ...[
        const Divider(height: 32, color: Colores.borde),
        _Linea(
          icono: Icons.schedule,
          texto: Text('Horario laboral: $horario',
              style: const TextStyle(fontSize: 15, color: Colores.textoSuave)),
        ),
      ],
    ]);
  }
}

class _AvisoPrivacidad extends StatelessWidget {
  const _AvisoPrivacidad({required this.alAbrir});

  final VoidCallback alAbrir;

  @override
  Widget build(BuildContext context) {
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Padding(
        padding: EdgeInsets.only(top: 2),
        child: Icon(Icons.shield_outlined, size: 22, color: Colores.marino),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text.rich(
            TextSpan(children: [
              TextSpan(text: 'Tu ubicación se comparte '),
              TextSpan(text: 'solo durante tu jornada de trabajo.', style: TextStyle(fontWeight: FontWeight.w700)),
            ]),
            style: TextStyle(fontSize: 15, height: 1.4),
          ),
          InkWell(
            onTap: alAbrir,
            child: const Padding(
              padding: EdgeInsets.symmetric(vertical: 4),
              child: Text('Cómo se usa mi ubicación',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colores.marino,
                      decoration: TextDecoration.underline)),
            ),
          ),
        ]),
      ),
    ]);
  }
}

class _ResumenHoy extends StatelessWidget {
  const _ResumenHoy({required this.estado});

  final EstadoJornada estado;

  @override
  Widget build(BuildContext context) {
    Widget dato(String titulo, String valor) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(titulo, style: const TextStyle(fontSize: 14, color: Colores.textoSuave)),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(valor, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
            ),
          ]),
        );

    return _TarjetaBlanca(children: [
      const Text('Resumen de hoy',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colores.textoSuave)),
      const SizedBox(height: 14),
      IntrinsicHeight(
        child: Row(children: [
          dato('Tiempo en jornada', duracion(estado.tiempoJornadaMin)),
          const VerticalDivider(width: 28, color: Colores.borde),
          dato('Distancia recorrida', kilometros(estado.distanciaKm)),
        ]),
      ),
    ]);
  }
}

class _SinDatos extends StatelessWidget {
  const _SinDatos({this.error, required this.reintentar});

  final String? error;
  final Future<void> Function() reintentar;

  @override
  Widget build(BuildContext context) {
    if (error == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return _TarjetaBlanca(children: [
      const Text('No se pudo cargar tu jornada', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      Text(error!, style: const TextStyle(color: Colores.textoSuave, height: 1.4)),
      const SizedBox(height: 14),
      OutlinedButton(onPressed: reintentar, child: const Text('Reintentar')),
    ]);
  }
}

// ---------- piezas comunes ----------

class _TarjetaBlanca extends StatelessWidget {
  const _TarjetaBlanca({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Colores.superficie,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colores.borde),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }
}

class _Punto extends StatelessWidget {
  const _Punto({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) =>
      Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}

class _Linea extends StatelessWidget {
  const _Linea({required this.icono, required this.texto, this.color = Colores.textoSuave});

  final IconData icono;
  final Widget texto;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Icon(icono, size: 20, color: color),
      const SizedBox(width: 10),
      Expanded(child: texto),
    ]);
  }
}
