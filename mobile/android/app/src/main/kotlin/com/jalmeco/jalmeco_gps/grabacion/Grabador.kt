package com.jalmeco.jalmeco_gps.grabacion

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Graba una llamada en AAC (.m4a, mono, 64 kbps ≈ 0,5 MB por minuto) dentro del almacenamiento
 * PRIVADO de la app (ninguna otra app ni el usuario puede verlo o borrarlo). Al terminar escribe
 * al lado un .json con los datos de la llamada y la huella SHA-256 del audio.
 */
class Grabador(private val ctx: Context) {
    private var recorder: MediaRecorder? = null
    private var archivo: File? = null
    private var inicio = 0L
    private var fuente = 0

    var canal: String = ""
        private set
    private var paquete: String? = null

    val grabando get() = recorder != null

    fun iniciar(canal: String, paquete: String?, fuente: Int): Boolean {
        if (recorder != null) return true
        val dir = carpeta(ctx).apply { mkdirs() }
        val nombre = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + "_$canal.m4a"
        val f = File(dir, nombre)
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
        return try {
            r.setAudioSource(fuente)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(44100)
            r.setAudioEncodingBitRate(64_000)
            r.setOutputFile(f.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            archivo = f
            inicio = System.currentTimeMillis()
            this.canal = canal
            this.paquete = paquete
            this.fuente = fuente
            Registro.anotar(ctx, "▶ Grabando $canal${paquete?.let { " ($it)" } ?: ""} · fuente ${Ajustes.nombreFuente(fuente)}")
            true
        } catch (e: Exception) {
            Registro.anotar(ctx, "✖ No se pudo grabar con ${Ajustes.nombreFuente(fuente)}: ${e.javaClass.simpleName} ${e.message ?: ""}")
            r.release()
            f.delete()
            false
        }
    }

    /** Cierra el archivo y escribe sus datos. Devuelve el archivo, o null si quedó vacío. */
    fun detener(): File? {
        val r = recorder ?: return null
        val f = archivo ?: return null
        recorder = null
        archivo = null
        val fin = System.currentTimeMillis()
        try {
            r.stop()
        } catch (e: Exception) {
            // stop() falla si no llegó audio: el archivo no sirve
            Registro.anotar(ctx, "✖ La grabación no tiene audio (${e.javaClass.simpleName})")
            r.release()
            f.delete()
            return null
        }
        r.release()
        val meta = JSONObject().apply {
            put("archivo", f.name)
            put("canal", canal)
            put("paquete", paquete ?: JSONObject.NULL)
            put("fuente", Ajustes.nombreFuente(fuente))
            put("inicio", inicio)
            put("fin", fin)
            put("duracion_s", (fin - inicio) / 1000)
            put("tamano", f.length())
            put("sha256", sha256(f))
            put("equipo", "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}")
        }
        File(f.path + ".json").writeText(meta.toString())
        Registro.anotar(ctx, "■ Guardada ${f.name} · ${(fin - inicio) / 1000} s · ${f.length() / 1024} KB")
        return f
    }

    companion object {
        fun carpeta(ctx: Context) = File(ctx.filesDir, "grabaciones")

        fun sha256(f: File): String {
            val md = MessageDigest.getInstance("SHA-256")
            f.inputStream().use { entrada ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = entrada.read(buf)
                    if (n < 0) break
                    md.update(buf, 0, n)
                }
            }
            return md.digest().joinToString("") { "%02x".format(it) }
        }
    }
}
