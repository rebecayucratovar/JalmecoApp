import 'dart:async';

import 'package:flutter/material.dart';

import '../grabacion/grabacion_nativa.dart';
import '../tema.dart';
import '../utils/formato.dart';

/// PROTOTIPO · solo en modo desarrollo. Sirve para probar en cada modelo de celular:
/// los 3 permisos, qué fuente de audio capta mejor la voz del cliente, y escuchar el resultado.
/// En la versión final el trabajador NO puede escuchar ni borrar grabaciones.
class GrabacionPruebasPantalla extends StatefulWidget {
  const GrabacionPruebasPantalla({super.key});

  @override
  State<GrabacionPruebasPantalla> createState() => _GrabacionPruebasPantallaState();
}

class _GrabacionPruebasPantallaState extends State<GrabacionPruebasPantalla> with WidgetsBindingObserver {
  EstadoGrabacion? _estado;
  List<Grabacion> _grabaciones = const [];
  List<String> _eventos = const [];
  String? _sonando;
  String? _error;
  Timer? _refresco;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _cargar();
    _refresco = Timer.periodic(const Duration(seconds: 3), (_) => _cargar());
  }

  @override
  void dispose() {
    _refresco?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    GrabacionNativa.detenerReproduccion();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _cargar(); // al volver de Ajustes
  }

  Future<void> _cargar() async {
    try {
      final r = await Future.wait([GrabacionNativa.estado(), GrabacionNativa.listar(), GrabacionNativa.eventos()]);
      if (!mounted) return;
      setState(() {
        _estado = r[0] as EstadoGrabacion;
        _grabaciones = r[1] as List<Grabacion>;
        _eventos = r[2] as List<String>;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _sonar(Grabacion g) async {
    if (_sonando == g.ruta) {
      await GrabacionNativa.detenerReproduccion();
      setState(() => _sonando = null);
      return;
    }
    final ms = await GrabacionNativa.reproducir(g.ruta);
    setState(() => _sonando = g.ruta);
    Future.delayed(Duration(milliseconds: ms + 300), () {
      if (mounted && _sonando == g.ruta) setState(() => _sonando = null);
    });
  }

  Future<void> _pruebaMicrofono() async {
    final ok = await GrabacionNativa.pruebaIniciar();
    if (!ok) {
      await _cargar();
      return;
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Grabando 5 segundos: habla cerca del celular…'), duration: Duration(seconds: 5)));
    }
    await Future.delayed(const Duration(seconds: 5));
    await GrabacionNativa.pruebaDetener();
    await _cargar();
  }

  @override
  Widget build(BuildContext context) {
    final e = _estado;
    return Scaffold(
      appBar: AppBar(title: const Text('Pruebas de grabación'), backgroundColor: Colores.fondo),
      body: e == null
          ? Center(child: Text(_error ?? 'Cargando…'))
          : RefreshIndicator(
              onRefresh: _cargar,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  const _Aviso(),
                  const SizedBox(height: 16),
                  _Caja(titulo: 'Permisos · ${e.pasosListos} de 3 listos', children: [
                    _Paso(
                      numero: 1,
                      titulo: 'Registro de llamadas',
                      texto: 'Para guardar el número y si la llamada fue entrante o saliente.',
                      listo: e.registro,
                      boton: 'Permitir',
                      alTocar: () => GrabacionNativa.pedirPermiso('registro').then((_) => _cargar()),
                    ),
                    _Paso(
                      numero: 2,
                      titulo: 'Micrófono',
                      texto: 'Para grabar el audio de la llamada.',
                      listo: e.microfono,
                      boton: 'Permitir',
                      alTocar: () => GrabacionNativa.pedirPermiso('microfono').then((_) => _cargar()),
                    ),
                    _Paso(
                      numero: 3,
                      titulo: 'Servicio de accesibilidad',
                      texto: 'Ajustes → Accesibilidad → «Grabación de llamadas de trabajo» → Activar.\n'
                          'Si dice «ajuste restringido»: Ajustes → Apps → Jalmeco GPS (dev) → ⋮ → '
                          'Permitir ajustes restringidos.',
                      listo: e.accesibilidad,
                      boton: 'Abrir accesibilidad',
                      alTocar: GrabacionNativa.abrirAccesibilidad,
                      extra: TextButton(
                          onPressed: GrabacionNativa.abrirAjustesApp, child: const Text('Abrir ajustes de la app')),
                    ),
                    _Linea('Servicio conectado', e.servicioConectado ? 'Sí' : 'No', ok: e.servicioConectado),
                  ]),
                  const SizedBox(height: 16),
                  _Caja(titulo: 'Configuración de la prueba', children: [
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Grabar aunque no haya jornada'),
                      subtitle: const Text('Solo para pruebas. En la versión final se graba solo en jornada.'),
                      value: e.ignorarJornada,
                      onChanged: (v) => GrabacionNativa.configurar(ignorarJornada: v).then((_) => _cargar()),
                    ),
                    _Linea('Jornada activa (según la app)', e.enJornada ? 'Sí' : 'No', ok: e.enJornada),
                    const SizedBox(height: 12),
                    const Text('Fuente de audio', style: TextStyle(fontWeight: FontWeight.w600)),
                    const Text('Prueba cada una con una llamada y compara si se escucha al cliente.',
                        style: TextStyle(fontSize: 13, color: Colores.textoSuave)),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final f in e.fuentes.entries)
                        ChoiceChip(
                          label: Text(f.value),
                          selected: e.fuente == f.key,
                          onSelected: (_) => GrabacionNativa.configurar(fuente: f.key).then((_) => _cargar()),
                        ),
                    ]),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: e.microfono && !e.probando ? _pruebaMicrofono : null,
                      icon: const Icon(Icons.mic_none),
                      label: const Text('Probar micrófono (5 s, sin llamada)'),
                    ),
                  ]),
                  const SizedBox(height: 16),
                  _Caja(
                    titulo: 'Grabaciones en el celular (${_grabaciones.length})',
                    children: _grabaciones.isEmpty
                        ? [
                            const Text('Aún no hay grabaciones. Con los 3 permisos listos, haz una llamada '
                                'normal y una de WhatsApp de al menos 15 segundos.'),
                          ]
                        : [for (final g in _grabaciones) _FilaGrabacion(g, sonando: _sonando == g.ruta, alTocar: () => _sonar(g), alBorrar: () => GrabacionNativa.borrar(g.ruta).then((_) => _cargar()))],
                  ),
                  const SizedBox(height: 16),
                  _Caja(titulo: 'Bitácora', children: [
                    if (_eventos.isEmpty) const Text('Sin eventos todavía.'),
                    for (final ev in _eventos.take(60))
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Text(ev, style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
                      ),
                  ]),
                ],
              ),
            ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colores.aviso.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colores.aviso.withValues(alpha: 0.4)),
        ),
        child: const Text(
          'Prototipo de desarrollo. Escuchar y borrar grabaciones existe solo aquí, para probar la calidad '
          'del audio. Graba solo con el consentimiento de las personas en la llamada.',
          style: TextStyle(fontSize: 13, height: 1.4),
        ),
      );
}

class _Caja extends StatelessWidget {
  const _Caja({required this.titulo, required this.children});

  final String titulo;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colores.superficie, borderRadius: BorderRadius.circular(18)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(titulo, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          ...children,
        ]),
      );
}

class _Paso extends StatelessWidget {
  const _Paso({
    required this.numero,
    required this.titulo,
    required this.texto,
    required this.listo,
    required this.boton,
    required this.alTocar,
    this.extra,
  });

  final int numero;
  final String titulo;
  final String texto;
  final bool listo;
  final String boton;
  final VoidCallback alTocar;
  final Widget? extra;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(radius: 13, backgroundColor: Colores.fondo, child: Text('$numero', style: const TextStyle(fontSize: 13))),
            const SizedBox(width: 10),
            Expanded(child: Text(titulo, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
            Icon(listo ? Icons.check_circle : Icons.radio_button_unchecked,
                color: listo ? Colores.exito : Colores.textoSuave, size: 22),
          ]),
          const SizedBox(height: 4),
          Text(texto, style: const TextStyle(fontSize: 13, color: Colores.textoSuave, height: 1.4)),
          if (!listo) ...[
            const SizedBox(height: 8),
            FilledButton(
              onPressed: alTocar,
              style: FilledButton.styleFrom(backgroundColor: Colores.marino, minimumSize: const Size.fromHeight(46)),
              child: Text(boton),
            ),
            if (extra != null) extra!,
          ],
        ]),
      );
}

class _Linea extends StatelessWidget {
  const _Linea(this.titulo, this.valor, {required this.ok});

  final String titulo;
  final String valor;
  final bool ok;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Expanded(child: Text(titulo)),
          Text(valor, style: TextStyle(fontWeight: FontWeight.w700, color: ok ? Colores.exito : Colores.textoSuave)),
        ]),
      );
}

class _FilaGrabacion extends StatelessWidget {
  const _FilaGrabacion(this.g, {required this.sonando, required this.alTocar, required this.alBorrar});

  final Grabacion g;
  final bool sonando;
  final VoidCallback alTocar;
  final VoidCallback alBorrar;

  @override
  Widget build(BuildContext context) {
    final canal = switch (g.canal) {
      'telefono' => 'Teléfono',
      'whatsapp' => 'WhatsApp',
      'prueba' => 'Prueba de micrófono',
      _ => 'Internet (${g.paquete ?? '?'})',
    };
    final detalle = [
      if (g.inicio != null) diaYHora(g.inicio!),
      if (g.duracionS != null) '${g.duracionS} s',
      '${(g.tamano / 1024).round()} KB',
      if (g.direccion != null) g.direccion!,
      if (g.numero != null && g.numero!.isNotEmpty) g.numero!,
      if (g.fuente != null) g.fuente!,
      if (g.incompleta) 'grabando / incompleta',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(children: [
        IconButton.filledTonal(
          onPressed: g.incompleta ? null : alTocar,
          icon: Icon(sonando ? Icons.stop : Icons.play_arrow),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(canal, style: const TextStyle(fontWeight: FontWeight.w600)),
            Text(detalle, style: const TextStyle(fontSize: 12, color: Colores.textoSuave)),
            if (g.sha256 != null)
              Text('SHA-256 ${g.sha256!.substring(0, 12)}…',
                  style: const TextStyle(fontSize: 11, color: Colores.textoSuave, fontFamily: 'monospace')),
          ]),
        ),
        IconButton(onPressed: alBorrar, icon: const Icon(Icons.delete_outline), tooltip: 'Borrar (solo prueba)'),
      ]),
    );
  }
}
