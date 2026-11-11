import 'package:flutter/material.dart';

import '../modelos/estado_jornada.dart';
import '../servicios/datos.dart';
import '../tema.dart';
import '../utils/formato.dart';

/// Estado del seguimiento. [PARCIAL] Batería, GPS del celular y "Puntos por enviar" se agregan
/// junto con el servicio de rastreo.
class EstadoPantalla extends StatelessWidget {
  const EstadoPantalla({super.key, required this.datos});

  final Datos datos;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: datos,
      builder: (context, _) {
        final e = datos.estado;
        return RefreshIndicator(
          onRefresh: datos.actualizar,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
            children: [
              const Text('Estado', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              const Text('Lo que está pasando con tu seguimiento ahora.',
                  style: TextStyle(fontSize: 15, color: Colores.textoSuave)),
              const SizedBox(height: 20),
              if (e != null) _Cabecera(estado: e),
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(color: Colores.superficie, borderRadius: BorderRadius.circular(20)),
                child: Column(children: [
                  _Fila(
                    icono: datos.enLinea ? Icons.wifi : Icons.wifi_off,
                    titulo: 'Conexión',
                    valor: Text(datos.enLinea ? 'En línea' : 'Sin conexión',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: datos.enLinea ? Colores.exito : Colores.error)),
                  ),
                  const Divider(height: 1, indent: 16, endIndent: 16, color: Colores.borde),
                  _Fila(
                    icono: Icons.sync,
                    titulo: 'Última sincronización',
                    valor: datos.actualizadoEn == null
                        ? const Text('—')
                        : Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                            Text(haceCuanto(datos.actualizadoEn!),
                                style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(diaYHora(datos.actualizadoEn!),
                                style: const TextStyle(fontSize: 13, color: Colores.textoSuave)),
                          ]),
                  ),
                  const Divider(height: 1, indent: 16, endIndent: 16, color: Colores.borde),
                  _Fila(
                    icono: Icons.fingerprint,
                    titulo: 'Última verificación de identidad',
                    valor: _verificacion(e?.ultimaVerificacion),
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: datos.actualizar,
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  backgroundColor: Colores.superficie,
                  side: const BorderSide(color: Colores.borde),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                icon: const Icon(Icons.sync),
                label: const Text('Sincronizar ahora', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _verificacion(UltimaVerificacion? v) {
    if (v == null) return const Text('Ninguna aún', style: TextStyle(color: Colores.textoSuave));
    final (texto, color) = switch (v.resultado) {
      'exito' => ('${diaYHora(v.respondidaEn ?? v.solicitadaEn)} ✓', Colores.exito),
      'no_realizada' => ('${diaYHora(v.solicitadaEn)} · no realizada', Colores.error),
      _ => ('${diaYHora(v.solicitadaEn)} · pendiente', Colores.aviso),
    };
    return Text(texto, textAlign: TextAlign.end, style: TextStyle(fontWeight: FontWeight.w700, color: color));
  }
}

class _Cabecera extends StatelessWidget {
  const _Cabecera({required this.estado});

  final EstadoJornada estado;

  @override
  Widget build(BuildContext context) {
    final (icono, titulo, texto, fondo, color) = switch (estado.fase) {
      FaseJornada.activa => (
          Icons.location_on_outlined,
          'Seguimiento encendido',
          'Se registra tu ubicación al desplazarte, o ${estado.rastreo.intervaloTexto} si estás quieto, '
              'hasta tu salida en Odoo.',
          const Color(0xFFDCFCE7),
          Colores.exito,
        ),
      FaseJornada.almuerzo => (
          Icons.pause,
          'Hora de almuerzo · seguimiento en pausa',
          estado.almuerzoFin != null ? 'Se reanuda a las ${estado.almuerzoFin}.' : 'Se reanuda al terminar el almuerzo.',
          Colores.superficie,
          Colores.marino,
        ),
      FaseJornada.fuera => (
          Icons.location_off_outlined,
          'Seguimiento apagado',
          'Fuera de jornada no se registra tu ubicación.',
          Colores.superficie,
          Colores.textoSuave,
        ),
    };
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: fondo, borderRadius: BorderRadius.circular(20)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(14)),
          child: Icon(icono, color: Colors.white),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(titulo, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color)),
            const SizedBox(height: 4),
            Text(texto, style: const TextStyle(fontSize: 14, height: 1.4)),
          ]),
        ),
      ]),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila({required this.icono, required this.titulo, required this.valor});

  final IconData icono;
  final String titulo;
  final Widget valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(children: [
        Icon(icono, color: Colores.textoSuave),
        const SizedBox(width: 12),
        Expanded(child: Text(titulo, style: const TextStyle(fontSize: 15))),
        const SizedBox(width: 12),
        Flexible(child: Align(alignment: Alignment.centerRight, child: valor)),
      ]),
    );
  }
}
