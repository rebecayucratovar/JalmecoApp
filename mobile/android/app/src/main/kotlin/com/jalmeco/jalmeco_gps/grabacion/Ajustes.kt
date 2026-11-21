package com.jalmeco.jalmeco_gps.grabacion

import android.content.Context
import android.media.MediaRecorder

/**
 * Configuración del módulo de grabación, compartida entre la app (Flutter) y el servicio de
 * accesibilidad, que corren por separado. Regla: solo se graba EN JORNADA.
 */
object Ajustes {
    private const val ARCHIVO = "grabacion"

    /** Fuentes de audio que se pueden probar (cada marca de celular se comporta distinto). */
    val FUENTES = linkedMapOf(
        MediaRecorder.AudioSource.VOICE_RECOGNITION to "VOICE_RECOGNITION",
        MediaRecorder.AudioSource.MIC to "MIC",
        MediaRecorder.AudioSource.VOICE_COMMUNICATION to "VOICE_COMMUNICATION",
        MediaRecorder.AudioSource.CAMCORDER to "CAMCORDER",
        MediaRecorder.AudioSource.UNPROCESSED to "UNPROCESSED",
        MediaRecorder.AudioSource.VOICE_CALL to "VOICE_CALL",
    )

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(ARCHIVO, Context.MODE_PRIVATE)

    /** La app avisa si hay jornada activa (entrada marcada en Odoo y fuera del almuerzo). */
    fun enJornada(ctx: Context) = prefs(ctx).getBoolean("en_jornada", false)
    fun setEnJornada(ctx: Context, v: Boolean) = prefs(ctx).edit().putBoolean("en_jornada", v).apply()

    /** SOLO PRUEBAS: grabar aunque no haya jornada. */
    fun ignorarJornada(ctx: Context) = prefs(ctx).getBoolean("ignorar_jornada", false)
    fun setIgnorarJornada(ctx: Context, v: Boolean) = prefs(ctx).edit().putBoolean("ignorar_jornada", v).apply()

    fun fuente(ctx: Context) = prefs(ctx).getInt("fuente", MediaRecorder.AudioSource.VOICE_RECOGNITION)
    fun setFuente(ctx: Context, v: Int) = prefs(ctx).edit().putInt("fuente", v).apply()

    fun puedeGrabar(ctx: Context) = enJornada(ctx) || ignorarJornada(ctx)

    fun nombreFuente(fuente: Int) = FUENTES[fuente] ?: "fuente $fuente"
}
