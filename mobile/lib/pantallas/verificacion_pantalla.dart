import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:local_auth/error_codes.dart' as codigos;
import 'package:local_auth/local_auth.dart';

import '../servicios/api.dart';
import '../servicios/aviso_verificacion.dart';
import '../servicios/datos.dart';
import '../tema.dart';

enum ResultadoHuella { ok, fallo, sinHuella, bloqueada }

/// Pide la huella SOLO con biometría (no acepta el PIN o patrón del celular: si no, cualquiera
/// que lo sepa podría confirmar en lugar del técnico).
Future<ResultadoHuella> pedirHuella() async {
  final auth = LocalAuthentication();
  try {
    if (!await auth.canCheckBiometrics || (await auth.getAvailableBiometrics()).isEmpty) {
      return ResultadoHuella.sinHuella;
    }
    final ok = await auth.authenticate(
      localizedReason: 'Confirma tu identidad para Jalmeco GPS',
      options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
    );
    return ok ? ResultadoHuella.ok : ResultadoHuella.fallo;
  } on PlatformException catch (e) {
    return switch (e.code) {
      codigos.notEnrolled || codigos.notAvailable || codigos.passcodeNotSet => ResultadoHuella.sinHuella,
      codigos.lockedOut || codigos.permanentlyLockedOut => ResultadoHuella.bloqueada,
      _ => ResultadoHuella.fallo,
    };
  }
}

/// Dónde estaba al confirmar (rápido: la última posición conocida; null si no hay).
Future<Position?> _posicion() async {
  try {
    return await Geolocator.getLastKnownPosition().timeout(const Duration(seconds: 3));
  } catch (_) {
    return null;
  }
}

enum _Fase { esperando, enviando, exito, noRealizada }

/// "Verificación de identidad": cuenta regresiva + huella.
class VerificacionPantalla extends StatefulWidget {
  const VerificacionPantalla({
    super.key,
    required this.datos,
    required this.verificacion,
    this.huella = pedirHuella,
    this.posicion = _posicion,
  });

  final Datos datos;
  final VerificacionPendiente verificacion;
  final Future<ResultadoHuella> Function() huella;
  final Future<Position?> Function() posicion;

  @override
  State<VerificacionPantalla> createState() => _VerificacionPantallaState();
}

class _VerificacionPantallaState extends State<VerificacionPantalla> {
  late final Timer _reloj;
  late Duration _restante;
  late final Duration _total;
  _Fase _fase = _Fase.esperando;
  String? _mensaje;
  bool _sinHuella = false;
  bool _pidiendo = false;

  Api get _api => widget.datos.api;

  @override
  void initState() {
    super.initState();
    _restante = _calcularRestante();
    final tres = const Duration(minutes: 3);
    _total = _restante > tres ? _restante : tres;
    _reloj = Timer.periodic(const Duration(seconds: 1), (_) => _tic());
    // Al abrir se pide la huella de inmediato.
    WidgetsBinding.instance.addPostFrameCallback((_) => _verificar());
  }

  Duration _calcularRestante() {
    final r = widget.verificacion.venceEn.difference(DateTime.now());
    return r.isNegative ? Duration.zero : r;
  }

  void _tic() {
    if (!mounted || _fase != _Fase.esperando) return;
    // Resta un segundo por tic; si la app estuvo en segundo plano (los timers se pausan) el
    // reloj real dice que queda menos y se toma ese valor.
    final porTic = _restante - const Duration(seconds: 1);
    final real = _calcularRestante();
    final nuevo = real < porTic ? real : porTic;
    setState(() => _restante = nuevo.isNegative ? Duration.zero : nuevo);
    if (_restante == Duration.zero) _terminar(_Fase.noRealizada);
  }

  @override
  void dispose() {
    _reloj.cancel();
    super.dispose();
  }

  Future<void> _verificar() async {
    if (_pidiendo || _fase != _Fase.esperando || _sinHuella) return;
    _pidiendo = true;
    try {
      final r = await widget.huella();
      if (!mounted || _fase != _Fase.esperando) return;
      switch (r) {
        case ResultadoHuella.ok:
          await _enviar();
        case ResultadoHuella.fallo:
          setState(() => _mensaje = 'No se confirmó la huella. Toca el ícono para intentarlo de nuevo.');
        case ResultadoHuella.bloqueada:
          setState(() => _mensaje =
              'Demasiados intentos: el sensor está bloqueado. Espera unos segundos y vuelve a intentarlo.');
        case ResultadoHuella.sinHuella:
          setState(() {
            _sinHuella = true;
            _mensaje = 'Este celular no tiene una huella registrada. Comunícate con tu supervisor.';
          });
      }
    } finally {
      _pidiendo = false;
    }
  }

  Future<void> _enviar() async {
    setState(() {
      _fase = _Fase.enviando;
      _mensaje = null;
    });
    final pos = await widget.posicion();
    try {
      await _api.post('mi/verificaciones/${widget.verificacion.id}/responder', {
        'resultado': 'exito',
        if (pos != null) 'lat': pos.latitude,
        if (pos != null) 'lng': pos.longitude,
      });
      _terminar(_Fase.exito);
    } on ApiError catch (e) {
      if (!mounted) return;
      if (e.codigo == 'YA_RESPONDIDA') return _terminar(_Fase.exito);
      if (e.codigo == 'VERIFICACION_VENCIDA') return _terminar(_Fase.noRealizada);
      // Sin señal u otro error: puede reintentar mientras quede tiempo.
      setState(() {
        _fase = _Fase.esperando;
        _mensaje = e.sinConexion
            ? 'Tu huella se confirmó, pero no hay conexión para enviarla. Toca el ícono para reintentar.'
            : e.mensaje;
      });
    }
  }

  void _terminar(_Fase fase) {
    if (!mounted) return;
    setState(() => _fase = fase);
    AvisoVerificacion.quitar();
    widget.datos.verificacionTerminada();
    widget.datos.actualizar();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: true,
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
            child: switch (_fase) {
              _Fase.exito => _Resultado(
                  icono: Icons.verified_user_outlined,
                  color: Colores.exito,
                  titulo: 'Identidad confirmada',
                  subtitulo: 'Gracias',
                  texto: 'Tu jornada sigue normalmente.',
                  alCerrar: () => Navigator.of(context).maybePop(),
                ),
              _Fase.noRealizada => _Resultado(
                  icono: Icons.gpp_maybe_outlined,
                  color: Colores.error,
                  titulo: 'Verificación no realizada',
                  subtitulo: 'Se avisó a tu supervisor',
                  texto: 'Si tuviste un problema con el celular, comunícate con tu supervisor. '
                      'Tu jornada sigue activa.',
                  alCerrar: () => Navigator.of(context).maybePop(),
                ),
              _ => _esperando(),
            },
          ),
        ),
      ),
    );
  }

  Widget _esperando() {
    final enviando = _fase == _Fase.enviando;
    final seg = _restante.inSeconds;
    final reloj = '${seg ~/ 60}:${(seg % 60).toString().padLeft(2, '0')}';
    final urgente = seg <= 30;
    return Column(children: [
      const Text('Verificación de identidad',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colores.textoSuave)),
      const Spacer(),
      Semantics(
        button: true,
        label: 'Verificar con huella',
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: enviando ? null : _verificar,
          child: Container(
            width: 160,
            height: 160,
            decoration: BoxDecoration(color: Colores.petroleo.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: enviando
                ? const Padding(padding: EdgeInsets.all(56), child: CircularProgressIndicator(strokeWidth: 3))
                : const Icon(Icons.fingerprint, size: 88, color: Colores.marino),
          ),
        ),
      ),
      const SizedBox(height: 28),
      const Text(
        'Confirma que eres tú tocando el sensor de huella del celular',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, height: 1.3),
      ),
      const SizedBox(height: 8),
      const Text('Tu huella no sale del celular.', style: TextStyle(fontSize: 15, color: Colores.textoSuave)),
      if (_mensaje != null) ...[
        const SizedBox(height: 16),
        Text(_mensaje!,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: _sinHuella ? Colores.error : Colores.texto, height: 1.4)),
      ],
      const Spacer(),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colores.superficie, borderRadius: BorderRadius.circular(16)),
        child: Column(children: [
          Row(children: [
            Expanded(
              child: Text('Tienes ${_total.inMinutes} minutos para confirmar',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            ),
            Text(reloj,
                style: TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w700, color: urgente ? Colores.error : Colores.texto)),
          ]),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: _total.inSeconds == 0 ? 0 : seg / _total.inSeconds,
              minHeight: 8,
              color: urgente ? Colores.error : Colores.petroleo,
              backgroundColor: Colores.borde,
            ),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: enviando ? null : () => Navigator.of(context).maybePop(),
        child: const Text('Hacerlo en un momento', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
    ]);
  }
}

class _Resultado extends StatelessWidget {
  const _Resultado({
    required this.icono,
    required this.color,
    required this.titulo,
    required this.subtitulo,
    required this.texto,
    required this.alCerrar,
  });

  final IconData icono;
  final Color color;
  final String titulo;
  final String subtitulo;
  final String texto;
  final VoidCallback alCerrar;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const Text('Verificación de identidad',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colores.textoSuave)),
      const Spacer(),
      Container(
        width: 128,
        height: 128,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
        child: Icon(icono, size: 64, color: color),
      ),
      const SizedBox(height: 28),
      Text(titulo, textAlign: TextAlign.center, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: color)),
      const SizedBox(height: 6),
      Text(subtitulo, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: color)),
      const SizedBox(height: 12),
      Text(texto,
          textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, color: Colores.textoSuave, height: 1.45)),
      const Spacer(),
      FilledButton(
        onPressed: alCerrar,
        style: FilledButton.styleFrom(backgroundColor: Colores.marino),
        child: const Text('Entendido'),
      ),
    ]);
  }
}
