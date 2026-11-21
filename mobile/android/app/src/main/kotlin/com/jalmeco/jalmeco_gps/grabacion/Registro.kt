package com.jalmeco.jalmeco_gps.grabacion

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Bitácora de lo que hace el módulo de grabación (modo de audio, inicio/fin, errores).
 * En el prototipo se muestra en la pantalla de pruebas para diagnosticar cada celular.
 */
object Registro {
    private const val MAXIMO = 300
    private val hora = SimpleDateFormat("dd/MM HH:mm:ss", Locale.US)

    private fun archivo(ctx: Context) = File(Grabador.carpeta(ctx), "eventos.log")

    @Synchronized
    fun anotar(ctx: Context, texto: String) {
        try {
            val f = archivo(ctx)
            f.parentFile?.mkdirs()
            val lineas = (if (f.exists()) f.readLines() else emptyList()).takeLast(MAXIMO - 1)
            f.writeText((lineas + "${hora.format(Date())}  $texto").joinToString("\n"))
        } catch (_: Exception) {
            // La bitácora nunca debe romper la grabación
        }
    }

    @Synchronized
    fun leer(ctx: Context): List<String> =
        archivo(ctx).let { if (it.exists()) it.readLines().reversed() else emptyList() }
}
