import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../servicios/datos.dart';
import '../tema.dart';
import '../widgets/hojas_info.dart';

/// Perfil: datos del técnico, celular asignado, información y cerrar sesión.
class PerfilPantalla extends StatelessWidget {
  const PerfilPantalla({super.key, required this.datos});

  final Datos datos;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: datos,
      builder: (context, _) {
        final p = datos.perfil;
        final t = datos.api.sesion.tecnico ?? const {};
        final nombre = p?.nombre ?? (t['nombre'] as String? ?? '');
        final cargo = p?.cargo ?? t['cargo'] as String?;
        final codigo = p?.codigo ?? t['codigo'] as String?;

        return RefreshIndicator(
          onRefresh: datos.cargarPerfil,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
            children: [
              const Text('Perfil', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
              const SizedBox(height: 20),
              Center(child: _Avatar(nombre: nombre, fotoUrl: p?.fotoUrl)),
              const SizedBox(height: 14),
              Text(nombre,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              if (cargo != null) ...[
                const SizedBox(height: 4),
                Text(cargo, textAlign: TextAlign.center, style: const TextStyle(color: Colores.textoSuave, fontSize: 15)),
              ],
              if (codigo != null) ...[
                const SizedBox(height: 10),
                Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(color: Colores.borde, borderRadius: BorderRadius.circular(20)),
                    child: Text('Código $codigo', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  ),
                ),
              ],
              const SizedBox(height: 28),
              const _Titulo('Celular asignado'),
              _Caja(children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(color: Colores.fondo, borderRadius: BorderRadius.circular(12)),
                      child: const Icon(Icons.smartphone, color: Colores.marino),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(p?.celularModelo ?? 'Sin asignar',
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                        if (p?.celularNumero != null)
                          Text(p!.celularNumero!, style: const TextStyle(fontSize: 15, color: Colores.textoSuave)),
                        if (p?.equipoModelo != null)
                          Text('Equipo de la empresa · ${p!.equipoModelo}',
                              style: const TextStyle(fontSize: 13, color: Colores.textoSuave)),
                      ]),
                    ),
                  ]),
                ),
              ]),
              const SizedBox(height: 24),
              const _Titulo('Información y privacidad'),
              _Caja(children: [
                _Opcion(
                  icono: Icons.description_outlined,
                  texto: 'Política de uso del celular',
                  alTocar: () => mostrarPoliticaUso(context),
                ),
                const Divider(height: 1, indent: 16, endIndent: 16, color: Colores.borde),
                _Opcion(
                  icono: Icons.shield_outlined,
                  texto: 'Cómo se usa mi ubicación',
                  alTocar: () => mostrarComoSeUsaUbicacion(context, p?.politicas),
                ),
              ]),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: () => _confirmarCierre(context, datos.api),
                style: FilledButton.styleFrom(
                  backgroundColor: Colores.error.withValues(alpha: 0.1),
                  foregroundColor: Colores.error,
                ),
                icon: const Icon(Icons.logout),
                label: const Text('Cerrar sesión'),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Confirma y cierra sesión. Si hay jornada activa, el backend avisa al supervisor.
Future<void> _confirmarCierre(BuildContext context, Api api) async {
  final confirmar = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colores.superficie,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('¿Cerrar sesión?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          const Text(
            'Si estás en jornada, el seguimiento se detendrá y tu supervisor recibirá un aviso. '
            'Para volver a entrar necesitarás tu usuario y PIN.',
            style: TextStyle(color: Colores.textoSuave, height: 1.4, fontSize: 15),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colores.error),
            child: const Text('Cerrar sesión'),
          ),
          const SizedBox(height: 8),
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
        ]),
      ),
    ),
  );
  if (confirmar != true) return;
  try {
    // Avisar ANTES de borrar el token (en jornada: alerta crítica; fuera: advertencia,
    // porque sin sesión no se registrará su próxima jornada)
    await api.post('mi/seguimiento-detenido', {'motivo': 'cerro_sesion'});
  } on ApiError catch (_) {
    // Sin conexión: igual se cierra; el panel lo verá como "Sin conexión".
  }
  await api.sesion.cerrar();
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.nombre, this.fotoUrl});

  final String nombre;
  final String? fotoUrl;

  @override
  Widget build(BuildContext context) {
    final iniciales = nombre
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
    return Container(
      width: 104,
      height: 104,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colores.marino,
        border: Border.all(color: Colores.superficie, width: 4),
        image: fotoUrl == null ? null : DecorationImage(image: NetworkImage(fotoUrl!), fit: BoxFit.cover),
      ),
      alignment: Alignment.center,
      child: fotoUrl == null
          ? Text(iniciales, style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w700))
          : null,
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(texto, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Colores.textoSuave)),
      );
}

class _Caja extends StatelessWidget {
  const _Caja({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(color: Colores.superficie, borderRadius: BorderRadius.circular(20)),
        clipBehavior: Clip.antiAlias,
        child: Column(children: children),
      );
}

class _Opcion extends StatelessWidget {
  const _Opcion({required this.icono, required this.texto, required this.alTocar});

  final IconData icono;
  final String texto;
  final VoidCallback alTocar;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icono, color: Colores.marino),
        title: Text(texto, style: const TextStyle(fontSize: 16)),
        trailing: const Icon(Icons.chevron_right, color: Colores.textoSuave),
        onTap: alTocar,
      );
}
