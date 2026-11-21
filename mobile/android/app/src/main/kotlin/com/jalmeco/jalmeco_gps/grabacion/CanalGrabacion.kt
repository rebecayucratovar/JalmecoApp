package com.jalmeco.jalmeco_gps.grabacion

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.net.Uri
import android.provider.Settings
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import java.io.File

/**
 * Puente Flutter ↔ módulo nativo de grabación ("jalmeco/grabacion").
 * Escuchar y borrar grabaciones es SOLO para el prototipo (la pantalla de pruebas existe solo en
 * modo desarrollo); en la versión final el trabajador no puede escucharlas ni borrarlas.
 */
class CanalGrabacion(private val activity: Activity) : MethodChannel.MethodCallHandler {
    private var reproductor: MediaPlayer? = null
    private var prueba: Grabador? = null

    fun registrar(messenger: BinaryMessenger) {
        MethodChannel(messenger, "jalmeco/grabacion").setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val ctx = activity.applicationContext
        try {
            when (call.method) {
                "estado" -> result.success(mapOf(
                    "microfono" to concedido(Manifest.permission.RECORD_AUDIO),
                    "registro" to concedido(Manifest.permission.READ_CALL_LOG),
                    "accesibilidad" to accesibilidadActiva(),
                    "servicioConectado" to ServicioGrabacion.conectado,
                    "enJornada" to Ajustes.enJornada(ctx),
                    "ignorarJornada" to Ajustes.ignorarJornada(ctx),
                    "fuente" to Ajustes.fuente(ctx),
                    "fuentes" to Ajustes.FUENTES.map { (k, v) -> mapOf("id" to k, "nombre" to v) },
                    "probando" to (prueba?.grabando == true),
                ))
                "pedirPermiso" -> {
                    val permiso = when (call.argument<String>("permiso")) {
                        "microfono" -> Manifest.permission.RECORD_AUDIO
                        "registro" -> Manifest.permission.READ_CALL_LOG
                        else -> null
                    }
                    if (permiso != null) activity.requestPermissions(arrayOf(permiso), 4711)
                    result.success(null)
                }
                "abrirAccesibilidad" -> {
                    activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    result.success(null)
                }
                "abrirAjustesApp" -> {
                    activity.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
                    )
                    result.success(null)
                }
                "configurar" -> {
                    call.argument<Boolean>("enJornada")?.let { Ajustes.setEnJornada(ctx, it) }
                    call.argument<Boolean>("ignorarJornada")?.let { Ajustes.setIgnorarJornada(ctx, it) }
                    call.argument<Int>("fuente")?.let { Ajustes.setFuente(ctx, it) }
                    result.success(null)
                }
                "listar" -> result.success(listar())
                "eventos" -> result.success(Registro.leer(ctx).take(150))
                "reproducir" -> result.success(reproducir(call.argument<String>("ruta")!!))
                "detenerReproduccion" -> {
                    detenerReproduccion()
                    result.success(null)
                }
                "borrar" -> {
                    val ruta = call.argument<String>("ruta")!!
                    if (dentroDeCarpeta(ruta)) {
                        File(ruta).delete()
                        File("$ruta.json").delete()
                    }
                    result.success(null)
                }
                "pruebaIniciar" -> {
                    // Prueba del micrófono sin llamada (la app está abierta: no necesita servicio)
                    val g = Grabador(ctx)
                    prueba = g
                    result.success(g.iniciar("prueba", null, Ajustes.fuente(ctx)))
                }
                "pruebaDetener" -> {
                    prueba?.detener()
                    prueba = null
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            result.error("GRABACION", e.message, null)
        }
    }

    private fun concedido(permiso: String) =
        activity.checkSelfPermission(permiso) == PackageManager.PERMISSION_GRANTED

    private fun accesibilidadActiva(): Boolean {
        val activos = Settings.Secure.getString(
            activity.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val yo = ComponentName(activity, ServicioGrabacion::class.java)
        return activos.split(':').any {
            it.equals(yo.flattenToString(), true) || it.equals(yo.flattenToShortString(), true)
        }
    }

    private fun listar(): List<Map<String, Any?>> {
        val dir = Grabador.carpeta(activity)
        val audios = dir.listFiles { f -> f.name.endsWith(".m4a") }?.sortedByDescending { it.name } ?: return emptyList()
        return audios.map { audio ->
            val json = File(audio.path + ".json")
            val datos = mutableMapOf<String, Any?>("ruta" to audio.absolutePath, "tamano" to audio.length())
            if (json.exists()) {
                val meta = JSONObject(json.readText())
                meta.keys().forEach { k -> datos[k] = meta.opt(k)?.takeIf { it != JSONObject.NULL } }
            } else {
                datos["incompleta"] = true // se está grabando ahora, o se cortó
            }
            datos
        }
    }

    private fun dentroDeCarpeta(ruta: String) =
        File(ruta).canonicalPath.startsWith(Grabador.carpeta(activity).canonicalPath)

    private fun reproducir(ruta: String): Int {
        detenerReproduccion()
        if (!dentroDeCarpeta(ruta)) return 0
        val mp = MediaPlayer().apply {
            setDataSource(ruta)
            prepare()
            start()
            setOnCompletionListener { detenerReproduccion() }
        }
        reproductor = mp
        return mp.duration
    }

    private fun detenerReproduccion() {
        reproductor?.run {
            try {
                stop()
            } catch (_: Exception) {
            }
            release()
        }
        reproductor = null
    }
}
