import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../servicios/dispositivo.dart';
import '../tema.dart';
import '../widgets/marca.dart';
import '../widgets/teclado_pin.dart';

/// Login del técnico: usuario (o código JAL-XXXX) + PIN de 6 dígitos.
class LoginPantalla extends StatefulWidget {
  const LoginPantalla({super.key, required this.api});

  final Api api;

  @override
  State<LoginPantalla> createState() => _LoginPantallaState();
}

class _LoginPantallaState extends State<LoginPantalla> {
  static const _largoPin = 6;

  final _usuario = TextEditingController();
  final _focoUsuario = FocusNode();
  String _pin = '';
  bool _cargando = false;
  String? _error;

  bool get _puedeIngresar => !_cargando && _usuario.text.trim().isNotEmpty && _pin.length == _largoPin;

  @override
  void initState() {
    super.initState();
    _usuario.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _usuario.dispose();
    _focoUsuario.dispose();
    super.dispose();
  }

  void _agregarDigito(String d) {
    _focoUsuario.unfocus(); // al usar el teclado del PIN se oculta el del sistema
    if (_pin.length >= _largoPin) return;
    setState(() {
      _pin += d;
      _error = null;
    });
  }

  void _borrar() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _ingresar() async {
    if (!_puedeIngresar) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      await widget.api.login(_usuario.text, _pin);
      // Al tener sesión, la app cambia sola al Inicio. El equipo se reporta en segundo plano.
      reportarEquipo(widget.api);
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.status == 401 ? 'Usuario o PIN incorrecto.' : e.mensaje;
        _pin = '';
        _cargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Marca(subtitulo: 'App para técnicos'),
              const SizedBox(height: 36),
              const Text('Ingresa a tu cuenta', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              const Text('Tu empresa te asignó este usuario y PIN.',
                  style: TextStyle(fontSize: 15, color: Colores.textoSuave)),
              const SizedBox(height: 28),
              const Text('Usuario', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              TextField(
                controller: _usuario,
                focusNode: _focoUsuario,
                enabled: !_cargando,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _focoUsuario.unfocus(),
                decoration: const InputDecoration(
                  hintText: 'Usuario o código (JAL-XXXX)',
                  prefixIcon: Icon(Icons.person_outline, color: Colores.textoSuave),
                ),
              ),
              const SizedBox(height: 24),
              const Text.rich(
                TextSpan(children: [
                  TextSpan(text: 'PIN ', style: TextStyle(fontWeight: FontWeight.w600)),
                  TextSpan(text: '(6 dígitos)', style: TextStyle(color: Colores.textoSuave)),
                ]),
                style: TextStyle(fontSize: 15),
              ),
              const SizedBox(height: 14),
              PuntosPin(cantidad: _pin.length, largo: _largoPin, error: _error != null),
              SizedBox(
                height: 44,
                child: Center(
                  child: _error == null
                      ? null
                      : Text(_error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colores.error, fontSize: 14)),
                ),
              ),
              TecladoPin(alDigito: _agregarDigito, alBorrar: _borrar, habilitado: !_cargando),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: _puedeIngresar ? _ingresar : null,
                child: _cargando
                    ? const SizedBox(
                        width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : const Text('Ingresar'),
              ),
              const SizedBox(height: 14),
              const Center(
                child: Text('¿Olvidaste tu PIN? Pídelo a tu supervisor.',
                    style: TextStyle(fontSize: 13, color: Colores.textoSuave)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
