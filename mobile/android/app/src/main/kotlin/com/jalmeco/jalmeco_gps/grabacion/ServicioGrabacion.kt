package com.jalmeco.jalmeco_gps.grabacion

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject
import java.io.File

/**
 * Servicio de accesibilidad que graba las llamadas de trabajo (teléfono y WhatsApp), SOLO en jornada.
 *
 * Cómo detecta una llamada: por el MODO DE AUDIO del celular, que no necesita permisos y es igual
 * en todas las marcas:
 *  - MODE_IN_CALL          → llamada de teléfono (red móvil)
 *  - MODE_IN_COMMUNICATION → llamada por internet (WhatsApp u otra app; se sabe cuál por la última
 *                            pantalla abierta, que informa la accesibilidad)
 *  - MODE_NORMAL           → terminó la llamada
 * Android solo deja grabar audio durante una llamada a un servicio de accesibilidad activo.
 */
class ServicioGrabacion : AccessibilityService() {
    private lateinit var audio: AudioManager
    private lateinit var grabador: Grabador
    private val handler = Handler(Looper.getMainLooper())
    private var modoActual = AudioManager.MODE_NORMAL
    private var ultimoPaquete: String? = null
    private var escucha: AudioManager.OnModeChangedListener? = null

    // Respaldo del aviso de cambio de modo (algunas marcas no lo envían): se revisa cada segundo
    private val sondeo = object : Runnable {
        override fun run() {
            revisarModo(audio.mode)
            handler.postDelayed(this, 1000)
        }
    }

    override fun onServiceConnected() {
        audio = getSystemService(AUDIO_SERVICE) as AudioManager
        grabador = Grabador(this)
        conectado = true
        crearCanal()
        if (Build.VERSION.SDK_INT >= 31) {
            val l = AudioManager.OnModeChangedListener { m -> handler.post { revisarModo(m) } }
            audio.addOnModeChangedListener(mainExecutor, l)
            escucha = l
        }
        handler.post(sondeo)
        Registro.anotar(this, "Servicio de grabación conectado (${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE})")
    }

    override fun onAccessibilityEvent(evento: AccessibilityEvent?) {
        if (evento?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val p = evento.packageName?.toString() ?: return
        if (p != packageName && p != "com.android.systemui") ultimoPaquete = p
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= 31) escucha?.let { audio.removeOnModeChangedListener(it) }
        handler.removeCallbacksAndMessages(null)
        if (::grabador.isInitialized) terminar()
        conectado = false
        Registro.anotar(this, "Servicio de grabación detenido")
        super.onDestroy()
    }

    private fun revisarModo(modo: Int) {
        if (modo == modoActual) return
        val anterior = modoActual
        modoActual = modo
        Registro.anotar(this, "Modo de audio: ${nombreModo(anterior)} → ${nombreModo(modo)}")
        when (modo) {
            AudioManager.MODE_IN_CALL -> empezar("telefono", null)
            AudioManager.MODE_IN_COMMUNICATION -> {
                val p = ultimoPaquete
                empezar(if (p == "com.whatsapp" || p == "com.whatsapp.w4b") "whatsapp" else "voip", p)
            }
            AudioManager.MODE_RINGTONE -> Unit // todavía suena: se graba al contestar
            else -> terminar()
        }
    }

    private fun empezar(canal: String, paquete: String?) {
        if (grabador.grabando) return // p. ej. cambio de modo dentro de la misma llamada
        if (!Ajustes.puedeGrabar(this)) {
            Registro.anotar(this, "Llamada ($canal) fuera de jornada: no se graba")
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Registro.anotar(this, "✖ Falta el permiso de micrófono")
            return
        }
        // Aviso visible mientras se graba (transparencia) + lo exige Android para usar el micrófono
        try {
            val aviso = notificacion()
            if (Build.VERSION.SDK_INT >= 30) {
                startForeground(ID_AVISO, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(ID_AVISO, aviso)
            }
        } catch (e: Exception) {
            Registro.anotar(this, "⚠ No se pudo mostrar el aviso de grabación: ${e.javaClass.simpleName} ${e.message ?: ""}")
        }
        grabador.iniciar(canal, paquete, Ajustes.fuente(this))
    }

    private fun terminar() {
        val canal = grabador.canal
        val archivo = grabador.detener()
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
        // El registro de llamadas se escribe unos segundos después de colgar
        if (archivo != null && canal == "telefono") handler.postDelayed({ completarConRegistro(archivo) }, 3000)
    }

    /** Agrega número, dirección (entrante/saliente) y duración según el registro de llamadas. */
    private fun completarConRegistro(audio: File) {
        val json = File(audio.path + ".json")
        if (!json.exists()) return
        if (checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            Registro.anotar(this, "Sin permiso de registro de llamadas: se guarda sin número")
            return
        }
        try {
            val meta = JSONObject(json.readText())
            val desde = meta.getLong("inicio") - 120_000
            contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DURATION),
                "${CallLog.Calls.DATE} >= ?",
                arrayOf(desde.toString()),
                "${CallLog.Calls.DATE} DESC",
            )?.use { c ->
                if (c.moveToFirst()) {
                    meta.put("numero", c.getString(0) ?: "")
                    meta.put("direccion", when (c.getInt(1)) {
                        CallLog.Calls.INCOMING_TYPE -> "entrante"
                        CallLog.Calls.OUTGOING_TYPE -> "saliente"
                        CallLog.Calls.MISSED_TYPE -> "perdida"
                        CallLog.Calls.REJECTED_TYPE -> "rechazada"
                        else -> "otra"
                    })
                    meta.put("duracion_llamada_s", c.getLong(2))
                    json.writeText(meta.toString())
                }
            }
        } catch (e: Exception) {
            Registro.anotar(this, "⚠ No se pudo leer el registro de llamadas: ${e.message}")
        }
    }

    private fun crearCanal() {
        val canal = NotificationChannel(CANAL, "Grabación de llamadas", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Aviso mientras se graba una llamada de trabajo"
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
    }

    private fun notificacion(): Notification =
        Notification.Builder(this, CANAL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Grabando llamada como respaldo")
            .setContentText("Jalmeco GPS · solo llamadas en jornada")
            .setOngoing(true)
            .setUsesChronometer(true)
            .build()

    companion object {
        private const val CANAL = "grabacion"
        private const val ID_AVISO = 7101

        /** El sistema conectó el servicio (la accesibilidad está activa y funcionando). */
        @Volatile
        var conectado = false
            private set

        fun nombreModo(m: Int) = when (m) {
            AudioManager.MODE_NORMAL -> "normal"
            AudioManager.MODE_RINGTONE -> "timbrando"
            AudioManager.MODE_IN_CALL -> "llamada"
            AudioManager.MODE_IN_COMMUNICATION -> "llamada por internet"
            4 -> "filtrando llamada"
            else -> "modo $m"
        }
    }
}
