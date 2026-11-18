import java.util.Properties

// Llave de firma de la empresa (ver docs/despliegue.md → "Llave de la app"). key.properties y el
// .jks NUNCA van a GitHub (están en .gitignore). Sin key.properties se firma con la de desarrollo.
val llave = Properties().apply {
    val archivo = rootProject.file("key.properties")
    if (archivo.exists()) archivo.inputStream().use { load(it) }
}

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.jalmeco.jalmeco_gps"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // Lo requiere flutter_local_notifications (APIs de fechas de Java 8+ en Android viejo)
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.jalmeco.jalmeco_gps"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 26 // Android 8+: Android ID estable por app (alerta cambio_equipo)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (llave.containsKey("storeFile")) {
            create("empresa") {
                storeFile = file(llave.getProperty("storeFile"))
                storePassword = llave.getProperty("storePassword")
                keyAlias = llave.getProperty("keyAlias")
                keyPassword = llave.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (llave.containsKey("storeFile")) signingConfigs.getByName("empresa")
                            else signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
