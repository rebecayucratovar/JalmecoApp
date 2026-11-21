package com.jalmeco.jalmeco_gps

import com.jalmeco.jalmeco_gps.grabacion.CanalGrabacion
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine

// FlutterFragmentActivity (no FlutterActivity): lo exige local_auth para mostrar la huella.
class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Módulo nativo de grabación de llamadas (Kotlin)
        CanalGrabacion(this).registrar(flutterEngine.dartExecutor.binaryMessenger)
    }
}
